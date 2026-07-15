/**
 * Validate a post-login return path taken from an untrusted `?next=` param.
 *
 * Returns the path only when it is a same-origin *absolute* path: a single
 * leading slash, not protocol-relative (`//host`), no backslash trick
 * (`/\host`), no embedded control characters. Anything else returns null and
 * the caller falls back to its own default destination.
 *
 * This is the open-redirect guard. Without it, `/login?next=//evil.com` or
 * `?next=https://evil.com` would let an attacker bounce a freshly
 * authenticated user off-origin. Mirrors the server-side check that
 * `api-server/routes/auth.ts` already applies to its OAuth callback `next`.
 */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Exactly one leading slash; reject '//' (protocol-relative) and '/\'.
  if (!/^\/(?![/\\])/.test(raw)) return null;
  // No control chars (newline/tab smuggling into a would-be scheme).
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) < 0x20) return null;
  }
  return raw;
}
