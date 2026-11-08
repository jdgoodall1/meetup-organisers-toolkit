import { handler } from '../src/handlers/speakers-admin';
import { speakerAdminRepo, speakersRepo } from '../src/shared/repos';

jest.mock('../src/shared/repos', () => ({
  speakersRepo: { get: jest.fn() },
  speakerAdminRepo: { upsert: jest.fn() },
}));

const speakers = speakersRepo as unknown as Record<string, jest.Mock>;
const admin = speakerAdminRepo as unknown as Record<string, jest.Mock>;

const makeEvent = (path: string, groups: string[], body?: unknown): any => ({
  httpMethod: 'PUT',
  path,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  requestContext: { authorizer: { claims: { sub: 'admin-1', email: 'a@example.com', 'cognito:groups': groups } } },
});
const parse = (r: any) => JSON.parse(r.body);

describe('speakers-admin marker and notes', () => {
  beforeEach(() => {
    speakers.get.mockReset().mockResolvedValue({ speakerId: 'sp-1' });
    admin.upsert.mockReset().mockImplementation(async (id: string, f: any) => ({ speakerId: id, ...f }));
  });

  it('returns 403 for speakers on both routes', async () => {
    for (const p of ['marker', 'notes']) {
      const r = await handler(makeEvent(`/admin/speakers/sp-1/${p}`, ['speaker'], { marker: 'have_back', adminNotes: 'x' }));
      expect(r.statusCode).toBe(403);
    }
    expect(admin.upsert).not.toHaveBeenCalled();
  });

  it('sets marker, note and audit fields in one write', async () => {
    const r = await handler(
      makeEvent('/admin/speakers/sp-1/marker', ['admin'], { marker: 'not_again', markerNote: ' no-show ' }),
    );
    expect(r.statusCode).toBe(200);
    expect(admin.upsert).toHaveBeenCalledTimes(1);
    const [id, fields, actor, removes] = admin.upsert.mock.calls[0];
    expect(id).toBe('sp-1');
    expect(actor).toBe('admin-1');
    expect(fields).toMatchObject({ marker: 'not_again', markerNote: 'no-show', markerChangedBy: 'admin-1' });
    expect(typeof fields.markerChangedAt).toBe('string');
    expect(removes).toEqual([]);
  });

  it('unset removes marker and note but records who changed it', async () => {
    await handler(makeEvent('/admin/speakers/sp-1/marker', ['admin'], { marker: 'unset' }));
    const [, fields, , removes] = admin.upsert.mock.calls[0];
    expect(fields).toMatchObject({ markerChangedBy: 'admin-1' });
    expect(fields).not.toHaveProperty('marker');
    expect(removes).toEqual(['marker', 'markerNote']);
  });

  it('rejects invalid marker and overlong note', async () => {
    const r = await handler(
      makeEvent('/admin/speakers/sp-1/marker', ['admin'], { marker: 'maybe', markerNote: 'x'.repeat(1001) }),
    );
    expect(r.statusCode).toBe(400);
    expect(parse(r).error.fields).toHaveProperty('marker');
    expect(parse(r).error.fields).toHaveProperty('markerNote');
  });

  it('returns 404 for an unknown speaker', async () => {
    speakers.get.mockResolvedValue(undefined);
    const r = await handler(makeEvent('/admin/speakers/nope/marker', ['admin'], { marker: 'have_back' }));
    expect(r.statusCode).toBe(404);
    expect(admin.upsert).not.toHaveBeenCalled();
  });

  it('sets and clears admin notes', async () => {
    let r = await handler(makeEvent('/admin/speakers/sp-1/notes', ['admin'], { adminNotes: ' Great ' }));
    expect(r.statusCode).toBe(200);
    expect(admin.upsert.mock.calls[0][1]).toEqual({ adminNotes: 'Great' });
    await handler(makeEvent('/admin/speakers/sp-1/notes', ['admin'], { adminNotes: '  ' }));
    expect(admin.upsert.mock.calls[1][3]).toEqual(['adminNotes']);
    r = await handler(makeEvent('/admin/speakers/sp-1/notes', ['admin'], { adminNotes: 5 }));
    expect(r.statusCode).toBe(400);
  });
});
