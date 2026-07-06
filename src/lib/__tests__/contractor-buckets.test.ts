import { describe, expect, it } from 'vitest';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import {
  greetingFor,
  isOverdue,
  overdueLabel,
  splitDeliverables,
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

describe('splitDeliverables', () => {
  it('sorts active by deadline then priority (same-day High before Low)', () => {
    const items = [
      d({ id: 'b', deadline: '2026-07-08', priority: 'Low' }),
      d({ id: 'a', deadline: '2026-07-06', priority: 'Low' }),
      d({ id: 'a-high', deadline: '2026-07-06', priority: 'High' }),
    ];
    const { active } = splitDeliverables(items, NOW);
    expect(active.map((i) => i.id)).toEqual(['a-high', 'a', 'b']);
  });


  it('puts all incomplete work in active (overdue floats to top), Done in the timeline', () => {
    const items = [
      d({ id: 'week', deadline: '2026-07-08', status: 'Todo' }),
      d({ id: 'overdue1', deadline: '2026-07-01', status: 'In Progress' }),
      d({ id: 'overdue2', deadline: '2026-06-15', status: 'Todo' }),
      d({ id: 'none', deadline: null, status: 'Todo' }),
      d({ id: 'done-may', deadline: '2026-05-20', status: 'Done' }),
      d({ id: 'cancel', deadline: '2026-07-02', status: 'Canceled' }),
      d({ id: 'dup', deadline: '2026-07-02', status: 'Duplicate' }),
    ];
    const { active, timeline } = splitDeliverables(items, NOW);

    // overdue (earliest deadline) first, then upcoming by deadline, undated last
    expect(active.map((i) => i.id)).toEqual(['overdue2', 'overdue1', 'week', 'none']);
    // Done leaves the active list entirely
    expect(active.map((i) => i.id)).not.toContain('done-may');
    // canceled + duplicate appear nowhere
    expect(JSON.stringify({ active, timeline })).not.toContain('cancel');
    expect(JSON.stringify({ active, timeline })).not.toContain('dup');
  });

  it('groups the timeline by month, newest month first, newest-first within a month', () => {
    const items = [
      d({ id: 'apr', deadline: '2026-04-30', status: 'Done' }),
      d({ id: 'may-early', deadline: '2026-05-12', status: 'Done' }),
      d({ id: 'may-late', deadline: '2026-05-20', status: 'Done' }),
    ];
    const { timeline } = splitDeliverables(items, NOW);

    expect(timeline.map((m) => m.label)).toEqual(['May 2026', 'April 2026']);
    expect(timeline[0].items.map((i) => i.id)).toEqual(['may-late', 'may-early']);
    expect(timeline[1].items.map((i) => i.id)).toEqual(['apr']);
  });

  it('collects Done items with no deadline into a trailing "No date" group', () => {
    const items = [
      d({ id: 'dated', deadline: '2026-05-20', status: 'Done' }),
      d({ id: 'undated', deadline: null, status: 'Done' }),
    ];
    const { timeline } = splitDeliverables(items, NOW);

    expect(timeline.map((m) => m.label)).toEqual(['May 2026', 'No date']);
    expect(timeline.at(-1)?.items.map((i) => i.id)).toEqual(['undated']);
  });

  it('omits empty groups and returns empty arrays when there is nothing to show', () => {
    expect(splitDeliverables([], NOW)).toEqual({ active: [], timeline: [] });
  });
});

describe('isOverdue', () => {
  it('is true only for a past-dated deadline, never today or the future or null', () => {
    expect(isOverdue('2026-07-01', NOW)).toBe(true);
    expect(isOverdue('2026-07-04', NOW)).toBe(false); // due today is not overdue
    expect(isOverdue('2026-07-10', NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });
});

describe('overdueLabel', () => {
  it('renders a human day count', () => {
    expect(overdueLabel('2026-07-03', NOW)).toBe('1 day overdue');
    expect(overdueLabel('2026-06-29', NOW)).toBe('5 days overdue');
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
