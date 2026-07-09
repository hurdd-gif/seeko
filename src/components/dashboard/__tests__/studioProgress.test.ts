import { overallProgress, orderAreas } from '../studioProgress';
import type { Area } from '@/lib/types';

const area = (over: Partial<Area>): Area =>
  ({ id: 'x', name: 'X', status: 'Active', progress: 0, ...over }) as Area;

describe('overallProgress', () => {
  it('is the rounded mean of per-area progress', () => {
    expect(overallProgress([area({ progress: 60 }), area({ progress: 0 })])).toBe(30);
    expect(overallProgress([area({ progress: 50 }), area({ progress: 51 })])).toBe(51); // 50.5 -> 51
  });

  it('is 0 for an empty studio (no divide-by-zero)', () => {
    expect(overallProgress([])).toBe(0);
  });
});

describe('orderAreas', () => {
  it('orders by target_date ascending, dated before undated', () => {
    const out = orderAreas([
      area({ id: 'late', name: 'Late', target_date: '2026-11-01' }),
      area({ id: 'none', name: 'None' }),
      area({ id: 'early', name: 'Early', target_date: '2026-08-15' }),
    ]);
    expect(out.map((a) => a.id)).toEqual(['early', 'late', 'none']);
  });

  it('falls back to sort_order when neither has a target_date', () => {
    const out = orderAreas([
      area({ id: 'b', sort_order: 2 }),
      area({ id: 'a', sort_order: 1 }),
    ]);
    expect(out.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [area({ id: 'b', sort_order: 2 }), area({ id: 'a', sort_order: 1 })];
    orderAreas(input);
    expect(input.map((a) => a.id)).toEqual(['b', 'a']);
  });
});
