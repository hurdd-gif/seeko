# Investor Panel Redesign — Design Doc

**Date:** 2026-05-12
**Owner:** karti
**Status:** Approved, pending implementation plan
**Revision:** v2 — incorporates reviewer / IA / designer agent findings

---

## Problem

A real investor uses `/investor` today. The panel covers two of the four jobs they come to it for, and leaves three gaps:

| Investor job              | Current coverage                                         | Gap                      |
|---------------------------|----------------------------------------------------------|--------------------------|
| Is progress happening?    | Completion %, "This Week" KPI, activity feed             | Narrative feels noisy    |
| Where is risk?            | Issues card + red health-summary state                   | OK as-is                 |
| When will it ship?        | Nothing                                                  | Missing entirely         |
| Where is my money going?  | `/investor/payments` page only — not on dashboard        | Not surfaced             |

## Goal

Rework `/investor` so it answers all four investor questions at a glance, with a coherent top-to-bottom narrative.

## Success criteria (observable)

- All four investor questions answerable in <5s from `/investor` without scrolling past the fold on desktop.
- Each of the three named sections renders **populated · empty · error** states without breaking the page.
- Downloadable export (.xlsx) is coherent with on-screen narrative (same data, three tabs mirroring the three sections).
- Non-admin investor loads page with zero console errors and no admin-only affordances visible.
- Lighthouse a11y ≥ 95 on `/investor`.
- `prefers-reduced-motion` users see final state only — no ring draw, no bar fill animation, no stagger.

## Visibility scope (stated explicitly)

The investor panel surfaces **studio-wide** data, not per-investor scoping:
- Progress / forecast: all areas (Main Game, Fighting Club).
- Spend: studio-wide totals across the payments ledger (paid + pending). Cancelled payments stay admin-only.
- An investor sees the *studio's* health, not "what payments they personally received."

## Approach

Replace the current "hero + KPI grid + areas card + activity card" structure with **three named narrative sections**, each owning one investor question. Activity feed demoted to a collapsed footer.

### Page structure & weight

```
Hero (compressed) + health summary banner   [kept — works, has red state]
├─ Where we are       [single card, ring + per-area list]
├─ Where we're going  [taller — answers the dollar-weighted question]
└─ What it cost       [shorter, wider strip — the receipt]
└─ Recent updates (collapsed footer)
```

Section 2 gets more vertical weight than Section 3 — "when will it ship" is what investor money tracks against. Section 3 is a receipt, not a centerpiece.

### Section 1 — "Where we are"

Single rounded surface card. Layout:

- **Left:** large completion ring, **72px radius** (promoted from 54px peer-grid scale to solo-hero scale), thicker stroke proportional to radius. Number centered, "% complete" caption.
- **Right:** single-column per-area progress list. Each row: name (foreground) · full-width progress bar (seeko-accent fill, secondary track) · tabular-nums `%` · quiet phase label.

Single-column always — progress bars need width to read as proportional signals.

**Bar entrance — pick one (NOT both):** labels stagger in 80ms apart (`FadeRise`), bars fill in parallel from 0% width with a single shared spring. Avoids the read conflict where staggered horizontal entrances fight the horizontal fill direction.

Empty state via existing `EmptyState`. Mobile: ring stacks above the list, ring shrinks to ~96px diameter.

Admin click target: the ring opens the existing completion-edit Dialog (extracted from `InvestorKPIStrip`). **Non-admin investors:** no `<button>` wrapper, default cursor — no misleading pointer affordance.

### Section 2 — "Where we're going"

Phase timeline: **Alpha · Beta · Launch**.

**Metaphor:** one timeline with three stations. Not three independent columns.

