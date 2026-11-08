import { requireAdmin, requireSpeaker } from '../src/shared/auth';
import { Forbidden, Unauthorized } from '../src/shared/http';

// Validates: Requirements 1.7, 1.9
function ev(claims: Record<string, unknown> | null | undefined, extra: Record<string, unknown> = {}): any {
  return { requestContext: { authorizer: claims === undefined ? undefined : { claims } }, ...extra };
}

describe('requireAdmin / requireSpeaker', () => {
  it('allows admin', () => {
    const a = requireAdmin(ev({ sub: 'u1', email: 'a@x.com', 'cognito:groups': ['admin'] }));
    expect(a.userId).toBe('u1');
    expect(a.email).toBe('a@x.com');
  });

  it('allows speaker', () => {
    expect(requireSpeaker(ev({ sub: 'u2', 'cognito:groups': ['speaker'] })).userId).toBe('u2');
  });

  it('a user in BOTH groups passes requireAdmin and requireSpeaker (group list, not role precedence)', () => {
    for (const groups of [['admin', 'speaker'], ['speaker', 'admin'], '[admin speaker]']) {
      const both = ev({ sub: 'u3', 'cognito:groups': groups });
      expect(requireAdmin(both).userId).toBe('u3');
      expect(requireSpeaker(both).userId).toBe('u3');
    }
  });

  it('wrong role -> Forbidden 403', () => {
    const speaker = ev({ sub: 'u', 'cognito:groups': ['speaker'] });
    const admin = ev({ sub: 'u', 'cognito:groups': ['admin'] });
    expect(() => requireAdmin(speaker)).toThrow(Forbidden);
    expect(() => requireSpeaker(admin)).toThrow(Forbidden);
    try { requireAdmin(speaker); } catch (e: any) { expect(e.statusCode ?? e.status).toBe(403); }
  });

  it('no groups -> Forbidden', () => {
    expect(() => requireAdmin(ev({ sub: 'u' }))).toThrow(Forbidden);
    expect(() => requireSpeaker(ev({ sub: 'u' }))).toThrow(Forbidden);
  });

  it.each([
    ['undefined authorizer', ev(undefined)],
    ['null claims', ev(null)],
    ['empty claims', ev({})],
    ['missing sub', ev({ 'cognito:groups': ['admin', 'speaker'] })],
    ['empty sub', ev({ sub: '', 'cognito:groups': ['admin', 'speaker'] })],
    ['no requestContext', {}],
  ])('%s -> Unauthorized', (_n, e) => {
    expect(() => requireAdmin(e as any)).toThrow(Unauthorized);
    expect(() => requireSpeaker(e as any)).toThrow(Unauthorized);
  });

  it.each([
    ['array', ['admin']],
    ['bracketed string', '[admin speaker]'],
    ['comma-separated string', 'speaker,admin'],
  ])('groups as %s', (_n, groups) => {
    expect(requireAdmin(ev({ sub: 'u', 'cognito:groups': groups })).groups).toContain('admin');
  });

  it('parses speaker from bracketed and comma strings', () => {
    expect(requireSpeaker(ev({ sub: 'u', 'cognito:groups': '[admin speaker]' })).groups).toEqual(['admin', 'speaker']);
    expect(requireSpeaker(ev({ sub: 'u', 'cognito:groups': 'speaker,admin' })).groups).toEqual(['speaker', 'admin']);
  });

  it('does not match substrings of group names', () => {
    expect(() => requireAdmin(ev({ sub: 'u', 'cognito:groups': 'superadmin' }))).toThrow(Forbidden);
  });

  describe('spoofed role is ignored', () => {
    const claims = { sub: 'u', 'cognito:groups': ['speaker'] };
    const spoofs = {
      body: JSON.stringify({ role: 'admin', 'cognito:groups': ['admin'], groups: ['admin'] }),
      headers: { 'x-user-role': 'admin', 'cognito:groups': 'admin', 'X-User-Role': 'admin' },
      queryStringParameters: { role: 'admin', 'cognito:groups': 'admin', 'x-user-role': 'admin' },
      multiValueQueryStringParameters: { role: ['admin'] },
    };

    it.each(Object.keys(spoofs))('spoof in %s cannot grant admin', (key) => {
      const e = ev(claims, { [key]: (spoofs as any)[key] });
      expect(() => requireAdmin(e)).toThrow(Forbidden);
      expect(requireSpeaker(e).groups).toEqual(['speaker']);
    });

    it('all spoofs combined still forbidden', () => {
      expect(() => requireAdmin(ev(claims, spoofs))).toThrow(Forbidden);
    });

    it('spoofs cannot replace missing claims', () => {
      expect(() => requireAdmin(ev(undefined, spoofs))).toThrow(Unauthorized);
    });

    it('spoofed identity does not override sub', () => {
      const e = ev({ sub: 'real', 'cognito:groups': ['admin'] }, { headers: { 'x-user-id': 'fake' }, body: '{"sub":"fake"}' });
      expect(requireAdmin(e).userId).toBe('real');
    });
  });
});
