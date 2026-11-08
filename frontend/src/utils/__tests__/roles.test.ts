import { roleFromGroups, homePathForRole, groupsFromClaim, canUseView } from '../roles';

describe('roleFromGroups', () => {
  it('maps admin and speaker groups', () => {
    expect(roleFromGroups(['admin'])).toBe('admin');
    expect(roleFromGroups(['speaker'])).toBe('speaker');
  });

  it('gives admin precedence when in both groups', () => {
    expect(roleFromGroups(['speaker', 'admin'])).toBe('admin');
    expect(roleFromGroups(['admin', 'speaker'])).toBe('admin');
  });

  it('returns null for missing, non-array or unrelated groups', () => {
    expect(roleFromGroups(undefined)).toBeNull();
    expect(roleFromGroups('admin')).toBeNull();
    expect(roleFromGroups([])).toBeNull();
    expect(roleFromGroups(['other'])).toBeNull();
  });
});

describe('homePathForRole', () => {
  it('routes each role to its area and no role to login', () => {
    expect(homePathForRole('admin')).toBe('/admin');
    expect(homePathForRole('speaker')).toBe('/speaker');
    expect(homePathForRole(null)).toBe('/login');
  });
});

describe('groupsFromClaim', () => {
  it('keeps string groups and ignores anything else', () => {
    expect(groupsFromClaim(['admin', 'speaker'])).toEqual(['admin', 'speaker']);
    expect(groupsFromClaim(['admin', 3, null])).toEqual(['admin']);
    expect(groupsFromClaim(undefined)).toEqual([]);
    expect(groupsFromClaim('admin')).toEqual([]);
  });
});

describe('canUseView', () => {
  it('uses group membership, not role precedence', () => {
    expect(canUseView(['admin', 'speaker'], 'admin', 'speaker')).toBe(true);
    expect(canUseView(['admin', 'speaker'], 'admin', 'admin')).toBe(true);
    expect(canUseView(['admin'], 'admin', 'speaker')).toBe(false);
    expect(canUseView(['speaker'], 'speaker', 'admin')).toBe(false);
  });

  it('falls back to the resolved role when groups are unknown', () => {
    expect(canUseView(undefined, 'speaker', 'speaker')).toBe(true);
    expect(canUseView(undefined, 'speaker', 'admin')).toBe(false);
    expect(canUseView(undefined, null, 'admin')).toBe(false);
  });
});