- **Desktop:** three phase headers spaced horizontally with a thin horizontal connector stroke running across all three. A small marker is pinned to the timeline at the **soonest non-null `target_date`** column. This converts the layout from "three buckets" (kanban read) to "one timeline" (forecast read).
  - Each area pinned as a small card under the header matching its `phase`. Card content: area name, formatted `target_date` ("Jun 15") or "TBD" if null, one-line "X of Y tasks complete" caption.
  - Hover: cards lift subtly via existing `HoverCard` primitive.
- **Mobile:** vertical phase headers stacked; thin vertical connector stroke runs *between phase headers only* (not between cards) — preserves time-ordering metaphor without ladder-rung kanban read at 375px.
- Column headers: muted-foreground, tight tracking, **no uppercase** (per "no uppercase-tracked eyebrow chrome" rule).

**Edge cases (specified):**

| Condition                                  | Behavior                                                       |
|--------------------------------------------|----------------------------------------------------------------|
| All `target_date`s null                    | No marker. Headers + cards still render. Caption: "No ship dates set." |
| Soonest `target_date` is in the past       | Marker still pins to that column. Card date renders with `text-status-blocked` (red). |
| All areas in same phase                    | Other two phase columns render empty with muted "—" placeholder. Marker still places on the populated column if it has the soonest date. |
| Multiple areas in the same phase, same date | Marker pins to the column (not a specific card).               |

### Section 3 — "What it cost"

Two zones in one card, sitting as a wider/shorter strip beneath Section 2:

- **Top (inline KPIs, hero scale):** `$12,400 paid total` · `$1,800 pending`. Tabular-nums, larger type (text-2xl) — the headline of the section is the totals, not the table. Muted captions beneath.
- **Bottom (3 most recent payments):** date · description · recipient (display_name) · amount · status dot.
  - **Status dot colors:** seeko-accent for paid, `muted-foreground` (neutral) for pending. **Amber is reserved for `task_status = In Progress`** — payment status and task status are different ontologies; don't bleed semantics across them.
- Footer link: `View all payments →` to `/investor/payments`.
- Empty state via `EmptyState`.

**Currency:** assume USD. Mixed-currency display is out of scope; flag if `payments.currency != 'USD'` and surface a follow-up.

No sparkline. Episodic payments don't form a meaningful trend with current data volume; the recent-payments list already answers the "where" question.

### Section 4 — Recent updates (footer)

Current activity feed, collapsed by default — expandable.

- Toggle label: `Recent updates (3 this week)` — count badge in muted-foreground keeps signal even when collapsed.
- Expand uses Framer `layout` for height auto, so disclosure has a measured beat of motion (Emil-rule: every interactive control needs feedback). Spring physics, not `transition: all`.

## Schema change

```sql
-- supabase/migrations/<timestamp>_areas_target_date.sql
alter table public.areas add column if not exists target_date date;
```

- Idempotent (`if not exists`).
- Nullable — existing rows stay null until set. Matches the existing `area.phase` nullable convention.
- `target_date` (not `deadline`) is intentional — `tasks.deadline` is a hard task due date; `areas.target_date` is a planned ship commitment. Different concepts, separate columns.
- `Area` type in `src/lib/types.ts` gains `target_date?: string;` (Supabase returns `date` as ISO `YYYY-MM-DD`).
- **`fetchAreas()` query update required** — current implementation selects an explicit column list (not `*`); add `target_date` to the `select(...)` string. Verified against `src/lib/supabase/data.ts`.
- UI shows "TBD" when null. Never blocks render.

Editing `target_date` is out of scope for this pass — set via Supabase Table Editor. Follow-up admin UI noted but not built now.

## RLS migration (P0 — required)

```sql
-- supabase/migrations/<timestamp>_investor_pending_payments_rls.sql
drop policy if exists "Investors can read paid payments" on public.payments;

create policy "Investors can read paid and pending payments"
  on public.payments for select
  using (is_investor_or_admin() and status in ('paid', 'pending'));
```

