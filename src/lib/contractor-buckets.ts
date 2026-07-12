// src/lib/contractor-buckets.ts
import type { ContractorDeliverable } from './contractor-index';

const DELIVERED: Record<string, true> = { Done: true };
const HIDDEN: Record<string, true> = { Canceled: true, Duplicate: true };

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * Parse a `YYYY-MM-DD` deadline as LOCAL midnight. A bare `new Date('2026-07-08')`
 * parses as UTC midnight, which shifts back a day when read in a UTC-negative
 * timezone — so buckets and labels would show the wrong calendar day. Appending
 * `T00:00:00` pins it to the local day (same fix as src/lib/format-deadline.ts).
 */
export function parseDeadline(deadline: string): Date {
  return new Date(`${deadline}T00:00:00`);
}

function priorityRank(p: string | null): number {
  return p === 'High' ? 0 : p === 'Medium' ? 1 : p === 'Low' ? 2 : 3;
}

function deadlineMs(d: ContractorDeliverable): number {
  return d.deadline ? parseDeadline(d.deadline).getTime() : Number.POSITIVE_INFINITY;
}

/** Steps ride along optionally — this module predates the step model and the
 * base ContractorDeliverable doesn't carry them, but urgency must read them:
 * under the step model most tasks are undated and only steps hold deadlines. */
type MaybeStepped = ContractorDeliverable & {
  steps?: { deadline: string | null; state: string }[];
};

/**
 * The date a deliverable is actually "due next": the earliest deadline among
 * its not-done steps, falling back to the task's own deadline. Without this,
 * step-model tasks (task deadline null) sank to the bottom of the active list
 * even with a step days overdue.
 */
function effectiveDeadlineMs(d: MaybeStepped): number {
  const stepMs = (d.steps ?? [])
    .filter((s) => s.state !== 'done' && s.deadline != null)
    .map((s) => parseDeadline(s.deadline!).getTime());
  if (stepMs.length > 0) return Math.min(...stepMs);
  return deadlineMs(d);
}

function sortByDeadlineThenPriority(a: MaybeStepped, b: MaybeStepped): number {
  const da = effectiveDeadlineMs(a);
  const db = effectiveDeadlineMs(b);
  if (da !== db) return da - db;
  return priorityRank(a.priority) - priorityRank(b.priority);
}

export function formatDueLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** A deadline is overdue only when it lands strictly before today's local midnight. */
export function isOverdue(deadline: string | null, now: Date): boolean {
  if (deadline == null) return false;
  return startOfDay(parseDeadline(deadline)) < startOfDay(now);
}

/** Human day-count for an overdue deadline, e.g. "1 day overdue" / "5 days overdue". */
export function overdueLabel(deadline: string, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(parseDeadline(deadline))) / 86_400_000);
  return days === 1 ? '1 day overdue' : `${days} days overdue`;
}

export type TimelineMonth = { key: string; label: string; items: ContractorDeliverable[] };

const UNDATED_KEY = 'undated';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Split a contractor's tasks into the two surfaces of the portal:
 *  - `active`  — every incomplete task (Canceled/Duplicate dropped), sorted by
 *    deadline then priority. Past dates sort ahead of today/future, so overdue
 *    work naturally floats to the top of the "what you need to do" list.
 *  - `timeline` — Done tasks condensed into month groups (newest month first,
 *    newest-first within a month); Done tasks with no deadline collect into a
 *    trailing "No date" group. This is the collapsing history below the fold.
 */
export function splitDeliverables<T extends ContractorDeliverable>(
  items: T[],
  _now: Date,
): { active: T[]; timeline: { key: string; label: string; items: T[] }[] } {
  const active: T[] = [];
  const dated = new Map<string, { label: string; items: T[] }>();
  const undated: T[] = [];

  for (const item of items) {
    if (HIDDEN[item.status]) continue;
    if (!DELIVERED[item.status]) {
      active.push(item);
      continue;
    }
    if (item.deadline == null) {
      undated.push(item);
      continue;
    }
    const due = parseDeadline(item.deadline);
    const key = monthKey(due);
    const group = dated.get(key) ?? { label: monthLabel(due), items: [] };
    group.items.push(item);
    dated.set(key, group);
  }

  active.sort(sortByDeadlineThenPriority);

  const timeline: { key: string; label: string; items: T[] }[] = [...dated.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // newest month first
    .map(([key, group]) => ({
      key,
      label: group.label,
      // newest deadline first within the month
      items: group.items.sort((a, b) => deadlineMs(b) - deadlineMs(a)),
    }));

  if (undated.length > 0) {
    timeline.push({ key: UNDATED_KEY, label: 'No date', items: undated });
  }

  return { active, timeline };
}

export function summarizeDeliverables(
  items: ContractorDeliverable[],
  now: Date,
): { count: number; nextDueLabel: string | null; overdueCount: number } {
  const active = (items as MaybeStepped[]).filter((i) => !DELIVERED[i.status] && !HIDDEN[i.status]);
  const dated = active
    .map((i) => effectiveDeadlineMs(i))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
  const today = startOfDay(now);
  // Next-due looks forward only — anything already past is reported through
  // overdueCount instead, so the greeting never says "next due" about a date
  // that has slipped.
  const upcoming = dated.find((ms) => startOfDay(new Date(ms)) >= today);
  return {
    count: active.length,
    nextDueLabel: upcoming != null ? formatDueLabel(new Date(upcoming)) : null,
    overdueCount: dated.filter((ms) => startOfDay(new Date(ms)) < today).length,
  };
}

export function greetingFor(hours: number): string {
  if (hours < 12) return 'Good morning';
  if (hours < 18) return 'Good afternoon';
  return 'Good evening';
}
