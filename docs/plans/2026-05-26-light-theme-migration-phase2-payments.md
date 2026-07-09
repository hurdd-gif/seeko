# Light-Theme Migration — Phase 2 · Payments Implementation Plan

> **For Claude:** Execute task-by-task with file-scoped commits. Hold invariants:
> `tsc` clean count = **190**, test baseline = **12 pre-existing failures**, notifications
> WIP untouched (= 10). NEVER `git add -A` / `git add .` — stage only the named files.
> Dev server runs from main repo; write to main first.

**Goal:** Relight the Payments surface (admin body + passkey gate + create/invoice dialogs)
from dark chrome onto SEEKO's established light language, wrapped in `LightShell` with a
`‹ Payments` breadcrumb — matching Settings/Docs/Team.

**Architecture:** Mechanical reuse of `lightKit.ts` + opt-in `light` props (`Dialog`, `Select`,
`DepartmentSelect`, `InteractiveRow`). Two real craft fixes: (1) the **banned uppercase-tracked
eyebrow** on stat-card labels → sentence-case; (2) the shared `EmptyState` **invisible-title
bug on white** → local light empty blocks. No new design language.

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4 (`@theme inline` baked tokens → relight via
className overrides, not runtime vars) · motion/react · HeroUI v3.

**Reference:** dark-baseline inventory in `docs/plans/phase2-baselines/payments-before-critique.md`.

---

## Color decisions (from BEFORE critique + Team-phase precedent)

| Role | Light value |
|------|-------------|
| Primary / confirm (New Payment, Accept) | `BTN_PRIMARY` = `bg-[#111] text-white hover:bg-[#2a2a2a]` |
| Secondary (Request Invoice) | `BTN_SECONDARY` light |
| Money owed / azure accent (pending amount, Pay, active filter pill, paid check, verified+approved status) | `#0a63cc` (AA 5.7:1); washes `#0a63cc/10` |
| "Needs approval" amber (Payment Requests card, pending row, submitted status) | text `#946a00`, wash `#b8801a/10`, hairline `#b8801a/30` |
| Destructive (Deny, Revoke, rejected, revoked) | `#d4503e`, wash `#d4503e/10` |
| Neutral status (pending, expired) | text `#808080`, hairline `black/[0.08]` |
| Cards | `rounded-2xl border-0 bg-white shadow-seeko` (flatten dark glow gradients) |
| Headings / body / muted ladder | `#111` / `#2a2a2a` / `#505050` / `#808080` / `#9a9a9a` |
| Row hover | `hover:bg-black/[0.03]` |
| Avatar | `outline outline-1 -outline-offset-1 outline-black/[0.06]`, fallback `bg-[#f4f4f4] text-[#505050]` |
| Sub-panels | `bg-[#f7f7f7]` |
| Spinner | `border-black/10 border-t-[#0a63cc]` |

---

### Task 0: Baseline-commit the pre-existing WIP AS-IS

**Hazard:** `git commit -- <file>` commits ALL uncommitted changes to that file. Three Payments
files carry a clean, single-purpose pre-existing WIP (emerald→sky recolor of success/paid
affordances). Commit it AS-IS first so the relight lands as clean, separate commits.

**Files:** `PaymentsAdmin.tsx`, `PaymentCreateDialog.tsx`, `InvoiceRequestForm.tsx`

**Step 1:** `git add` the three files explicitly (named paths only).
**Step 2:** Commit: `chore(payments): recolor success/paid affordances emerald→sky (WIP baseline)`
**Step 3:** Verify `git status` shows those three clean; confirm `tsc` still = 190.

---

### Task 1: Add light invoice-status map to lightKit

**Files:** Modify `src/components/dashboard/lightKit.ts`

Add `LIGHT_INVOICE_STATUS: Record<string, string>` (AA-on-white) mirroring the dark
`INVOICE_STATUS_COLOR` keys (pending/verified/signed/approved/rejected/expired/revoked):
- `pending`: `text-[#808080] border-black/[0.08]`
- `verified`: `text-[#0a63cc] border-[#0a63cc]/30 bg-[#0a63cc]/10`
- `signed` (Submitted): `text-[#946a00] border-[#b8801a]/40 bg-[#b8801a]/10`
- `approved`: `text-[#0a63cc] border-[#0a63cc]/30 bg-[#0a63cc]/10`
- `rejected` / `revoked`: `text-[#d4503e] border-[#d4503e]/30 bg-[#d4503e]/10`
- `expired`: `text-[#9a9a9a] border-black/[0.08]`

**Commit:** `feat(lightkit): add LIGHT_INVOICE_STATUS AA-on-white map` (lightKit.ts only).

---

### Task 2: Relight PaymentsAdmin body + wrap in LightShell

**Files:** Modify `src/components/dashboard/PaymentsAdmin.tsx`

Sub-steps (single file-scoped commit at the end):
1. **Chrome wrap:** wrap the returned `<div className="flex flex-col gap-8">` in
   `<LightShell fill bordered leftSlot={<Link href="/" className="flex items-center gap-1
   text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"><ChevronLeft className="size-3.5"/><span>Payments</span></Link>}>`
   + `<main className="min-h-0 flex-1 overflow-y-auto">` + `<div className="mx-auto flex w-full
   max-w-3xl flex-col gap-8 px-6 py-10">`. (Settings/Team idiom.)
2. **Hero:** h1 `text-[#111]`, subtitle `text-[#808080]`; New Payment → `BTN_PRIMARY`,
   Request Invoice → `BTN_SECONDARY`.
