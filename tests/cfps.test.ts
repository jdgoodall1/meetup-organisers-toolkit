import { handler } from '../src/handlers/cfps';
import { cfpsRepo, questionTemplatesRepo, submissionsRepo } from '../src/shared/repos';

jest.mock('../src/shared/repos', () => ({
  cfpsRepo: {
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listAll: jest.fn(),
    listByStatus: jest.fn(),
  },
  questionTemplatesRepo: {
    create: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    listAll: jest.fn(),
  },
  submissionsRepo: { listByCfp: jest.fn() },
}));

const cfps = cfpsRepo as unknown as Record<string, jest.Mock>;
const templates = questionTemplatesRepo as unknown as Record<string, jest.Mock>;
const subs = submissionsRepo as unknown as Record<string, jest.Mock>;

const makeEvent = (
  method: string,
  path: string,
  groups: string[],
  body?: unknown,
  query?: Record<string, string>,
): any => ({
  httpMethod: method,
  path,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
  queryStringParameters: query ?? null,
  requestContext: {
    authorizer: { claims: { sub: 'user-sub', email: 'a@example.com', 'cognito:groups': groups } },
  },
});
const parse = (r: any) => JSON.parse(r.body);

const q = (id: string, type: any = 'short_text', order = 0, extra: object = {}) => ({
  questionId: id,
  type,
  label: `Q ${id}`,
  required: false,
  order,
  ...extra,
});
const cfp = (over: object = {}): any => ({
  cfpId: 'c1',
  title: 'CFP',
  description: 'd',
  opensAt: '2020-01-01T00:00:00Z',
  closesAt: '2999-01-01T00:00:00Z',
  status: 'open',
  questions: [q('a'), q('b', 'long_text', 1)],
  updatedAt: 'u1',
  ...over,
});

