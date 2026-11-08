import { AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { handler } from '../src/handlers/speakers-admin';
import { cognitoClient } from '../src/shared/aws-clients';
import { createHeadshotUpload, deleteHeadshot } from '../src/shared/headshots';
import { bookingsRepo, speakerAdminRepo, speakersRepo, submissionsRepo } from '../src/shared/repos';

jest.mock('../src/shared/aws-clients', () => ({
  cognitoClient: { send: jest.fn() },
  s3Client: {},
  dynamoDocClient: {},
}));
jest.mock('../src/shared/headshots', () => ({
  getHeadshotUrl: jest.fn(async (k: string) => `https://signed/${k}`),
  headshotKeyPrefix: (id: string) => `headshots/${id}/`,
  createHeadshotUpload: jest.fn(),
  deleteHeadshot: jest.fn(),
}));
jest.mock('../src/shared/repos', () => ({
  speakersRepo: { get: jest.fn(), listAll: jest.fn(), create: jest.fn(), update: jest.fn(), getByUserId: jest.fn() },
  speakerAdminRepo: { get: jest.fn(), listAll: jest.fn(), upsert: jest.fn() },
  submissionsRepo: { listBySpeaker: jest.fn() },
  bookingsRepo: { listBySpeaker: jest.fn() },
}));

const speakers = speakersRepo as unknown as Record<string, jest.Mock>;
const admin = speakerAdminRepo as unknown as Record<string, jest.Mock>;
const subs = submissionsRepo as unknown as Record<string, jest.Mock>;
const bookings = bookingsRepo as unknown as Record<string, jest.Mock>;
const cognitoSend = cognitoClient.send as jest.Mock;
const mockUpload = createHeadshotUpload as jest.Mock;
const mockDeleteHeadshot = deleteHeadshot as jest.Mock;

const ev = (method: string, path: string, opts: { groups?: string[]; body?: unknown; qs?: any } = {}): any => ({
  httpMethod: method,
  path,
  body: opts.body === undefined ? null : JSON.stringify(opts.body),
  isBase64Encoded: false,
  queryStringParameters: opts.qs ?? null,
  requestContext: {
    authorizer: { claims: { sub: 'admin-1', email: 'a@example.com', 'cognito:groups': opts.groups ?? ['admin'] } },
  },
});
const json = (r: any) => JSON.parse(r.body);

const alice = { speakerId: 'a', name: 'Alice', bio: 'Rust fan', location: 'London', topics: ['Rust', 'Cloud'], links: [], pastTalks: [{ title: 'Ownership' }], userId: 'u1' };
const bob = { speakerId: 'b', name: 'Bob', bio: 'Data person', location: 'Leeds, UK', topics: ['Data'], links: [], pastTalks: [] };
const cara = { speakerId: 'c', name: 'Cara', bio: 'Frontend', location: 'London', topics: ['Cloud'], links: [], pastTalks: [] };

beforeEach(() => {
  Object.values({ ...speakers, ...admin, ...subs, ...bookings }).forEach((m) => m.mockReset());
  speakers.listAll.mockResolvedValue([bob, cara, alice]);
  admin.listAll.mockResolvedValue([
    { speakerId: 'a', marker: 'have_back', markerNote: 'great', adminNotes: 'secret' },
    { speakerId: 'b', marker: 'not_again' },
  ]);
  admin.get.mockResolvedValue({ speakerId: 'a', marker: 'have_back', adminNotes: 'secret' });
  subs.listBySpeaker.mockResolvedValue([{ submissionId: 's1' }]);
  bookings.listBySpeaker.mockResolvedValue([{ bookingId: 'b1' }]);
  speakers.get.mockResolvedValue({ ...alice, userId: undefined });
  cognitoSend.mockReset().mockResolvedValue({});
  (AdminGetUserCommand as unknown as jest.Mock).mockClear();
  mockUpload.mockReset().mockResolvedValue({ url: 'https://s3', fields: { a: 'b' }, key: 'headshots/a/k', expiresInSeconds: 900 });
  mockDeleteHeadshot.mockReset().mockResolvedValue(undefined);
  speakers.create.mockImplementation(async (i: any) => ({ ...i, createdAt: 't' }));
  speakers.update.mockImplementation(async (id: string, f: any) => ({ ...alice, speakerId: id, ...f }));
});

describe('speakers-admin authorisation', () => {
  it.each([
    ['GET', '/admin/speakers'],
    ['POST', '/admin/speakers'],
    ['GET', '/admin/speakers/a'],
    ['PUT', '/admin/speakers/a'],
    ['POST', '/admin/speakers/a/link'],
    ['POST', '/admin/speakers/a/headshot-url'],
  ])('%s %s rejects speakers', async (m, p) => {
    const r = await handler(ev(m, p, { groups: ['speaker'], body: { name: 'x', bio: 'y', userId: 'u' } }));
    expect(r.statusCode).toBe(403);
    expect(speakers.create).not.toHaveBeenCalled();
    expect(speakers.update).not.toHaveBeenCalled();
  });
});

describe('GET /admin/speakers', () => {
  const list = async (qs?: any) => json(await handler(ev('GET', '/admin/speakers', { qs })));

  it('lists all speakers sorted by name with markers, without admin notes', async () => {
    const res = await list();
    expect(res.items.map((i: any) => i.name)).toEqual(['Alice', 'Bob', 'Cara']);
    expect(res.items[0]).toMatchObject({ marker: 'have_back', linked: true });
    expect(JSON.stringify(res)).not.toContain('secret');
  });

  it('searches free text across name, bio, topics and past talks', async () => {
    expect((await list({ q: 'alice' })).items).toHaveLength(1);
    expect((await list({ q: 'DATA' })).items[0].name).toBe('Bob');
    expect((await list({ q: 'ownership' })).items[0].name).toBe('Alice');
  });

  it('filters by topic, location and marker', async () => {
    expect((await list({ topic: 'cloud' })).items.map((i: any) => i.name)).toEqual(['Alice', 'Cara']);
    expect((await list({ location: 'leeds' })).items.map((i: any) => i.name)).toEqual(['Bob']);
    expect((await list({ marker: 'not_again' })).items.map((i: any) => i.name)).toEqual(['Bob']);
    expect((await list({ marker: 'none' })).items.map((i: any) => i.name)).toEqual(['Cara']);
    expect((await list({ topic: 'cloud', location: 'london', marker: 'have_back' })).items).toHaveLength(1);
  });

  it('rejects an invalid marker filter', async () => {
    const r = await handler(ev('GET', '/admin/speakers', { qs: { marker: 'maybe' } }));
    expect(r.statusCode).toBe(400);
  });
});

describe('POST /admin/speakers', () => {
  it('creates an unlinked profile', async () => {
    const r = await handler(ev('POST', '/admin/speakers', { body: { name: ' Dan ', bio: 'Hi', topics: ['Go'] } }));
    expect(r.statusCode).toBe(201);
    const [item, actor] = speakers.create.mock.calls[0];
    expect(actor).toBe('admin-1');
    expect(item).toMatchObject({ name: 'Dan', bio: 'Hi', topics: ['Go'] });
    expect(item.userId).toBeUndefined();
    expect(typeof item.speakerId).toBe('string');
  });

  it('rejects missing name and bio', async () => {
    const r = await handler(ev('POST', '/admin/speakers', { body: { location: 'x' } }));
    expect(r.statusCode).toBe(400);
    expect(json(r).error.fields).toHaveProperty('name');
    expect(json(r).error.fields).toHaveProperty('bio');
    expect(speakers.create).not.toHaveBeenCalled();
  });
});

describe('GET /admin/speakers/{id}', () => {
  it('returns profile, admin data, submissions and bookings', async () => {
    const r = await handler(ev('GET', '/admin/speakers/a'));
    expect(r.statusCode).toBe(200);
    expect(json(r)).toMatchObject({
      speaker: { speakerId: 'a' },
      admin: { marker: 'have_back', adminNotes: 'secret' },
      submissions: [{ submissionId: 's1' }],
      bookings: [{ bookingId: 'b1' }],
    });
  });

  it('includes the linked account email so the UI never shows a raw id', async () => {
    speakers.get.mockResolvedValue({ ...alice, userId: 'u1' });
    cognitoSend.mockResolvedValue({ UserAttributes: [{ Name: 'email', Value: 'alice@example.com' }] });
    expect(json(await handler(ev('GET', '/admin/speakers/a'))).linkedEmail).toBe('alice@example.com');
  });

  it('still loads the speaker when the account lookup fails', async () => {
    speakers.get.mockResolvedValue({ ...alice, userId: 'u1' });
    cognitoSend.mockRejectedValue(new Error('cognito down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await handler(ev('GET', '/admin/speakers/a'));
    expect(r.statusCode).toBe(200);
    expect(json(r).linkedEmail).toBeNull();
  });

  it('returns 404 for an unknown speaker', async () => {
    speakers.get.mockResolvedValue(undefined);
    expect((await handler(ev('GET', '/admin/speakers/zzz'))).statusCode).toBe(404);
  });

  it('returns an empty bookings list when the bookings repo is unavailable', async () => {
    bookings.listBySpeaker = undefined as any;
    const r = await handler(ev('GET', '/admin/speakers/a'));
    expect(r.statusCode).toBe(200);
    expect(json(r).bookings).toEqual([]);
    bookings.listBySpeaker = jest.fn();
  });
});

describe('PUT /admin/speakers/{id}', () => {
  it('edits any profile without touching userId', async () => {
    const r = await handler(ev('PUT', '/admin/speakers/a', { body: { name: 'New', bio: 'Bio', updatedAt: 't1' } }));
    expect(r.statusCode).toBe(200);
    const [id, fields, actor, expected] = speakers.update.mock.calls[0];
    expect([id, actor, expected]).toEqual(['a', 'admin-1', 't1']);
    expect(fields).toMatchObject({ name: 'New', bio: 'Bio' });
    expect(fields).not.toHaveProperty('userId');
  });

  it('validates and 404s', async () => {
    expect((await handler(ev('PUT', '/admin/speakers/a', { body: { name: '' } }))).statusCode).toBe(400);
    speakers.get.mockResolvedValue(undefined);
    expect((await handler(ev('PUT', '/admin/speakers/a', { body: { name: 'n', bio: 'b' } }))).statusCode).toBe(404);
  });
});

describe('POST /admin/speakers/{id}/link', () => {
  const link = (userId?: unknown) => handler(ev('POST', '/admin/speakers/a/link', { body: { userId } }));

  it('links an unlinked profile to an account', async () => {
    speakers.getByUserId.mockResolvedValue(undefined);
    const r = await link('u9');
    expect(r.statusCode).toBe(200);
    expect(speakers.update).toHaveBeenCalledWith('a', { userId: 'u9' }, 'admin-1');
    expect(AdminGetUserCommand).toHaveBeenCalledWith({ UserPoolId: 'test-user-pool', Username: 'u9' });
  });

  it('rejects a userId that does not exist in Cognito with a field error', async () => {
    speakers.getByUserId.mockResolvedValue(undefined);
    cognitoSend.mockRejectedValue(Object.assign(new Error('nope'), { name: 'UserNotFoundException' }));
    const r = await link('ghost');
    expect(r.statusCode).toBe(400);
    expect(json(r).error.fields).toHaveProperty('email');
    expect(speakers.update).not.toHaveBeenCalled();
  });

  it('links by email and stores the account id (sub), not the email', async () => {
    speakers.getByUserId.mockResolvedValue(undefined);
    cognitoSend.mockResolvedValue({
      Username: 'internal-name',
      UserAttributes: [
        { Name: 'sub', Value: 'sub-123' },
        { Name: 'email', Value: 'sam@example.com' },
      ],
    });
    const r = await handler(ev('POST', '/admin/speakers/a/link', { body: { email: 'sam@example.com' } }));
    expect(r.statusCode).toBe(200);
    expect(AdminGetUserCommand).toHaveBeenCalledWith({ UserPoolId: 'test-user-pool', Username: 'sam@example.com' });
    expect(speakers.update).toHaveBeenCalledWith('a', { userId: 'sub-123' }, 'admin-1');
  });

  it('surfaces unexpected Cognito failures instead of linking', async () => {
    speakers.getByUserId.mockResolvedValue(undefined);
    cognitoSend.mockRejectedValue(Object.assign(new Error('boom'), { name: 'InternalErrorException' }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await link('u9')).statusCode).toBe(500);
    expect(speakers.update).not.toHaveBeenCalled();
  });

  it('requires a userId', async () => {
    expect((await link('  ')).statusCode).toBe(400);
  });

  it('conflicts when the profile is already linked or the account has a profile', async () => {
    speakers.get.mockResolvedValue({ ...alice, userId: 'other' });
    expect((await link('u9')).statusCode).toBe(409);
    speakers.get.mockResolvedValue({ ...alice, userId: undefined });
    speakers.getByUserId.mockResolvedValue({ speakerId: 'zzz' });
    expect((await link('u9')).statusCode).toBe(409);
    expect(speakers.update).not.toHaveBeenCalled();
  });

  it('is idempotent when already linked to the same account', async () => {
    speakers.get.mockResolvedValue({ ...alice, userId: 'u9' });
    expect((await link('u9')).statusCode).toBe(200);
    expect(speakers.update).not.toHaveBeenCalled();
  });
});

describe('admin headshots', () => {
  const upload = (body: unknown, id = 'a') => handler(ev('POST', `/admin/speakers/${id}/headshot-url`, { body }));

  it('issues a presigned upload for an existing speaker', async () => {
    const r = await upload({ contentType: 'IMAGE/PNG ', size: 1000 });
    expect(r.statusCode).toBe(200);
    expect(json(r)).toMatchObject({ url: 'https://s3', key: 'headshots/a/k' });
    expect(mockUpload).toHaveBeenCalledWith('a', 'image/png');
  });

  it('applies the shared headshot limits', async () => {
    const badType = await upload({ contentType: 'image/gif', size: 10 });
    expect(badType.statusCode).toBe(400);
    expect(json(badType).error.fields).toHaveProperty('contentType');
    const tooBig = await upload({ contentType: 'image/png', size: 5 * 1024 * 1024 + 1 });
    expect(json(tooBig).error.fields).toHaveProperty('size');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('404s for an unknown speaker', async () => {
    speakers.get.mockResolvedValue(undefined);
    expect((await upload({ contentType: 'image/png', size: 10 })).statusCode).toBe(404);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  const put = (extra: Record<string, unknown>) =>
    handler(ev('PUT', '/admin/speakers/a', { body: { name: 'N', bio: 'B', ...extra } }));

  it('sets a headshotKey under the speaker prefix and removes the replaced object', async () => {
    speakers.get.mockResolvedValue({ ...alice, headshotKey: 'headshots/a/old' });
    const r = await put({ headshotKey: 'headshots/a/new' });
    expect(r.statusCode).toBe(200);
    expect(speakers.update.mock.calls[0][1]).toMatchObject({ headshotKey: 'headshots/a/new' });
    expect(mockDeleteHeadshot).toHaveBeenCalledWith('headshots/a/old');
  });

  it('clears the headshot with null and deletes the object', async () => {
    speakers.get.mockResolvedValue({ ...alice, headshotKey: 'headshots/a/old' });
    const r = await put({ headshotKey: null });
    expect(r.statusCode).toBe(200);
    const fields = speakers.update.mock.calls[0][1];
    expect('headshotKey' in fields).toBe(true);
    expect(fields.headshotKey).toBeUndefined();
    expect(mockDeleteHeadshot).toHaveBeenCalledWith('headshots/a/old');
  });

  it('rejects keys outside the speaker prefix', async () => {
    const r = await put({ headshotKey: 'headshots/other/x' });
    expect(r.statusCode).toBe(400);
    expect(json(r).error.fields).toHaveProperty('headshotKey');
    expect(speakers.update).not.toHaveBeenCalled();
  });

  it('leaves the headshot untouched when headshotKey is omitted', async () => {
    speakers.get.mockResolvedValue({ ...alice, headshotKey: 'headshots/a/old' });
    await put({});
    expect(speakers.update.mock.calls[0][1]).not.toHaveProperty('headshotKey');
    expect(mockDeleteHeadshot).not.toHaveBeenCalled();
  });

  it('keeps the save when deleting the old object fails', async () => {
    speakers.get.mockResolvedValue({ ...alice, headshotKey: 'headshots/a/old' });
    mockDeleteHeadshot.mockRejectedValue(new Error('s3 down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await put({ headshotKey: null })).statusCode).toBe(200);
  });
});