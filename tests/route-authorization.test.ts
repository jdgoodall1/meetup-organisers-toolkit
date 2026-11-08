// Route-level authorisation tests (Requirements 1.7, 11.1, 11.2).
//  - Every implemented `/admin/*` route returns 403 for a speaker token and
//    never touches a repository.
//  - Every implemented `/me/*` route that takes a resource ID returns 404 for
//    another speaker's resource and never writes.
// The route list is driven from template.yaml (API events per function) and
// cross-checked against each handler's own route table so no route is missed.

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Every repo method is an auto-recording stub. Tests can override behaviour via
// mockRepoImpl[repoName][method]. Any call is recorded in mockRepoCalls.
jest.mock('../src/shared/repos', () => {
  const calls: string[] = [];
  const impl: Record<string, Record<string, (...a: unknown[]) => unknown>> = {};
  const repoProxy = (repo: string) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== 'string' || method === 'then') return undefined;
          return async (...args: unknown[]) => {
            calls.push(`${repo}.${method}`);
            return impl[repo]?.[method]?.(...args);
          };
        },
      },
    );
  const cache: Record<string, unknown> = {};
  return new Proxy(
    { mockRepoCalls: calls, mockRepoImpl: impl },
    {
      get: (target, name) => {
        if (name === '__esModule') return true;
        if (typeof name !== 'string' || name === 'then') return undefined;
        if (name in target) return (target as Record<string, unknown>)[name];
        return (cache[name] ??= repoProxy(name));
      },
    },
  );
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const repoMock = require('../src/shared/repos') as {
  mockRepoCalls: string[];
  mockRepoImpl: Record<string, Record<string, (...a: unknown[]) => unknown>>;
};

// ---------------------------------------------------------------------------
// template.yaml -> routes
// ---------------------------------------------------------------------------

const cfnTags = ['Ref', 'GetAtt', 'Sub', 'Join', 'Select', 'Split', 'If', 'Equals', 'Not', 'FindInMap', 'ImportValue', 'GetAZs', 'Base64'];
const CFN_SCHEMA = yaml.DEFAULT_SCHEMA.extend(
  cfnTags.flatMap((tag) =>
    (['scalar', 'sequence', 'mapping'] as const).map(
      (kind) =>
        new yaml.Type(`!${tag}`, {
          kind,
          construct: (data: unknown) => ({ [tag === 'Ref' ? 'Ref' : `Fn::${tag}`]: data }),
        }),
    ),
  ),
);

interface RouteDef {
  handlerName: string;
  method: string;
  path: string;
}

const ROOT = path.join(__dirname, '..');
const template = yaml.load(fs.readFileSync(path.join(ROOT, 'template.yaml'), 'utf8'), {
  schema: CFN_SCHEMA,
}) as { Resources: Record<string, any> };

const templateRoutes: RouteDef[] = [];
for (const res of Object.values(template.Resources)) {
  if (res.Type !== 'AWS::Serverless::Function') continue;
  const handlerName = String(res.Properties.Handler).replace(/^handlers\//, '').replace(/\.handler$/, '');
  for (const ev of Object.values<any>(res.Properties.Events ?? {})) {
    if (ev.Type !== 'Api') continue;
    templateRoutes.push({
      handlerName,
      method: String(ev.Properties.Method).toUpperCase(),
      path: String(ev.Properties.Path),
    });
  }
}

/** Routes declared in a handler's own route table (parsed from source). */
function sourceRoutes(handlerName: string): RouteDef[] {
  const file = path.join(ROOT, 'src', 'handlers', `${handlerName}.ts`);
  const src = fs.readFileSync(file, 'utf8');
  const out: RouteDef[] = [];
  const re = /method:\s*'(\w+)',\s*path:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ handlerName, method: m[1].toUpperCase(), path: m[2] });
  return out;
}

const handlerExists = (name: string) => fs.existsSync(path.join(ROOT, 'src', 'handlers', `${name}.ts`));
const key = (r: RouteDef) => `${r.method} ${r.path}`;
const concretePath = (p: string) => p.replace(/\{[^}]+\}/g, 'some-id');

