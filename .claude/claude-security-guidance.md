# SEEKO Studio — Security Review Rules

> Project threat model for the `security-guidance` plugin. Concatenated into every
> diff/commit review. Encodes invariants surfaced by the 2026-05-28 multi-lens
> external-signing review. **Never put secrets in this file** (it is committed).

When reviewing a diff, flag any change that violates the invariants below. Order
findings by severity. Be specific about the file/line and the exploit.

---

## 1. Shared invite table — cross-product isolation (HIGHEST PRIORITY)

`external_signing_invites` is a **shared table across three sibling products**:
signing (`template_type ∈ {preset, custom}`), invoice (`invoice`), and doc-share
(`doc_share`). A token for one product must NEVER be operable on another product's
routes.

**Invariant:** every route under `src/app/api/external-signing/**` and the
`/sign/[token]` server page that fetches an invite by `token` (or `id`) MUST reject
non-signing rows immediately after the fetch:

```ts
import { isSigningInvite } from '@/lib/invite-filters';
if (!isSigningInvite(invite)) {
  return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
}
```

- Return an **identical 404** for unknown-token AND wrong-product rows — never a
  distinct status that confirms a sibling token exists (enumeration oracle).
- This applies to BOTH the atomic RPC path and any non-atomic fallback in
  `verify/route.ts`, and to every `updated.length === 0` re-fetch.
- The select must include `template_type` for the guard to work.
- Reference implementation: `reissue/route.ts`. Sibling products gate the mirror
  way with `.eq('purpose', ...)` — do not rely on `purpose` alone for signing
  (legacy signing rows may have `purpose = NULL`); use the `template_type`
  allow-list (`SIGNING_TEMPLATE_TYPES` / `isSigningInvite`).

**Flag:** any new/edited external-signing route that selects `.eq('token', …)` or
`.eq('id', …)` on `external_signing_invites` without an `isSigningInvite` guard.

---

## 2. Untrusted content in HTML/PDF/email sinks

`custom_sections[].content` and `custom_title` originate from `parse-pdf` (raw
uploaded-PDF text → Claude → stored HTML, **never sanitized at insert**). Treat all
of it as attacker-influenced.

- **Every HTML sink must sanitize.** The in-app render path uses
  `sanitizeHtml` (DOMPurify). The **email path must use `sanitizeEmailHtml`**
  (`src/lib/sanitize.ts`) — an allow-list that drops `<a>`, `<img>`, `<script>`,
  `style`, and event handlers (anchors/tracking-pixels survive a plain DOMPurify
  pass and become phishing from the trusted `noreply@seekostudios.com` domain).
- `esc()` covers plain-text interpolation; section **content** is rich HTML and
  needs the sanitizer, not `esc()`.
- The PDF path must `stripHtml` content (no raw tags) before `drawText`.

**Flag:** any `${...content...}` interpolated into an email `html:` body, a
`dangerouslySetInnerHTML`, or a PDF text call without going through the matching
sanitizer.

---

## 3. PDF generation is input-fragile

`agreement-pdf.ts` embeds only `StandardFonts` (WinAnsi/Latin1). Drawing a code
point outside Latin1 (CJK, emoji, some smart punctuation, control chars) **throws**
→ unhandled 500, signer hard-blocked, row left mid-state.

- Wrap `generateAgreementPdf` calls in `try/catch` → return a clear **422**
  ("name/address contains unsupported characters"), never a 500.
- Defensively cap and coerce DB-sourced content before PDF gen: `sections` is an
  array, `sections.length` capped, total content length capped, and each
  `title`/`content` coerced with `String(... ?? '')`.

**Flag:** new `drawText` of user/DB-sourced strings without a try/catch or
char-set handling; `custom_sections` fed to PDF gen without a defensive cap.

---

## 4. Rate limiting & client IP

- In-memory `Map` limiters are per-process (fine for the current single Render
  instance, but they reset on deploy and do not hold if the service scales).
  New public mutating/emailing routes MUST have a limiter; prefer a shared/DB-backed
  one if horizontal scaling is ever enabled.
- Client IP is `x-forwarded-for?.split(',').pop()?.trim()` (last hop) → `x-real-ip`.
  It is spoofable; treat it as best-effort.
- **Never persist `'unknown'` (or a spoofable raw header) as `signer_ip` in the
  legal audit record.** Store `null` and render "Not recorded" — a fabricated IP
  poisons the ESIGN/UETA audit trail.

**Flag:** a new public `external-signing` POST with no rate limit; `'unknown'`
written to `signer_ip`; an audit field populated from an unvalidated header.

---

## 5. Geocode proxy (`/api/geocode`)

Public, unauthenticated (signer address field). Must: rate-limit per IP, cap `q`
length, set a fetch timeout, keep the destination host hard-coded (no user-supplied
URL/host/path), and return only `{place_id, display_name}` (no raw upstream
passthrough). It forwards the signer's typed address to OSM — do not widen what is
sent.

**Flag:** removing the host hard-coding, the length cap, or the rate limit;
forwarding additional fields upstream.

---

## 6. Planned additions — bake security in from the first commit

**`signature_image`** (canvas→PNG dataURL or typed name in the sign POST):
- Enforce a request-body size limit before parse.
- Require `^data:image/png;base64,` (reject svg/html/jpeg/remote URLs).
- Cap decoded bytes (≤ ~256KB) and validate PNG magic bytes; cap dimensions.
- The typed-name branch is length-capped text like `full_name`.

**`GET /api/external-signing/download`** (signed-URL to the cert PDF):
- Fetch by token, enforce `isSigningInvite(invite)` AND `status === 'signed'`
  before minting a signed URL on the invite-id-scoped path.
- Return the URL as **JSON or a 302 Location** — never interpolated into HTML.
- Rate-limit per IP; shortest viable TTL.

**Certificate PDF** (embeds `signer_ip` + `signer_user_agent`):
- Cap UA length, strip control chars, transliterate/encode to the font's charset
  (or embed a Unicode TTF via fontkit). Render "Not recorded" when audit fields are
  absent (≈⅔ of legacy signed rows have no IP/UA).
- Validate `signer_ip` parses as an IP before display.

---

## 7. Secrets & logging

- Never print/commit tokens, verification codes, bcrypt hashes, API keys, or auth
  headers. `getServiceClient()` (service-role key) is server-only — never import it
  into a `'use client'` file.
- Log `err.message` / `err.code`, **not** the full Supabase error object (it can
  carry `recipient_email` / row context into log sinks).
- Verification codes are bcrypt-hashed at rest; the plaintext exists only to email
  it. Keep it that way.

**Flag:** `console.*` of a token/code/hash/email/IP or a full DB error object; the
service client reaching client code.

---

## Out of scope for this surface

Do not modify invoice (`/invoice`, `invoice-request/*`), doc-share (`/shared`,
`doc-share/*`), or their routes when working on signing — they share the table but
are separate products. Changes to shared libs (`email.ts`, `invite-filters.ts`,
`agreement-pdf.ts`, `sanitize.ts`) must stay backward-compatible for all three.
