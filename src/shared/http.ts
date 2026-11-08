// HTTP helpers: responses, typed errors, body parsing, and a small route matcher.
// Error body is uniform: { error: { code, message, fields?, warnings? } }

export interface HttpResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    warnings?: string[];
  };
}

function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    ...extra,
  };
}

/** Build a JSON response. Body is omitted for 204. */
export function jsonResponse(
  statusCode: number,
  data?: unknown,
  headers?: Record<string, string>
): HttpResponse {
  return {
    statusCode,
    body: statusCode === 204 || data === undefined ? '' : JSON.stringify(data),
    headers: baseHeaders(headers),
  };
}

export const ok = (data?: unknown): HttpResponse => jsonResponse(200, data);
export const created = (data?: unknown): HttpResponse => jsonResponse(201, data);
export const noContent = (): HttpResponse => jsonResponse(204);

/** Base class for errors that map to an HTTP response. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly warnings?: string[]
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends HttpError {
  constructor(fields: Record<string, string>, message = 'Validation failed') {
    super(400, 'VALIDATION_ERROR', message, fields);
  }
}

export class Unauthorized extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class Forbidden extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFound extends HttpError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

/** Action needs explicit confirmation; `warnings` describe the consequences. */
export class ConfirmRequired extends HttpError {
  constructor(warnings: string[] = [], message = 'Confirmation required') {
    super(409, 'CONFIRM_REQUIRED', message, undefined, warnings);
  }
}

/** Optimistic-concurrency or state conflict. */
export class Conflict extends HttpError {
  constructor(message = 'Resource was modified by another request') {
    super(409, 'CONFLICT', message);
  }
}

/** Build the uniform error response. */
export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
  warnings?: string[]
): HttpResponse {
  const body: ErrorBody = { error: { code, message } };
  if (fields) body.error.fields = fields;
  if (warnings) body.error.warnings = warnings;
  return jsonResponse(statusCode, body);
}

/**
 * Convert any thrown value to a response. Unknown errors are logged and
 * returned as 500 INTERNAL without leaking details.
 */
export function toErrorResponse(err: unknown): HttpResponse {
  if (err instanceof HttpError) {
    return errorResponse(err.statusCode, err.code, err.message, err.fields, err.warnings);
  }
  // Conditional write failure from DynamoDB -> optimistic concurrency conflict
  if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
    const c = new Conflict();
    return errorResponse(c.statusCode, c.code, c.message);
  }
  console.error('Unhandled error:', err);
  return errorResponse(500, 'INTERNAL', 'Internal server error');
}

/** Parse a JSON object body. Throws ValidationError when missing or malformed. */
export function parseJsonBody<T = Record<string, unknown>>(
  body: string | null | undefined,
  isBase64Encoded = false
): T {
  if (!body) {
    throw new ValidationError({ body: 'Request body is required' });
  }
  const raw = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError({ body: 'Request body must be valid JSON' });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError({ body: 'Request body must be a JSON object' });
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

export type RouteParams = Record<string, string>;

export interface Route<Ctx, R = HttpResponse> {
  method: string;
  /** Pattern such as `/events/{id}/bookings`. */
  path: string;
  handler: (ctx: Ctx, params: RouteParams) => Promise<R> | R;
}

function matchPath(pattern: string, path: string): RouteParams | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: RouteParams = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg.startsWith('{') && seg.endsWith('}')) {
      try {
        params[seg.slice(1, -1)] = decodeURIComponent(a[i]);
      } catch {
        return null;
      }
    } else if (seg !== a[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Find the matching route and invoke it. Returns 404 NOT_FOUND when no path
 * matches and 405 when the path matches with a different method. Thrown
 * errors are converted with `toErrorResponse`.
 */
export async function dispatch<Ctx>(
  routes: Route<Ctx>[],
  method: string,
  path: string,
  ctx: Ctx
): Promise<HttpResponse> {
  try {
    const m = method.toUpperCase();
    let pathMatched = false;
    for (const route of routes) {
      const params = matchPath(route.path, path);
      if (!params) continue;
      pathMatched = true;
      if (route.method.toUpperCase() === m) {
        return await route.handler(ctx, params);
      }
    }
    if (pathMatched) {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    }
    throw new NotFound();
  } catch (err) {
    return toErrorResponse(err);
  }
}
