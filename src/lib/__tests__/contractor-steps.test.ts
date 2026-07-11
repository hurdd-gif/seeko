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
