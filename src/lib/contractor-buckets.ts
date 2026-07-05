// src/lib/contractor-buckets.ts
import type { ContractorDeliverable } from './contractor-index';

export type BucketKey = 'overdue' | 'thisWeek' | 'upcoming' | 'delivered';
export type Bucket = { key: BucketKey; label: string; items: ContractorDeliverable[] };

const DELIVERED: Record<string, true> = { Done: true };
const HIDDEN: Record<string, true> = { Canceled: true, Duplicate: true };

const BUCKET_ORDER: BucketKey[] = ['overdue', 'thisWeek', 'upcoming', 'delivered'];
const BUCKET_LABEL: Record<BucketKey, string> = {
  overdue: 'Overdue',
  thisWeek: 'This week',
  upcoming: 'Upcoming',
  delivered: 'Delivered',
};

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

function sortByDeadlineThenPriority(a: ContractorDeliverable, b: ContractorDeliverable): number {
  const da = deadlineMs(a);
  const db = deadlineMs(b);
  if (da !== db) return da - db;
  return priorityRank(a.priority) - priorityRank(b.priority);
}

export function bucketDeliverables(items: ContractorDeliverable[], now: Date): Bucket[] {
  const today = startOfDay(now);
  const weekAhead = today + 7 * 24 * 60 * 60 * 1000;
  const groups: Record<BucketKey, ContractorDeliverable[]> = {
    overdue: [],
    thisWeek: [],
    upcoming: [],
    delivered: [],
  };

  for (const item of items) {
    if (HIDDEN[item.status]) continue;
    if (DELIVERED[item.status]) {
      groups.delivered.push(item);
      continue;
    }
    if (item.deadline == null) {
      groups.upcoming.push(item);
      continue;
    }
    const due = startOfDay(parseDeadline(item.deadline));
    if (due < today) groups.overdue.push(item);
    else if (due < weekAhead) groups.thisWeek.push(item);
    else groups.upcoming.push(item);
  }

  for (const key of BUCKET_ORDER) groups[key].sort(sortByDeadlineThenPriority);

  return BUCKET_ORDER.filter((key) => groups[key].length > 0).map((key) => ({
    key,
    label: BUCKET_LABEL[key],
    items: groups[key],
  }));
}

export function formatDueLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function summarizeDeliverables(
  items: ContractorDeliverable[],
  _now: Date,
): { count: number; nextDueLabel: string | null } {
  const active = items.filter((i) => !DELIVERED[i.status] && !HIDDEN[i.status]);
  const next = active
    .filter((i) => i.deadline != null)
    .sort((a, b) => parseDeadline(a.deadline!).getTime() - parseDeadline(b.deadline!).getTime())[0];
  return {
    count: active.length,
    nextDueLabel: next ? formatDueLabel(parseDeadline(next.deadline!)) : null,
  };
}

export function greetingFor(hours: number): string {
  if (hours < 12) return 'Good morning';
  if (hours < 18) return 'Good afternoon';
  return 'Good evening';
}
