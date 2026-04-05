import { describe, it, expect } from 'vitest';
import { computeAreaProgress } from '../area-progress';

describe('computeAreaProgress', () => {
  it('returns 0 for empty sections', () => {
    expect(computeAreaProgress([])).toBe(0);
  });

  it('returns the average, rounded to nearest integer', () => {
    expect(computeAreaProgress([{ progress: 20 }, { progress: 40 }])).toBe(30);
    expect(computeAreaProgress([{ progress: 10 }, { progress: 20 }, { progress: 30 }])).toBe(20);
    // rounding: (33 + 34) / 2 = 33.5 → 34
    expect(computeAreaProgress([{ progress: 33 }, { progress: 34 }])).toBe(34);
  });

  it('handles single section', () => {
    expect(computeAreaProgress([{ progress: 42 }])).toBe(42);
  });

  it('clamps to 0-100 even if inputs are out of range', () => {
    expect(computeAreaProgress([{ progress: 150 }])).toBe(100);
    expect(computeAreaProgress([{ progress: -20 }])).toBe(0);
  });
});
