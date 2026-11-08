import { handler } from '../src/handlers/submissions-me';
import { cfpsRepo, speakersRepo, submissionsRepo } from '../src/shared/repos';

jest.mock('../src/shared/repos', () => ({
  cfpsRepo: { get: jest.fn() },
  speakersRepo: { getByUserId: jest.fn() },
  submissionsRepo: { create: jest.fn(), get: jest.fn(), update: jest.fn(), listBySpeaker: jest.fn() },
}));

const cfps = cfpsRepo as unknown as Record<string, jest.Mock>;
const speakers = speakersRepo as unknown as Record<string, jest.Mock>;
const subs = submissionsRepo as unknown as Record<string, jest.Mock>;

const makeEvent = (method: string, path: string, body?: unknown, groups = ['speaker']): any => ({
  httpMethod: method,
  path,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  queryStringParameters: null,
  requestContext: {
    authorizer: { claims: { sub: 'user-1', email: 's@example.com', 'cognito:groups': groups } },
  },
});
const parse = (r: any) => JSON.parse(r.body);

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
const cfp = (over: object = {}) => ({
  cfpId: 'c1',
  status: 'open',
  closesAt: future,
  questions: [
    { questionId: 'q1', type: 'single_select', label: 'Level', required: true, options: ['a', 'b'], order: 0 },
  ],
  ...over,
});
const sub = (over: object = {}) => ({
  submissionId: 's1',
  cfpId: 'c1',
  speakerId: 'sp-1',
  status: 'draft',
  talkTitle: 'T',
  abstract: 'A',
  durationMinutes: 30,
  level: 200,
  answers: {},
  createdAt: 't0',
  updatedAt: 't1',
  createdBy: 'user-1',
  updatedBy: 'user-1',
  ...over,
});

