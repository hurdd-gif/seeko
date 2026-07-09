import { describe, it, expect } from 'vitest';
import { describeTargetDate } from '../MilestonesSection';

// Fixed "now" so the relative math is deterministic. Late in the day on purpose:
// a DATE target on the same calendar day must still read "Today", proving we
// compare calendar days (local), not raw timestamps.
const NOW = new Date(2026, 5, 18, 23, 30); // 2026-06-18 23:30 local

describe('describeTargetDate — temporal awareness', () => {
  it('returns null when there is no target date', () => {
    expect(describeTargetDate(undefined, NOW)).toBeNull();
    expect(describeTargetDate(null, NOW)).toBeNull();
  });

  it('flags an overdue milestone in red with a day count', () => {
    expect(describeTargetDate('2026-06-10', NOW)).toEqual({ label: '8d overdue', tone: 'overdue' });
  });

  it('counts a single overdue day', () => {
    expect(describeTargetDate('2026-06-17', NOW)).toEqual({ label: '1d overdue', tone: 'overdue' });
  });

  it('reads "Today" for a same-day target regardless of time', () => {
    expect(describeTargetDate('2026-06-18', NOW)).toEqual({ label: 'Today', tone: 'soon' });
  });

  it('counts down within the next week as "soon"', () => {
    expect(describeTargetDate('2026-06-21', NOW)).toEqual({ label: 'in 3d', tone: 'soon' });
    expect(describeTargetDate('2026-06-25', NOW)).toEqual({ label: 'in 7d', tone: 'soon' });
  });

  it('shows an absolute date in a neutral tone when more than a week out', () => {
    const r = describeTargetDate('2026-07-15', NOW);
    expect(r?.tone).toBe('normal');
    expect(r?.label).toBe('Jul 15');
  });
});
