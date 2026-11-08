// CFPs handler: admin CRUD, close/reopen, duplicate, question list,
// templates, and the speaker-facing open CFP list/detail.
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdmin, requireSpeaker } from '../shared/auth';
import { effectiveStatus } from '../shared/cfp-logic';
import {
  ConfirmRequired,
  NotFound,
  Route,
  ValidationError,
  created,
  dispatch,
  noContent,
  ok,
  parseJsonBody,
} from '../shared/http';
import type { Cfp, CfpQuestion, CfpStatus } from '../shared/models';
import { cfpsRepo, questionTemplatesRepo, submissionsRepo } from '../shared/repos';
import { validateCfp, validateQuestions } from '../shared/validation';

type Ctx = APIGatewayProxyEvent;
type Body = Record<string, unknown>;

export const CFP_STATUSES: readonly CfpStatus[] = ['draft', 'open', 'closed'];

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const isConfirmed = (event: Ctx): boolean => event.queryStringParameters?.confirm === 'true';

/** Optional JSON body: empty body means `{}`; malformed bodies still fail. */
function optionalBody(event: Ctx): Body {
  return event.body ? parseJsonBody<Body>(event.body, event.isBase64Encoded) : {};
}

// ---------------------------------------------------------------------------
// Question helpers
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a list of questions from a request. Array position
 * defines `order`. Existing questionIds are kept; missing ones are generated.
 * Throws ValidationError on invalid input or duplicate questionIds.
 */
export function buildQuestions(input: unknown): CfpQuestion[] {
  const fields = validateQuestions(input);
  const list = (Array.isArray(input) ? input : []) as Body[];
  const seen = new Set<string>();
  list.forEach((q, i) => {
    if (q === null || typeof q !== 'object') return;
    if (typeof q.required !== 'undefined' && typeof q.required !== 'boolean') {
      fields[`questions[${i}].required`] = 'Required must be true or false';
    }
    if (typeof q.questionId === 'string' && q.questionId) {
      if (seen.has(q.questionId)) fields[`questions[${i}].questionId`] = 'Duplicate question ID';
      seen.add(q.questionId);
    }
  });
  if (Object.keys(fields).length) throw new ValidationError(fields);

  return list.map((q, i) => {
    const type = q.type as CfpQuestion['type'];
    const out: CfpQuestion = {
      questionId: typeof q.questionId === 'string' && q.questionId ? q.questionId : randomUUID(),
      type,
      label: str(q.label),
      required: q.required === true,
      order: i,
    };
    const help = str(q.helpText);
    if (help) out.helpText = help;
    if (type === 'single_select' || type === 'multi_select') {
      out.options = (q.options as string[]).map((o) => o.trim());
    }
    return out;
  });
}

/** Deep copy questions with fresh questionIds, preserving order. */
export function copyQuestions(questions: CfpQuestion[]): CfpQuestion[] {
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .map((q, i) => ({
      ...q,
      questionId: randomUUID(),
      order: i,
      ...(q.options ? { options: [...q.options] } : {}),
    }));
}

/** Describe questions removed or retyped between two lists. */
export function questionChangeWarnings(before: CfpQuestion[], after: CfpQuestion[]): string[] {
  const next = new Map(after.map((q) => [q.questionId, q]));
  const warnings: string[] = [];
  for (const q of before) {
    const n = next.get(q.questionId);
    if (!n) warnings.push(`Question "${q.label}" will be removed.`);
    else if (n.type !== q.type) {
      warnings.push(`Question "${q.label}" changes type from ${q.type} to ${n.type}.`);
    }
  }
  return warnings;
}

