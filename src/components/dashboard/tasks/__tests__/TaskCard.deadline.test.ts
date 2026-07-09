import { describe, it, expect } from 'vitest';
import { formatDeadline } from '../TaskCard';

// Late-in-day "now" guards the calendar-day comparison: a deadline on the same
// date must NOT read as overdue just because the clock is past midnight.
const NOW = new Date(2026, 5, 18, 23, 30); // 2026-06-18 23:30 local

describe('formatDeadline — due-date meta for a board card', () => {
  it('returns null when there is no deadline', () => {
    expect(formatDeadline(undefined, NOW)).toBeNull();
    expect(formatDeadline(null, NOW)).toBeNull();
  });

  it('marks a past deadline overdue', () => {
    expect(formatDeadline('2026-06-10', NOW)).toEqual({ label: 'Jun 10', overdue: true });
  });

  it('does not mark a deadline due today as overdue', () => {
    expect(formatDeadline('2026-06-18', NOW)).toEqual({ label: 'Jun 18', overdue: false });
  });

  it('shows a future deadline without the overdue flag', () => {
    expect(formatDeadline('2026-07-15', NOW)).toEqual({ label: 'Jul 15', overdue: false });
  });
});
