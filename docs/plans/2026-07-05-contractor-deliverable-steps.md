# Contractor Deliverable Steps (Breadcrumbs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the contractor portal's one-node-per-deliverable + `ProgressRail` model with a two-level breadcrumb: each deliverable is a text group-heading whose 1–10 admin-authored steps are the nodes on the single vertical spine, each rendering one of five derived states.

**Architecture:** Prototype-first. Phase 1 builds pure derivation logic + three presentational components + a seeded QA route — no backend. Phase 2 adds the `task_steps` table/RLS and wires the read (steps into `contractor-index`) + the contractor advance API route. Phase 3 swaps the live `/contractor` route onto the new timeline and retires `ProgressRail`/`DeliverableRow`/`DeliverableTimeline`.

**Tech Stack:** Vite + React Router 7 (`src/rr-app`) · Hono API (`src/api-server`) · Supabase Postgres (service-role, cookie auth) · Tailwind v4 (`--ink-*` / `border-hairline` light tokens) · `motion/react` (`springs.snappy`) · Vitest + Testing Library.

**Design spec:** [`./2026-07-05-contractor-deliverable-steps-design.md`](./2026-07-05-contractor-deliverable-steps-design.md). Builds on [`./2026-07-04-contractor-portal-design.md`](./2026-07-04-contractor-portal-design.md).

## Global Constraints

- **Branch/worktree:** all work happens in the `feat/light-theme-migration` worktree at `/Volumes/CODEUSER/seeko-studio/.worktrees/contractor-portal`. Never touch the parent checkout (a different agent's branch).
- **Stack:** never reinstall `next`. Tests: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Dev: `npx vite` (:5173).
- **Vitest baseline:** 5 known-red files are expected to fail (investor, investor-layout, payments, qa-routes, ActivitySection.copy). Anything else red is a real regression.
- **Security (still binding, design §8):** contractor sees **only** their own tasks and steps — enforced server-side, never by client filtering alone. Never render bounty/payment amounts or any personal contact info on this surface. The only permitted contact address anywhere is `legal@seekostudios.com`. The unauthenticated `/login` and `/legal/*` pages must not name this portal.
- **Stored step enum is tiny:** `task_step_state = pending | in_review | done`. `active` and `missed` are **never stored** — derived from `(state, deadline, now, sort_order)`.
- **Contractor's only write:** advance the focal `pending` step → `in_review` (one tap). Non-admins can never reach `done` and can never advance a non-focal step. Admin may perform any transition.
- **Motion (design §6):** spring-first (`springs.snappy`), reduced-motion-safe (`useReducedMotion`). The two transition-based moves (press, advance-fill) use `cubic-bezier(0.23, 1, 0.32, 1)` and transition **only** the named property (never `all`). The **missed** (red) and **upcoming** (hollow) states are deliberately static — no pulse.
- **Frameless single spine:** one continuous `border-l border-hairline`; nodes straddle it. Never a card frame around the list, never a second line as a group divider — top-margin is the only new-group signal.

---

## File Structure

**Phase 1 (prototype, no backend):**
- Create `src/lib/contractor-steps.ts` — step types + `deriveSteps` + `summarizeSteps` (pure). *Task 1*
- Create `src/components/contractor/StepNode.tsx` — one node + label per rendered state. *Task 2*
- Create `src/components/contractor/DeliverableSteps.tsx` — group heading + rollup + compaction + optimistic advance. *Task 3*
- Create `src/components/contractor/StepDeliverableTimeline.tsx` — the spine wrapper (active groups + `CompletedTimeline`). *Task 4*
- Create `src/rr-app/routes/contractor-steps-qa.tsx` + register `/contractor/steps-qa`. *Task 5*

**Phase 2 (schema + read + write):**
- Create `supabase/migrations/20260705000001_task_steps.sql`; update `docs/supabase-schema.sql` + `docs/personas/ia.md`. *Task 6*
- Modify `src/lib/contractor-index.ts` — fetch `steps` per deliverable. *Task 7*
- Modify `src/api-server/routes/tasks.ts` — add `PATCH /tasks/:taskId/steps/:stepId`. *Task 8*

**Phase 3 (wire live + retire old):**
- Modify `src/rr-app/routes/contractor.tsx` — render `StepDeliverableTimeline` + real advance handler; make `splitDeliverables` generic. *Task 9*
- Delete `ProgressRail.tsx`, `DeliverableRow.tsx`, `DeliverableTimeline.tsx` (+ their tests) and `contractor-steps-qa.tsx`; enrich `/contractor/qa` seed with steps. *Task 10*

**Prototype checkpoint** sits between Task 5 and Task 6 — the visual/motion design is reviewed on `/contractor/steps-qa` before any migration.

---

## Task 1: Step derivation logic (`contractor-steps.ts`)

The keystone pure module. Every component and the API guard read state off these functions.

**Files:**
- Create: `src/lib/contractor-steps.ts`
- Test: `src/lib/__tests__/contractor-steps.test.ts`

**Interfaces:**
- Consumes: `isOverdue`, `overdueLabel`, `formatDueLabel`, `parseDeadline` from `src/lib/contractor-buckets.ts` (all `now`-injected, local-midnight); `ContractorDeliverable` (type only) from `src/lib/contractor-index.ts`.
- Produces:
  - `type StepState = 'pending' | 'in_review' | 'done'`
  - `type ContractorStep = { id: string; name: string; deadline: string | null; state: StepState; sort_order: number }`
  - `type RenderedStepState = 'upcoming' | 'active' | 'pending-review' | 'missed' | 'done'`
  - `type DerivedStep = { step: ContractorStep; rendered: RenderedStepState; isFocal: boolean; canAdvance: boolean }`
  - `type DeliverableRollup = { doneCount: number; total: number; label: string }`
  - `type ContractorStepDeliverable = ContractorDeliverable & { steps: ContractorStep[] }`
  - `deriveSteps(steps: ContractorStep[], now: Date): DerivedStep[]`
  - `summarizeSteps(steps: ContractorStep[], now: Date): DeliverableRollup`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/contractor-steps.test.ts
import { describe, expect, it } from 'vitest';
import type { ContractorStep } from '../contractor-steps';
import { deriveSteps, summarizeSteps } from '../contractor-steps';

const NOW = new Date('2026-07-05T09:00:00');

function s(partial: Partial<ContractorStep>): ContractorStep {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Step',
    deadline: partial.deadline ?? null,
    state: partial.state ?? 'pending',
    sort_order: partial.sort_order ?? 0,
  };
}

describe('deriveSteps', () => {
  it('marks the first non-done step as focal and active, later pending steps upcoming', () => {
    const steps = [
      s({ id: 'a', state: 'done', sort_order: 0 }),
      s({ id: 'b', state: 'pending', deadline: '2026-07-18', sort_order: 1 }),
      s({ id: 'c', state: 'pending', deadline: '2026-07-22', sort_order: 2 }),
    ];
    const d = deriveSteps(steps, NOW);
    expect(d.map((x) => [x.step.id, x.rendered, x.isFocal])).toEqual([
      ['a', 'done', false],
      ['b', 'active', true],
      ['c', 'upcoming', false],
    ]);
  });

  it('sorts by sort_order before deriving', () => {
    const steps = [
      s({ id: 'c', state: 'pending', sort_order: 2 }),
      s({ id: 'a', state: 'done', sort_order: 0 }),
      s({ id: 'b', state: 'pending', sort_order: 1 }),
    ];
    expect(deriveSteps(steps, NOW).map((x) => x.step.id)).toEqual(['a', 'b', 'c']);
  });

  it('renders a focal pending step past its deadline as missed', () => {
    const d = deriveSteps([s({ id: 'b', state: 'pending', deadline: '2026-07-03', sort_order: 0 })], NOW);
    expect(d[0].rendered).toBe('missed');
    expect(d[0].isFocal).toBe(true);
  });

  it('renders a focal in_review step (not overdue) as pending-review', () => {
    const d = deriveSteps([s({ id: 'b', state: 'in_review', deadline: '2026-07-25', sort_order: 0 })], NOW);
    expect(d[0].rendered).toBe('pending-review');
  });

  it('renders any not-done step past its deadline as missed even when not focal', () => {
    const steps = [
      s({ id: 'a', state: 'pending', deadline: '2026-07-25', sort_order: 0 }), // focal, active
      s({ id: 'b', state: 'pending', deadline: '2026-07-01', sort_order: 1 }), // overdue → missed
    ];
    const d = deriveSteps(steps, NOW);
    expect(d[0].rendered).toBe('active');
    expect(d[1].rendered).toBe('missed');
  });

  it('sets canAdvance only on the focal pending step', () => {
    const steps = [
      s({ id: 'a', state: 'done', sort_order: 0 }),
      s({ id: 'b', state: 'pending', sort_order: 1 }), // focal pending
      s({ id: 'c', state: 'pending', sort_order: 2 }),
    ];
    expect(deriveSteps(steps, NOW).map((x) => x.canAdvance)).toEqual([false, true, false]);
  });

  it('sets canAdvance false when the focal step is already in_review', () => {
    const d = deriveSteps([s({ id: 'b', state: 'in_review', sort_order: 0 })], NOW);
    expect(d[0].canAdvance).toBe(false);
  });

  it('sets canAdvance true on a focal pending step that is overdue (missed)', () => {
    const d = deriveSteps([s({ id: 'b', state: 'pending', deadline: '2026-07-01', sort_order: 0 })], NOW);
    expect(d[0].rendered).toBe('missed');
    expect(d[0].canAdvance).toBe(true);
  });
});

