# Contractor Deliverable Steps (Breadcrumbs) — Design Spec

**Linear:** [DIH-29 Contract_portal](https://linear.app/dihuser/issue/DIH-29/contract-portal)
**Date:** 2026-07-05
**Status:** Design approved (all three sections) — ready for writing-plans
**Builds on:** [`2026-07-04-contractor-portal-design.md`](./2026-07-04-contractor-portal-design.md)

---

## 1. Problem

The contractor portal today renders each deliverable as a **single node** on the vertical
breadcrumb spine, with one 0–100 `ProgressRail` scrub-dial per deliverable. A real deliverable
isn't one atomic thing — it's a short sequence of hand-off moments ("low-fi flows → component
pass → high-fi mockup → handoff"). A single % can't say *which* moment we're at, when each is
due, or that one is sitting in review.

The ask (verbatim): *"You'll need to do a missed deadline state, compacted finished state, pending
review state for the timeline. Ideally each deliverable would have 1–10 breadcrumbs."*

This reframes the model to **two levels**: each deliverable becomes a group of **1–10
admin-authored steps** ("breadcrumbs"), and each step is a node on the one spine carrying its own
state and optional deadline.

## 2. What this supersedes in the 07-04 portal spec

| 07-04 spec | Superseded by this design | Why |
|---|---|---|
| `ProgressRail` 0–100 scrub-dial per deliverable | **Derived** step progress ("M of N") | The unit is now discrete steps, not a continuous %. |
| Contractor write = scrub progress | Contractor write = **advance current step → In review** (one tap) | Discrete steps + a review hand-off; justifies the pending-review state. |
| Expand-in-place progress slider | No expand — steps are already visible on the spine | Keeps the frameless single-spine mandate (see [[contractor-vertical-breadcrumb]]). |

Unchanged from 07-04: the frameless single-spine layout, the two-zone structure (active
Deliverables up top, month-grouped completed Timeline below), the light `27P-0` design language,
the contractor-only `/contractor` route + auth gating, and all security constraints.

## 3. Product decisions (locked in brainstorming)

| Question | Decision |
|---|---|
| What is a "breadcrumb"? | An **admin-authored sub-step** of a deliverable — a named step with an optional deadline. 1–10 per deliverable. |
| Structure on the spine | **Approach A** — one continuous spine; the deliverable is a text group-heading (no node); its steps are the nodes. |
| Who authors steps? | **Admin** (writes names + deadlines). |
| Contractor's only write | Advance the **current** step: active → **In review** (one tap on the focal node). |
| Who marks done? | **Admin** confirms In review → **done** (or bounces back to active). |
| Build order | **Prototype the look on the QA route with seeded data first, then wire schema.** |

## 4. Section 1 — Node states & interaction model

### 4.1 The five rendered states

Each state is purely a node + label treatment on the one spine, all drawn from the existing
AA-on-white light ramp (see [[portal-light-token-baseline]]).

| State | Node | Label | Meaning |
|---|---|---|---|
| **upcoming** | hollow, `ring-hairline`, `bg-white` | date `ink-muted` ("Jul 18") or "No deadline" | authored, not started |
| **active** | filled, department-tinted, **enlarged** (focal) | department tint | the one step in motion now |
| **pending-review** | filled review-blue `#3f5fb5` | "In review", blue | contractor submitted; waiting on admin |
| **missed-deadline** | filled overdue-red `#d4503e` | "N days overdue" + `TriangleAlert`, red | past deadline, not done |
| **done** | faint green check `#15803d`, compacts | collapses into "✓ N done — show" | admin-confirmed complete |

### 4.2 Stored vs derived

Stored enum is intentionally tiny — `task_step_state`: **`pending` · `in_review` · `done`**.
Everything else is derived at render time, mirroring how `contractor-buckets.ts` already derives
`isOverdue`:

- **focal** = the first step whose state ≠ `done` (in `sort_order`).
- **active** = focal that is `pending` and not past due.
- **missed-deadline** = focal (or any not-done step) that is `pending`/`in_review` with `deadline < today` (local midnight).
- **pending-review** = focal that is `in_review`.
- **upcoming** = every not-done step after the focal.

### 4.3 Who moves a step

1. **Admin authors** the 1–10 steps (name + optional deadline) — the "admin-authored sub-steps" choice.
2. **Contractor's only write**: tap the focal node to advance `active → in_review` (`pending → in_review`).
   Constrained server-side to the caller's own task, and only the focal step.
3. **Admin confirms**: `in_review → done`, or bounces `in_review → pending` (back to active).
   Admin is the only actor who can reach `done`.

`active` and `missed` are never stored — they are read off `(state, deadline, now, sort_order)`.

## 5. Section 2 — Layout & compaction

### 5.1 Grouping on the one spine

Each deliverable is a text group-heading indented `pl-6` (**no node** — the hairline runs behind
it unbroken, exactly like today's `DELIVERABLES` label), carrying a faint derived rollup. Its
steps hang off the *same* spine below it. Extra top-margin before each heading is the only "new
group" signal — never a frame, never a second line.

```
│  MAIN MENU WIREFRAMES               3 of 5 · next Jul 18   ← heading + rollup (no node)
│    ✓ 3 done — show                                         ← compacted (≥2 done)
◉──  High-fi mockup                              Jul 18      ← focal: active (enlarged, tinted)
○──  Handoff spec                                Jul 22      ← upcoming (hollow, dated)
│
│  COMBAT HUD                                    In review   ← heading rollup = focal state
◉──  Damage-state sprites                     In review      ← focal: pending-review (blue)
○──  HUD integration                             Jul 25
│
│  ONBOARDING FLOW                          2 days overdue
◉──  Tutorial copy                          2 days overdue   ← focal: missed (red)
│
│  ── TIMELINE ──                                            ← existing completed zone, unchanged
●  Loading screen polish                            Jun 28   ← fully-done deliverable, faint
```

### 5.2 Focal node & rollup

There is exactly **one focal node per active deliverable** (§4.2). The group heading's rollup
derives one line, in priority order: `In review` (focal in_review) › `N days overdue` (focal
missed) › `M of N · next {date}` (default).

### 5.3 Compaction rule

- Done steps sit above the focal, so they collapse: **≥2 done → one faint "✓ N done — show" line**;
  0–1 done render inline.
- Expanding staggers them in (`animate-timeline-enter`, `${i*60}ms`) — the same mechanism
  `CompletedTimeline` already uses; collapse is a quick fade.
- The focal + upcoming steps **never** collapse — they are "what's next."
- A **fully-done deliverable** (all steps `done`) drops into the existing month-grouped Timeline
  history below as a **single faint line**; its steps do not expand down there. The two-zone
  structure is untouched — breadcrumbs only expand inside *active* deliverables.

### 5.4 Edge cases

| Case | Treatment |
|---|---|
| Deliverable with **0 authored steps** | heading + faint "No steps yet" line (admin hasn't broken it down) |
| No deliverables at all | existing `Inbox` empty state (unchanged) |
| All deliverables fully done | all fall into the Timeline zone; active zone shows the "all caught up" line (unchanged) |

## 6. Section 3 — Motion

Graded by emil's frequency rule (retire animation on constantly-seen states; reserve motion for
the rare), spring-first, reduced-motion-safe, reusing existing primitives (`springs.snappy`,
`animate-timeline-enter`, `useReducedMotion`).

```
FOCAL ADVANCE  (contractor taps active node → "In review")   ← the single hero moment
  0ms   press: focal node scale 0.97 (140ms ease-out)         emil: every pressable needs :active
  on release
  0ms   node fills dept-tint → review-blue #3f5fb5            transition background-color ONLY, 180ms
  0ms   label crossfades "UI/UX" → "In review"                opacity 160ms, no layout shift
 (admin later confirms → node → faint green check, compacts)

COMPACTION  ("✓ N done — show" toggled open)
  each done step in:  fade + translateY(4px)→0, staggered ${i*60}ms   reuse animate-timeline-enter
  collapse:           quick 120ms fade out (not staggered)            emil: subtle exits

FOCAL ENLARGE  (a step becomes the focal one)
  node scale → 1.4 (≈10px→14px) via springs.snappy            interruptible; the "active step is bigger" read

LIST REORDER  (a deliverable's next-due changes → floats up)
  motion `layout` + springs.snappy, interruptible            shared-layout; lightest tier, deferrable

FIRST PAINT  (active zone loads)
  focal + upcoming nodes stagger top→down, animate-timeline-enter
```

**Deliberately NOT animated** (frequency rule): the **missed-deadline** red state and **upcoming**
hollow nodes are static — persistent conditions a contractor may see every visit; a recurring
pulse would nag. Color carries them.

**Reduced motion:** `useReducedMotion` → advance color/label jump, enlarge jumps, stagger instant,
`layout` reorder disabled — identical discipline to `ProgressRail`/`CompletedTimeline` today.

**Custom easing** for the two transition-based moves (press, advance-fill):
`cubic-bezier(0.23, 1, 0.32, 1)` (emil's strong ease-out) — never the weak built-in, never `all`.

## 7. Data model (prototype-first, then schema)

**Build order is prototype-first:** the QA route (`src/rr-app/routes/contractor-qa.tsx`) renders
the full breadcrumb look against **seeded in-memory steps** first, so the visual + motion design is
approved before any migration. Schema + wiring come after.

### 7.1 New enum + table

```sql
create type task_step_state as enum ('pending', 'in_review', 'done');

create table task_steps (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  name        text not null,
  deadline    date,                                   -- nullable ("No deadline")
  state       task_step_state not null default 'pending',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index task_steps_task_idx on task_steps (task_id, sort_order);
```

Constraint: at most 10 steps per task is a product rule (1–10) — enforced in the authoring UI /
API, not a DB check (a hard DB cap on a soft product rule is over-engineering).

### 7.2 RLS

- **SELECT:** any authenticated user (steps of tasks they can already see; the contractor index
  already filters to the caller's own tasks).
- **INSERT / DELETE / reorder / rename / set deadline:** admin only (`profiles.is_admin = true`) — authoring.
- **UPDATE `state`:** admin (any transition) **or** the task's `assignee_id` **restricted to
  `pending → in_review` on the focal step only** — enforced in the API route, not RLS alone.

### 7.3 API

- **Read:** `contractor-index.ts` gains a per-deliverable `steps: ContractorStep[]` (id, name,
  deadline, state, sort_order), fetched alongside the caller's tasks. `ContractorDeliverable`
  keeps its fields; `.progress` display becomes derived "M of N" from steps (falls back to the
  stored `progress` only for a deliverable with 0 steps, for continuity).
- **Write — contractor advance:** new `PATCH /api/tasks/:taskId/steps/:stepId` → sets
  `in_review`; authorized via the existing `canAccessTask` (assignee-or-admin) **plus** a guard
  that the step is the focal `pending` step and the caller is the assignee (non-admins cannot skip
  ahead or reach `done`).
- **Write — admin confirm/author:** admin transitions (`in_review → done`, `→ pending`) and CRUD
  authoring endpoints are admin-gated. (Admin authoring UI is a follow-up surface — see §10.)

## 8. Security & privacy constraints (unchanged, still binding)

- Never render bounty/payment amounts or any personal contact info on this surface. The only
  permitted contact address anywhere is `legal@seekostudios.com`.
- Contractor sees **only** their own tasks and their steps — enforced server-side, never by client
  filtering alone.
- The unauthenticated `/login` and `/legal/*` pages must not name this portal.

## 9. Testing

- **Derivation** (pure, `now`-injected): focal = first non-done; active vs missed vs pending-review
  from `(state, deadline, now)`; upcoming = after focal; rollup string precedence.
- **Compaction:** ≥2 done → single "✓ N done" line; 0–1 done inline; expand reveals all; focal +
  upcoming never collapse.
- **Fully-done deliverable** falls into the Timeline zone as one line; not expanded there.
- **Advance route:** assignee can move own focal `pending → in_review`; rejected on a non-focal
  step, on `→ done`, and on a task they don't own; admin can do any transition.
- **Edge:** 0-step deliverable → "No steps yet"; reduced-motion → no stagger/enlarge/reorder.
- **QA route** renders all five states from seeded data (visual regression anchor).
- Vitest baseline: 5 known-red files (investor, investor-layout, payments, qa-routes,
  ActivitySection.copy) — anything else new is a real regression.

## 10. Out of scope / follow-ups

- **Admin step-authoring UI** (create/reorder/rename/delete steps, set deadlines, confirm review →
  done). This design covers the *contractor read + advance* surface and the schema; the admin
  authoring surface is a distinct follow-up (seeded/admin-console for v1).
- Per-step comments or attachments (steps are text + state only).
- Notifying the admin when a contractor moves a step to In review (reuse the notification system —
  follow-up).
- Contractor-visible payments/bounty (separate surface, per 07-04 §11).
