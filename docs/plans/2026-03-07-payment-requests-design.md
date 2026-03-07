# Payment Requests from Settings — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let team members and contractors request payment from their settings page, creating pending payments for admin approval.

**Architecture:** Reuses existing `payments` + `payment_items` tables. Team members POST to a new authenticated endpoint that creates a pending payment. Admin approves/denies via existing PATCH endpoint.

**Tech Stack:** Next.js App Router, Supabase Auth + Data, shadcn/ui, motion/react

---

## Data Flow

1. Team member opens Settings, clicks "Request Payment"
2. Dialog collects: PayPal email (saved to profile), line items (label + amount), optionally attached completed tasks, optional notes
3. POST `/api/payments/request` creates `payments` row with `status: 'pending'` + `payment_items` rows
4. Admin's Payments dashboard shows pending requests in hero callout + dedicated pending section
5. Admin approves (status → `paid`, `paid_at` set) or denies (status → `cancelled`)

## Schema Changes

No new tables. Additions to existing:

- `payments.requested_at` (timestamptz, nullable) — distinguishes team-initiated requests from admin-created payments

The `payments.created_by` field already stores who created the payment. For requests, `created_by` = `recipient_id` (team member requesting for themselves).

## API

### POST `/api/payments/request` (new)

- **Auth:** Supabase session (any authenticated non-investor user)
- **Body:** `{ amount, description?, items: [{ label, amount, task_id? }], paypal_email? }`
- **Behavior:**
  - If `paypal_email` provided, update the user's profile
  - Create `payments` row: `recipient_id = user.id`, `created_by = user.id`, `status = 'pending'`, `requested_at = now()`
  - Create `payment_items` rows
- **Returns:** 201 with payment object

### PATCH `/api/payments/[id]` (existing)

Already supports `status: 'paid' | 'cancelled'`. Used by admin to approve/deny.

### GET `/api/payments/mine` (new)

- **Auth:** Supabase session
- **Returns:** User's own payments (all statuses) with items, ordered by created_at desc

## Components

### `PaymentRequestDialog` (new)

`src/components/dashboard/PaymentRequestDialog.tsx`

Dialog with:
- PayPal email input (pre-filled from profile, saved on submit)
- Line items: label + amount (add/remove, same pattern as PaymentCreateDialog)
- Task picker: dropdown of user's completed tasks (optional attachment)
- Notes/description field (optional)
- Total bar (accent-tinted when > 0)
- "Submit Request" button

### Settings Page — Payments Section

Add to existing settings page:
- "Payments" section header
- Saved PayPal email (display + edit inline)
- "Request Payment" button → opens PaymentRequestDialog
- Recent requests list: status badge (Pending/Approved/Denied), amount, date

### `PaymentsAdmin.tsx` — Pending Requests Section

Between hero callout and people list, add:
- "Pending Requests" card (only shown when pending requests exist)
- Each request row: avatar, name, requested amount, line items (expandable), attached tasks
- Two action buttons: Approve (accent green) and Deny (red/destructive)
- Approve calls PATCH with `status: 'paid'`, Deny calls PATCH with `status: 'cancelled'`

## Task Picker

Simple dropdown/multi-select showing the user's tasks with `status: 'Complete'`. Each selected task auto-creates a line item with the task name as label. Amount is manually entered (tasks don't have monetary values).

Fetched via existing `fetchTasks(userId)` filtered to `status: 'Complete'`.

## Security

- `/api/payments/request` only allows creating payments where `recipient_id = authenticated user`
- `/api/payments/mine` only returns payments where `recipient_id = authenticated user`
- Approve/deny still requires admin + payments token (existing auth)
- Investors cannot request payments (check `is_investor`)
