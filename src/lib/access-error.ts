/**
 * One access-control error, replacing the ~10 near-identical `*AccessError`
 * classes that every lib loader (dashboard, tasks, team, investor, docs,
 * contractor, onboarding, external-signing-admin) used to define for itself.
 *
 * `reason` drives the HTTP status (via `accessErrorStatus`); `message`
 * defaults to `reason` but can be overridden where a route's wire JSON body
 * carries a more specific literal than the four canonical reasons (e.g.
 * `investor_forbidden`, `not_admin`, `admin_required`) — the status still
 * buckets into the same 401/403/404, but the response body text is
 * preserved verbatim so existing clients see no change.
 */
export type AccessReason = 'unauthorized' | 'forbidden' | 'profile_not_found' | 'not_found';

export class AccessError extends Error {
  constructor(public readonly reason: AccessReason, message?: string) {
    super(message ?? reason);
    this.name = 'AccessError';
  }
}

export function accessErrorStatus(reason: AccessReason): 401 | 403 | 404 {
  if (reason === 'unauthorized') return 401;
  if (reason === 'forbidden') return 403;
  return 404;
}