describe('cfps handler', () => {
  beforeEach(() => {
    [cfps, templates, subs].forEach((r) => Object.values(r).forEach((m) => m.mockReset()));
    subs.listByCfp.mockResolvedValue([]);
    cfps.update.mockImplementation(async (_id, patch) => ({ ...cfp(), ...patch }));
    cfps.create.mockImplementation(async (item) => item);
  });

  it('403 for speakers on admin routes and for admins-only on /me routes', async () => {
    for (const [m, p] of [
      ['GET', '/admin/cfps'],
      ['POST', '/admin/cfps'],
      ['PUT', '/admin/cfps/1/questions'],
      ['GET', '/admin/templates'],
      ['POST', '/admin/cfps/1/apply-template'],
    ]) {
      expect((await handler(makeEvent(m, p, ['speaker'], {}))).statusCode).toBe(403);
    }
    expect((await handler(makeEvent('GET', '/me/cfps', ['admin']))).statusCode).toBe(403);
  });

  describe('admin CRUD', () => {
    it('creates a draft CFP and rejects close before open', async () => {
      const okRes = await handler(
        makeEvent('POST', '/admin/cfps', ['admin'], {
          title: 'T',
          opensAt: '2025-01-01T00:00:00Z',
          closesAt: '2025-02-01T00:00:00Z',
        }),
      );
      expect(okRes.statusCode).toBe(201);
      expect(cfps.create.mock.calls[0][0]).toMatchObject({ status: 'draft', questions: [] });

      const bad = await handler(
        makeEvent('POST', '/admin/cfps', ['admin'], {
          title: 'T',
          opensAt: '2025-02-01T00:00:00Z',
          closesAt: '2025-01-01T00:00:00Z',
        }),
      );
      expect(bad.statusCode).toBe(400);
      expect(parse(bad).error.fields.closesAt).toBeTruthy();
    });

    it('closes and reopens via PUT status', async () => {
      cfps.get.mockResolvedValue(cfp());
      await handler(makeEvent('PUT', '/admin/cfps/c1', ['admin'], { status: 'closed' }));
      expect(cfps.update.mock.calls[0][1]).toMatchObject({ status: 'closed' });
      cfps.get.mockResolvedValue(cfp({ status: 'closed' }));
      await handler(makeEvent('PUT', '/admin/cfps/c1', ['admin'], { status: 'open' }));
      expect(cfps.update.mock.calls[1][1]).toMatchObject({ status: 'open' });
    });

    it('ignores eventId: CFPs are not linked to events, and legacy eventId is never written back', async () => {
      cfps.get.mockResolvedValue(cfp({ eventId: 'legacy' }));
      const res = await handler(makeEvent('PUT', '/admin/cfps/c1', ['admin'], { eventId: 'e1', title: 'New' }));
      expect(res.statusCode).toBe(200);
      expect(cfps.update.mock.calls[0][1]).not.toHaveProperty('eventId');
      expect(cfps.update.mock.calls[0][1].title).toBe('New');

      await handler(makeEvent('POST', '/admin/cfps', ['admin'], { title: 'T', eventId: 'e1' }));
      expect(cfps.create.mock.calls[0][0]).not.toHaveProperty('eventId');
    });

    it('creates a standing CFP with no dates (no undefined attributes are written)', async () => {
      const res = await handler(makeEvent('POST', '/admin/cfps', ['admin'], { title: 'Standing' }));
      expect(res.statusCode).toBe(201);
      const item = cfps.create.mock.calls[0][0];
      expect(item).toMatchObject({ title: 'Standing', status: 'draft' });
      expect(Object.keys(item)).not.toContain('closesAt');
      expect(Object.keys(item)).not.toContain('opensAt');
    });

    it('validates dates only when given: closes must be after opens when both exist', async () => {
      const onlyCloses = await handler(
        makeEvent('POST', '/admin/cfps', ['admin'], { title: 'T', closesAt: '2030-01-01T00:00:00Z' }),
      );
      expect(onlyCloses.statusCode).toBe(201);
      const bad = await handler(
        makeEvent('POST', '/admin/cfps', ['admin'], {
          title: 'T',
          opensAt: '2030-02-01T00:00:00Z',
          closesAt: '2030-01-01T00:00:00Z',
        }),
      );
      expect(bad.statusCode).toBe(400);
      const junk = await handler(makeEvent('POST', '/admin/cfps', ['admin'], { title: 'T', closesAt: 'nope' }));
      expect(junk.statusCode).toBe(400);
    });

    it('clears the close date on update (REMOVE) to make a CFP standing', async () => {
      cfps.get.mockResolvedValue(cfp());
      const res = await handler(makeEvent('PUT', '/admin/cfps/c1', ['admin'], { closesAt: '' }));
      expect(res.statusCode).toBe(200);
      const patch = cfps.update.mock.calls[0][1];
      expect(patch).toHaveProperty('closesAt', undefined);
      expect(patch.opensAt).toBe('2020-01-01T00:00:00Z');
    });

    it('closes and reopens a standing CFP', async () => {
      const standing = cfp({ closesAt: undefined });
      cfps.get.mockResolvedValue(standing);
      await handler(makeEvent('PUT', '/admin/cfps/c1', ['admin'], { status: 'closed' }));
      expect(cfps.update.mock.calls[0][1]).toMatchObject({ status: 'closed', closesAt: undefined });

      cfps.get.mockResolvedValue({ ...standing, status: 'closed' });
      const res = await handler(makeEvent('PUT', '/admin/cfps/c1', ['admin'], { status: 'open' }));
      expect(res.statusCode).toBe(200);
      expect(cfps.update.mock.calls[1][1]).toMatchObject({ status: 'open', closesAt: undefined });
    });

    it('admin detail and list report effectiveStatus for standing CFPs and list tolerates missing dates', async () => {
      cfps.get.mockResolvedValue(cfp({ closesAt: undefined }));
      const detail = parse(await handler(makeEvent('GET', '/admin/cfps/c1', ['admin'])));
      expect(detail.effectiveStatus).toBe('open');

      cfps.listAll.mockResolvedValue([
        cfp({ cfpId: 'dated', closesAt: '2999-01-01T00:00:00Z' }),
        cfp({ cfpId: 'standing', closesAt: undefined }),
        cfp({ cfpId: 'legacy', closesAt: '2998-01-01T00:00:00Z', eventId: 'e-old' }),
      ]);
      const res = await handler(makeEvent('GET', '/admin/cfps', ['admin']));
      expect(res.statusCode).toBe(200);
      const list = parse(res).cfps;
      expect(list.map((c: any) => c.cfpId)).toEqual(['standing', 'dated', 'legacy']);
      expect(list.every((c: any) => c.effectiveStatus === 'open')).toBe(true);
    });
    it('delete needs confirmation when submissions exist', async () => {
      cfps.get.mockResolvedValue(cfp());
      subs.listByCfp.mockResolvedValue([{ submissionId: 's1' }]);
      const res = await handler(makeEvent('DELETE', '/admin/cfps/c1', ['admin']));
      expect(res.statusCode).toBe(409);
      expect(parse(res).error.code).toBe('CONFIRM_REQUIRED');
      expect(cfps.delete).not.toHaveBeenCalled();

      const res2 = await handler(makeEvent('DELETE', '/admin/cfps/c1', ['admin'], undefined, { confirm: 'true' }));
      expect(res2.statusCode).toBe(204);
      expect(cfps.delete).toHaveBeenCalledWith('c1');
    });

    it('deletes without confirmation when there are no submissions', async () => {
      cfps.get.mockResolvedValue(cfp());
      expect((await handler(makeEvent('DELETE', '/admin/cfps/c1', ['admin']))).statusCode).toBe(204);
    });

    it('duplicate creates a draft with new question IDs and drops any legacy event link', async () => {
      cfps.get.mockResolvedValue(cfp({ eventId: 'e1' }));
      const res = await handler(makeEvent('POST', '/admin/cfps/c1/duplicate', ['admin']));
      expect(res.statusCode).toBe(201);
      const item = cfps.create.mock.calls[0][0];
      expect(item.cfpId).not.toBe('c1');
      expect(item.status).toBe('draft');
      expect(item.eventId).toBeUndefined();
      expect(item.title).toBe('Copy of CFP');
      expect(item.questions).toHaveLength(2);
      expect(item.questions.map((x: any) => x.questionId)).not.toContain('a');
    });

    it('duplicate of a standing CFP is a standing draft', async () => {
      cfps.get.mockResolvedValue(cfp({ closesAt: undefined, opensAt: undefined }));
      const res = await handler(makeEvent('POST', '/admin/cfps/c1/duplicate', ['admin']));
      expect(res.statusCode).toBe(201);
      const item = cfps.create.mock.calls[0][0];
      expect(item.status).toBe('draft');
      expect(Object.keys(item)).not.toContain('closesAt');
      expect(Object.keys(item)).not.toContain('opensAt');
    });
  });

  describe('PUT questions', () => {
    it('validates select options and assigns order and IDs', async () => {
      cfps.get.mockResolvedValue(cfp({ questions: [] }));
      const bad = await handler(
        makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], {
          questions: [{ type: 'single_select', label: 'x', options: ['only'] }],
        }),
      );
      expect(bad.statusCode).toBe(400);
      expect(parse(bad).error.fields['questions[0].options']).toBeTruthy();

      const res = await handler(
        makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], {
          questions: [
            { type: 'yes_no', label: 'First', required: true, helpText: ' hi ' },
            { type: 'multi_select', label: 'Second', options: ['a', 'b'] },
          ],
        }),
      );
      expect(res.statusCode).toBe(200);
      const saved = cfps.update.mock.calls[0][1].questions;
      expect(saved.map((x: any) => x.order)).toEqual([0, 1]);
      expect(saved[0]).toMatchObject({ required: true, helpText: 'hi' });
      expect(saved[0].questionId).toBeTruthy();
    });

    it('rejects duplicate question IDs', async () => {
      cfps.get.mockResolvedValue(cfp());
      const res = await handler(
        makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], {
          questions: [q('a'), q('a')],
        }),
      );
      expect(res.statusCode).toBe(400);
    });

    it('warns before removing or retyping when submissions exist, and allows with confirm', async () => {
      cfps.get.mockResolvedValue(cfp());
      subs.listByCfp.mockResolvedValue([{ submissionId: 's1' }]);
      const removal = { questions: [q('a')] };
      const r1 = await handler(makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], removal));
      expect(r1.statusCode).toBe(409);
      expect(parse(r1).error.code).toBe('CONFIRM_REQUIRED');

      const retype = { questions: [q('a', 'number'), q('b', 'long_text', 1)] };
      const r2 = await handler(makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], retype));
      expect(r2.statusCode).toBe(409);

      const r3 = await handler(
        makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], removal, { confirm: 'true' }),
      );
      expect(r3.statusCode).toBe(200);
    });

    it('does not warn for reorder, edits, or additions with submissions', async () => {
      cfps.get.mockResolvedValue(cfp());
      subs.listByCfp.mockResolvedValue([{ submissionId: 's1' }]);
      const res = await handler(
        makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], {
          questions: [q('b', 'long_text'), q('a'), { type: 'yes_no', label: 'new' }],
        }),
      );
      expect(res.statusCode).toBe(200);
    });

    it('does not warn when removing with no submissions', async () => {
      cfps.get.mockResolvedValue(cfp());
      const res = await handler(
        makeEvent('PUT', '/admin/cfps/c1/questions', ['admin'], { questions: [] }),
      );
      expect(res.statusCode).toBe(200);
    });
  });

  describe('templates', () => {
    it('creates from a CFP and lists and deletes', async () => {
      cfps.get.mockResolvedValue(cfp());
      templates.create.mockImplementation(async (item) => item);
      const res = await handler(
        makeEvent('POST', '/admin/templates', ['admin'], { name: 'Std', cfpId: 'c1' }),
      );
      expect(res.statusCode).toBe(201);
      expect(templates.create.mock.calls[0][0].questions).toHaveLength(2);

      templates.listAll.mockResolvedValue([{ name: 'b' }, { name: 'a' }]);
      const list = await handler(makeEvent('GET', '/admin/templates', ['admin']));
      expect(parse(list).templates.map((t: any) => t.name)).toEqual(['a', 'b']);

      templates.get.mockResolvedValue({ templateId: 't1' });
      expect((await handler(makeEvent('DELETE', '/admin/templates/t1', ['admin']))).statusCode).toBe(204);
      templates.get.mockResolvedValue(undefined);
      expect((await handler(makeEvent('DELETE', '/admin/templates/t1', ['admin']))).statusCode).toBe(404);
    });

    it('requires a name', async () => {
      const res = await handler(makeEvent('POST', '/admin/templates', ['admin'], { questions: [] }));
      expect(res.statusCode).toBe(400);
    });

    it('apply copies questions with new IDs; later template edits do not alter the CFP', async () => {
      const tmpl: any = {
        templateId: 't1',
        name: 'T',
        questions: [q('t-a', 'single_select', 0, { options: ['x', 'y'] }), q('t-b', 'yes_no', 1)],
      };
      templates.get.mockResolvedValue(tmpl);
      cfps.get.mockResolvedValue(cfp({ questions: [] }));

      const res = await handler(
        makeEvent('POST', '/admin/cfps/c1/apply-template', ['admin'], { templateId: 't1' }),
      );
      expect(res.statusCode).toBe(200);
      const saved = cfps.update.mock.calls[0][1].questions;
      expect(saved).toHaveLength(2);
      expect(saved.map((x: any) => x.questionId)).not.toContain('t-a');
      expect(saved.map((x: any) => x.questionId)).not.toContain('t-b');

      // Snapshot what the CFP stored, then mutate the template.
      const snapshot = JSON.parse(JSON.stringify(saved));
      tmpl.questions[0].label = 'CHANGED';
      tmpl.questions[0].options.push('z');
      tmpl.questions.pop();
      expect(saved).toEqual(snapshot);
      expect(saved[0].options).toEqual(['x', 'y']);
    });

    it('append keeps existing questions; replace warns if submissions exist', async () => {
      templates.get.mockResolvedValue({ templateId: 't1', questions: [q('t-a')] });
      cfps.get.mockResolvedValue(cfp());
      await handler(makeEvent('POST', '/admin/cfps/c1/apply-template', ['admin'], { templateId: 't1' }));
      expect(cfps.update.mock.calls[0][1].questions).toHaveLength(3);

      subs.listByCfp.mockResolvedValue([{ submissionId: 's1' }]);
      const res = await handler(
        makeEvent('POST', '/admin/cfps/c1/apply-template', ['admin'], { templateId: 't1', mode: 'replace' }),
      );
      expect(res.statusCode).toBe(409);
    });

    it('404 for unknown template', async () => {
      cfps.get.mockResolvedValue(cfp());
      templates.get.mockResolvedValue(undefined);
      const res = await handler(
        makeEvent('POST', '/admin/cfps/c1/apply-template', ['admin'], { templateId: 'x' }),
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe('speaker endpoints', () => {
    it('lists only effectively open CFPs without audit fields', async () => {
      cfps.listByStatus.mockResolvedValue([
        cfp({ cfpId: 'open1', createdBy: 'secret' }),
        cfp({ cfpId: 'expired', closesAt: '2000-01-01T00:00:00Z', opensAt: '1999-01-01T00:00:00Z' }),
      ]);
      const res = await handler(makeEvent('GET', '/me/cfps', ['speaker']));
      const list = parse(res).cfps;
      expect(list.map((c: any) => c.cfpId)).toEqual(['open1']);
      expect(list[0].createdBy).toBeUndefined();
      expect(cfps.listByStatus).toHaveBeenCalledWith('open');
    });

    it('lists standing CFPs (no closesAt) as open, after dated ones, and reports no closesAt', async () => {
      cfps.listByStatus.mockResolvedValue([
        cfp({ cfpId: 'standing', closesAt: undefined, opensAt: undefined }),
        cfp({ cfpId: 'dated', closesAt: '2998-01-01T00:00:00Z' }),
        cfp({ cfpId: 'legacy', eventId: 'e-old', closesAt: '2997-01-01T00:00:00Z' }),
      ]);
      const list = parse(await handler(makeEvent('GET', '/me/cfps', ['speaker']))).cfps;
      expect(list.map((c: any) => c.cfpId)).toEqual(['legacy', 'dated', 'standing']);
      expect(list[2].closesAt).toBeUndefined();
      expect(list[0].eventId).toBeUndefined();
    });

    it('detail for a standing open CFP succeeds; a standing CFP that was closed is 404', async () => {
      cfps.get.mockResolvedValue(cfp({ closesAt: undefined }));
      expect((await handler(makeEvent('GET', '/me/cfps/c1', ['speaker']))).statusCode).toBe(200);
      cfps.get.mockResolvedValue(cfp({ closesAt: undefined, status: 'closed' }));
      expect((await handler(makeEvent('GET', '/me/cfps/c1', ['speaker']))).statusCode).toBe(404);
    });

    it('allows a speaker who is also an admin (both groups) on /me/cfps', async () => {
      cfps.listByStatus.mockResolvedValue([]);
      expect((await handler(makeEvent('GET', '/me/cfps', ['admin', 'speaker']))).statusCode).toBe(200);
    });

    it('detail returns ordered questions for open CFPs, 404 for draft/closed/expired/missing', async () => {
      cfps.get.mockResolvedValue(cfp({ questions: [q('b', 'short_text', 1), q('a', 'short_text', 0)] }));
      const res = await handler(makeEvent('GET', '/me/cfps/c1', ['speaker']));
      expect(parse(res).questions.map((x: any) => x.questionId)).toEqual(['a', 'b']);

      for (const over of [
        { status: 'draft' },
        { status: 'closed' },
        { closesAt: '2000-01-01T00:00:00Z' },
      ]) {
        cfps.get.mockResolvedValue(cfp(over));
        expect((await handler(makeEvent('GET', '/me/cfps/c1', ['speaker']))).statusCode).toBe(404);
      }
      cfps.get.mockResolvedValue(undefined);
      expect((await handler(makeEvent('GET', '/me/cfps/c1', ['speaker']))).statusCode).toBe(404);
    });
  });
});
