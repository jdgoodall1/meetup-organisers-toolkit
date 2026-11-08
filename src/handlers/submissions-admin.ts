// Admin submission review (admin-only; touches admin-only tables):
//   GET /admin/cfps/{id}/submissions       - list by CFP, status filter, drafts hidden by default (Req 9.1, 9.6)
//   GET /admin/submissions/{id}            - detail with profile summary, marker, answers, reviews (Req 9.5)
//   PUT /admin/submissions/{id}/status     - change status (Req 9.2, 9.3)
//   PUT /admin/submissions/{id}/review     - caller's own rating and notes (Req 9.4, 9.7)
// Marker info is included on list and detail so the UI can flag speakers (Req 5.6, 5.8).
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdmin } from '../shared/auth';
import { NotFound, Route, ValidationError, dispatch, ok, parseJsonBody } from '../shared/http';
import type { Speaker, SpeakerAdmin, Submission, SubmissionReview, SubmissionStatus } from '../shared/models';
import { cfpsRepo, speakerAdminRepo, speakersRepo, submissionReviewsRepo, submissionsRepo } from '../shared/repos';

type Ctx = APIGatewayProxyEvent;

export const REVIEW_NOTES_MAX = 5000;
export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'draft',
  'submitted',
  'shortlisted',
  'accepted',
  'rejected',
  'withdrawn',
];

/** Short speaker profile summary for review screens. */
function speakerSummary(s: Speaker | undefined) {
  if (!s) return null;
  return {
    speakerId: s.speakerId,
    name: s.name,
    bio: s.bio,
    location: s.location,
    topics: s.topics ?? [],
    links: s.links ?? [],
    pastTalks: s.pastTalks ?? [],
    headshotKey: s.headshotKey,
  };
}

function markerInfo(a: SpeakerAdmin | undefined) {
  return { marker: a?.marker ?? null, markerNote: a?.markerNote ?? null };
}

/** Average of ratings, rounded to 2 decimals; null when there are none (Req 9.7). */
export function averageRating(reviews: Pick<SubmissionReview, 'rating'>[]): number | null {
  if (!reviews.length) return null;
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return Math.round(avg * 100) / 100;
}

const reviewSummary = (reviews: SubmissionReview[]) => ({
  averageRating: averageRating(reviews),
  ratingCount: reviews.length,
});

async function loadSpeakerContext(speakerId: string) {
  const [speaker, admin] = await Promise.all([speakersRepo.get(speakerId), speakerAdminRepo.get(speakerId)]);
  return { speaker, admin };
}

async function getSubmission(id: string): Promise<Submission> {
  const sub = await submissionsRepo.get(id);
  if (!sub) throw new NotFound('Submission not found');
  return sub;
}

async function detail(sub: Submission) {
  const [{ speaker, admin }, reviews] = await Promise.all([
    loadSpeakerContext(sub.speakerId),
    submissionReviewsRepo.listBySubmission(sub.submissionId),
  ]);
  return {
    ...sub,
    speaker: speakerSummary(speaker),
    ...markerInfo(admin),
    ...reviewSummary(reviews),
    reviews: reviews.map((r) => ({
      adminUserId: r.adminUserId,
      rating: r.rating,
      notes: r.notes,
      updatedAt: r.updatedAt,
    })),
  };
}

const routes: Route<Ctx>[] = [
  {
    method: 'GET',
    path: '/admin/cfps/{id}/submissions',
    handler: async (event, params) => {
      requireAdmin(event);
      const filter = event.queryStringParameters?.status;
      if (filter && filter !== 'all' && !(SUBMISSION_STATUSES as readonly string[]).includes(filter)) {
        throw new ValidationError({ status: `Status must be one of ${SUBMISSION_STATUSES.join(', ')}, or all` });
      }
      if (!(await cfpsRepo.get(params.id))) throw new NotFound('CFP not found');

      const all = await submissionsRepo.listByCfp(params.id);
      // Drafts are hidden unless explicitly requested (Req 9.6).
      const items = all
        .filter((s) => (!filter ? s.status !== 'draft' : filter === 'all' || s.status === filter))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const speakerIds = [...new Set(items.map((s) => s.speakerId))];
      const contexts = new Map(
        await Promise.all(speakerIds.map(async (id) => [id, await loadSpeakerContext(id)] as const)),
      );
      const reviews = await Promise.all(items.map((s) => submissionReviewsRepo.listBySubmission(s.submissionId)));

      return ok({
        submissions: items.map((s, i) => {
          const c = contexts.get(s.speakerId);
          return {
            submissionId: s.submissionId,
            cfpId: s.cfpId,
            speakerId: s.speakerId,
            speakerName: c?.speaker?.name ?? null,
            status: s.status,
            talkTitle: s.talkTitle,
            durationMinutes: s.durationMinutes,
            level: s.level ?? null,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            ...markerInfo(c?.admin),
            ...reviewSummary(reviews[i]),
          };
        }),
      });
    },
  },
  {
    method: 'GET',
    path: '/admin/submissions/{id}',
    handler: async (event, params) => {
      requireAdmin(event);
      return ok(await detail(await getSubmission(params.id)));
    },
  },
  {
    method: 'PUT',
    path: '/admin/submissions/{id}/status',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<{ status?: unknown; updatedAt?: unknown }>(event.body, event.isBase64Encoded);
      if (typeof body.status !== 'string' || !(SUBMISSION_STATUSES as readonly string[]).includes(body.status)) {
        throw new ValidationError({ status: `Status must be one of ${SUBMISSION_STATUSES.join(', ')}` });
      }
      const sub = await getSubmission(params.id);
      const expected = typeof body.updatedAt === 'string' ? body.updatedAt : sub.updatedAt;
      const saved = await submissionsRepo.update(
        sub.submissionId,
        { status: body.status as SubmissionStatus },
        auth.userId,
        expected,
      );
      return ok(await detail(saved));
    },
  },
  {
    // Each admin has one review; ratings are kept separately and averaged on read.
    method: 'PUT',
    path: '/admin/submissions/{id}/review',
    handler: async (event, params) => {
      const auth = requireAdmin(event);
      const body = parseJsonBody<{ rating?: unknown; notes?: unknown }>(event.body, event.isBase64Encoded);
      const errors: Record<string, string> = {};
      const r = body.rating;
      if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 5) {
        errors.rating = 'Rating must be a whole number from 1 to 5';
      }
      let notes = '';
      if (body.notes !== undefined && body.notes !== null) {
        if (typeof body.notes !== 'string') errors.notes = 'Notes must be text';
        else if (body.notes.length > REVIEW_NOTES_MAX) {
          errors.notes = `Notes must be at most ${REVIEW_NOTES_MAX} characters`;
        } else notes = body.notes.trim();
      }
      if (Object.keys(errors).length) throw new ValidationError(errors);

      const sub = await getSubmission(params.id);
      await submissionReviewsRepo.upsert(sub.submissionId, auth.userId, { rating: r as number, notes });
      return ok(await detail(sub));
    },
  },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  dispatch(routes, event.httpMethod, event.path, event);