const handlerNames = Array.from(new Set(templateRoutes.map((r) => r.handlerName))).filter(handlerExists);

// Routes in the template whose handler does not (yet) implement them. These
// would 404 rather than 403; listed explicitly so new gaps are noticed and
// implemented routes are covered automatically.
const KNOWN_UNIMPLEMENTED = new Set<string>([]);

// Handlers declared in the template but not written yet.
const KNOWN_MISSING_HANDLERS = new Set<string>([]);

const implemented = (r: RouteDef) => sourceRoutes(r.handlerName).some((s) => key(s) === key(r));

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

const makeEvent = (method: string, p: string, groups: string[], sub = 'user-1'): any => ({
  httpMethod: method,
  path: p,
  body: JSON.stringify({ role: 'admin', groups: ['admin'] }), // spoofed role in body
  isBase64Encoded: false,
  queryStringParameters: null,
  headers: { 'x-role': 'admin', 'cognito:groups': 'admin' }, // spoofed role in headers
  requestContext: { authorizer: { claims: { sub, email: 'x@example.com', 'cognito:groups': groups } } },
});

beforeEach(() => {
  repoMock.mockRepoCalls.length = 0;
  for (const k of Object.keys(repoMock.mockRepoImpl)) delete repoMock.mockRepoImpl[k];
});

// ---------------------------------------------------------------------------
// Route coverage
// ---------------------------------------------------------------------------

