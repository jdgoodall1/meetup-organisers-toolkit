import type { ApiResult } from '../services/apiTypes';

/** User-facing message for any non-success API result. */
export const failureMessage = (r: Exclude<ApiResult<unknown>, { ok: true }>): string =>
  r.kind === 'error' ? r.error.message : r.message;
