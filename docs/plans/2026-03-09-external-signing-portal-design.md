# External Signing Portal Design

**Date:** 2026-03-09
**Status:** Approved

## Overview

A standalone external signing system that allows admins to send invite links to people outside the company (non-members, non-contractors) to sign documents. External signers verify their email, read the document in the same section-based format as the onboarding NDA, and sign — no account creation required.

## Key Decisions

- **Template source:** Pre-built template library in code OR admin-uploaded PDF parsed into sections via Claude API
- **Signer verification:** Email-based 6-digit code (no account creation)
- **Post-signing access:** None — signer gets a copy via email, link expires
- **Invite permissions:** Admins only
- **Link expiration:** Configurable per invite by admin
- **Invite metadata:** Email, template, expiration, optional personal note

## Data Model

### Table: `external_signing_invites`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `token` | text (unique) | URL-safe random token for the link |
| `recipient_email` | text | |
| `template_type` | text | `'preset'` or `'custom'` |
| `template_id` | text | Key from preset registry (e.g., `'external_nda'`) |
| `custom_sections` | jsonb | Parsed sections when using uploaded PDF |
| `custom_title` | text | Document title for custom uploads |
| `personal_note` | text | Optional note included in the invite email |
| `expires_at` | timestamptz | Admin-configured expiration |
| `verification_code` | text | 6-digit code, hashed with bcrypt |
| `verified_at` | timestamptz | |
| `status` | text | `pending` / `verified` / `signed` / `expired` / `revoked` |
| `signer_name` | text | Filled on sign |
| `signer_address` | text | Filled on sign |
| `signer_ip` | text | Captured on sign |
| `signer_user_agent` | text | Captured on sign |
| `signed_at` | timestamptz | |
| `created_by` | uuid (FK → profiles) | Admin who sent it |
| `created_at` | timestamptz | |

### Storage

- Signed PDFs: `agreements/external/{invite_id}/agreement.pdf`
- Uploaded source PDFs: `agreement-templates/{invite_id}/source.pdf`

## Template System

### Preset Templates

Defined in code at `src/lib/external-agreement-templates.ts` as a registry. Each template has: `id`, `name`, `description`, `sections[]` using the same `{ title, htmlContent, plainText }` shape as the existing onboarding agreement.

Starting templates: "External NDA", "Vendor Agreement", etc. — added over time as needed.

### Custom PDF Upload

1. Admin uploads a PDF in the invite form
2. Server extracts text via `pdf-parse`
3. Extracted text sent to Claude API to parse into sections (structured JSON matching the section format)
4. Admin sees a preview of parsed sections in the same visual style as the onboarding agreement
5. Admin can edit section titles/content or skip straight to saving
6. Sections stored as `custom_sections` JSONB on the invite row

## Admin UI

### Send Invite Form

- Recipient email input
- Template selection: dropdown of presets **or** PDF upload toggle
- If PDF uploaded: parsed section preview with option to edit or accept
- Expiration picker (7 days, 14 days, 30 days, custom date)
- Personal note textarea (optional, included in invite email)
- Send button

### Invite Management Table

- Lists all sent external signing invites
- Columns: recipient email, template name, status badge, sent date, expires date
- Status badges: `Pending` / `Verified` / `Signed` / `Expired` / `Revoked`
- Row actions: Revoke (if pending/verified), Resend email, Download signed PDF (if signed)

## External Signer Flow

**Route:** `/sign/[token]` (public, no auth required)

### Step 1 — Email Verification

- Branded page: SEEKO logo, "You've been invited to sign a document", masked email (j***@email.com)
- "Send Verification Code" button → 6-digit code sent via Resend
- Enter code → verified, proceed to step 2
- 3 attempt limit, code expires after 10 minutes

### Step 2 — Read Agreement

- Same scrollable section-based layout as onboarding agreement
- Same progress indicator, "Continue to Sign" button after scrolling to bottom
- Admin's personal note shown at top in subtle callout (if provided)
- Reuses `AgreementForm` component (refactored to accept sections as props)

### Step 3 — Sign

- Legal name input, address autocomplete, signature preview animation
- No engagement type field (internal only)
- Confirmation dialog on success

### Step 4 — Done

- Success screen: "Document signed successfully. A copy has been sent to your email."
- Revisiting the link shows: "This document has been signed"

### Emails on Sign

- To signer: signed PDF + HTML rendering (same style as onboarding)
- To admin who sent the invite: notification + signed PDF attachment

## API Routes

### `POST /api/external-signing/parse-pdf` (admin only)

Accepts PDF file, extracts text via `pdf-parse`, sends to Claude API for section parsing, returns parsed sections as JSON for admin preview.

### `POST /api/external-signing/invite` (admin only)

Creates invite row, generates token, hashes verification code. Sends invite email via Resend with `/sign/[token]` link.

### `GET /api/external-signing/[token]` (public)

Returns invite status + masked email. No sections returned until verified.

### `POST /api/external-signing/verify` (public)

Accepts token + 6-digit code. Validates code, marks invite as verified, returns sections to render.

### `POST /api/external-signing/sign` (public)

Accepts token + name + address. Requires invite status = `verified`. Generates PDF, uploads to storage, sends emails, marks as signed.

### `POST /api/external-signing/revoke` (admin only)

Marks invite as revoked.

### `POST /api/external-signing/resend` (admin only)

Resends invite email with same token, generates new verification code.

## Shared Utilities Refactor

To avoid duplication with the existing onboarding signing system:

### PDF Generation

Extract from `src/lib/agreement-pdf.ts` into a generic function:
- `generateAgreementPdf(sections, signerInfo)` — works for both onboarding and external signing

### Email Templates

Extract from `src/lib/email.ts`:
- `sendSignedAgreementEmail(recipient, sections, signerInfo, pdfBuffer)` — shared HTML rendering
- New: `sendExternalInviteEmail(recipientEmail, token, personalNote, templateName, expiresAt)`
- New: `sendVerificationCodeEmail(recipientEmail, code)`

### AgreementForm Component

Refactor to accept props:
- `sections` — array of `{ title, htmlContent }` (currently hardcoded)
- `showEngagementType` — boolean (`true` for onboarding, `false` for external)
- `onSign` — callback (different API endpoint depending on context)

`AddressAutocomplete` and `SignatureDrawing` are already reusable — no changes needed.

## Security

- **Token:** `crypto.randomBytes(32)` → URL-safe base64
- **Verification code:** hashed with bcrypt before storage
- **Rate limiting:** 3 verification attempts per code, 5 code resends per hour per invite
- **Expiration:** checked on every request — expired invites show "This link has expired"
- **Revocation:** immediate — revoked invites show "This link is no longer valid"
- **No auth session:** external signers never get a Supabase auth account
- **Storage RLS:** external signed PDFs readable only by admins
- **Input sanitization:** signer name/address validated before PDF generation