3. **Stat cards:** `rounded-2xl border-0 bg-white shadow-seeko`, drop glow gradient; **FIX banned
   eyebrow** — label `text-[13px] font-medium text-[#808080]` (sentence-case, no `uppercase
   tracking-wider`); icon chip `bg-[#f4f4f4]` (or `bg-[#0a63cc]/10` when accent); value `#111`
   (or `#0a63cc` when accent/owed); subtitle `#9a9a9a`; keep `tabular-nums`.
4. **Payment Requests card:** light amber — border `border-[#b8801a]/30`, icon chip
   `bg-[#b8801a]/10`, icon/amount/badge `#946a00`; `divide-black/[0.06]`.
5. **Invoice Requests card:** white card; icon chip `bg-[#0a63cc]/10` icon `#0a63cc`; outline badge
   light; show-all button `hover:bg-black/[0.03] text-[#808080] hover:text-[#111]`.
6. **People card:** icon chip `bg-[#f4f4f4]`; filter pills active `bg-[#0a63cc]/10 text-[#0a63cc]`
   / inactive `text-[#808080] hover:bg-black/[0.04] hover:text-[#111]`; spinner
   `border-black/10 border-t-[#0a63cc]`; **EmptyState → local light empty block** (icon in
   `bg-[#f4f4f4]` circle, title `text-[#111]`, desc `text-[#808080]`); rows `hover:bg-black/[0.03]`;
   avatar outline + light fallback; dept `text-[#9a9a9a]`; pending amount + Pay `#0a63cc`; paid
   check `#0a63cc`; "No payments" `text-[#c8c8c8]`.
7. **Recent Payments card** + `PaidPaymentRow`: white card; **local light empty block**; row
   hover/avatar/chevron light; amount `#111`; sub-panels `bg-[#f7f7f7]`; PayPal copy hover `#0a63cc`.
8. **PendingRequestRow:** amber avatar ring → `outline outline-[#b8801a]/30`, fallback
   `bg-[#b8801a]/10 text-[#946a00]`; amount `#946a00`; Accept → `BTN_PRIMARY`; Deny →
   `text-[#d4503e] hover:bg-[#d4503e]/10`.
9. **InvoiceRequestRow:** use `LIGHT_INVOICE_STATUS`; icon chip `bg-[#f4f4f4]` + hairline; text
   ladder light; resend/revoke icon buttons `hover:bg-black/[0.04]` / revoke hover `#d4503e`.

**Verify:** `tsc` = 190; visual QA deferred to T4 (gated body).
**Commit:** `feat(payments): relight admin body onto light language + LightShell` (PaymentsAdmin.tsx only).

---

### Task 3: Relight PaymentsPasskeyGate

**Files:** Modify `src/components/dashboard/PaymentsPasskeyGate.tsx`

This is the entry surface (only directly screenshot-able one). Wrap in `LightShell`
(`‹ Payments` breadcrumb) so the gate matches light chrome. Card → `rounded-2xl border-0
bg-white shadow-seeko`; lock icon chip `bg-[#0a63cc]/10` icon `#0a63cc`; title `#111`; description
`#808080`; "Unlock with passkey" → `BTN_PRIMARY`; recovery link `text-[#9a9a9a] hover:text-[#3a3a3a]`;
error `text-[#d4503e]`; unsupported/recovery modes recolored to the light ladder. Respect all
five modes (loading/first-time-setup/unlock/unsupported/recovery).

**Verify:** `tsc` = 190; **capture gate AFTER** at 1440 + 390 (this surface renders without a session).
**Commit:** `feat(payments): relight passkey gate onto light language` (PaymentsPasskeyGate.tsx only).

---

### Task 4: Relight dialogs (PaymentCreateDialog + InvoiceRequestForm)

**Files:** Modify `src/components/dashboard/PaymentCreateDialog.tsx`, then
`src/components/dashboard/InvoiceRequestForm.tsx` (two separate file-scoped commits).

Relight onto light: panel `bg-white shadow-seeko` + matched radius; inputs `LIGHT_INPUT`;
Selects/DepartmentSelect pass `light`; labels `#808080`; primary submit `BTN_PRIMARY`; cancel
`DIALOG_CANCEL`; success state — icon chip `bg-[#0a63cc]/10` check `#0a63cc` (the WIP already moved
emerald→sky; light = `#0a63cc`), title `#111`, body `#808080`. If these use the shared `Dialog`,
prefer its `light` prop over hand-relighting.

**Verify:** `tsc` = 190.
**Commits:** `feat(payments): relight PaymentCreateDialog onto light` / `…relight InvoiceRequestForm onto light`.

---

### Task 5 (→ task-list T4): QA + AFTER critique + memory

1. Gate AFTER screenshots (1440 + 390) — captured in Task 3.
2. Admin **body** AFTER: throwaway local mock-data feed (presentational only — temporarily make
   `fetchData` tolerate the 401 and inject 2–3 sample payments/people in dev), screenshot 1440 +
   390, then **revert exactly** (no git ops on the bypass; gate + API stay intact). Same discipline
   as the T1 BEFORE bypass.
3. Dialog screenshots via the relit create/invoice flows (open from the body in the mock session).
4. Run `/interface-craft critique` AFTER-pass against the dark baseline. Confirm: eyebrow gone,
   white cards, amber/azure/destructive AA-legible, empty blocks visible, chrome consistent.
5. Move all screenshots into `docs/plans/phase2-baselines/` via same-volume `mv`.
6. Update memory (`project_seeko_light_theme_migration.md` + `MEMORY.md`): Phase 2 Payments DONE;
   next = External Signing, then Notifications (after inbox WIP resolved).
7. Hold invariants: `tsc` = 190, 12-fail test baseline, notifications = 10.