describe('submissions-me handler', () => {
  beforeEach(() => {
    [cfps, speakers, subs].forEach((r) => Object.values(r).forEach((m) => m.mockReset()));
    speakers.getByUserId.mockResolvedValue({ speakerId: 'sp-1', userId: 'user-1' });
    cfps.get.mockResolvedValue(cfp());
    subs.create.mockImplementation(async (i) => ({ ...i, createdAt: 't0', updatedAt: 't0' }));
    subs.update.mockImplementation(async (_id, patch) => ({ ...sub(), ...patch }));
  });

  it('rejects non-speakers with 403', async () => {
    expect((await handler(makeEvent('GET', '/me/submissions', undefined, ['admin']))).statusCode).toBe(403);
  });

  it('requires a profile to create', async () => {
    speakers.getByUserId.mockResolvedValue(undefined);
    const r = await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1' }));
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields.profile).toBeDefined();
  });

  it('creates a draft with snapshotted question label and type', async () => {
    const r = await handler(
      makeEvent('POST', '/me/submissions', { cfpId: 'c1', talkTitle: 'Hi', answers: { q1: 'a' } }),
    );
    expect(r.statusCode).toBe(201);
    const body = parse(r);
    expect(body.status).toBe('Draft');
    expect(body.answers.q1).toEqual({ questionLabel: 'Level', questionType: 'single_select', value: 'a' });
  });

  it('stores and returns the talk level, and rejects levels outside 100 to 500', async () => {
    const good = await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1', level: 300 }));
    expect(good.statusCode).toBe(201);
    expect(parse(good).level).toBe(300);
    expect(subs.create.mock.calls[0][0].level).toBe(300);

    const bad = await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1', level: 250 }));
    expect(bad.statusCode).toBe(400);
    expect(parse(bad).error.fields.level).toBeDefined();
  });

  it('requires a level to submit', async () => {
    subs.get.mockResolvedValue(
      sub({
        level: undefined,
        answers: { q1: { questionLabel: 'Level', questionType: 'single_select', value: 'a' } },
      }),
    );
    const r = await handler(makeEvent('POST', '/me/submissions/s1/submit'));
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields.level).toBe('Level is required');
  });

  it('rejects a select answer outside the options', async () => {
    const r = await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1', answers: { q1: 'zzz' } }));
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields['answers.q1']).toBeDefined();
  });

  it('rejects creating on a closed CFP', async () => {
    cfps.get.mockResolvedValue(cfp({ closesAt: past }));
    const r = await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1' }));
    expect(r.statusCode).toBe(409);
    expect(parse(r).error.code).toBe('CFP_CLOSED');
  });

  it('lets a speaker create a draft on a standing CFP (no closesAt)', async () => {
    cfps.get.mockResolvedValue(cfp({ closesAt: undefined }));
    const r = await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1', talkTitle: 'Hi' }));
    expect(r.statusCode).toBe(201);
  });

  it('rejects creating on a standing CFP once an admin has closed it', async () => {
    cfps.get.mockResolvedValue(cfp({ closesAt: undefined, status: 'closed' }));
    const r = await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1' }));
    expect(r.statusCode).toBe(409);
    expect(parse(r).error.code).toBe('CFP_CLOSED');
  });

  it('returns 404 for a draft CFP', async () => {
    cfps.get.mockResolvedValue(cfp({ status: 'draft' }));
    expect((await handler(makeEvent('POST', '/me/submissions', { cfpId: 'c1' }))).statusCode).toBe(404);
  });

  it('returns 404 for another speaker\'s submission on every verb', async () => {
    subs.get.mockResolvedValue(sub({ speakerId: 'other' }));
    for (const [m, p] of [
      ['GET', '/me/submissions/s1'],
      ['PUT', '/me/submissions/s1'],
      ['DELETE', '/me/submissions/s1'],
      ['POST', '/me/submissions/s1/submit'],
    ]) {
      const r = await handler(makeEvent(m, p, m === 'PUT' ? { talkTitle: 'x' } : undefined));
      expect(r.statusCode).toBe(404);
    }
    expect(subs.update).not.toHaveBeenCalled();
  });

  it('submit lists unanswered required items', async () => {
    subs.get.mockResolvedValue(sub());
    const r = await handler(makeEvent('POST', '/me/submissions/s1/submit'));
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields['answers.q1']).toBeDefined();
  });

  it('submits a complete draft and maps status', async () => {
    subs.get.mockResolvedValue(
      sub({ answers: { q1: { questionLabel: 'Level', questionType: 'single_select', value: 'a' } } }),
    );
    const r = await handler(makeEvent('POST', '/me/submissions/s1/submit'));
    expect(r.statusCode).toBe(200);
    expect(subs.update.mock.calls[0][1].status).toBe('submitted');
    expect(parse(r).status).toBe('Under review');
  });

  it('rejects submit after the CFP closes', async () => {
    subs.get.mockResolvedValue(sub());
    cfps.get.mockResolvedValue(cfp({ closesAt: past }));
    expect((await handler(makeEvent('POST', '/me/submissions/s1/submit'))).statusCode).toBe(409);
  });

  it('locks editing once shortlisted without revealing it', async () => {
    subs.get.mockResolvedValue(sub({ status: 'shortlisted' }));
    const r = await handler(makeEvent('PUT', '/me/submissions/s1', { talkTitle: 'x' }));
    expect(r.statusCode).toBe(409);
    expect(parse(r).error.code).toBe('SUBMISSION_LOCKED');
    const g = await handler(makeEvent('GET', '/me/submissions/s1'));
    expect(parse(g).status).toBe('Under review');
  });

  it('withdraws an open submission and blocks it after close', async () => {
    subs.get.mockResolvedValue(sub({ status: 'submitted' }));
    const r = await handler(makeEvent('DELETE', '/me/submissions/s1'));
    expect(r.statusCode).toBe(200);
    expect(parse(r).status).toBe('Withdrawn');
    cfps.get.mockResolvedValue(cfp({ closesAt: past }));
    expect((await handler(makeEvent('DELETE', '/me/submissions/s1'))).statusCode).toBe(409);
  });

  it('lists own submissions without admin or internal fields', async () => {
    subs.listBySpeaker.mockResolvedValue([sub({ status: 'shortlisted', marker: 'not_again', notes: 'x' })]);
    const body = parse(await handler(makeEvent('GET', '/me/submissions')));
    expect(body.submissions[0].status).toBe('Under review');
    expect(body.submissions[0]).not.toHaveProperty('marker');
    expect(body.submissions[0]).not.toHaveProperty('notes');
    expect(body.submissions[0]).not.toHaveProperty('speakerId');
  });
});
