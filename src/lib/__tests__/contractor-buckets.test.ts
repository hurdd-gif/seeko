import { describe, expect, it } from 'vitest';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import {
  bucketDeliverables,
  greetingFor,
  summarizeDeliverables,
} from '@/lib/contractor-buckets';

const NOW = new Date('2026-07-04T09:00:00'); // Saturday

function d(partial: Partial<ContractorDeliverable>): ContractorDeliverable {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Task',
    department: partial.department ?? 'Coding',
    status: partial.status ?? 'Todo',
    priority: partial.priority ?? 'Medium',
    deadline: partial.deadline ?? null,
    progress: partial.progress ?? 0,
    description: partial.description ?? null,
  };
}

describe('bucketDeliverables', () => {
  it('classifies by deadline vs today and drops canceled/duplicate', () => {
    const items = [
      d({ id: 'over', deadline: '2026-07-01', status: 'In Progress' }),
      d({ id: 'week', deadline: '2026-07-08', status: 'Todo' }),
      d({ id: 'later', deadline: '2026-07-24', status: 'Backlog' }),
      d({ id: 'none', deadline: null, status: 'Todo' }),
      d({ id: 'done', deadline: '2026-07-02', status: 'Done' }),
      d({ id: 'cancel', deadline: '2026-07-02', status: 'Canceled' }),
      d({ id: 'dup', deadline: '2026-07-02', status: 'Duplicate' }),
    ];
    const buckets = bucketDeliverables(items, NOW);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.items.map((i) => i.id)]));

    expect(byKey.overdue).toEqual(['over']);
    expect(byKey.thisWeek).toEqual(['week']);
    expect(byKey.upcoming).toEqual(['later', 'none']); // no-deadline sorts last within upcoming
    expect(byKey.delivered).toEqual(['done']);
    // canceled + duplicate appear in NO bucket
    expect(JSON.stringify(buckets)).not.toContain('cancel');
    expect(JSON.stringify(buckets)).not.toContain('dup');
    // empty buckets are omitted
    expect(buckets.every((b) => b.items.length > 0)).toBe(true);
  });

  it('sorts within a bucket by deadline then priority', () => {
    const items = [
      d({ id: 'b', deadline: '2026-07-08', priority: 'Low' }),
      d({ id: 'a', deadline: '2026-07-06', priority: 'Low' }),
      d({ id: 'a-high', deadline: '2026-07-06', priority: 'High' }),
    ];
    const [week] = bucketDeliverables(items, NOW);
    expect(week.items.map((i) => i.id)).toEqual(['a-high', 'a', 'b']);
  });
});

describe('summarizeDeliverables', () => {
  it('counts active deliverables and labels the next due date', () => {
    const items = [
      d({ id: 'x', deadline: '2026-07-10', status: 'In Progress' }),
      d({ id: 'y', deadline: '2026-07-08', status: 'Todo' }),
      d({ id: 'done', deadline: '2026-07-02', status: 'Done' }),
    ];
    const s = summarizeDeliverables(items, NOW);
    expect(s.count).toBe(2); // Done excluded
    expect(s.nextDueLabel).toBe('Wed, Jul 8'); // earliest active deadline
  });

  it('returns null next-due when no active deadlines', () => {
    const s = summarizeDeliverables([d({ deadline: null })], NOW);
    expect(s).toEqual({ count: 1, nextDueLabel: null });
  });
});

describe('greetingFor', () => {
  it('maps hour-of-day to a greeting', () => {
    expect(greetingFor(9)).toBe('Good morning');
    expect(greetingFor(13)).toBe('Good afternoon');
    expect(greetingFor(20)).toBe('Good evening');
  });
});
