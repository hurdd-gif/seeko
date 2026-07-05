// src/lib/contractor-steps.ts
//
// The two-level breadcrumb model. A deliverable (task) is no longer a single
// node on the contractor's vertical spine — it is a GROUP of 1–10 admin-authored
// sub-steps, each rendering one of five states. This module is the pure core:
// given the stored steps and a reference "now", it derives what each node should
// look like and rolls the group up into one summary line. No React, no server
// code — just data in, data out, so it unit-tests cleanly and can be imported
// from both the QA prototype and the real fetch layer.
//
// Stored state stays deliberately tiny: `pending | in_review | done`. The two
// "situational" states a contractor sees — `active` (the one step they're on)
// and `missed` (a not-done step past its deadline) — are DERIVED here from
// (state, deadline, now, order), never stored. That keeps the schema honest:
// "missed" isn't a state an admin sets, it's a fact about time.

import type { ContractorDeliverable } from './contractor-index';
import { formatDueLabel, isOverdue, overdueLabel, parseDeadline } from './contractor-buckets';

/** What an admin authors + what the DB stores. Small on purpose. */
export type StepState = 'pending' | 'in_review' | 'done';

export type ContractorStep = {
  id: string;
  name: string;
  deadline: string | null;
  state: StepState;
  sort_order: number;
};

/** What a node actually renders as — the stored states plus the two derived ones. */
export type RenderedStepState = 'upcoming' | 'active' | 'pending-review' | 'missed' | 'done';

export type DerivedStep = {
  step: ContractorStep;
  rendered: RenderedStepState;
  /** The first not-done step by sort order — the one the contractor is "on". */
  isFocal: boolean;
  /** True only when this is the focal step AND it's still pending (submittable). */
  canAdvance: boolean;
};

export type DeliverableRollup = {
  doneCount: number;
  total: number;
  /** One-line status for the deliverable heading; '' when there are no steps. */
  label: string;
};

/** A deliverable carrying its ordered breadcrumb steps. */
export type ContractorStepDeliverable = ContractorDeliverable & {
  steps: ContractorStep[];
};

function bySortOrder(a: ContractorStep, b: ContractorStep): number {
  return a.sort_order - b.sort_order;
}

/** Index of the first not-done step in an already-sorted array, or -1 if all done. */
function focalIndex(sorted: ContractorStep[]): number {
  return sorted.findIndex((s) => s.state !== 'done');
}

/**
 * Derive the render state of every step. Steps are sorted by `sort_order` first
 * so callers can pass rows in any order. Precedence per step:
 *   1. done                          → 'done'
 *   2. not-done & past its deadline  → 'missed'   (time beats everything else)
 *   3. in_review                     → 'pending-review'
 *   4. the focal pending step        → 'active'
 *   5. otherwise                     → 'upcoming'
 * `canAdvance` marks the single focal step that a contractor may submit for
 * review — focal AND still pending (an overdue focal is "missed" but still
 * submittable, which mirrors the server guard).
 */
export function deriveSteps(steps: ContractorStep[], now: Date): DerivedStep[] {
  const sorted = [...steps].sort(bySortOrder);
  const focal = focalIndex(sorted);

  return sorted.map((step, i) => {
    const isFocal = i === focal;
    const overdue = isOverdue(step.deadline, now);

    let rendered: RenderedStepState;
    if (step.state === 'done') rendered = 'done';
    else if (overdue) rendered = 'missed';
    else if (step.state === 'in_review') rendered = 'pending-review';
    else if (isFocal) rendered = 'active';
    else rendered = 'upcoming';

    return { step, rendered, isFocal, canAdvance: isFocal && step.state === 'pending' };
  });
}

/**
 * Roll a deliverable's steps up into one heading line. Precedence:
 *   1. focal step is in_review       → "In review"
 *   2. focal step is overdue         → "N days overdue"
 *   3. otherwise                     → "M of N" (+ " · next {date}" if the
 *                                       focal step has a deadline)
 * A deliverable with no steps returns an empty label so the heading can fall
 * back to just the name.
 */
export function summarizeSteps(steps: ContractorStep[], now: Date): DeliverableRollup {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.state === 'done').length;
  if (total === 0) return { doneCount: 0, total: 0, label: '' };

  const sorted = [...steps].sort(bySortOrder);
  const focal = sorted[focalIndex(sorted)];

  let label: string;
  if (focal && focal.state === 'in_review') {
    label = 'In review';
  } else if (focal && isOverdue(focal.deadline, now)) {
    label = overdueLabel(focal.deadline!, now);
  } else {
    const next = focal?.deadline ? ` · next ${formatDueLabel(parseDeadline(focal.deadline))}` : '';
    label = `${doneCount} of ${total}${next}`;
  }

  return { doneCount, total, label };
}
