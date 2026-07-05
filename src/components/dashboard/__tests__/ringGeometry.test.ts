import { clampPercent, ringDashOffset } from '../ringGeometry';

describe('clampPercent', () => {
  it('passes through in-range integers', () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(100)).toBe(100);
  });

  it('clamps below 0 and above 100', () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(140)).toBe(100);
  });

  it('rounds fractional input to a whole percent', () => {
    expect(clampPercent(49.4)).toBe(49);
    expect(clampPercent(49.6)).toBe(50);
  });

  it('coerces non-finite input to 0 (never NaN into the SVG)', () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(100);
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('ringDashOffset', () => {
  const C = 100; // use a round circumference so the math is obvious

  it('hides the whole arc at 0% (offset = full circumference)', () => {
    expect(ringDashOffset(0, C)).toBe(100);
  });

  it('reveals the whole arc at 100% (offset = 0)', () => {
    expect(ringDashOffset(100, C)).toBe(0);
  });

  it('reveals half the arc at 50%', () => {
    expect(ringDashOffset(50, C)).toBe(50);
  });

  it('clamps out-of-range percent before computing the offset', () => {
    expect(ringDashOffset(-10, C)).toBe(100); // treated as 0%
    expect(ringDashOffset(130, C)).toBe(0); // treated as 100%
  });
});
