import type { Role } from '../types';

/** Normalise the ID token's cognito:groups claim to a list of strings. */
export const groupsFromClaim = (groups: unknown): string[] =>
  Array.isArray(groups) ? groups.filter((g): g is string => typeof g === 'string') : [];

/**
 * Derive the default app role from the ID token's cognito:groups claim.
 * Admin wins over speaker; this only decides default routing, not which
 * areas the user may open (see canUseView).
 */
export const roleFromGroups = (groups: unknown): Role | null => {
  if (!Array.isArray(groups)) return null;
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('speaker')) return 'speaker';
  return null;
};

/**
 * Whether a user may open the area for `view`. True when their Cognito groups
 * include it (so an admin who is also in the speaker group can open the
 * speaker view). Falls back to the resolved role when groups are unknown.
 */
export const canUseView = (
  groups: readonly string[] | undefined,
  role: Role | null,
  view: Role,
): boolean => (groups ? groups.includes(view) : false) || role === view;

/** Landing path for a role (Req 1.6). */
export const homePathForRole = (role: Role | null): string => {
  if (role === 'admin') return '/admin';
  if (role === 'speaker') return '/speaker';
  return '/login';
};