describe('summarizeSteps', () => {
  it('returns "In review" when the focal step is in_review (highest precedence)', () => {
    const steps = [
      s({ id: 'a', state: 'done', sort_order: 0 }),
      s({ id: 'b', state: 'in_review', deadline: '2026-07-25', sort_order: 1 }),
    ];
    expect(summarizeSteps(steps, NOW).label).toBe('In review');
  });

  it('returns "N days overdue" when the focal step is missed', () => {
    const steps = [s({ id: 'a', state: 'pending', deadline: '2026-07-03', sort_order: 0 })];
    expect(summarizeSteps(steps, NOW).label).toBe('2 days overdue');
  });

  it('returns "M of N · next {date}" by default', () => {
    const steps = [
      s({ id: 'a', state: 'done', sort_order: 0 }),
      s({ id: 'b', state: 'done', sort_order: 1 }),
      s({ id: 'c', state: 'done', sort_order: 2 }),
      s({ id: 'd', state: 'pending', deadline: '2026-07-18', sort_order: 3 }),
      s({ id: 'e', state: 'pending', deadline: '2026-07-22', sort_order: 4 }),
    ];
    const r = summarizeSteps(steps, NOW);
    expect(r).toEqual({ doneCount: 3, total: 5, label: '3 of 5 · next Sat, Jul 18' });
  });

  it('omits "next {date}" when the focal step has no deadline', () => {
    const steps = [s({ id: 'a', state: 'pending', deadline: null, sort_order: 0 })];
    expect(summarizeSteps(steps, NOW).label).toBe('0 of 1');
  });

  it('returns an empty label for a deliverable with no steps', () => {
    expect(summarizeSteps([], NOW)).toEqual({ doneCount: 0, total: 0, label: '' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/contractor-steps.test.ts`
Expected: FAIL — `Failed to resolve import '../contractor-steps'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/contractor-steps.ts
import type { ContractorDeliverable } from './contractor-index';
import { formatDueLabel, isOverdue, overdueLabel, parseDeadline } from './contractor-buckets';

/** Stored enum — mirrors the `task_step_state` DB type. Tiny on purpose. */
export type StepState = 'pending' | 'in_review' | 'done';

export type ContractorStep = {
  id: string;
  name: string;
  deadline: string | null;
  state: StepState;
  sort_order: number;
};

/** The five node treatments on the spine. `active`/`missed` are derived, never stored. */
export type RenderedStepState = 'upcoming' | 'active' | 'pending-review' | 'missed' | 'done';

export type DerivedStep = {
  step: ContractorStep;
  rendered: RenderedStepState;
  isFocal: boolean;
  /** The contractor may tap to submit for review: the focal step, still `pending`. */
  canAdvance: boolean;
};

export type DeliverableRollup = { doneCount: number; total: number; label: string };

/** A contractor deliverable carrying its ordered admin-authored steps. */
export type ContractorStepDeliverable = ContractorDeliverable & { steps: ContractorStep[] };

/**
 * Derive each step's render treatment from `(state, deadline, now, sort_order)`,
 * mirroring how contractor-buckets already derives `isOverdue`. The focal step is
 * the first non-done step in sort order; only it can be `active` (vs `upcoming`).
 * Any not-done step past its deadline reads as `missed` regardless of focal.
 */
export function deriveSteps(steps: ContractorStep[], now: Date): DerivedStep[] {
  const ordered = [...steps].sort((a, b) => a.sort_order - b.sort_order);
  const focalIndex = ordered.findIndex((s) => s.state !== 'done');

  return ordered.map((step, i) => {
    const isFocal = i === focalIndex;
    let rendered: RenderedStepState;
    if (step.state === 'done') {
      rendered = 'done';
    } else if (step.deadline != null && isOverdue(step.deadline, now)) {
      rendered = 'missed';
    } else if (step.state === 'in_review') {
      rendered = 'pending-review';
    } else if (isFocal) {
      rendered = 'active';
    } else {
      rendered = 'upcoming';
    }
    return { step, rendered, isFocal, canAdvance: isFocal && step.state === 'pending' };
  });
}

/**
 * The group heading's one-line rollup, in priority order:
 *   In review (focal in_review) › N days overdue (focal missed) › M of N · next {date}.
 */
export function summarizeSteps(steps: ContractorStep[], now: Date): DeliverableRollup {
  const derived = deriveSteps(steps, now);
  const total = derived.length;
  const doneCount = derived.filter((d) => d.rendered === 'done').length;
  const focal = derived.find((d) => d.isFocal);

  let label: string;
  if (total === 0) {
    label = '';
  } else if (focal?.rendered === 'pending-review') {
    label = 'In review';
  } else if (focal?.rendered === 'missed' && focal.step.deadline != null) {
    label = overdueLabel(focal.step.deadline, now);
  } else {
    const base = `${doneCount} of ${total}`;
    label =
      focal?.step.deadline != null
        ? `${base} · next ${formatDueLabel(parseDeadline(focal.step.deadline))}`
        : base;
  }
  return { doneCount, total, label };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/contractor-steps.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contractor-steps.ts src/lib/__tests__/contractor-steps.test.ts
git commit -m "feat(contractor): derive step states + rollup from stored enum"
```

---

## Task 2: Step node component (`StepNode.tsx`)

One `<li>` node on the spine per derived step. Presentational; the focal `pending` node is a button that fires `onAdvance`.

**Files:**
- Create: `src/components/contractor/StepNode.tsx`
- Test: `src/components/contractor/__tests__/StepNode.test.tsx`

**Interfaces:**
- Consumes: `DerivedStep` from `src/lib/contractor-steps.ts`; `overdueLabel`, `formatDueLabel`, `parseDeadline` from `src/lib/contractor-buckets.ts`; `LIGHT_DEPT_COLOR` from `src/components/dashboard/lightKit.ts`; `springs` from `src/lib/motion.ts`.
- Produces: `StepNode(props: StepNodeProps)` where `StepNodeProps = { derived: DerivedStep; department: string | null; now: Date; onAdvance?: (stepId: string) => void | Promise<void> }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/contractor/__tests__/StepNode.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedStep } from '@/lib/contractor-steps';
import { StepNode } from '../StepNode';

const NOW = new Date('2026-07-05T09:00:00');

function derived(over: Partial<DerivedStep> & { rendered: DerivedStep['rendered'] }): DerivedStep {
  return {
    step: { id: 's1', name: 'High-fi mockup', deadline: '2026-07-18', state: 'pending', sort_order: 0, ...over.step },
    rendered: over.rendered,
    isFocal: over.isFocal ?? false,
    canAdvance: over.canAdvance ?? false,
  };
}

function renderNode(d: DerivedStep, onAdvance?: (id: string) => void) {
  return render(
    <ul>
      <StepNode derived={d} department="UI/UX" now={NOW} onAdvance={onAdvance} />
    </ul>,
  );
}

describe('StepNode', () => {
  it('renders an upcoming step with its due date and no button', () => {
    renderNode(derived({ rendered: 'upcoming' }));
    expect(screen.getByText('High-fi mockup')).toBeInTheDocument();
    expect(screen.getByText('Sat, Jul 18')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders "No deadline" for an undated step', () => {
    renderNode(derived({ rendered: 'upcoming', step: { id: 's1', name: 'Handoff', deadline: null, state: 'pending', sort_order: 0 } }));
    expect(screen.getByText('No deadline')).toBeInTheDocument();
  });

  it('renders a pending-review step with a blue "In review" label', () => {
    renderNode(derived({ rendered: 'pending-review', step: { id: 's1', name: 'Sprites', deadline: '2026-07-25', state: 'in_review', sort_order: 0 } }));
    expect(screen.getByText('In review')).toBeInTheDocument();
  });

  it('renders a missed step with an overdue label', () => {
    renderNode(derived({ rendered: 'missed', step: { id: 's1', name: 'Tutorial copy', deadline: '2026-07-03', state: 'pending', sort_order: 0 } }));
    expect(screen.getByText('2 days overdue')).toBeInTheDocument();
  });

  it('renders the focal active step as a button that advances on click', async () => {
    const onAdvance = vi.fn();
    renderNode(derived({ rendered: 'active', isFocal: true, canAdvance: true }), onAdvance);
    const button = screen.getByRole('button', { name: /submit high-fi mockup for review/i });
    fireEvent.click(button);
    expect(onAdvance).toHaveBeenCalledWith('s1');
  });

  it('does not render a button when the step cannot be advanced', () => {
    renderNode(derived({ rendered: 'active', isFocal: true, canAdvance: false }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/contractor/__tests__/StepNode.test.tsx`
Expected: FAIL — `Failed to resolve import '../StepNode'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/contractor/StepNode.tsx
import { Check, TriangleAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { DerivedStep } from '@/lib/contractor-steps';
import { formatDueLabel, overdueLabel, parseDeadline } from '@/lib/contractor-buckets';
import { LIGHT_DEPT_COLOR } from '@/components/dashboard/lightKit';
import { springs } from '@/lib/motion';

/* Node fill hexes — the AA-on-white department ramp (mirrors LIGHT_DEPT_COLOR),
 * plus the shared status colors used across the light kit. */
const DEPT_HEX: Record<string, string> = {
  'Coding': '#0a63cc',
  'Visual Art': '#3f5fb5',
  'UI/UX': '#6e4fc4',
  'Animation': '#b8801a',
  'Asset Creation': '#bd3f7c',
};
const REVIEW_BLUE = '#3f5fb5';
const OVERDUE_RED = '#d4503e';
const SUCCESS_GREEN = '#15803d';
const FALLBACK_TINT = '#b8801a';
/** emil's strong ease-out — the advance-fill color move (background-color only). */
const EASE_OUT = 'cubic-bezier(0.23,1,0.32,1)';

export type StepNodeProps = {
  derived: DerivedStep;
  department: string | null;
  now: Date;
  onAdvance?: (stepId: string) => void | Promise<void>;
};

/**
 * One admin-authored step as a node on the single breadcrumb spine. The node fill
 * encodes the derived state; the focal node is enlarged. Only the focal `pending`
 * node is interactive (tap → submit for review). Missed/upcoming stay static — a
 * recurring pulse on a persistent condition would nag (design §6).
 */
export function StepNode({ derived, department, now, onAdvance }: StepNodeProps) {
  const reduce = useReducedMotion();
  const { step, rendered, isFocal, canAdvance } = derived;
  const deptTint = (department && DEPT_HEX[department]) || FALLBACK_TINT;
  const deptText = (department && LIGHT_DEPT_COLOR[department]) || 'text-ink-strong';
  const dueLabel = step.deadline ? formatDueLabel(parseDeadline(step.deadline)) : null;

  const filled = rendered === 'active' || rendered === 'pending-review' || rendered === 'missed';
  const fillColor =
    rendered === 'active' ? deptTint : rendered === 'pending-review' ? REVIEW_BLUE : OVERDUE_RED;
  const sizeCls = isFocal ? 'size-3 -left-[6px]' : 'size-2.5 -left-[5px]';

  const node = filled ? (
    <motion.span
      className={`absolute ${sizeCls} top-1/2 -translate-y-1/2 rounded-full ring-2 ring-white`}
      style={{ backgroundColor: fillColor, transition: `background-color 200ms ${EASE_OUT}` }}
      initial={isFocal && !reduce ? { scale: 0.6 } : false}
      animate={{ scale: 1 }}
      transition={reduce ? { duration: 0 } : springs.snappy}
      aria-hidden
    />
  ) : rendered === 'done' ? (
    <span
      className={`absolute ${sizeCls} top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white ring-1 ring-hairline`}
      aria-hidden
    >
      <span className="size-1 rounded-full bg-ink-ghost" />
    </span>
  ) : (
    // upcoming — hollow
    <span
      className={`absolute ${sizeCls} top-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-hairline`}
      aria-hidden
    />
  );

  const trailing =
    rendered === 'pending-review' ? (
      <span className="shrink-0 text-[12px] font-medium text-[#3f5fb5]">In review</span>
    ) : rendered === 'missed' ? (
      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-[#d4503e]">
        <TriangleAlert className="size-3" strokeWidth={2.5} aria-hidden />
        {overdueLabel(step.deadline!, now)}
      </span>
    ) : rendered === 'done' ? (
      <span className="inline-flex shrink-0 items-center gap-1.5">
        {dueLabel && <span className="text-[12px] tabular-nums text-ink-faint">{dueLabel}</span>}
        <Check className="size-3.5 text-[#15803d]" strokeWidth={2.5} aria-hidden />
      </span>
    ) : (
      <span className={`shrink-0 text-[12px] tabular-nums ${dueLabel ? 'text-ink-muted' : 'text-ink-faintest'}`}>
        {dueLabel ?? 'No deadline'}
      </span>
    );

  const nameCls =
    rendered === 'active'
      ? `font-medium ${deptText}`
      : rendered === 'done'
        ? 'text-ink-muted'
        : 'text-ink-muted-strong';

  const row = (
    <>
      {node}
      <span className={`min-w-0 flex-1 truncate text-[13px] ${nameCls}`}>{step.name}</span>
      {trailing}
    </>
  );

  return (
    <li className="relative">
      {canAdvance ? (
        <button
          type="button"
          onClick={() => onAdvance?.(step.id)}
          aria-label={`Submit ${step.name} for review`}
          className="flex w-full items-center gap-2 py-1.5 pl-6 pr-1 text-left outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#0d7aff]/40 active:scale-[0.99]"
        >
          {row}
        </button>
      ) : (
        <div className="flex items-center gap-2 py-1.5 pl-6 pr-1">{row}</div>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/contractor/__tests__/StepNode.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/contractor/StepNode.tsx src/components/contractor/__tests__/StepNode.test.tsx
git commit -m "feat(contractor): StepNode renders five node states on the spine"
```

---

## Task 3: Deliverable step group (`DeliverableSteps.tsx`)

A deliverable's group heading + derived rollup + its steps, with the ≥2-done compaction and optimistic advance.

**Files:**
- Create: `src/components/contractor/DeliverableSteps.tsx`
- Test: `src/components/contractor/__tests__/DeliverableSteps.test.tsx`

**Interfaces:**
- Consumes: `ContractorStep`, `deriveSteps`, `summarizeSteps` from `src/lib/contractor-steps.ts`; `StepNode` from `./StepNode`.
- Produces: `DeliverableSteps(props: DeliverableStepsProps)` where `DeliverableStepsProps = { name: string; department: string | null; steps: ContractorStep[]; now: Date; onAdvance?: (stepId: string) => void | Promise<void> }`.

Compaction (design §5.3): all `done` steps sit above the focal, so they collapse — **≥2 done → one faint "✓ N done — show" line**; **0–1 done render inline**. Focal + upcoming never collapse. Expanding staggers the done nodes in via `animate-timeline-enter` at `${i*60}ms` (the mechanism `CompletedTimeline` already uses). Advancing is optimistic: flip the tapped step to `in_review` locally, call `onAdvance`, revert on failure.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/contractor/__tests__/DeliverableSteps.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContractorStep } from '@/lib/contractor-steps';
import { DeliverableSteps } from '../DeliverableSteps';

const NOW = new Date('2026-07-05T09:00:00');

function s(partial: Partial<ContractorStep>): ContractorStep {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Step',
    deadline: partial.deadline ?? null,
    state: partial.state ?? 'pending',
    sort_order: partial.sort_order ?? 0,
  };
}

describe('DeliverableSteps', () => {
  it('renders the heading name and the derived rollup', () => {
    render(
      <ul>
        <DeliverableSteps
          name="Main menu wireframes"
          department="UI/UX"
          now={NOW}
          steps={[
            s({ id: 'a', state: 'done', sort_order: 0 }),
            s({ id: 'b', state: 'pending', deadline: '2026-07-18', sort_order: 1 }),
          ]}
        />
      </ul>,
    );
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 · next Sat, Jul 18')).toBeInTheDocument();
  });

  it('shows a "No steps yet" line when the deliverable has no steps', () => {
    render(
      <ul>
        <DeliverableSteps name="Character portraits" department="Visual Art" now={NOW} steps={[]} />
      </ul>,
    );
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
  });

  it('collapses two or more done steps behind a "✓ N done — show" toggle', () => {
    render(
      <ul>
        <DeliverableSteps
          name="Main menu wireframes"
          department="UI/UX"
          now={NOW}
          steps={[
            s({ id: 'a', name: 'Low-fi flows', state: 'done', sort_order: 0 }),
            s({ id: 'b', name: 'Component pass', state: 'done', sort_order: 1 }),
            s({ id: 'c', name: 'High-fi mockup', state: 'pending', deadline: '2026-07-18', sort_order: 2 }),
          ]}
        />
      </ul>,
    );
    // done steps hidden behind the toggle, focal always visible
    expect(screen.queryByText('Low-fi flows')).not.toBeInTheDocument();
    expect(screen.getByText('High-fi mockup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2 done/i }));
    expect(screen.getByText('Low-fi flows')).toBeInTheDocument();
    expect(screen.getByText('Component pass')).toBeInTheDocument();
  });

  it('renders a single done step inline (no toggle)', () => {
    render(
      <ul>
        <DeliverableSteps
          name="Combat HUD"
          department="Animation"
          now={NOW}
          steps={[
            s({ id: 'a', name: 'Damage sprites', state: 'done', sort_order: 0 }),
            s({ id: 'b', name: 'HUD integration', state: 'pending', deadline: '2026-07-25', sort_order: 1 }),
          ]}
        />
      </ul>,
    );
    expect(screen.getByText('Damage sprites')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /done/i })).not.toBeInTheDocument();
  });

  it('optimistically flips the focal step to In review and calls onAdvance', async () => {
    const onAdvance = vi.fn().mockResolvedValue(undefined);
    render(
      <ul>
        <DeliverableSteps
          name="Combat HUD"
          department="Animation"
          now={NOW}
          onAdvance={onAdvance}
          steps={[s({ id: 'b', name: 'HUD integration', state: 'pending', deadline: '2026-07-25', sort_order: 0 })]}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /submit hud integration for review/i }));
    // Optimistic flip: the node now reads "In review" (the rollup heading mirrors it
    // for a single-step deliverable, hence getAllByText), and the submit button is gone.
    expect(screen.getAllByText('In review').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /submit hud integration for review/i })).not.toBeInTheDocument();
    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith('b'));
  });

  it('reverts and shows an error when the advance fails', async () => {
    const onAdvance = vi.fn().mockRejectedValue(new Error('nope'));
    render(
      <ul>
        <DeliverableSteps
          name="Combat HUD"
          department="Animation"
          now={NOW}
          onAdvance={onAdvance}
          steps={[s({ id: 'b', name: 'HUD integration', state: 'pending', deadline: '2026-07-25', sort_order: 0 })]}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /submit hud integration for review/i }));
    await waitFor(() => expect(screen.getByText(/couldn’t submit/i)).toBeInTheDocument());
    // reverted: the focal step is tappable again
    expect(screen.getByRole('button', { name: /submit hud integration for review/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/contractor/__tests__/DeliverableSteps.test.tsx`
Expected: FAIL — `Failed to resolve import '../DeliverableSteps'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/contractor/DeliverableSteps.tsx
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ContractorStep } from '@/lib/contractor-steps';
import { deriveSteps, summarizeSteps } from '@/lib/contractor-steps';
import { StepNode } from './StepNode';

export type DeliverableStepsProps = {
  name: string;
  department: string | null;
  steps: ContractorStep[];
  now: Date;
  onAdvance?: (stepId: string) => void | Promise<void>;
};

/**
 * One deliverable as a text group-heading (no node — the hairline runs behind it)
 * plus its admin-authored steps hanging off the same spine. Done steps sit above
 * the focal, so ≥2 collapse into a single "✓ N done — show" line; the focal + the
 * upcoming steps never collapse. The contractor's one write — advance the focal
 * step to In review — is applied optimistically here (this component owns the list).
 */
export function DeliverableSteps({ name, department, steps: initial, now, onAdvance }: DeliverableStepsProps) {
  const [steps, setSteps] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);

  const rollup = summarizeSteps(steps, now);

  async function advance(stepId: string) {
    const prev = steps;
    setSteps((cur) => cur.map((s) => (s.id === stepId ? { ...s, state: 'in_review' as const } : s)));
    setError(false);
    try {
      await onAdvance?.(stepId);
    } catch {
      setSteps(prev);
      setError(true);
    }
  }

  const Heading = (
    <div className="mb-1.5 flex items-baseline justify-between gap-3 pl-6">
      <h3 className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {name}
      </h3>
      {rollup.label && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-ghost">{rollup.label}</span>
      )}
    </div>
  );

  if (steps.length === 0) {
    return (
      <div>
        {Heading}
        <p className="pl-6 text-[13px] text-ink-faintest">No steps yet</p>
      </div>
    );
  }

  const derived = deriveSteps(steps, now);
  const doneSteps = derived.filter((d) => d.rendered === 'done');
  const liveSteps = derived.filter((d) => d.rendered !== 'done');
  const collapse = doneSteps.length >= 2 && !expanded;

  return (
    <div>
      {Heading}
      <ol>
        {collapse ? (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="relative flex w-full items-center gap-2 py-1.5 pl-6 text-left text-[12px] text-ink-faint transition-colors duration-150 ease-out hover:text-ink active:text-[#111]"
            >
              <span
                className="absolute -left-[5px] top-1/2 flex size-2.5 -translate-y-1/2 items-center justify-center rounded-full bg-white ring-1 ring-hairline"
                aria-hidden
              >
                <Check className="size-2 text-[#15803d]" strokeWidth={3} aria-hidden />
              </span>
              {doneSteps.length} done
              <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
          </li>
        ) : (
          doneSteps.map((d, i) => (
            <div
              key={d.step.id}
              className={expanded ? 'animate-timeline-enter' : undefined}
              style={expanded ? { animationDelay: `${i * 60}ms` } : undefined}
            >
              <StepNode derived={d} department={department} now={now} />
            </div>
          ))
        )}

        {liveSteps.map((d) => (
          <StepNode key={d.step.id} derived={d} department={department} now={now} onAdvance={advance} />
        ))}
      </ol>

      {error && <p className="mt-1 pl-6 text-[11px] text-[#d4503e]">Couldn’t submit — try again.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/contractor/__tests__/DeliverableSteps.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/contractor/DeliverableSteps.tsx src/components/contractor/__tests__/DeliverableSteps.test.tsx
git commit -m "feat(contractor): DeliverableSteps group heading + rollup + compaction"
```

---

## Task 4: Spine wrapper (`StepDeliverableTimeline.tsx`)

The single continuous spine: active deliverables as step groups up top, the existing month-grouped `CompletedTimeline` below, unbroken.

**Files:**
- Create: `src/components/contractor/StepDeliverableTimeline.tsx`
- Test: `src/components/contractor/__tests__/StepDeliverableTimeline.test.tsx`

**Interfaces:**
- Consumes: `ContractorStepDeliverable` from `src/lib/contractor-steps.ts`; `TimelineMonth` from `src/lib/contractor-buckets.ts`; `DeliverableSteps` from `./DeliverableSteps`; `CompletedTimeline` from `./CompletedTimeline`.
- Produces: `StepDeliverableTimeline(props: StepDeliverableTimelineProps)` where `StepDeliverableTimelineProps = { active: ContractorStepDeliverable[]; timeline: TimelineMonth[]; now: Date; onAdvance?: (taskId: string, stepId: string) => void | Promise<void> }`.

The `onAdvance` here takes `(taskId, stepId)`; each group binds its deliverable id so `DeliverableSteps`' `(stepId)` callback resolves to the full pair.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/contractor/__tests__/StepDeliverableTimeline.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { StepDeliverableTimeline } from '../StepDeliverableTimeline';

const NOW = new Date('2026-07-05T09:00:00');

function deliverable(over: Partial<ContractorStepDeliverable>): ContractorStepDeliverable {
  return {
    id: over.id ?? 'd1',
    name: over.name ?? 'Deliverable',
    department: over.department ?? 'Coding',
    status: over.status ?? 'In Progress',
    priority: over.priority ?? 'Medium',
    deadline: over.deadline ?? null,
    progress: over.progress ?? 0,
    description: over.description ?? null,
    steps: over.steps ?? [],
  };
}

const mayTimeline: TimelineMonth[] = [
  {
    key: '2026-05',
    label: 'May 2026',
    items: [
      { id: 'c', name: 'Combat SFX', department: 'Asset Creation', status: 'Done', priority: 'Low', deadline: '2026-05-20', progress: 100, description: null },
    ],
  },
];

describe('StepDeliverableTimeline', () => {
  it('renders the empty state when there is no active work and no history', () => {
    render(<StepDeliverableTimeline active={[]} timeline={[]} now={NOW} />);
    expect(screen.getByText(/no deliverables assigned yet/i)).toBeInTheDocument();
  });

  it('renders each active deliverable as a step group', () => {
    render(
      <StepDeliverableTimeline
        active={[
          deliverable({
            id: 'd1',
            name: 'Main menu wireframes',
            steps: [{ id: 's1', name: 'High-fi mockup', deadline: '2026-07-18', state: 'pending', sort_order: 0 }],
          }),
        ]}
        timeline={[]}
        now={NOW}
      />,
    );
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('High-fi mockup')).toBeInTheDocument();
  });

  it('shows the "all caught up" line plus the timeline when active is empty but history exists', () => {
    render(<StepDeliverableTimeline active={[]} timeline={mayTimeline} now={NOW} />);
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByText('Combat SFX')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/contractor/__tests__/StepDeliverableTimeline.test.tsx`
Expected: FAIL — `Failed to resolve import '../StepDeliverableTimeline'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/contractor/StepDeliverableTimeline.tsx
import { Inbox } from 'lucide-react';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { DeliverableSteps } from './DeliverableSteps';
import { CompletedTimeline } from './CompletedTimeline';

export type StepDeliverableTimelineProps = {
  /** Incomplete deliverables — each a group of admin-authored steps on the spine. */
  active: ContractorStepDeliverable[];
  /** Delivered deliverables condensed into the month-grouped history below. */
  timeline: TimelineMonth[];
  now: Date;
  onAdvance?: (taskId: string, stepId: string) => void | Promise<void>;
};

/**
 * The contractor's single vertical breadcrumb. One continuous hairline spine runs
 * the full height. Up top, each active deliverable is a text group-heading whose
 * steps are the nodes; down the spine, delivered work condenses into the existing
 * month-grouped Timeline. Group headings (top-margin separated) are the only
 * "new group" signal — no card frames, no top-level "Deliverables" header.
 */
export function StepDeliverableTimeline({ active, timeline, now, onAdvance }: StepDeliverableTimelineProps) {
  if (active.length === 0 && timeline.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-seeko">
        <Inbox className="mx-auto size-6 text-ink-ghost" strokeWidth={1.75} aria-hidden />
        <p className="mt-3 text-[15px] font-medium text-ink-heading">No deliverables assigned yet</p>
        <p className="mt-1 text-sm text-ink-faint">New work will show up here.</p>
      </div>
    );
  }

  return (
    <div className="relative ml-1.5 border-l border-hairline">
      <section className="space-y-8 pb-9">
        {active.length > 0 ? (
          active.map((d) => (
            <DeliverableSteps
              key={d.id}
              name={d.name}
              department={d.department}
              steps={d.steps}
              now={now}
              onAdvance={onAdvance ? (stepId) => onAdvance(d.id, stepId) : undefined}
            />
          ))
        ) : (
          <p className="pl-6 text-sm text-ink-faint">
            You’re all caught up — nothing needs your attention right now.
          </p>
        )}
      </section>

      <CompletedTimeline timeline={timeline} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/contractor/__tests__/StepDeliverableTimeline.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/contractor/StepDeliverableTimeline.tsx src/components/contractor/__tests__/StepDeliverableTimeline.test.tsx
git commit -m "feat(contractor): StepDeliverableTimeline single-spine wrapper"
```

---

## Task 5: Seeded QA route (`/contractor/steps-qa`)

The prototype anchor — renders all five states + compaction + rollup precedence + the 0-step and Timeline zones from in-memory seed, no backend. This is the checkpoint surface.

**Files:**
- Create: `src/rr-app/routes/contractor-steps-qa.tsx`
- Modify: `src/rr-app/routes.tsx` (register `/contractor/steps-qa` after the `/contractor/qa` entry, ~line 810)
- Test: `src/rr-app/routes/__tests__/contractor-steps-qa.test.tsx`

**Interfaces:**
- Consumes: `ContractorStepDeliverable` from `src/lib/contractor-steps.ts`; `TimelineMonth` from `src/lib/contractor-buckets.ts`; `StepDeliverableTimeline` from `@/components/contractor/StepDeliverableTimeline`.
- Produces: `ContractorStepsQaRoute()` (default-style named export used by the lazy route).

The route renders its own minimal `overview-light` scaffold (a throwaway QA chrome — the live chrome is wired in Task 9). Fixed `now = 2026-07-05` keeps overdue counts deterministic. Not added to `routeInventory`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/rr-app/routes/__tests__/contractor-steps-qa.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ContractorStepsQaRoute } from '../contractor-steps-qa';

describe('contractor steps QA route', () => {
  it('renders every node state from the seed', () => {
    render(
      <MemoryRouter>
        <ContractorStepsQaRoute />
      </MemoryRouter>,
    );
    // group headings
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
    // states present across the seed ("In review" shows on both the node and its
    // rollup heading for a focal-in_review deliverable, hence getAllByText)
    expect(screen.getAllByText('In review').length).toBeGreaterThan(0);
    expect(screen.getByText(/days overdue/i)).toBeInTheDocument();
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
    // compaction toggle + timeline zone
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /timeline/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rr-app/routes/__tests__/contractor-steps-qa.test.tsx`
Expected: FAIL — `Failed to resolve import '../contractor-steps-qa'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/rr-app/routes/contractor-steps-qa.tsx
import { CircleHelp } from 'lucide-react';
import type { ContractorStep, ContractorStepDeliverable } from '@/lib/contractor-steps';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { StepDeliverableTimeline } from '@/components/contractor/StepDeliverableTimeline';

/**
 * No-backend visual-QA preview for the breadcrumb-steps model. Seeds every node
 * state at once: a five-step deliverable with ≥2 done (compaction) + a focal active
 * step, a deliverable whose focal step is In review, a single overdue (missed) step,
 * a 0-step deliverable ("No steps yet"), and a delivered deliverable in the Timeline
 * zone. Fixed now (2026-07-05) keeps the overdue day-counts deterministic. Not in
 * routeInventory. Chrome is a throwaway QA scaffold — the live route wires the real
 * chrome (see contractor.tsx / plan Task 9).
 */
const NOW = new Date('2026-07-05T09:00:00');

function d(partial: Partial<ContractorStepDeliverable> & { steps: ContractorStep[] }): ContractorStepDeliverable {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Deliverable',
    department: partial.department ?? 'Coding',
    status: partial.status ?? 'In Progress',
    priority: partial.priority ?? 'Medium',
    deadline: partial.deadline ?? null,
    progress: partial.progress ?? 0,
    description: partial.description ?? null,
    steps: partial.steps,
  };
}

const active: ContractorStepDeliverable[] = [
  d({
    id: 'd1',
    name: 'Main menu wireframes',
    department: 'UI/UX',
    steps: [
      { id: 's1', name: 'Low-fi flows', deadline: '2026-06-30', state: 'done', sort_order: 0 },
      { id: 's2', name: 'Component pass', deadline: '2026-07-04', state: 'done', sort_order: 1 },
      { id: 's3', name: 'Content review', deadline: '2026-07-06', state: 'done', sort_order: 2 },
      { id: 's4', name: 'High-fi mockup', deadline: '2026-07-18', state: 'pending', sort_order: 3 },
      { id: 's5', name: 'Handoff spec', deadline: '2026-07-22', state: 'pending', sort_order: 4 },
    ],
  }),
  d({
    id: 'd2',
    name: 'Combat HUD',
    department: 'Animation',
    steps: [
      { id: 's6', name: 'Damage-state sprites', deadline: '2026-07-16', state: 'in_review', sort_order: 0 },
      { id: 's7', name: 'HUD integration', deadline: '2026-07-25', state: 'pending', sort_order: 1 },
    ],
  }),
  d({
    id: 'd3',
    name: 'Onboarding flow',
    department: 'UI/UX',
    steps: [{ id: 's8', name: 'Tutorial copy', deadline: '2026-07-03', state: 'pending', sort_order: 0 }],
  }),
  d({ id: 'd4', name: 'Character portraits', department: 'Visual Art', steps: [] }),
];

const timeline: TimelineMonth[] = [
  {
    key: '2026-06',
    label: 'June 2026',
    items: [
      { id: 't1', name: 'Loading screen polish', department: 'Coding', status: 'Done', priority: 'Low', deadline: '2026-06-28', progress: 100, description: null },
    ],
  },
];

export function ContractorStepsQaRoute() {
  return (
    <div className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased [scrollbar-gutter:stable_both-edges]">
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-ink-muted-strong">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20contractor%20help"
          className="flex items-center gap-2 text-base text-ink-muted-strong transition-colors duration-150 hover:text-ink active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      <main className="mx-auto w-full max-w-[620px] flex-col pt-[clamp(5rem,11vh,6.5rem)] pb-16">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-heading">Good morning, Dana</h1>
          <p className="mt-1 text-sm text-ink-faint tabular-nums">4 deliverables · next due Thu, Jul 16</p>
        </div>
        <StepDeliverableTimeline active={active} timeline={timeline} now={NOW} />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Register the route in `src/rr-app/routes.tsx`**

After the `/contractor/qa` entry (which ends ~line 810), insert:

```tsx
  {
    // No-backend visual-QA preview for the breadcrumb-steps model. Standalone.
    // Not in routeInventory. Retired once /contractor/qa adopts the step model
    // (plan Task 10).
    path: '/contractor/steps-qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/contractor-steps-qa');
      return {
        Component: route.ContractorStepsQaRoute,
      };
    },
  },
```

- [ ] **Step 5: Run the test + typecheck**

Run: `npx vitest run src/rr-app/routes/__tests__/contractor-steps-qa.test.tsx`
Expected: PASS (1 test).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/rr-app/routes/contractor-steps-qa.tsx src/rr-app/routes.tsx src/rr-app/routes/__tests__/contractor-steps-qa.test.tsx
git commit -m "feat(contractor): seeded /contractor/steps-qa breadcrumb prototype"
```

---

## ⏸ Prototype checkpoint (before Task 6)

Phase 1 is a working, seeded prototype at `/contractor/steps-qa` (`npx vite` → visit the route). Per the design's prototype-first mandate (§7) and the standing "pause and show me" instruction, this is the natural point to review the visual + motion design **before** any migration. Confirm the five states, compaction, rollup precedence, and the advance interaction read right; then proceed to Phase 2. No schema is touched before this passes review.

---

## Task 6: `task_steps` schema + RLS

**Files:**
- Create: `supabase/migrations/20260705000001_task_steps.sql`
- Modify: `docs/supabase-schema.sql` (append the new type + table); `docs/personas/ia.md` (add the table + enum rows)

**Note on TDD:** schema/migration is the config exception to the Iron Law (per test-driven-development skill). There is no local DB, so verification is by applying the migration to the Supabase project and asserting the objects exist (Step 3). Do not write a Vitest for the DDL.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260705000001_task_steps.sql
-- Admin-authored deliverable sub-steps ("breadcrumbs") for the contractor portal.
-- Stored enum is tiny; active/missed are derived at render time (see src/lib/contractor-steps.ts).

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

alter table task_steps enable row level security;

-- SELECT: any authenticated user (the contractor index already filters to the
-- caller's own tasks server-side; step visibility follows task visibility).
create policy task_steps_select_authenticated
  on task_steps for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: admin only. The contractor's pending -> in_review
-- advance goes through the API route on the service role (guarded in code), NOT
-- a client-side write, so no assignee UPDATE policy is granted here.
create policy task_steps_write_admin
  on task_steps for all
  to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true));
```

- [ ] **Step 2: Update the canonical docs**

In `docs/supabase-schema.sql`, append the same `create type` + `create table` + index + RLS block (match the surrounding file's formatting). In `docs/personas/ia.md`: add a `task_steps` section under the tables list (columns id/task_id/name/deadline/state/sort_order/created_at), add `task_step_state → pending, in_review, done` to the Enum Types table, add the `task_steps ← task_id → tasks` line to the Content Hierarchy tree, and note the RLS ("authenticated select; admin-only writes; contractor advance via service-role API route").

- [ ] **Step 3: Apply + verify against the Supabase project**

Apply via the Supabase MCP `apply_migration` (name `task_steps`, the SQL above), then verify:
- `list_tables` includes `task_steps` with the columns above.
- `execute_sql`: `select unnest(enum_range(null::task_step_state))::text;` returns `pending, in_review, done`.
- `execute_sql`: `insert into task_steps (task_id, name) values ('<a real task id>', 'x') returning id;` succeeds under service role, then delete it.

Expected: table + enum + index exist; FK cascade confirmed by the insert.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260705000001_task_steps.sql docs/supabase-schema.sql docs/personas/ia.md
git commit -m "feat(db): task_steps table + task_step_state enum + RLS"
```

---

## Task 7: Read steps into the contractor index

Fetch each deliverable's steps alongside the caller's tasks, in one extra query.

**Files:**
- Modify: `src/lib/contractor-index.ts`
- Modify: `src/rr-app/routes/contractor-qa.tsx` (keep the old QA route compiling — its `d()` factory must now supply `steps: []`)
- Test: `src/lib/__tests__/contractor-index-steps.test.ts`

**Interfaces:**
- Consumes: `ContractorStep`, `ContractorStepDeliverable` from `src/lib/contractor-steps.ts`.
- Produces: `loadContractorOverview` now returns `deliverables: ContractorStepDeliverable[]` (each `ContractorDeliverable` gains `steps: ContractorStep[]`); `ContractorOverviewData.deliverables` retyped to `ContractorStepDeliverable[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/contractor-index-steps.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mocks.getServiceClient }));

import { loadContractorOverview } from '../contractor-index';

const PROFILE = {
  id: 'user-1',
  display_name: 'Dana',
  email: 'dana@example.invalid',
  avatar_url: null,
  is_admin: false,
  is_contractor: true,
};

const TASKS = [
  { id: 'task-1', name: 'Main menu', department: 'UI/UX', status: 'In Progress', priority: 'High', deadline: '2026-07-18', progress: 40, description: null },
];

const STEPS = [
  { id: 's2', task_id: 'task-1', name: 'High-fi', deadline: '2026-07-18', state: 'pending', sort_order: 1 },
  { id: 's1', task_id: 'task-1', name: 'Low-fi', deadline: '2026-06-30', state: 'done', sort_order: 0 },
];

function serviceMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: PROFILE, error: null }) }) }) };
      }
      if (table === 'tasks') {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.order = () => q;
        q.overrideTypes = async () => ({ data: TASKS, error: null });
        return q;
      }
      if (table === 'task_steps') {
        return { select: () => ({ in: () => ({ order: async () => ({ data: STEPS, error: null }) }) }) };
      }
      return {};
    }),
  };
}

describe('loadContractorOverview with steps', () => {
  beforeEach(() => mocks.getServiceClient.mockReturnValue(serviceMock()));

  it('attaches each task its steps, ordered by sort_order', async () => {
    const data = await loadContractorOverview({ id: 'user-1' });
    expect(data.deliverables).toHaveLength(1);
    expect(data.deliverables[0].steps.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(data.deliverables[0].steps[0]).toEqual({
      id: 's1',
      name: 'Low-fi',
      deadline: '2026-06-30',
      state: 'done',
      sort_order: 0,
    });
  });

  it('returns an empty steps array for a task with no steps', async () => {
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: PROFILE, error: null }) }) }) };
        if (table === 'tasks') {
          const q: Record<string, unknown> = {};
          q.select = () => q; q.eq = () => q; q.order = () => q;
          q.overrideTypes = async () => ({ data: TASKS, error: null });
          return q;
        }
        if (table === 'task_steps') return { select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) };
        return {};
      }),
    });
    const data = await loadContractorOverview({ id: 'user-1' });
    expect(data.deliverables[0].steps).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/contractor-index-steps.test.ts`
Expected: FAIL — `steps` is undefined on the deliverable (property missing).

- [ ] **Step 3: Implement in `src/lib/contractor-index.ts`**

Add the import and step row type near the top:

```ts
import type { ContractorStep, ContractorStepDeliverable } from './contractor-steps';
```

```ts
const CONTRACTOR_STEP_SELECT = 'id, task_id, name, deadline, state, sort_order' as const;

type ContractorStepRow = {
  id: string;
  task_id: string;
  name: string;
  deadline: string | null;
  state: ContractorStep['state'];
  sort_order: number;
};
```

Retype `ContractorOverviewData`:

```ts
export type ContractorOverviewData = {
  profile: ContractorProfile;
  deliverables: ContractorStepDeliverable[];
};
```

Replace the tail of `loadContractorOverview` (the `const deliverables = ...; return ...` block, lines ~110–121) with:

```ts
  if (error) throw error;

  const taskRows = data ?? [];
  const taskIds = taskRows.map((t) => t.id);

  const stepsByTask = new Map<string, ContractorStep[]>();
  if (taskIds.length > 0) {
    const { data: stepRows, error: stepError } = await service
      .from('task_steps')
      .select(CONTRACTOR_STEP_SELECT)
      .in('task_id', taskIds)
      .order('sort_order', { ascending: true })
      .overrideTypes<ContractorStepRow[], { merge: false }>();
    if (stepError) throw stepError;

    for (const row of stepRows ?? []) {
      const list = stepsByTask.get(row.task_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        deadline: row.deadline ?? null,
        state: row.state,
        sort_order: row.sort_order,
      });
      stepsByTask.set(row.task_id, list);
    }
  }

  const deliverables: ContractorStepDeliverable[] = taskRows.map((t) => ({
    id: t.id,
    name: t.name,
    department: t.department ?? null,
    status: t.status,
    priority: t.priority ?? null,
    deadline: t.deadline ?? null,
    progress: typeof t.progress === 'number' ? t.progress : 0,
    description: t.description ?? null,
    steps: stepsByTask.get(t.id) ?? [],
  }));

  return { profile, deliverables };
```

- [ ] **Step 4: Keep the old QA route compiling**

In `src/rr-app/routes/contractor-qa.tsx`, add `steps` to the `d()` factory return so its `ContractorDeliverable` literals satisfy the now-`ContractorStepDeliverable` index type. Change the `return { ... }` block to include:

```ts
    steps: [],
```

(as the last field, after `description`). This route is fully replaced in Task 10; this one line just keeps Phase 2 green.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/lib/__tests__/contractor-index-steps.test.ts`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contractor-index.ts src/rr-app/routes/contractor-qa.tsx src/lib/__tests__/contractor-index-steps.test.ts
git commit -m "feat(contractor): load task_steps into the contractor index"
```

---

## Task 8: Contractor advance API route

`PATCH /tasks/:taskId/steps/:stepId` — the contractor's one write.

**Files:**
- Modify: `src/api-server/routes/tasks.ts` (add the route to the `createTasksRoutes` chain; extend `canAccessTask` is not needed — reuse as-is)
- Test: `src/api-server/routes/__tests__/task-steps-advance.test.ts`

**Interfaces:**
- Consumes: `canAccessTask` (existing, returns `{ found, allowed, isAdmin, task, profile }`), `getServiceClient`, `authResolver`.
- Produces: route `PATCH /tasks/:taskId/steps/:stepId` → `{ id, state }`.

Rules (design §7.3): 401 unauth · 404 task not found · 403 not assignee/admin · 404 step not found · non-admin may only advance the **focal `pending`** step → `in_review` (403 non-focal, 409 already-submitted) · admin may set any valid state via `{ state }` body (defaults to `in_review`).

- [ ] **Step 1: Write the failing test**

```ts
// src/api-server/routes/__tests__/task-steps-advance.test.ts
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTasksRoutes } from '../tasks';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mocks.getServiceClient }));

type Step = { id: string; state: 'pending' | 'in_review' | 'done'; sort_order: number };

function serviceMock(opts: { isAdmin: boolean; assignee: string; steps: Step[]; onUpdate?: (patch: unknown) => void }) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: opts.isAdmin, display_name: 'X' } }) }) }) };
      }
      if (table === 'tasks') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'task-1', assignee_id: opts.assignee, name: 'T' } }) }) }) };
      }
      if (table === 'task_steps') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: opts.steps, error: null }) }) }),
          update: (patch: unknown) => ({ eq: async () => { opts.onUpdate?.(patch); return { error: null }; } }),
        };
      }
      return {};
    }),
  };
}

function app(assignee: string) {
  return new Hono().route('/api', createTasksRoutes({
    authResolver: async () => ({ id: assignee, email: 'x@example.invalid' }),
  }));
}

const STEPS: Step[] = [
  { id: 's1', state: 'done', sort_order: 0 },
  { id: 's2', state: 'pending', sort_order: 1 }, // focal
  { id: 's3', state: 'pending', sort_order: 2 },
];

describe('PATCH /tasks/:taskId/steps/:stepId', () => {
  it('lets the assignee advance the focal pending step to in_review', async () => {
    let patched: unknown;
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS, onUpdate: (p) => (patched = p) }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', { method: 'PATCH' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 's2', state: 'in_review' });
    expect(patched).toEqual({ state: 'in_review' });
  });

  it('rejects advancing a non-focal step', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s3', { method: 'PATCH' });
    expect(res.status).toBe(403);
  });

  it('rejects a non-admin trying to reach done', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'done' }),
    });
    // non-admin path ignores the body and forces in_review
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 's2', state: 'in_review' });
  });

  it('rejects a task the caller does not own', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'someone-else', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', { method: 'PATCH' });
    expect(res.status).toBe(403);
  });

  it('404s an unknown step', async () => {
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: STEPS }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/nope', { method: 'PATCH' });
    expect(res.status).toBe(404);
  });

  it('409s when the focal step is already in review', async () => {
    const submitted: Step[] = [{ id: 's2', state: 'in_review', sort_order: 0 }];
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: false, assignee: 'user-1', steps: submitted }));
    const res = await app('user-1').request('/api/tasks/task-1/steps/s2', { method: 'PATCH' });
    expect(res.status).toBe(409);
  });

  it('lets an admin set any valid state via the body', async () => {
    let patched: unknown;
    mocks.getServiceClient.mockReturnValue(serviceMock({ isAdmin: true, assignee: 'someone-else', steps: [{ id: 's2', state: 'in_review', sort_order: 0 }], onUpdate: (p) => (patched = p) }));
    const res = await app('admin-1').request('/api/tasks/task-1/steps/s2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'done' }),
    });
    expect(res.status).toBe(200);
    expect(patched).toEqual({ state: 'done' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api-server/routes/__tests__/task-steps-advance.test.ts`
Expected: FAIL — the route 404s (Hono has no matching route) so status assertions fail.

- [ ] **Step 3: Implement the route in `src/api-server/routes/tasks.ts`**

Add this `.patch(...)` to the `createTasksRoutes` return chain (place it directly after the existing `.patch('/tasks/:id/progress', ...)` block, before the chain ends):

```ts
    .patch('/tasks/:taskId/steps/:stepId', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const taskId = c.req.param('taskId');
      const stepId = c.req.param('stepId');

      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) {
        return c.json({ error: 'Only the assignee or an admin can update this task' }, 403);
      }

      const service = getServiceClient();
      const { data: steps, error } = await service
        .from('task_steps')
        .select('id, state, sort_order')
        .eq('task_id', taskId)
        .order('sort_order', { ascending: true });
      if (error) return c.json({ error: 'Failed to load steps' }, 500);

      const rows = (steps ?? []) as { id: string; state: 'pending' | 'in_review' | 'done'; sort_order: number }[];
      const step = rows.find((s) => s.id === stepId);
      if (!step) return c.json({ error: 'Step not found' }, 404);

      let target: 'pending' | 'in_review' | 'done';
      if (access.isAdmin) {
        // Admin may set any valid state (completes the review loop without an
        // authoring UI yet — see design §10). Defaults to in_review.
        const body = (await c.req.json().catch(() => null)) as { state?: unknown } | null;
        const requested = body?.state;
        target =
          requested === 'pending' || requested === 'in_review' || requested === 'done'
            ? requested
            : 'in_review';
      } else {
        // Contractor: only the focal pending step advances to in_review.
        const focal = rows.find((s) => s.state !== 'done');
        if (!focal || focal.id !== stepId) {
          return c.json({ error: 'Only the current step can be advanced' }, 403);
        }
        if (step.state !== 'pending') {
          return c.json({ error: 'Step is not awaiting submission' }, 409);
        }
        target = 'in_review';
      }

      const { error: updateError } = await service
        .from('task_steps')
        .update({ state: target } as never)
        .eq('id', stepId);
      if (updateError) return c.json({ error: 'Failed to update step' }, 500);

      return c.json({ id: stepId, state: target });
    })
```

- [ ] **Step 4: Run the test + the existing security test**

Run: `npx vitest run src/api-server/routes/__tests__/task-steps-advance.test.ts`
Expected: PASS (7 tests).
Run: `npx vitest run src/api-server/routes/__tests__/tasks-security.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/api-server/routes/tasks.ts src/api-server/routes/__tests__/task-steps-advance.test.ts
git commit -m "feat(api): contractor advance route PATCH /tasks/:taskId/steps/:stepId"
```

---

## Task 9: Wire the live `/contractor` route onto the step timeline

Swap `ContractorRouteContent` from `DeliverableTimeline` to `StepDeliverableTimeline`, thread the real advance handler, and make `splitDeliverables` generic so the split preserves `steps`.

**Files:**
- Modify: `src/lib/contractor-buckets.ts` (make `splitDeliverables` generic over `T extends ContractorDeliverable`)
- Modify: `src/rr-app/routes/contractor.tsx`
- Test: `src/rr-app/routes/__tests__/contractor-advance.test.tsx` (new — advance handler wiring)
- Existing test to update: `src/lib/__tests__/contractor-buckets.test.ts` (only if the generic signature change surfaces a type error there — behavior is unchanged, so it should pass as-is)

**Interfaces:**
- Consumes: `StepDeliverableTimeline` from `@/components/contractor/StepDeliverableTimeline`; `ContractorStepDeliverable` from `@/lib/contractor-steps`.
- Produces: `ContractorRouteContent` renders `StepDeliverableTimeline`; a `defaultAdvanceCommit(taskId, stepId)` that `PATCH`es `/api/tasks/:taskId/steps/:stepId`.

- [ ] **Step 1: Make `splitDeliverables` generic (behavior-preserving)**

In `src/lib/contractor-buckets.ts`, change the signature and the internal collections so the item type flows through. Replace the `splitDeliverables` declaration line and its local arrays:

```ts
export function splitDeliverables<T extends ContractorDeliverable>(
  items: T[],
  _now: Date,
): { active: T[]; timeline: { key: string; label: string; items: T[] }[] } {
  const active: T[] = [];
  const dated = new Map<string, { label: string; items: T[] }>();
  const undated: T[] = [];
```

The body is otherwise unchanged. The return already builds `{ key, label, items }` groups; those are structurally `TimelineMonth` when `T = ContractorDeliverable`. `TimelineMonth` stays exported as-is for `CompletedTimeline`.

Run: `npx vitest run src/lib/__tests__/contractor-buckets.test.ts`
Expected: PASS (unchanged behavior).

- [ ] **Step 2: Write the failing advance-wiring test**

```tsx
// src/rr-app/routes/__tests__/contractor-advance.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import { ContractorRouteContent } from '../contractor';

const NOW = new Date('2026-07-05T09:00:00');

const deliverable: ContractorStepDeliverable = {
  id: 'task-1',
  name: 'Combat HUD',
  department: 'Animation',
  status: 'In Progress',
  priority: 'High',
  deadline: '2026-07-25',
  progress: 20,
  description: null,
  steps: [{ id: 's1', name: 'HUD integration', deadline: '2026-07-25', state: 'pending', sort_order: 0 }],
};

afterEach(() => vi.restoreAllMocks());

describe('ContractorRouteContent advance wiring', () => {
  it('PATCHes the advance route when the focal step is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ContractorRouteContent
          now={NOW}
          data={{
            status: 'ready',
            index: {
              profile: { id: 'u1', displayName: 'Dana', email: null, avatarUrl: null, isAdmin: false, isContractor: true },
              deliverables: [deliverable],
            },
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /submit hud integration for review/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1/steps/s1', expect.objectContaining({ method: 'PATCH' })),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/rr-app/routes/__tests__/contractor-advance.test.tsx`
Expected: FAIL — the old row model has no "Submit … for review" button.

- [ ] **Step 4: Rewrite the render + add the advance commit in `src/rr-app/routes/contractor.tsx`**

Change the imports:

```ts
import { greetingFor, splitDeliverables, summarizeDeliverables } from '@/lib/contractor-buckets';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import { StepDeliverableTimeline } from '@/components/contractor/StepDeliverableTimeline';
```

Add the default commit above `ContractorRouteContent`:

```ts
async function defaultAdvanceCommit(taskId: string, stepId: string): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('advance_failed');
}
```

In `ContractorRouteContent`, add `onAdvance` to the props and swap the timeline render. Change the signature to:

```ts
export function ContractorRouteContent({
  data,
  now = new Date(),
  onAdvance = defaultAdvanceCommit,
}: {
  data: ContractorData;
  now?: Date;
  onAdvance?: (taskId: string, stepId: string) => void | Promise<void>;
}) {
```

The `deliverables` destructured from `data.index` are now `ContractorStepDeliverable[]`. `splitDeliverables` (generic) returns `active: ContractorStepDeliverable[]` and matching timeline groups. Replace the `<DeliverableTimeline .../>` line (currently `contractor.tsx:86`) with:

```tsx
        <StepDeliverableTimeline active={active} timeline={timeline} now={now} onAdvance={onAdvance} />
```

`summarizeDeliverables` and the greeting/subline block above are unchanged (they read only base `ContractorDeliverable` fields).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/rr-app/routes/__tests__/contractor-advance.test.tsx`
Expected: PASS (1 test).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contractor-buckets.ts src/rr-app/routes/contractor.tsx src/rr-app/routes/__tests__/contractor-advance.test.tsx
git commit -m "feat(contractor): wire /contractor onto the step timeline + advance route"
```

---

## Task 10: Retire `ProgressRail` / `DeliverableRow` / `DeliverableTimeline`; fold the QA route

With the step model live, the scrub-dial row model is dead code. Remove it, delete the now-redundant standalone steps-QA route, and move the seeded steps into the canonical `/contractor/qa` so there is a single QA anchor (no preview-route drift).

**Files:**
- Delete: `src/components/contractor/ProgressRail.tsx` + `src/components/contractor/DeliverableRow.tsx` + `src/components/contractor/DeliverableTimeline.tsx`
- Delete: their tests — `src/components/contractor/__tests__/DeliverableRow.test.tsx`, `src/components/contractor/__tests__/DeliverableTimeline.test.tsx` (keep `CompletedTimeline.test.tsx` — still used)
- Delete: `src/rr-app/routes/contractor-steps-qa.tsx` + its test + its `/contractor/steps-qa` entry in `src/rr-app/routes.tsx`
- Modify: `src/rr-app/routes/contractor-qa.tsx` — seed steps + render through the (now step-aware) `ContractorRouteContent`

- [ ] **Step 1: Confirm no remaining importers**

Run: `git grep -nE "ProgressRail|DeliverableRow|DeliverableTimeline" -- src`
Expected: only the three component files, their two tests, and `DeliverableTimeline`'s self-references. If `DeliverableTimeline` is imported anywhere other than its own test, that importer must move to `StepDeliverableTimeline` first — there should be none after Task 9 (contractor.tsx no longer imports it).

- [ ] **Step 2: Enrich the canonical QA seed with steps**

Rewrite `src/rr-app/routes/contractor-qa.tsx` so its `d()` factory carries `steps` and the seed exercises the five states through the real `ContractorRouteContent` (which now renders `StepDeliverableTimeline`). Reuse the seed shape from the deleted `contractor-steps-qa.tsx` (the `active` array's four deliverables + a Done deliverable for the Timeline zone), but express delivered work as a `status: 'Done'` deliverable with all-`done` steps so `splitDeliverables` files it under the Timeline. Concretely, extend the `d()` return with `steps: partial.steps ?? []`, add step arrays to the incomplete rows (matching the Task 5 seed: `d1` five-step compaction, `d2` in_review focal, `d3` single overdue, `d4` zero steps), and give the `Done` rows a fully-`done` steps array. Keep `NOW = new Date('2026-07-05T09:00:00')` and the existing `ContractorRouteContent` wrapper (`data={{ status: 'ready', index: { profile, deliverables } }}`).

- [ ] **Step 3: Delete the dead files + the steps-qa route entry**

```bash
git rm src/components/contractor/ProgressRail.tsx \
       src/components/contractor/DeliverableRow.tsx \
       src/components/contractor/DeliverableTimeline.tsx \
       src/components/contractor/__tests__/DeliverableRow.test.tsx \
       src/components/contractor/__tests__/DeliverableTimeline.test.tsx \
       src/rr-app/routes/contractor-steps-qa.tsx \
       src/rr-app/routes/__tests__/contractor-steps-qa.test.tsx
```

Remove the `/contractor/steps-qa` route object from `src/rr-app/routes.tsx` (the block added in Task 5).

- [ ] **Step 4: Update the QA route test**

Point `src/rr-app/routes/__tests__` coverage at the canonical route: either update the existing contractor-qa test (if present) or add a small render test asserting `/contractor/qa`'s content shows the step model (`In review`, a "… done" toggle, `no steps yet`, and the `Timeline` heading), mirroring the deleted `contractor-steps-qa.test.tsx` but importing `ContractorQaRoute` from `../contractor-qa` and wrapping in `<MemoryRouter>`.

- [ ] **Step 5: Full typecheck + targeted + full test run**

Run: `npx tsc --noEmit`
Expected: no errors (no dangling imports of the deleted components).
Run: `npx vitest run src/components/contractor src/rr-app/routes/__tests__/contractor-qa.test.tsx src/lib/__tests__/contractor-steps.test.ts`
Expected: PASS.
Run: `npx vitest run`
Expected: only the 5 known-red baseline files fail (investor, investor-layout, payments, qa-routes, ActivitySection.copy); nothing else.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(contractor): retire ProgressRail/DeliverableRow, fold QA to step model"
```

---

## Self-Review Checklist (completed while drafting)

- **Spec coverage:** §4.1 five states → Task 2; §4.2 derivation + focal + canAdvance → Task 1; §4.3 advance interaction → Tasks 2/3/8/9; §5.1 grouping + §5.2 rollup precedence → Tasks 1/3; §5.3 compaction → Task 3; §5.4 edge cases (0-step, no deliverables, all-done) → Tasks 3/4; §6 motion (focal advance/enlarge, compaction stagger, reduced-motion, custom easing, static missed/upcoming) → Tasks 2/3; §7.1 schema → Task 6; §7.2 RLS → Task 6; §7.3 read + advance + admin transitions → Tasks 7/8; §8 security → Global Constraints + Task 8 guards; §9 testing → every task's tests; §10 out-of-scope (admin authoring UI, comments, notifications) → deliberately excluded.
- **Type consistency:** `ContractorStep`, `RenderedStepState`, `DerivedStep` (`{ step, rendered, isFocal, canAdvance }`), `ContractorStepDeliverable`, `deriveSteps`, `summarizeSteps` are used with identical shapes across Tasks 1→9. `onAdvance` is `(stepId)` at `StepNode`/`DeliverableSteps` and `(taskId, stepId)` at `StepDeliverableTimeline`/`contractor.tsx` — bound in Task 4's `.map`.
- **No placeholders:** every code step contains complete, runnable code; every command has an expected result.
- **Prototype-first:** no schema is created until after the Task 5 checkpoint.
