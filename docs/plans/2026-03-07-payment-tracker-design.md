# Payment Tracker — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Embed payment tracking into SEEKO Studio so admins can track who's owed, batch payments, generate PayPal links, and mark payments complete — without leaving the dashboard. Investors get a read-only spend overview.

**Architecture:** New `payments` and `payment_items` Supabase tables. New `/payments` route with admin (full CRUD + password gate) and investor (read-only aggregates) views. PayPal integration is link-based (paypal.me URLs), not API-based.

---

## Data Model

### New table: `payments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| recipient_id | uuid (FK) | → profiles.id |
| amount | decimal | Total payment amount |
| currency | text | Default 'USD' |
| description | text | Summary of what payment covers |
| status | payment_status enum | `pending`, `paid`, `cancelled` |
| paid_at | timestamptz | When marked as paid (null while pending) |
| created_by | uuid (FK) | → profiles.id (admin who created it) |
| created_at | timestamptz | Auto |

### New table: `payment_items`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| payment_id | uuid (FK) | → payments.id (cascade delete) |
| task_id | uuid (FK, nullable) | → tasks.id (null for fixed/hourly items) |
| label | text | Description ("March retainer", task name) |
| amount | decimal | Line item amount |

### New enum: `payment_status`

Values: `pending`, `paid`, `cancelled`

### New columns on existing tables

- `profiles.paypal_email` — text, nullable. Their PayPal email for payments.
- `tasks.bounty` — decimal, nullable. Optional pre-set dollar value for task-based pay.

### RLS Policies

- `payments` + `payment_items`: admins can read/write, investors can read payments (not items), regular members cannot access
- `profiles.paypal_email`: only admins can read/write

---

## UI: Admin Payments Page (`/payments`)

### Page Structure

1. **Password gate overlay** — On first visit per session, a centered card asks for the payments password. Verified server-side via `POST /api/payments/verify`. On success, stores a session token in sessionStorage. Subsequent visits in the same tab skip the gate.

2. **Stat cards** (4-column grid, same pattern as Overview):
   - **Pending** (accent tint, primary) — total $ owed across all people
   - **Paid This Month** — total $ paid in current calendar month
   - **People Owed** — count of distinct recipients with pending payments
   - **Payments This Month** — count of completed payments this month

3. **People card** — Core interaction surface:
   - Each row: avatar, name, department badge, payment model indicator, pending amount or "Paid" status
   - FilterPill: All / Owed / Paid
   - "Owed" rows sorted by amount descending, "Paid" rows grouped below (muted)
   - "Pay" ghost button on each owed row opens payment creation dialog
   - "+ New Payment" button in card header

4. **Recent Payments card** — Chronological list of completed payments:
   - Recipient avatar + name, amount, item count, date
   - Click opens detail dialog with line items

### Payment Creation Dialog

- **Recipient**: avatar + name (pre-selected if opened from a person row)
- **PayPal email**: shown with copy-to-clipboard button
- **Line items section**:
  - Pre-populated with completed-but-unpaid tasks that have this person as assignee
  - Checkboxes to include/exclude each task
  - Editable amount per line item (pre-filled from task bounty if set)
  - "+ Add custom item" row for retainers, hourly blocks, bonuses
- **Total**: auto-calculated from checked items
- **Actions**:
  - "Open PayPal" — generates `https://paypal.me/{paypal_username}/{amount}` and opens in new tab
  - "Mark as Paid" — saves payment record with `status: paid`, `paid_at: now()`

### Animation Storyboard

```
mount     hero fades in (0ms)
          stat cards stagger (100ms start, 80ms between, spring)
          people card fades in (300ms)
          people rows stagger (50ms between, slide from left)
pay       dialog glass treatment, scales 0.95→1.0 (spring)
mark paid row: pending badge → paid badge (spring scale)
          amount color green → muted (transition)
          row slides to paid group (layout animation)
```

### Visual Design

- Glass treatment on dialogs (inherited from global Dialog component)
- Stat cards: "Pending" gets `border-seeko-accent/20 bg-seeko-accent/[0.04]` accent tint
- People rows: borderless, `hover:bg-white/[0.04]`, `rounded-lg`
- "Pay" button: ghost variant with accent text
- Paid rows: `text-muted-foreground`, amount with ✓ icon
- PayPal email: monospace font, copy button

---

## UI: Investor Payments View

Same `/payments` route, server component checks role and renders investor view for `is_investor` profiles.

### Page Structure

1. **No password gate** — investors access directly

2. **Stat cards** (3-column grid):
   - **This Month** — total $ paid in current month
   - **All Time** — total $ paid ever
   - **People Paid** — distinct recipients count

3. **Monthly Breakdown card** — Aggregated spend per month:
   - Month label, total amount, payment count
   - Sorted newest first

4. **Recent Payments card** — Last 10 payments:
   - Recipient name, amount, date
   - No line item detail, no PayPal emails (privacy)

### What Investors Don't See

- No "Pay" buttons or payment creation
- No PayPal email addresses
- No line item breakdown (just totals per payment)
- No "pending" amounts (only completed payments)
- No password gate

---

## Security

### Password Protection

- Password stored as bcrypt hash in environment variable `PAYMENTS_ACCESS_HASH`
- `POST /api/payments/verify` — accepts password, compares against hash, returns a signed session token (JWT with 24hr expiry)
- Client stores token in sessionStorage (cleared on tab close)
- All payment mutation routes validate: admin role + valid session token
- Read routes: admin needs token, investor just needs `is_investor` flag

### API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/payments/verify` | POST | admin | Verify payments password, return session token |
| `/api/payments` | GET | admin+token / investor | List payments (filtered by role) |
| `/api/payments` | POST | admin+token | Create payment with line items |
| `/api/payments/[id]` | PATCH | admin+token | Update payment status (mark paid/cancel) |
| `/api/payments/stats` | GET | admin+token / investor | Aggregated stats |

---

## Sidebar Integration

- **Admin sidebar**: "Payments" link with `DollarSign` icon, between "Activity" and "Notifications"
- **Investor sidebar**: "Payments" link with same icon
- **Command palette**: Add "Payments" to pages list (admin/investor only)

---

## Scope Boundaries

**In scope:**
- Payment CRUD for admins
- PayPal.me link generation
- Read-only investor view
- Password gate
- Task bounty field
- PayPal email on profiles

**Out of scope:**
- PayPal API integration (no programmatic payments)
- Automatic payment scheduling
- Tax reporting / 1099 generation
- Multi-currency support (USD only for now)
- Payment notifications to recipients
