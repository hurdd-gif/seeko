# Contractor Portal — Design Spec

**Linear:** [DIH-29 Contract_portal](https://linear.app/dihuser/issue/DIH-29/contract-portal)
**Date:** 2026-07-04
**Status:** Design approved — layout Approach A (single-column vertical timeline)

---

## 1. Problem

Contractors are assigned tasks like everyone else, but the studio dashboard (tasks board, docs,
payments, activity) is built for internal members. A contractor logging in has no focused surface
for the only thing that concerns them: **what am I on the hook to deliver, by when, and how do I
report progress and hand it off.**

DIH-29 asks for a "contractor portal where it's a vertical breadcrumb that says deliverables,
deadlines, check-in dates, etc." This spec turns that into a single, calm landing surface a
contractor sees immediately after login.

## 2. Goals / Non-goals

**Goals**
- A contractor-only home at `/contractor`, landed on directly after login.
- A **vertical breadcrumb timeline** of the contractor's own deliverables, ordered by deadline.
- Two write actions per deliverable: **update progress** and **upload a deliverable file**.
- Visual language inherited verbatim from the login reference (Paper `SK_DB` frame `27P-0`).

**Non-goals (YAGNI)**
- No new database tables or columns. Check-in dates *are* deliverable deadlines.
- No task creation, reassignment, status editing, or commenting by contractors (read + progress
  + upload only).
- No cloning of the investor portal shell — the design is net-new from the login style.
- No exposure of internal surfaces (tasks board, docs, payments, activity, other people's work).

## 3. Product decisions (locked in brainstorming)

| Question | Decision |
|---|---|
| What can a contractor do? | **Read + progress updates** (plus deliverable upload). |
| What are "check-in dates"? | **The deliverable deadlines** — no separate concept, no new schema. |
| Where do contractors land? | **Their own `/contractor` home**, mirroring how investors get `/investor`. |
| Layout | **Approach A** — single-column vertical timeline. |
| Greeting header | Personal warm treatment ("Good morning, {name} · N deliverables · next due {date}"). |

## 4. Design language (inherited from login reference 27P-0)

The portal must read as the same product as the login. Values below are confirmed against the
Paper reference and the live `src/rr-app/routes/login.tsx`.

| Element | Spec |
|---|---|
| Canvas | pure white, `antialiased`, inside `.overview-light` scope (so `--ov-*` tokens resolve) |
| Top bar | absolute, `flex justify-between`, `px-10 py-8` (32/40); gray `seeko-mark.svg` (24px) + `Studio` label `text-[#686868]` on the left |
| Centered column | `max-w-[620px]`, `p-4`, `gap-8` vertical rhythm |
| Surface card | `rounded-[20px] border border-[#E8E8E8]/75 bg-white shadow-[0_10px_20px_#D1D1D126]` |
| Heading | 22px / 600 / `-0.02em` / `#454545` |
| Muted text | `#969696`, 14px |
| Status node dots | existing status color map: Done `#0d7aff`, In Progress `#fbbf24`, In Review `#93c5fd`, Blocked/overdue `#f87171`, Backlog/Todo neutral `#c4c4c4` |
| Reusable kit | `lightKit.ts` (BTN_PRIMARY, LIGHT_INPUT, LIGHT_FOCUS_RING, HAIRLINE, CARD_TITLE, CARD_DESC, status/department ramps) |

## 5. Layout — Approach A (single-column vertical timeline)

A hairline **spine** runs down the left of the centered column. Each deliverable is a node on the
spine (a status-colored dot) with a card to its right. Deliverables are ordered by deadline and
grouped into urgency buckets. The spine is the "vertical breadcrumb" from the ticket.

```
 ┌ Studio                                          Dana Okafor ▾ ┐   top bar (login geometry)
 │                                                                │
 │   Good morning, Dana                                           │   greeting 22/600 #454545
 │   3 deliverables · next due Thu Jul 10                         │   subline #969696
 │                                                                │
 │   OVERDUE                                                      │   bucket label 11px caps #969696
 │   ●───┐ Fighting Club combat SFX pass        [ In Review ]     │
 │   │   └ Animation · due Jul 1 · ▓▓▓▓▓▓▓░░ 70%                  │   deliverable card (surface card)
 │   │                                                            │
 │   THIS WEEK                                                    │
 │   ●───┐ Main menu wireframes                  [ In Progress ]  │
 │   │   └ UI/UX · due Thu Jul 10 · ▓▓▓▓░░░░ 45%                 │
 │   ○───┐ Character-select portraits            [ Todo ]         │
 │   │   └ Asset Creation · due Sat Jul 12 · ░░░░ 0%             │
 │                                                                │
 │   UPCOMING                                                     │
 │   ○───┐ Boss intro cinematic                  [ Backlog ]      │
 │       └ Animation · due Jul 24 · ░ 0%                          │
 └────────────────────────────────────────────────────────────────┘
```

**Buckets** (computed from `deadline` vs today, local time):
- `Overdue` — deadline < today, status not Done/Canceled. Red node + red deadline text.
- `This week` — deadline within the next 7 days.
- `Upcoming` — deadline > 7 days out, or no deadline (sorted last).
- Done/Canceled deliverables collapse into a quiet `Delivered` bucket at the bottom (node filled, muted).

**Deliverable card contents:** task name (CARD_TITLE), department tag, deadline (tabular-nums),
inline progress bar, status pill. Priority is surfaced only via ordering within a bucket
(High first), not a separate badge, to keep the row calm.

**Expand-in-place detail:** clicking a card expands it (spring, matched inner radius = outer −
padding) into a detail panel:
- description (read-only)
- deadline restated
- **progress slider** — the contractor's primary write action → `PATCH /api/tasks/:id` `{ progress }`
- **deliverable upload** — reuses existing `TaskDeliverable` flow (file → storage → `deliverable_uploaded` notification)
- the spine node fills proportionally to progress as a visual reward

## 6. Data flow (no schema changes)

- **Read:** `fetchTasksForAssignee(contractor.id)` (`src/lib/supabase/data.ts:194`) returns the
  contractor's own tasks joined with assignee as `TaskWithAssignee[]`. No other rows are fetched.
- **Write — progress:** existing `PATCH /api/tasks/:id` with `{ progress }`. Server must verify the
  task's `assignee_id === session user id` before allowing a contractor to write (see §8).
- **Write — deliverable:** existing `TaskDeliverable` upload path (`task_id`, `file_name`,
  `storage_path`, `uploaded_by`, `download_url`) and its `deliverable_uploaded` notification.
- **Fields used:** `Task.name`, `.department`, `.status`, `.priority`, `.deadline`, `.progress`,
  `.description` (`src/lib/types.ts`). `bounty` is intentionally **not** shown (payment surface is
  separate and out of scope).

## 7. States

| State | Treatment |
|---|---|
| Loading | skeleton spine with 3 shimmer node/card pairs |
| Empty (no assigned tasks) | centered card: "No deliverables assigned yet" + muted line "New work will show up here." |
| All delivered | quiet celebratory line above an all-`Delivered` bucket ("You're all caught up.") |
| Overdue present | red node + red deadline; Overdue bucket pinned to top |
| Write error (progress/upload) | inline error under the control, non-destructive, retryable |

## 8. Route & auth plumbing (existing app conventions)

- **Route:** `/contractor` registered top-level in `src/rr-app/routes.tsx` (outside `RootLayout`),
  rendering its own `LightShell`, with `ErrorBoundary: StandaloneErrorBoundary` — same shape as the
  investor cluster.
- **Loader gate:** the route loader `fetch`es `/api/contractor`; maps `401 → redirect('/login')`,
  `403 | 404 → forbidden card`. No client-side guard component.
- **Server authorization:** a new `src/lib/contractor-index.ts` builder mirrors `investor-index.ts`:
  it resolves the session profile and throws unless `profile.is_contractor === true` **or**
  `profile.is_admin === true`. The `/api/contractor` route returns the contractor's deliverables via
  `fetchTasksForAssignee`. The progress `PATCH` additionally enforces `assignee_id` ownership so a
  contractor can only move their own tasks.
- **Post-login redirect:** after successful auth, contractors route to `/contractor` instead of
  `/tasks`. Investors already win the redirect race to `/investor`; contractor takes precedence over
  the default `/tasks` but not over investor (a user is realistically one or the other).

## 9. Security & privacy constraints

- Never render bounty/payment amounts or any personal contact info on this surface.
- The unauthenticated `/login` and `/legal/*` pages must not name this portal.
- Contractor sees **only** their own tasks — enforced server-side, never by client filtering alone.

## 10. Testing

- Loader: 401 → redirect `/login`; 403/404 → forbidden card; 200 → renders timeline.
- `contractor-index.ts`: throws for non-contractor/non-admin; returns only the caller's tasks.
- Bucketing: overdue / this-week / upcoming / delivered classification from `deadline` vs a fixed
  "today"; no-deadline sorts last.
- Progress `PATCH`: contractor can write own task; is rejected on a task they don't own.
- Empty and all-delivered render states.
- Vitest baseline unchanged except new suites (current baseline: only `investor.test.tsx` red).

## 11. Out of scope / follow-ups

- Contractor-visible payment/bounty view (separate surface, separate decision).
- Threaded comments or check-in notes distinct from deadlines.
- Contractor invite/onboarding copy changes.
