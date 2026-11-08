import { handler } from '../src/handlers/speakers-me';
import { speakersRepo } from '../src/shared/repos';
import * as headshots from '../src/shared/headshots';

jest.mock('../src/shared/repos', () => ({
  speakersRepo: { create: jest.fn(), update: jest.fn(), getByUserId: jest.fn() },
}));
jest.mock('../src/shared/headshots', () => ({
  createHeadshotUpload: jest.fn(),
  getHeadshotUrl: jest.fn(),
  deleteHeadshot: jest.fn(),
  headshotKeyPrefix: (id: string) => `headshots/${id}/`,
}));

const repo = speakersRepo as unknown as Record<string, jest.Mock>;
const hs = headshots as unknown as Record<string, jest.Mock>;

const makeEvent = (method: string, path: string, groups: string[], body?: unknown): any => ({
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

const existing = {
  speakerId: 'sp-1',
  userId: 'user-1',
  name: 'Ann',
  bio: 'Bio',
  location: '',
  topics: [],
  links: [],
  pastTalks: [],
  headshotKey: 'headshots/sp-1/old',
  updatedAt: 't',
};

describe('speakers-me handler', () => {
  beforeEach(() => {
    [repo, hs].forEach((r) => Object.values(r).forEach((m) => jest.isMockFunction(m) && m.mockReset()));
    hs.getHeadshotUrl.mockResolvedValue('https://signed.example/get');
    hs.deleteHeadshot.mockResolvedValue(undefined);
  });

  it('rejects admin-only callers with 403', async () => {
    const r = await handler(makeEvent('GET', '/me/profile', ['admin']));
    expect(r.statusCode).toBe(403);
  });

  it('GET returns empty template when no profile exists', async () => {
    repo.getByUserId.mockResolvedValue(undefined);
    const r = await handler(makeEvent('GET', '/me/profile', ['speaker']));
    expect(r.statusCode).toBe(200);
    expect(parse(r)).toMatchObject({ exists: false, name: '', topics: [] });
  });

  it('GET returns profile with signed headshot URL and no admin fields', async () => {
    repo.getByUserId.mockResolvedValue(existing);
    const body = parse(await handler(makeEvent('GET', '/me/profile', ['speaker'])));
    expect(body.headshotUrl).toBe('https://signed.example/get');
    expect(body).not.toHaveProperty('marker');
  });

  it('PUT validates required name and bio', async () => {
    repo.getByUserId.mockResolvedValue(undefined);
    const r = await handler(makeEvent('PUT', '/me/profile', ['speaker'], { name: '', bio: '' }));
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields).toMatchObject({ name: expect.any(String), bio: expect.any(String) });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('PUT creates a profile linked to the caller', async () => {
    repo.getByUserId.mockResolvedValue(undefined);
    repo.create.mockImplementation(async (i: any) => i);
    const r = await handler(
      makeEvent('PUT', '/me/profile', ['speaker'], {
        name: 'Ann',
        bio: 'B',
        topics: ['aws'],
        links: ['https://example.com'],
      }),
    );
    expect(r.statusCode).toBe(200);
    expect(repo.create.mock.calls[0][0]).toMatchObject({ userId: 'user-1', name: 'Ann', topics: ['aws'] });
  });

  it('PUT rejects invalid links and foreign headshot keys', async () => {
    repo.getByUserId.mockResolvedValue(existing);
    const r = await handler(
      makeEvent('PUT', '/me/profile', ['speaker'], {
        name: 'A',
        bio: 'B',
        links: ['javascript:alert(1)'],
        headshotKey: 'headshots/other/x',
      }),
    );
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields).toHaveProperty(['links[0]']);
    expect(parse(r).error.fields).toHaveProperty(['headshotKey']);
  });

  it('PUT replaces headshot and deletes the old object', async () => {
    repo.getByUserId.mockResolvedValue(existing);
    repo.update.mockImplementation(async (_id: string, p: any) => ({ ...existing, ...p }));
    const r = await handler(
      makeEvent('PUT', '/me/profile', ['speaker'], { name: 'A', bio: 'B', headshotKey: 'headshots/sp-1/new' }),
    );
    expect(r.statusCode).toBe(200);
    expect(hs.deleteHeadshot).toHaveBeenCalledWith('headshots/sp-1/old');
  });

  it('headshot-url rejects bad type and oversize files', async () => {
    const r = await handler(
      makeEvent('POST', '/me/profile/headshot-url', ['speaker'], { contentType: 'image/gif', size: 6 * 1024 * 1024 }),
    );
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields).toMatchObject({ contentType: expect.any(String), size: expect.any(String) });
  });

  it('headshot-url requires an existing profile', async () => {
    repo.getByUserId.mockResolvedValue(undefined);
    const r = await handler(
      makeEvent('POST', '/me/profile/headshot-url', ['speaker'], { contentType: 'image/png', size: 1000 }),
    );
    expect(r.statusCode).toBe(400);
  });

  it('headshot-url returns presigned upload for valid input', async () => {
    repo.getByUserId.mockResolvedValue(existing);
    hs.createHeadshotUpload.mockResolvedValue({ url: 'u', fields: {}, key: 'headshots/sp-1/k', expiresInSeconds: 900 });
    const r = await handler(
      makeEvent('POST', '/me/profile/headshot-url', ['speaker'], { contentType: 'image/png', size: 1000 }),
    );
    expect(r.statusCode).toBe(200);
    expect(hs.createHeadshotUpload).toHaveBeenCalledWith('sp-1', 'image/png');
  });
});
