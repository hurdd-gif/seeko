# Guardian Signing for Minors — Design

**Goal:** Allow team members under 18 to join the platform by having their parent/guardian sign the NDA on their behalf, using the existing external signing infrastructure.

**Architecture:** Extend `external_signing_invites` with an `on_behalf_of` link to a minor's profile. When the guardian completes signing, the minor's NDA fields are populated automatically. The minor is blocked at `/agreement` with a waiting screen until the guardian signs.

---

## Data Model Changes

### `profiles` table — add:
- `is_minor` boolean (default false)

### `external_signing_invites` table — add:
- `on_behalf_of` UUID (FK → profiles.id, nullable) — links invite to the minor's profile
- `guardian_relationship` text (nullable) — "Mother", "Father", "Legal Guardian"

### Signing side-effect:
When a guardian signs an invite where `on_behalf_of` is set, the sign API also updates the linked minor's profile:
- `nda_accepted_at` = now
- `nda_signer_name` = guardian's name
- `nda_signer_address` = guardian's address
- `nda_ip` = guardian's IP
- `nda_user_agent` = guardian's user agent

---

## Flows

### 1. Admin Flags Minor During Invite

1. Admin toggles "Under 18" on the invite/member creation form
2. Three fields appear: Guardian email, Guardian name, Guardian relationship (dropdown)
3. On submit:
   - Minor's profile created with `is_minor: true`
   - `external_signing_invites` record created with `on_behalf_of` → minor's profile ID, using internal NDA template
   - Guardian receives signing link email
4. Minor receives their normal account invite separately

### 2. Minor Self-Declares During Onboarding

1. Minor hits `/agreement` page
2. Sees age gate: "I am 18 or older" / "I am under 18"
3. If under 18: form for guardian email, name, relationship
4. On submit:
   - Profile updated: `is_minor: true`
   - External signing invite created with `on_behalf_of`
   - Guardian receives signing link email
5. Minor sees waiting screen

### 3. Minor Waiting Screen (`/agreement`)

When `is_minor = true` and `nda_accepted_at` is null:
- "Waiting for your parent/guardian to sign"
- Masked guardian email displayed
- Invite status indicator (pending / verified)
- Resend button
- Auto-redirects to `/onboarding` once guardian signs (polling)

### 4. Guardian Signing Experience

Standard `/sign/[token]` flow with one addition:
- Document header notes: "Signing on behalf of [minor's display name]"
- Everything else identical: email verification → read NDA → enter name/address → sign → PDF generated → emailed

---

## Key Decisions

- **Reuse `external_signing_invites`** rather than a new table — guardian signing is fundamentally the same operation as external signing
- **Admin can pre-send guardian link** before minor even logs in, reducing wait time
- **Minor is fully blocked** at `/agreement` until guardian signs — no dashboard access
- **Guardian relationship** captured for legal record (Mother / Father / Legal Guardian)
- **Same NDA template** used for guardian signing as for regular internal signing
