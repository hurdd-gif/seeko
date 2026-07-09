import { isIP } from 'node:net';

// The audit trail printed on the signing certificate (and stored on the invite
// row) must never carry a fabricated or attacker-controlled value — a poisoned
// IP / user-agent would taint the ESIGN/UETA record. These helpers extract only
// trustworthy values and return null otherwise (the certificate renders "Not
// recorded" for null fields).

const MAX_USER_AGENT_LENGTH = 400;
const CONTROL_CHAR_MAX = 0x20; // strip C0 control chars below this…
const DEL_CHAR = 0x7f; //          …and DEL.

/**
 * The trusted client IP for the audit trail: the RIGHTMOST entry of
 * `x-forwarded-for` — the one our edge/proxy appends for the real peer. A client
 * can pre-seed the left of the chain ("1.1.1.1, <real>"), so only the last hop is
 * trustworthy. Returns null when the header is absent or the rightmost value is
 * not a valid IP (spoofed / garbage / the literal "unknown"). Deliberately does
 * NOT fall back to `x-real-ip` — that is a single client-supplied header with no
 * append semantics, so it is freely spoofable.
 */
export function extractTrustedClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) return null;
  const candidate = forwarded
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  if (candidate && isIP(candidate)) return candidate;
  return null;
}

/**
 * Sanitize a user-agent before it reaches the PDF certificate / DB: strip control
 * characters (which could corrupt the audit record or the rendered PDF) and cap
 * the length so an oversized header can't bloat the document. Returns null for
 * null/undefined/empty/whitespace-only or all-control-character input.
 */
export function sanitizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  let cleaned = '';
  for (const ch of userAgent) {
    const code = ch.charCodeAt(0);
    if (code < CONTROL_CHAR_MAX || code === DEL_CHAR) continue;
    cleaned += ch;
  }
  cleaned = cleaned.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_USER_AGENT_LENGTH);
}
