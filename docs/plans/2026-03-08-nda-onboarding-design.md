# NDA Agreement in Onboarding — Design

## Goal

Gate dashboard access behind a signed onboarding agreement (NDA). New users sign during onboarding between password setup and profile. Existing non-admin users sign on next login. Admins are exempt.

## Flow

**New users:** Set Password → **NDA Agreement** → Profile Setup → Dashboard

**Existing non-admin users (retroactive):** Login → **NDA Agreement** → Dashboard

**Admins:** No change — skip NDA entirely

## NDA Page (`/agreement`)

- Full agreement text rendered inline (scrollable, styled prose)
- Auto-populated read-only fields at top: email, department/role, engagement type
- User fills in: **Legal full name**, **Address**
- Engagement type radio (Team Member / Independent Contractor) — pre-selected from `is_contractor` but editable
- "I Agree & Sign" button disabled until user scrolls to bottom + fills required fields
- On submit:
  - Records: `nda_accepted_at`, `nda_signer_name`, `nda_signer_address`, `nda_ip`, `nda_user_agent`
  - Generates a filled-in PDF server-side
  - Stores PDF in Supabase Storage (`agreements/{user_id}.pdf`)
  - Emails copy to the user + admin
  - Redirects to `/onboarding` (new users) or `/` (existing users)

## Routing (proxy.ts)

Priority order:
1. `must_set_password === true` → `/set-password`
2. `nda_accepted_at IS NULL AND NOT is_admin` → `/agreement`
3. `onboarded === 0` → `/onboarding`
4. else → dashboard

The `/agreement` route itself must be excluded from the redirect (allow access when not signed).

## Database

Add columns to `profiles` table:
- `nda_accepted_at` (timestamptz, nullable) — when they signed
- `nda_signer_name` (text, nullable) — legal full name as typed
- `nda_signer_address` (text, nullable) — address as typed
- `nda_ip` (text, nullable) — IP at time of signing
- `nda_user_agent` (text, nullable) — browser user agent at time of signing

## API

### POST `/api/agreement/sign`

Auth: requires authenticated user, rejects admins (they shouldn't hit this).

Body: `{ full_name, address, engagement_type }`

Actions:
1. Validate required fields
2. Update `profiles` with `nda_accepted_at`, `nda_signer_name`, `nda_signer_address`, `nda_ip` (from request headers), `nda_user_agent`
3. Generate filled PDF using `pdf-lib`
4. Upload PDF to Supabase Storage at `agreements/{user_id}.pdf`
5. Send email with PDF attached to user + admin
6. Return success with redirect path (`/onboarding` if `onboarded === 0`, else `/`)

## PDF Generation

Use `pdf-lib` to:
- Load the SEEKO_Onboarding_Agreement.pdf as a template
- Fill in: Full Name, Address, Email, Role/Position, Engagement Type checkboxes, Date, Printed Name (signature section)
- Save and upload to Supabase Storage

The original PDF template is stored in `public/` or as a static asset.

## Email

Send the signed PDF as attachment to:
- The signer (their email from auth)
- Admin email (hardcoded or from env var)

Use Supabase Edge Functions, Resend, or a simple SMTP service.

## Admin View

On the Team page, show NDA status per user:
- Signed: green checkmark + date + link to download PDF
- Pending: yellow indicator
- Admin: "Exempt" label

## Agreement Text

The full text of `SEEKO_Onboarding_Agreement.pdf` is rendered as styled HTML prose on the `/agreement` page. 12 sections covering:
1. Confidentiality & Non-Disclosure
2. Intellectual Property Ownership
3. Dashboard & Development Environment Access
4. Scope of Work & Responsibilities
5. Compensation
6. Non-Compete & Non-Solicitation
7. Representations & Warranties
8. Term & Termination
9. Indemnification
10. Limitation of Liability
11. Dispute Resolution
12. General Provisions

## Tech Stack

- `pdf-lib` for PDF generation (lightweight, no native deps)
- Supabase Storage for PDF hosting
- Email: TBD (Resend, Supabase Edge Function, or simple SMTP)