/** Throws ConfirmRequired when the change affects a CFP that has submissions and is unconfirmed. */
async function guardQuestionChange(
  cfp: Cfp,
  next: CfpQuestion[],
  confirm: boolean,
): Promise<void> {
  const warnings = questionChangeWarnings(cfp.questions ?? [], next);
  if (warnings.length === 0 || confirm) return;
  const subs = await submissionsRepo.listByCfp(cfp.cfpId);
  if (subs.length > 0) {
    throw new ConfirmRequired([
      ...warnings,
      `This CFP has ${subs.length} submission(s). Existing answers are kept but the question changes.`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// CFP helpers
// ---------------------------------------------------------------------------

function parseStatus(v: unknown, fields: Record<string, string>): CfpStatus | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string' && (CFP_STATUSES as readonly string[]).includes(v)) return v as CfpStatus;
  fields.status = `Status must be one of: ${CFP_STATUSES.join(', ')}`;
  return undefined;
}

/**
 * Validated CFP fields. `opensAt` / `closesAt` are optional: a blank value
 * (or null) clears the date. The result keeps `undefined` for cleared dates so
 * an update REMOVEs the attribute; use `forCreate` to drop them before a put.
 * Any legacy `eventId` in the body or on the stored item is ignored.
 */
function buildCfpFields(body: Body, base?: Cfp) {
  const merged = { ...(base ?? {}), ...body } as Body;
  const fields = validateCfp(merged);
  const status = parseStatus(merged.status, fields) ?? 'draft';
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return {
    title: str(merged.title),
    description: str(merged.description),
    opensAt: str(merged.opensAt) || undefined,
    closesAt: str(merged.closesAt) || undefined,
    status,
  };
}

/** Drop undefined values so DynamoDB put does not choke on cleared optional dates. */
function forCreate<T extends object>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as T;
}
/** Sort helpers: CFPs with no closesAt (standing) rank as the furthest-out close date. */
const closeKey = (c: { closesAt?: string }): string => c.closesAt ?? '\uffff';
const byClosesAtAsc = (a: { closesAt?: string }, b: { closesAt?: string }): number =>
  closeKey(a).localeCompare(closeKey(b));
const byClosesAtDesc = (a: { closesAt?: string }, b: { closesAt?: string }): number =>
  closeKey(b).localeCompare(closeKey(a));

async function getCfpOrThrow(id: string): Promise<Cfp> {
  const cfp = await cfpsRepo.get(id);
  if (!cfp) throw new NotFound('CFP not found');
  return cfp;
}

/** Speaker-facing projection: no audit fields, questions in admin order. */
function toSpeakerCfp(cfp: Cfp) {
  return {
    cfpId: cfp.cfpId,
    title: cfp.title,
    description: cfp.description,
    opensAt: cfp.opensAt,
    closesAt: cfp.closesAt,
    questions: [...(cfp.questions ?? [])].sort((a, b) => a.order - b.order),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes: Route<Ctx>[] = [
  // ---- Admin: CFPs ----
  {
    method: 'GET',
    path: '/admin/cfps',
    handler: async (event) => {
      requireAdmin(event);
      const fields: Record<string, string> = {};
      const status = parseStatus(event.queryStringParameters?.status, fields);
      if (Object.keys(fields).length) throw new ValidationError(fields);
      const items = status ? await cfpsRepo.listByStatus(status) : await cfpsRepo.listAll();
      const now = Date.now();
      const cfps = items
        .map((c) => ({ ...c, effectiveStatus: effectiveStatus(c, now) }))
        .sort(byClosesAtDesc);
      return ok({ cfps });
    },
  },
  {
    method: 'POST',
    path: '/admin/cfps',
    handler: async (event) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const base = forCreate(buildCfpFields(body));
      const questions = body.questions === undefined ? [] : buildQuestions(body.questions);
      const item = { cfpId: randomUUID(), ...base, questions };
      return created(await cfpsRepo.create(item, auth.userId));
    },
  },
  {
    method: 'GET',
    path: '/admin/cfps/{id}',
    handler: async (event, params) => {
      requireAdmin(event);
      const cfp = await getCfpOrThrow(params.id);
      return ok({ ...cfp, effectiveStatus: effectiveStatus(cfp, Date.now()) });
    },
  },
  {
    // Edit, close (status: closed) and reopen (status: open) all go through PUT.
    method: 'PUT',
    path: '/admin/cfps/{id}',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const existing = await getCfpOrThrow(params.id);
      const patch = buildCfpFields(body, existing);
      const expected = typeof body.updatedAt === 'string' ? body.updatedAt : existing.updatedAt;
      return ok(await cfpsRepo.update(params.id, patch, auth.userId, expected));
    },
  },
  {
    method: 'DELETE',
    path: '/admin/cfps/{id}',
    handler: async (event, params) => {
      requireAdmin(event);
      const existing = await getCfpOrThrow(params.id);
      if (!isConfirmed(event)) {
        const subs = await submissionsRepo.listByCfp(existing.cfpId);
        if (subs.length > 0) {
          throw new ConfirmRequired([`This CFP has ${subs.length} submission(s).`]);
        }
      }
      await cfpsRepo.delete(existing.cfpId);
      return noContent();
    },
  },
  {
    method: 'POST',
    path: '/admin/cfps/{id}/duplicate',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = optionalBody(event);
      const source = await getCfpOrThrow(params.id);
      // Copy is always a draft. A standing source (no closesAt) stays standing.
      const base = forCreate(
        buildCfpFields({
          title: str(body.title) || `Copy of ${source.title}`,
          description: source.description,
          opensAt: str(body.opensAt) || source.opensAt,
          closesAt: str(body.closesAt) || source.closesAt,
          status: 'draft',
        }),
      );
      const item = { cfpId: randomUUID(), ...base, questions: copyQuestions(source.questions ?? []) };
      return created(await cfpsRepo.create(item, auth.userId));
    },
  },

  // ---- Admin: questions ----
  {
    method: 'PUT',
    path: '/admin/cfps/{id}/questions',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const existing = await getCfpOrThrow(params.id);
      const questions = buildQuestions(body.questions);
      await guardQuestionChange(existing, questions, isConfirmed(event));
      const expected = typeof body.updatedAt === 'string' ? body.updatedAt : existing.updatedAt;
      return ok(await cfpsRepo.update(params.id, { questions }, auth.userId, expected));
    },
  },

  // ---- Admin: templates ----
  {
    method: 'GET',
    path: '/admin/templates',
    handler: async (event) => {
      requireAdmin(event);
      const templates = (await questionTemplatesRepo.listAll()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return ok({ templates });
    },
  },
  {
    // Body: { name, questions } or { name, cfpId } to save a CFP's current questions.
    method: 'POST',
    path: '/admin/templates',
    handler: async (event) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const fields: Record<string, string> = {};
      if (!str(body.name)) fields.name = 'Name is required';
      let source: unknown = body.questions;
      if (source === undefined && typeof body.cfpId === 'string') {
        source = (await getCfpOrThrow(body.cfpId)).questions ?? [];
      }
      let questions: CfpQuestion[] = [];
      try {
        questions = buildQuestions(source);
      } catch (err) {
        if (err instanceof ValidationError) Object.assign(fields, err.fields);
        else throw err;
      }
      if (Object.keys(fields).length) throw new ValidationError(fields);
      const item = { templateId: randomUUID(), name: str(body.name), questions: copyQuestions(questions) };
      return created(await questionTemplatesRepo.create(item, auth.userId));
    },
  },
  {
    method: 'DELETE',
    path: '/admin/templates/{id}',
    handler: async (event, params) => {
      requireAdmin(event);
      if (!(await questionTemplatesRepo.get(params.id))) throw new NotFound('Template not found');
      await questionTemplatesRepo.delete(params.id);
      return noContent();
    },
  },
  {
    // Body: { templateId, mode?: 'append' | 'replace', updatedAt? }. Questions are deep-copied.
    method: 'POST',
    path: '/admin/cfps/{id}/apply-template',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<Body>(event.body, event.isBase64Encoded);
      const fields: Record<string, string> = {};
      if (typeof body.templateId !== 'string' || !body.templateId) {
        fields.templateId = 'templateId is required';
      }
      const mode = body.mode === undefined ? 'append' : body.mode;
      if (mode !== 'append' && mode !== 'replace') fields.mode = 'mode must be append or replace';
      if (Object.keys(fields).length) throw new ValidationError(fields);

      const existing = await getCfpOrThrow(params.id);
      const template = await questionTemplatesRepo.get(body.templateId as string);
      if (!template) throw new NotFound('Template not found');

      const copied = copyQuestions(template.questions ?? []);
      const kept = mode === 'replace' ? [] : [...(existing.questions ?? [])].sort((a, b) => a.order - b.order);
      const questions = [...kept, ...copied].map((q, i) => ({ ...q, order: i }));
      await guardQuestionChange(existing, questions, isConfirmed(event));
      const expected = typeof body.updatedAt === 'string' ? body.updatedAt : existing.updatedAt;
      return ok(await cfpsRepo.update(params.id, { questions }, auth.userId, expected));
    },
  },

  // ---- Speaker: open CFPs ----
  {
    method: 'GET',
    path: '/me/cfps',
    handler: async (event) => {
      requireSpeaker(event);
      const now = Date.now();
      const cfps = (await cfpsRepo.listByStatus('open'))
        .filter((c) => effectiveStatus(c, now) === 'open')
        .sort(byClosesAtAsc)
        .map(toSpeakerCfp);
      return ok({ cfps });
    },
  },
  {
    method: 'GET',
    path: '/me/cfps/{id}',
    handler: async (event, params) => {
      requireSpeaker(event);
      const cfp = await cfpsRepo.get(params.id);
      // Drafts and closed CFPs are indistinguishable from missing ones.
      if (!cfp || effectiveStatus(cfp, Date.now()) !== 'open') throw new NotFound('CFP not found');
      return ok(toSpeakerCfp(cfp));
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
