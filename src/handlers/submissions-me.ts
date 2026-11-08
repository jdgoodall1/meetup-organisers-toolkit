// Speaker submissions: create/edit drafts, submit, withdraw, list and get own.
// Only speaker-visible tables are touched (submissions, speakers, cfps); admin-only
// data (marker, notes, reviews) is never read here, and responses use an explicit
// allow-list plus the simplified speaker status (Req 8.12).
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireSpeaker } from '../shared/auth';
import { effectiveStatus, toSpeakerStatus, validateSubmission } from '../shared/cfp-logic';
import {
  HttpError,
  NotFound,
  Route,
  ValidationError,
  created,
  dispatch,
  ok,
  parseJsonBody,
} from '../shared/http';
import type { Cfp, Speaker, Submission, SubmissionAnswer } from '../shared/models';
import { cfpsRepo, speakersRepo, submissionsRepo } from '../shared/repos';

type Ctx = APIGatewayProxyEvent;
type Body = Record<string, unknown>;

/** Statuses a speaker may still edit, submit or withdraw. */
const EDITABLE: readonly Submission['status'][] = ['draft', 'submitted'];

/** Speaker-facing projection: explicit allow-list, simplified status. */
export function toSpeakerSubmission(s: Submission) {
  return {
    submissionId: s.submissionId,
    cfpId: s.cfpId,
    status: toSpeakerStatus(s.status),
    talkTitle: s.talkTitle,
    abstract: s.abstract,
    durationMinutes: s.durationMinutes,
    level: s.level,
    answers: s.answers ?? {},
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

const cfpClosed = () => new HttpError(409, 'CFP_CLOSED', 'This CFP is closed and no longer accepts changes');

async function requireProfile(userId: string): Promise<Speaker> {
  const profile = await speakersRepo.getByUserId(userId);
  if (!profile) {
    throw new ValidationError({ profile: 'Create your speaker profile before submitting' });
  }
  return profile;
}

/** Load an own submission; missing or foreign IDs are indistinguishable (Req 11.2). */
async function getOwn(userId: string, id: string): Promise<{ sub: Submission; profile: Speaker }> {
  const profile = await speakersRepo.getByUserId(userId);
  const sub = profile ? await submissionsRepo.get(id) : undefined;
  if (!profile || !sub || sub.speakerId !== profile.speakerId) {
    throw new NotFound('Submission not found');
  }
  return { sub, profile };
}

/** The submission's CFP must be effectively open; otherwise changes are rejected. */
async function requireOpenCfp(cfpId: string): Promise<Cfp> {
  const cfp = await cfpsRepo.get(cfpId);
  if (!cfp || effectiveStatus(cfp, Date.now()) !== 'open') throw cfpClosed();
  return cfp;
}

function requireEditable(sub: Submission): void {
  if (!EDITABLE.includes(sub.status)) {
    throw new HttpError(
      409,
      'SUBMISSION_LOCKED',
      'This submission can no longer be changed. Please contact the organisers.',
    );
  }
}

/** Snapshot question label and type next to each answer (Req 7.9). */
function buildAnswers(cfp: Cfp, raw: Record<string, unknown>): Record<string, SubmissionAnswer> {
  const byId = new Map(cfp.questions.map((q) => [q.questionId, q]));
  const out: Record<string, SubmissionAnswer> = {};
  for (const [id, value] of Object.entries(raw)) {
    const q = byId.get(id);
    if (!q || value === undefined || value === null) continue;
    out[id] = {
      questionLabel: q.label,
      questionType: q.type,
      value: value as SubmissionAnswer['value'],
    };
  }
  return out;
}

interface Merged {
  talkTitle: string;
  abstract: string;
  durationMinutes: number;
  level?: number;
  answers: Record<string, SubmissionAnswer>;
}

/**
 * Validate `body` merged over `base` and return the values to store. Answers,
 * when provided, replace the whole map; otherwise existing answers are kept.
 */
function mergeAndValidate(
  cfp: Cfp,
  body: Body,
  base: Pick<Submission, 'talkTitle' | 'abstract' | 'durationMinutes' | 'level' | 'answers'> | undefined,
  mode: 'draft' | 'submit',
): Merged {
  const has = (k: string) => k in body && body[k] !== undefined;
  const rawAnswers: Record<string, unknown> | undefined = has('answers')
    ? (body.answers as Record<string, unknown>)
    : base
      ? Object.fromEntries(Object.entries(base.answers ?? {}).map(([k, a]) => [k, a.value]))
      : undefined;

  const input = {
    talkTitle: has('talkTitle') ? body.talkTitle : base?.talkTitle,
    abstract: has('abstract') ? body.abstract : base?.abstract,
    durationMinutes: has('durationMinutes')
      ? body.durationMinutes
      : base && base.durationMinutes > 0
        ? base.durationMinutes
        : undefined,
    level: has('level') ? body.level : base?.level,
    answers: has('answers') ? body.answers : rawAnswers,
  };
  // Stored answers for questions since removed from the CFP stay readable; only
  // validate answers the caller sent or those still tied to a current question.
  if (!has('answers') && rawAnswers) {
    const ids = new Set(cfp.questions.map((q) => q.questionId));
    input.answers = Object.fromEntries(Object.entries(rawAnswers).filter(([k]) => ids.has(k)));
  }

  const errors = validateSubmission(cfp, input, mode);
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const answers = has('answers')
    ? buildAnswers(cfp, rawAnswers ?? {})
    : { ...(base?.answers ?? {}), ...buildAnswers(cfp, (input.answers as Record<string, unknown>) ?? {}) };

  return {
    talkTitle: typeof input.talkTitle === 'string' ? input.talkTitle.trim() : '',
    abstract: typeof input.abstract === 'string' ? input.abstract.trim() : '',
    durationMinutes: typeof input.durationMinutes === 'number' ? input.durationMinutes : 0,
    // Left out entirely when unset: DynamoDB put cannot take undefined values.
    ...(typeof input.level === 'number' ? { level: input.level } : {}),
    answers,
  };
}

const expectedUpdatedAt = (body: Body, sub: Submission): string =>
  typeof body.updatedAt === 'string' ? body.updatedAt : sub.updatedAt;

const optionalBody = (event: Ctx): Body =>
  event.body ? parseJsonBody<Body>(event.body, event.isBase64Encoded) : {};

const routes: Route<Ctx>[] = [
  {
    method: 'GET',
    path: '/me/submissions',
    handler: async (event) => {
      const auth = requireSpeaker(event);
      const profile = await speakersRepo.getByUserId(auth.userId);
      if (!profile) return ok({ submissions: [] });
      const items = await submissionsRepo.listBySpeaker(profile.speakerId);
      return ok({
        submissions: items
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(toSpeakerSubmission),
      });
    },
  },
  {
    // Creates a draft. Multiple submissions per CFP are allowed (Req 8.9).
    method: 'POST',
    path: '/me/submissions',
    handler: async (event) => {
      const auth = requireSpeaker(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const profile = await requireProfile(auth.userId);
      if (typeof body.cfpId !== 'string' || !body.cfpId) {
        throw new ValidationError({ cfpId: 'cfpId is required' });
      }
      const cfp = await cfpsRepo.get(body.cfpId);
      // Drafts are hidden from speakers, so a draft CFP looks missing.
      if (!cfp || cfp.status === 'draft') throw new NotFound('CFP not found');
      if (effectiveStatus(cfp, Date.now()) !== 'open') throw cfpClosed();

      const values = mergeAndValidate(cfp, body, undefined, 'draft');
      const item = {
        submissionId: randomUUID(),
        cfpId: cfp.cfpId,
        speakerId: profile.speakerId,
        status: 'draft' as const,
        ...values,
      };
      return created(toSpeakerSubmission(await submissionsRepo.create(item, auth.userId)));
    },
  },
  {
    method: 'GET',
    path: '/me/submissions/{id}',
    handler: async (event, params) => {
      const auth = requireSpeaker(event);
      const { sub } = await getOwn(auth.userId, params.id);
      return ok(toSpeakerSubmission(sub));
    },
  },
  {
    method: 'PUT',
    path: '/me/submissions/{id}',
    handler: async (event, params) => {
      const auth = requireSpeaker(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const { sub } = await getOwn(auth.userId, params.id);
      requireEditable(sub);
      const cfp = await requireOpenCfp(sub.cfpId);
      // A submitted talk must stay complete; drafts only need type-correct values.
      const values = mergeAndValidate(cfp, body, sub, sub.status === 'submitted' ? 'submit' : 'draft');
      const saved = await submissionsRepo.update(sub.submissionId, values, auth.userId, expectedUpdatedAt(body, sub));
      return ok(toSpeakerSubmission(saved));
    },
  },
  {
    method: 'POST',
    path: '/me/submissions/{id}/submit',
    handler: async (event, params) => {
      const auth = requireSpeaker(event);
      const body = optionalBody(event);
      const { sub } = await getOwn(auth.userId, params.id);
      if (sub.status !== 'draft') {
        throw new HttpError(409, 'INVALID_STATE', 'Only draft submissions can be submitted');
      }
      const cfp = await requireOpenCfp(sub.cfpId);
      const values = mergeAndValidate(cfp, body, sub, 'submit');
      const saved = await submissionsRepo.update(
        sub.submissionId,
        { ...values, status: 'submitted' },
        auth.userId,
        expectedUpdatedAt(body, sub),
      );
      return ok(toSpeakerSubmission(saved));
    },
  },
  {
    // DELETE withdraws; the record is kept with status `withdrawn`.
    method: 'DELETE',
    path: '/me/submissions/{id}',
    handler: async (event, params) => {
      const auth = requireSpeaker(event);
      const body = optionalBody(event);
      const { sub } = await getOwn(auth.userId, params.id);
      requireEditable(sub);
      await requireOpenCfp(sub.cfpId);
      const saved = await submissionsRepo.update(
        sub.submissionId,
        { status: 'withdrawn' },
        auth.userId,
        expectedUpdatedAt(body, sub),
      );
      return ok(toSpeakerSubmission(saved));
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