describe('route table coverage', () => {
  it('reads routes from the template', () => {
    expect(templateRoutes.filter((r) => r.path.startsWith('/admin/')).length).toBeGreaterThan(20);
    expect(templateRoutes.filter((r) => r.path.startsWith('/me')).length).toBeGreaterThan(5);
  });

  it('only lacks handlers that are known to be pending', () => {
    const all = new Set(templateRoutes.map((r) => r.handlerName));
    const missing = Array.from(all).filter((n) => !handlerExists(n) && n !== 'post-confirmation');
    expect(missing.filter((n) => !KNOWN_MISSING_HANDLERS.has(n))).toEqual([]);
  });

  it.each(handlerNames)('%s: every /admin and /me route in the handler is wired in the template', (name) => {
    const tpl = new Set(templateRoutes.filter((r) => r.handlerName === name).map(key));
    const unwired = sourceRoutes(name)
      .filter((r) => r.path.startsWith('/admin/') || r.path === '/me' || r.path.startsWith('/me/'))
      .map(key)
      .filter((k) => !tpl.has(k));
    expect(unwired).toEqual([]);
  });

  it.each(handlerNames)('%s: template routes missing from the handler are known gaps', (name) => {
    const gaps = templateRoutes
      .filter((r) => r.handlerName === name && !implemented(r))
      .map(key)
      .filter((k) => !KNOWN_UNIMPLEMENTED.has(k));
    expect(gaps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// /admin/* -> 403 for speakers (Req 1.7, 11.1)
// ---------------------------------------------------------------------------

describe('/admin/* routes reject speaker tokens', () => {
  const adminRoutes = templateRoutes.filter(
    (r) => r.path.startsWith('/admin/') && handlerExists(r.handlerName) && implemented(r),
  );

  it('has admin routes to check', () => {
    expect(adminRoutes.length).toBeGreaterThan(20);
  });

  it.each(adminRoutes.map((r) => [`${r.handlerName}: ${key(r)}`, r] as const))('%s', async (_n, r) => {
    const { handler } = await import(`../src/handlers/${r.handlerName}`);
    // Speaker-only, speaker + unrelated group, and no groups at all.
    for (const groups of [['speaker'], ['speaker', 'other'], []]) {
      const res = await handler(makeEvent(r.method, concretePath(r.path), groups));
      expect(res.statusCode).toBe(403);
    }
    expect(repoMock.mockRepoCalls).toEqual([]);
  });

  it.each(adminRoutes.map((r) => [`${r.handlerName}: ${key(r)}`, r] as const))(
    '%s rejects a missing token with 401',
    async (_n, r) => {
      const { handler } = await import(`../src/handlers/${r.handlerName}`);
      const ev = makeEvent(r.method, concretePath(r.path), ['admin']);
      ev.requestContext = {};
      expect((await handler(ev)).statusCode).toBe(401);
      expect(repoMock.mockRepoCalls).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// /me/* -> other speakers' resources are 404 (Req 11.2)
// ---------------------------------------------------------------------------

describe('/me/* routes reject other speakers\' resources', () => {
  // /me/* routes taking an ID, and how foreign ownership is simulated.
  // /me/cfps/{id} is a shared (not speaker-owned) resource and is exempt; a
  // draft/closed CFP is covered by its own tests.
  const EXEMPT = new Set(['GET /me/cfps/{id}']);

  const meIdRoutes = templateRoutes.filter(
    (r) =>
      r.path.startsWith('/me/') &&
      r.path.includes('{') &&
      handlerExists(r.handlerName) &&
      implemented(r) &&
      !EXEMPT.has(key(r)),
  );

  const foreignSubmission = {
    submissionId: 'some-id',
    cfpId: 'c1',
    speakerId: 'sp-other',
    status: 'draft',
    talkTitle: 'Theirs',
    abstract: 'Theirs',
    durationMinutes: 30,
    answers: {},
    createdAt: 't0',
    updatedAt: 't1',
  };

  const arrange = () => {
    repoMock.mockRepoImpl.speakersRepo = {
      getByUserId: () => ({ speakerId: 'sp-me', userId: 'user-1' }),
    };
    repoMock.mockRepoImpl.submissionsRepo = { get: () => foreignSubmission };
    repoMock.mockRepoImpl.bookingsRepo = {
      get: () => ({ bookingId: 'some-id', speakerId: 'sp-other', status: 'confirmed' }),
    };
  };

  const WRITES = /\.(create|update|put|delete|upsert|remove|save)/i;

  it('has /me/{id} routes to check', () => {
    expect(meIdRoutes.length).toBeGreaterThanOrEqual(4);
  });

  it.each(meIdRoutes.map((r) => [`${r.handlerName}: ${key(r)}`, r] as const))('%s', async (_n, r) => {
    const { handler } = await import(`../src/handlers/${r.handlerName}`);

    // Foreign resource.
    arrange();
    const res = await handler(makeEvent(r.method, concretePath(r.path), ['speaker']));
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('Theirs');
    expect(repoMock.mockRepoCalls.filter((c) => WRITES.test(c))).toEqual([]);

    // A missing resource is indistinguishable from a foreign one.
    repoMock.mockRepoCalls.length = 0;
    repoMock.mockRepoImpl.submissionsRepo = { get: () => undefined };
    repoMock.mockRepoImpl.bookingsRepo = { get: () => undefined };
    const missing = await handler(makeEvent(r.method, concretePath(r.path), ['speaker']));
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toBe(res.body);

    // Caller with no speaker profile cannot reach anyone's resource.
    repoMock.mockRepoCalls.length = 0;
    arrange();
    repoMock.mockRepoImpl.speakersRepo = { getByUserId: () => undefined };
    const noProfile = await handler(makeEvent(r.method, concretePath(r.path), ['speaker']));
    expect(noProfile.statusCode).toBe(404);
    expect(repoMock.mockRepoCalls.filter((c) => WRITES.test(c))).toEqual([]);
  });

  it('own resource is still reachable (guard is not over-broad)', async () => {
    arrange();
    repoMock.mockRepoImpl.submissionsRepo = { get: () => ({ ...foreignSubmission, speakerId: 'sp-me' }) };
    const { handler } = await import('../src/handlers/submissions-me');
    const res = await handler(makeEvent('GET', '/me/submissions/some-id', ['speaker']));
    expect(res.statusCode).toBe(200);
  });
});
