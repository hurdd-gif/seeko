# External Document Sharing — Design

## Goal

Allow admins to share specific docs and decks with external contractors/individuals via email-verified links with single-session protection.

## Architecture

Reuse `external_signing_invites` table with `purpose: 'doc_share'`.

**New columns:**
- `shared_doc_id` (uuid, FK → docs) — which doc/deck is shared
- `session_token` (text, nullable) — active session token after verification
- `session_ip` (text, nullable) — IP of active session
- `session_user_agent` (text, nullable) — user agent of active session
- `session_started_at` (timestamptz, nullable) — when session was created
- `view_count` (int, default 0) — total views for access history

**Verification flow:** Same as signing/invoices — send 6-digit code to email, verify with bcrypt, atomic RPC increment.

**Single-session lock:** On verification, generate a session token → store in DB + set as httpOnly cookie. Each page load validates cookie matches stored session. If someone else verifies, the old session is replaced — original viewer gets bounced to "session expired" screen.

## UI Flow

### Admin: Sharing a doc

1. Doc/deck viewer dialog → "Share" button in header
2. Share dialog: recipient email, optional personal note, expiry date (default 30 days)
3. Submit → creates invite, sends email with `/shared/[token]` link

### Admin: Managing shared links

- Third tab in Documents page: "Docs | Decks | Shared"
- List: doc title, recipient email, status, view count, created date, expiry
- Actions: revoke, resend
- Collapsible at 4+ items

### External recipient: Viewing

1. Opens `/shared/[token]` → doc title, "from SEEKO Studio", expiry badge
2. VerificationForm: send code → enter 6 digits
3. After verification → standalone read-only view:
   - Docs: DocContent (sanitized HTML) in clean full-page layout
   - Decks: DeckViewer with filmstrip + present mode
4. No download, no print, text selection disabled, right-click disabled
5. If link accessed from another device → "Session ended" screen

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `POST /api/doc-share/invite` | POST | Admin | Create share invite, send email |
| `GET /api/doc-share/[token]` | GET | Public | Token lookup — status, masked email, doc title |
| `POST /api/doc-share/send-code` | POST | Public | Send verification code |
| `POST /api/doc-share/verify` | POST | Public | Verify code, create session, set cookie |
| `POST /api/doc-share/view` | POST | Session cookie | Validate session, return doc content, increment view count |
| `GET /api/doc-share/list` | GET | Admin | List shared links with view history |
| `POST /api/doc-share/revoke` | POST | Admin | Revoke shared link |
| `POST /api/doc-share/resend` | POST | Admin | Resend invite with new code |

## Security

- Doc content never in initial page load — fetched via `/view` endpoint only after session validation
- Session cookie: `httpOnly`, `secure`, `sameSite: strict`, expires with invite
- Single active session per invite — new verification invalidates previous session
- View count tracked for admin visibility
- CSS: `user-select: none`, right-click disabled for basic copy protection
- No download/print functionality exposed

## Migration

```sql
ALTER TABLE external_signing_invites
  ADD COLUMN IF NOT EXISTS shared_doc_id uuid REFERENCES docs(id),
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS session_ip text,
  ADD COLUMN IF NOT EXISTS session_user_agent text,
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;
```