- Widens investor read access from `status = 'paid'` only to `status in ('paid', 'pending')`.
- Cancelled payments remain admin-only (no investor visibility into rolled-back commitments).
- Without this migration, the `pendingTotal` KPI silently renders `$0` and pending rows never appear in the recent list — UI lies. This is the P0 reviewer + IA both flagged.

## Data

New aggregate function in `src/lib/supabase/data.ts`:

```ts
fetchPaymentsSummary(): Promise<{
  paidTotal: number;
  pendingTotal: number;
  recent: Array<{
    id: string;
    description: string;
    amount: number;
    status: 'pending' | 'paid';
    created_at: string;
    recipient: Pick<Profile, 'id' | 'display_name'>;
  }>;
}>
```

- **Totals via SQL aggregation**, not JS sums — matches the existing `fetchOpenNoteCount` / `fetchUnreadNotificationCount` pattern (`data.ts:172, 195`). Two `.select('amount.sum()', { head: true })` calls filtered by status (or a single Postgres RPC). Avoids fetching full ledger to client.
- `recent` query selects 3 most-recent rows joined with `profiles!payments_recipient_id_fkey(id, display_name)` for the nested `recipient` object — matches the existing `Payment.recipient` denorm pattern at `types.ts:142`, not flattened.
- Called in parallel with existing fetchers via `Promise.all` in the page.
- All fetchers `.catch()` to safe defaults — existing defensive pattern.

## Components

New files in `src/components/dashboard/`:

| File                             | Role                                                            |
|----------------------------------|-----------------------------------------------------------------|
| `InvestorWhereWeAre.tsx`         | Ring + per-area list; houses completion-edit Dialog             |
| `InvestorWhereWereGoing.tsx`     | Phase timeline (desktop horizontal / mobile vertical) + connector + marker |
| `InvestorPhaseCard.tsx`          | Small per-area card pinned to a phase column                    |
| `InvestorWhatItCost.tsx`         | Spend KPIs + recent payments preview                            |
| `InvestorActivityFooter.tsx`     | Collapsed activity feed (refactor of current inline activity)   |

**Deletions** once new components subsume their roles:

- `InvestorKPIStrip.tsx` — replaced by `InvestorWhereWeAre` (ring) and `InvestorWhatItCost` (spend KPIs).
- `CollapsibleInvestorAreas.tsx` — per-area progress now lives in `InvestorWhereWeAre`.
- `InvestorAreaCard.tsx` — **delete.** `InvestorPhaseCard` is the phase-timeline successor; the old area card's responsibilities don't map cleanly.

## Excel export (replaces PDF)

Replace `src/app/api/investor/export-summary/route.ts` (currently emits PDF) with `.xlsx` generation.

**Library:** `exceljs` (more flexible than `xlsx` for styling and column widths).

**Workbook structure — three sheets, one per dashboard section:**

| Sheet name   | Columns                                                                  |
|--------------|--------------------------------------------------------------------------|
| Progress     | Area · Phase · Progress % · Tasks complete · Tasks total                 |
| Forecast     | Area · Phase · Target date · Days remaining · Tasks complete · Tasks total |
| Payments     | Date · Description · Recipient · Amount · Currency · Status              |

- Investor downloads one `.xlsx`; opens whichever sheet they need.
- Sheet structure mirrors the on-screen three-section narrative — same data, same order.
- Number formatting: tabular currency in Payments sheet (`$#,##0.00`); ISO dates.
- Filename: `seeko-studio-investor-summary-YYYY-MM-DD.xlsx`.
- Existing PDF route deleted. Sidebar download button label updates from "Download summary (PDF)" → "Download summary (Excel)".

## Animation storyboard

