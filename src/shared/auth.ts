// Authorisation helpers.
// Identity and roles are read ONLY from the Cognito authorizer claims in
// `requestContext.authorizer.claims`. Request bodies, headers and query
// strings are never consulted for identity or role.

import { Forbidden, Unauthorized } from './http';

export type Role = 'admin' | 'speaker';

export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
}

/** Minimal event shape so this works with any API Gateway proxy event. */
export interface EventWithClaims {
  requestContext?: {
    authorizer?: { claims?: Record<string, unknown> | null } | null;
  } | null;
}

/**
 * Normalise `cognito:groups`. API Gateway may deliver an array, a JSON array
 * string, "[admin speaker]" (space separated, bracketed) or "admin,speaker".
 */
export function parseGroups(raw: unknown): string[] {
  let items: unknown[];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string') {
    items = raw
      .trim()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(/[\s,]+/);
  } else {
    return [];
  }
  const out = items
    .filter((g): g is string => typeof g === 'string')
    .map((g) => g.trim().replace(/^["']+|["']+$/g, ''))
    .filter((g) => g.length > 0);
  return Array.from(new Set(out));
}

/** Extract the caller from authorizer claims. Throws Unauthorized if absent. */
export function getAuth(event: EventWithClaims): AuthContext {
  const claims = event.requestContext?.authorizer?.claims;
  const sub = claims?.sub;
  if (!claims || typeof sub !== 'string' || sub.length === 0) {
    throw new Unauthorized();
  }
  return {
    userId: sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    groups: parseGroups(claims['cognito:groups']),
  };
}

export function isAdmin(auth: AuthContext): boolean {
  return auth.groups.includes('admin');
}

/** Require the `admin` group; throws Forbidden (403) otherwise. */
export function requireAdmin(event: EventWithClaims): AuthContext {
  const auth = getAuth(event);
  if (!auth.groups.includes('admin')) throw new Forbidden('Admin access required');
  return auth;
}

/** Require the `speaker` group; throws Forbidden (403) otherwise. */
export function requireSpeaker(event: EventWithClaims): AuthContext {
  const auth = getAuth(event);
  if (!auth.groups.includes('speaker')) throw new Forbidden('Speaker access required');
  return auth;
}
