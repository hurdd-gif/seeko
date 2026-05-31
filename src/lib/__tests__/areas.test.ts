import { describe, it, expect } from 'vitest';
import { soonestArea, monthsUntil } from '@/lib/areas';
import type { Area } from '@/lib/types';

const baseArea: Omit<Area, 'id' | 'name' | 'target_date'> = {
  status: 'Active',
  progress: 0,
  phase: 'Alpha',
};

describe('soonestArea', () => {
  it('returns null when no areas have a target_date', () => {
    const areas: Area[] = [
      { ...baseArea, id: 'a', name: 'A' },
      { ...baseArea, id: 'b', name: 'B' },
    ];
    expect(soonestArea(areas)).toBeNull();
  });

  it('returns the area with the closest future target_date', () => {
    const areas: Area[] = [
      { ...baseArea, id: 'a', name: 'A', target_date: '2027-01-01' },
      { ...baseArea, id: 'b', name: 'B', target_date: '2026-08-15' },
      { ...baseArea, id: 'c', name: 'C', target_date: '2026-09-01' },
    ];
    expect(soonestArea(areas)?.id).toBe('b');
  });

  it('ignores areas with null/undefined target_date', () => {
    const areas: Area[] = [
      { ...baseArea, id: 'a', name: 'A' },
      { ...baseArea, id: 'b', name: 'B', target_date: '2026-12-01' },
    ];
    expect(soonestArea(areas)?.id).toBe('b');
  });

  it('returns null for an empty array', () => {
    expect(soonestArea([])).toBeNull();
  });
});

describe('monthsUntil', () => {
  it('returns 0 when the target date is today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(monthsUntil(today, new Date())).toBe(0);
  });

  it('returns positive months for future dates', () => {
    const ref = new Date('2026-05-13');
    expect(monthsUntil('2026-09-13', ref)).toBe(4);
  });

  it('returns negative months for past dates', () => {
    const ref = new Date('2026-05-13');
    expect(monthsUntil('2026-01-13', ref)).toBe(-4);
  });
});