```
/* ANIMATION STORYBOARD — Investor Panel v2
 *
 * Total entrance: ~420ms (compressed from initial 700ms — this is a
 * return-visitor surface, not a first impression).
 *
 *    0ms   hero + health summary fade up
 *   80ms   "Where we are" section fades up
 *          ring draws (500ms ease-out) + area bars fill in parallel
 *          (400ms ease-out, single spring) — same finish line, no stagger conflict.
 *          Bar labels stagger in 80ms apart via FadeRise.
 *  180ms   "Where we're going" fades up
 *          phase headers + connector stroke fade in together
 *          area cards within columns stagger after (60ms apart)
 *  280ms   "What it cost" fades up
 *          spend numbers count up to value (300ms, eased)
 *  380ms   Activity footer fades in (subtle)
 */

const TIMING = {
  hero:        0,
  whereWeAre:  80,
  forecast:    180,
  spend:       280,
  activity:    380,
};
```

Reuse `FadeRise`, `Stagger`, `StaggerItem`, `HoverCard`. Spring physics. Specify exact transition properties (never `all`). `ease-out` over `ease-in`. Nothing scales from 0 — all entrances start at `opacity: 0.95+` per emil-design-eng standards.

**`prefers-reduced-motion`:** explicitly covers the ring draw, bar fill, AND the activity-footer layout expand — not just the wrapping `FadeRise`. Reduced-motion users see final state with no animated entrances.

## Admin overlay

- Completion ring clickable for **admins only** → opens existing completion-edit Dialog (moved from `InvestorKPIStrip` → `InvestorWhereWeAre`).
- Non-admin investors: ring is a static SVG, default cursor, no hover state.
- `target_date` editing: out of scope this pass. Supabase Table Editor for now. Followed up later.

## Error handling

- Each fetcher `.catch()` returns safe defaults (existing pattern).
- All sections render their empty states without breaking the page.
- Null `target_date` → "TBD" — never special-case.
- Migrations idempotent (`if not exists` / `drop policy if exists` + `create policy`).

## Testing

- **Unit:** `fetchPaymentsSummary` with mocked Supabase client — empty / single payment / mixed paid+pending. Verify SQL aggregation path (not JS sum).
- **Component:** `InvestorWhatItCost` and `InvestorWhereWereGoing` render populated + empty + error states. Specifically: `InvestorWhereWereGoing` with all-null `target_date`s renders without a marker.
- **Behavior over snapshot:** prefer assertions that "ring renders %", "payments list renders ≤3 rows", "marker pins to soonest date column" over full structural snapshots — page is layout-heavy and snapshots will be brittle.
- **Excel export route:** integration test that generates a workbook and asserts the three sheet names + column headers.
- Co-located in `__tests__/` next to each file. Vitest.

## Out of scope (follow-ups)

- Admin UI for editing `target_date` (use Supabase Table Editor for now).
- Sparkline / monthly spend trend in "What it cost".
- Risk-depth drilldown (current shallow risk surface judged sufficient).
- Notion sync for `target_date` (if/when desired).
- Mixed-currency display in Excel + UI.
- Per-investor spend scoping (current scope is studio-wide).
- `payment_items` line-item detail in the Payments sheet (current investor RLS doesn't grant access).

## Approval

Approved section-by-section in conversation 2026-05-12 with karti:

- Schema + page structure
- The three sections (with `/interface-craft critique` driving Q1–Q3 micro-decisions)
- Data flow, animations, admin overlay, error handling, testing

**v2 revisions (2026-05-12, post-agent review):**

- Reviewer (af2282dbac060967a): three P0 blockers + seven P1s — all addressed above.
- IA (a50f670d7cf8db8bf): RLS confirmation + SQL-aggregate pattern + nested `recipient` shape — incorporated.
- Designer (ab6a74900b9304f51): timeline-with-stations metaphor, ring scale 72px, bar stagger resolved, amber → neutral pending dot, animation compressed to 420ms — incorporated.

**User decisions locked:**

- Widen investor RLS to `status in ('paid', 'pending')` — keeps the four-question narrative.
- Replace PDF export with single Excel workbook (three tabs: Progress · Forecast · Payments).
