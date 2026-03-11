# External Invoice Requests — Design

**Goal:** Allow admins to send invoice request links to non-onboarded people, who fill in line items and PayPal email via a token-based page. Submitted invoices feed into the existing payments system as pending requests.

**Architecture:** Extend `external_signing_invites` with a `purpose` field to support both signing and invoicing. Reuse the existing token, email verification, and expiration infrastructure. New `/invoice/[token]` page for the recipient form. On submission, creates a `payments` record that appears in PaymentsAdmin alongside internal requests.

---

## Data Model Changes

### `external_signing_invites` table — add:
- `purpose` text (default `'signing'`) — `'signing'` or `'invoice'`
- `prefilled_items` JSONB (nullable) — array of `{ label: string, amount: number }` seeded by admin
- `submitted_payment_id` UUID (FK → payments.id, nullable) — links to the payment created on submission
- `paypal_email` text (nullable) — recipient's PayPal email captured during submission

### `payments` table — add:
- `recipient_email` text (nullable) — for external invoices where recipient has no profile
- Make `recipient_id` nullable — external invoices have no profile link

---

## Flows

### 1. Admin Sends Invoice Request

1. Admin clicks "Request Invoice" in PaymentsAdmin (or new section)
2. Fills in: recipient email, optional pre-filled line items (label + amount), optional personal note, expiration (7/14/30 days)
3. On submit:
   - Creates `external_signing_invites` record with `purpose: 'invoice'`
   - Generates token + hashed verification code
   - Sends email to recipient with link to `/invoice/[token]`

### 2. Recipient Fills Invoice

1. Opens `/invoice/[token]`
2. **Verification phase** — same as external signing: masked email, send code, enter 6-digit code
3. **Invoice form phase** — sees pre-filled items (editable), can add/remove items, enters PayPal email
4. **Submit** — creates `payments` record with:
   - `status: 'pending'`
   - `recipient_id: null` (no profile)
   - `recipient_email: <their email>`
   - `created_by: <admin who sent the invite>`
   - Line items as `payment_items`
   - Updates invite: `submitted_payment_id`, `paypal_email`, `status: 'signed'`
5. **Success screen** — "Invoice submitted successfully"

### 3. Admin Reviews

- Submitted invoice appears in PaymentsAdmin "Payment Requests" card
- Shows recipient email (since no display name), PayPal email, items, total
- Admin can Accept or Deny (same PATCH endpoint)

### 4. Recipient Checks Status

Recipient revisits `/invoice/[token]` anytime to see current status:
- **Pending** → "Your invoice has been submitted. We'll review it shortly."
- **Paid/Accepted** → "Your invoice for $X has been approved."
- **Cancelled/Denied** → "Your invoice was not approved."

No email notifications needed — the link is the source of truth.

---

## Key Decisions

- **Reuse `external_signing_invites`** with a `purpose` field rather than a new table — same token/verification/expiration infrastructure
- **Feed into existing payments flow** — no separate tracking, admin sees external and internal requests in the same place
- **`recipient_email` on payments** — allows PaymentsAdmin to display who submitted without joining to invite table
- **Status page on token URL** — recipient checks their link for updates, no notification emails needed
- **Pre-filled items are editable** — admin can seed items but recipient has final say on what they're invoicing for
