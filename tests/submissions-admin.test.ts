import { averageRating, handler } from '../src/handlers/submissions-admin';
import { cfpsRepo, speakerAdminRepo, speakersRepo, submissionReviewsRepo, submissionsRepo } from '../src/shared/repos';

jest.mock('../src/shared/repos', () => ({
  cfpsRepo: { get: jest.fn() },
  speakersRepo: { get: jest.fn() },
  speakerAdminRepo: { get: jest.fn() },
  submissionsRepo: { get: jest.fn(), update: jest.fn(), listByCfp: jest.fn() },
  submissionReviewsRepo: { upsert: jest.fn(), listBySubmission: jest.fn() },
}));

const m = (r: unknown) => r as Record<string, jest.Mock>;
const cfps = m(cfpsRepo);
const speakers = m(speakersRepo);
const speakerAdmin = m(speakerAdminRepo);
const subs = m(submissionsRepo);
const reviews = m(submissionReviewsRepo);

const makeEvent = (
  method: string,
  path: string,
  body?: unknown,
  groups = ['admin'],
  query: Record<string, string> | null = null,
): any => ({
  httpMethod: method,
  path,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  queryStringParameters: query,
  requestContext: {
    authorizer: { claims: { sub: 'admin-1', email: 'a@example.com', 'cognito:groups': groups } },
  },
});
const parse = (r: any) => JSON.parse(r.body);

const sub = (over: object = {}) => ({
  submissionId: 's1',
  cfpId: 'c1',
  speakerId: 'sp-1',
  status: 'submitted',
  talkTitle: 'T',
  abstract: 'A',
  durationMinutes: 30,
  answers: { q1: { questionLabel: 'Level', questionType: 'short_text', value: 'x' } },
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: 't1',
  createdBy: 'u',
  updatedBy: 'u',
  ...over,
});
const review = (adminUserId: string, rating: number) => ({
  submissionId: 's1',
  adminUserId,
  rating,
  notes: 'n',
  updatedAt: 't',
});

describe('submissions-admin handler', () => {
  beforeEach(() => {
    [cfps, speakers, speakerAdmin, subs, reviews].forEach((r) => Object.values(r).forEach((x) => x.mockReset()));
    cfps.get.mockResolvedValue({ cfpId: 'c1' });
    speakers.get.mockResolvedValue({ speakerId: 'sp-1', name: 'Ada', bio: 'b', location: 'L', topics: ['t'] });
    speakerAdmin.get.mockResolvedValue({ speakerId: 'sp-1', marker: 'not_again', markerNote: 'late' });
    reviews.listBySubmission.mockResolvedValue([]);
    subs.get.mockResolvedValue(sub());
    subs.update.mockImplementation(async (_id, patch) => ({ ...sub(), ...patch }));
  });

  it('rejects speakers with 403 on every route', async () => {
    for (const [mth, p] of [
      ['GET', '/admin/cfps/c1/submissions'],
      ['GET', '/admin/submissions/s1'],
      ['PUT', '/admin/submissions/s1/status'],
      ['PUT', '/admin/submissions/s1/review'],
    ]) {
      expect((await handler(makeEvent(mth, p, {}, ['speaker']))).statusCode).toBe(403);
    }
  });

  it('lists without drafts by default, newest first, with marker', async () => {
    subs.listByCfp.mockResolvedValue([
      sub({ submissionId: 'a', createdAt: '2025-01-01' }),
      sub({ submissionId: 'b', status: 'draft', createdAt: '2025-01-02' }),
      sub({ submissionId: 'c', createdAt: '2025-01-03' }),
    ]);
    const body = parse(await handler(makeEvent('GET', '/admin/cfps/c1/submissions')));
    expect(body.submissions.map((s: any) => s.submissionId)).toEqual(['c', 'a']);
    expect(body.submissions[0].marker).toBe('not_again');
    expect(body.submissions[0].speakerName).toBe('Ada');
  });

  it('filters by status, including drafts when asked', async () => {
    subs.listByCfp.mockResolvedValue([sub({ submissionId: 'a', status: 'draft' }), sub({ submissionId: 'b' })]);
    const d = parse(await handler(makeEvent('GET', '/admin/cfps/c1/submissions', undefined, ['admin'], { status: 'draft' })));
    expect(d.submissions.map((s: any) => s.submissionId)).toEqual(['a']);
    const all = parse(await handler(makeEvent('GET', '/admin/cfps/c1/submissions', undefined, ['admin'], { status: 'all' })));
    expect(all.submissions).toHaveLength(2);
  });

  it('rejects an invalid status filter and unknown CFP', async () => {
    expect(
      (await handler(makeEvent('GET', '/admin/cfps/c1/submissions', undefined, ['admin'], { status: 'bogus' }))).statusCode,
    ).toBe(400);
    cfps.get.mockResolvedValue(undefined);
    expect((await handler(makeEvent('GET', '/admin/cfps/c1/submissions'))).statusCode).toBe(404);
  });

  it('returns detail with profile, marker, answers and average rating', async () => {
    reviews.listBySubmission.mockResolvedValue([review('a1', 4), review('a2', 5)]);
    const body = parse(await handler(makeEvent('GET', '/admin/submissions/s1')));
    expect(body.speaker.name).toBe('Ada');
    expect(body.marker).toBe('not_again');
    expect(body.answers.q1.value).toBe('x');
    expect(body.averageRating).toBe(4.5);
    expect(body.reviews).toHaveLength(2);
  });

  it('returns 404 for a missing submission', async () => {
    subs.get.mockResolvedValue(undefined);
    expect((await handler(makeEvent('GET', '/admin/submissions/s1'))).statusCode).toBe(404);
  });

  it('changes status with optimistic concurrency and validates it', async () => {
    const r = await handler(makeEvent('PUT', '/admin/submissions/s1/status', { status: 'accepted' }));
    expect(r.statusCode).toBe(200);
    expect(subs.update).toHaveBeenCalledWith('s1', { status: 'accepted' }, 'admin-1', 't1');
    expect(parse(r).status).toBe('accepted');
    expect((await handler(makeEvent('PUT', '/admin/submissions/s1/status', { status: 'nope' }))).statusCode).toBe(400);
  });

  it('stores the caller\'s own review and validates the rating', async () => {
    reviews.upsert.mockResolvedValue({});
    const r = await handler(makeEvent('PUT', '/admin/submissions/s1/review', { rating: 3, notes: ' good ' }));
    expect(r.statusCode).toBe(200);
    expect(reviews.upsert).toHaveBeenCalledWith('s1', 'admin-1', { rating: 3, notes: 'good' });
    for (const rating of [0, 6, 2.5, '3']) {
      const bad = await handler(makeEvent('PUT', '/admin/submissions/s1/review', { rating }));
      expect(bad.statusCode).toBe(400);
      expect(parse(bad).error.fields.rating).toBeDefined();
    }
  });

  it('averageRating handles empty and rounds', () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([{ rating: 1 }, { rating: 2 }, { rating: 2 }])).toBe(1.67);
  });
});
