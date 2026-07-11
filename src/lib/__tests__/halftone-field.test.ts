import { describe, expect, it } from 'vitest';
import {
  VEIL_STOPS,
  bloomAlpha,
  bloomIntensity,
  lensDisplacement,
  sampleVeilGradient,
} from '../halftone-field';

describe('sampleVeilGradient', () => {
  it('returns deep orange at 0 (bottom edge anchor)', () => {
    expect(sampleVeilGradient(0)).toEqual([0xe4, 0x58, 0x1d]);
  });

  it('returns ultramarine at 1 (top of the field)', () => {
    expect(sampleVeilGradient(1)).toEqual([0x1d, 0x33, 0xb4]);
  });

  it('interpolates linearly between adjacent stops', () => {
    // Halfway between stop 0 (#E4581D @ 0) and stop 1 (#EE8A2F @ 0.16)
    const [r, g, b] = sampleVeilGradient(VEIL_STOPS[1].offset / 2);
    expect(r).toBeCloseTo((0xe4 + 0xee) / 2, 0);
    expect(g).toBeCloseTo((0x58 + 0x8a) / 2, 0);
    expect(b).toBeCloseTo((0x1d + 0x2f) / 2, 0);
  });

  it('clamps out-of-range inputs instead of extrapolating', () => {
    expect(sampleVeilGradient(-0.5)).toEqual(sampleVeilGradient(0));
    expect(sampleVeilGradient(1.5)).toEqual(sampleVeilGradient(1));
  });

  it('hits every named stop exactly at its offset', () => {
    for (const stop of VEIL_STOPS) {
      expect(sampleVeilGradient(stop.offset)).toEqual(stop.rgb);
    }
  });
});

describe('bloomIntensity', () => {
  it('is 1 at the ellipse center', () => {
    expect(bloomIntensity(0, 0, 400, 300)).toBe(1);
  });

  it('is 0 at the ellipse edge along both axes', () => {
    expect(bloomIntensity(400, 0, 400, 300)).toBe(0);
    expect(bloomIntensity(0, 300, 400, 300)).toBe(0);
  });

  it('is 0 (never negative) beyond the ellipse', () => {
    expect(bloomIntensity(800, 0, 400, 300)).toBe(0);
    expect(bloomIntensity(400, 300, 400, 300)).toBe(0);
  });

  it('decreases monotonically outward', () => {
    let prev = bloomIntensity(0, 0, 400, 300);
    for (let d = 40; d <= 400; d += 40) {
      const n = bloomIntensity(d, 0, 400, 300);
      expect(n).toBeLessThan(prev);
      prev = n;
    }
  });

  it('is elliptical — same normalized distance gives the same intensity', () => {
    // dx = rx/2 and dy = ry/2 are both "halfway out"
    expect(bloomIntensity(200, 0, 400, 300)).toBeCloseTo(
      bloomIntensity(0, 150, 400, 300),
      10,
    );
  });
});

describe('bloomAlpha', () => {
  it('has the 0.12 floor at zero intensity (soft outer reaches, no hard edge)', () => {
    expect(bloomAlpha(0)).toBeCloseTo(0.12, 10);
  });

  it('reaches (and caps at) full ink', () => {
    expect(bloomAlpha(1)).toBe(1);
    expect(bloomAlpha(2)).toBe(1);
  });

  it('never goes below the floor for negative intensity', () => {
    expect(bloomAlpha(-1)).toBeCloseTo(0.12, 10);
  });

  it('increases monotonically with intensity', () => {
    let prev = bloomAlpha(0);
    for (let n = 0.1; n <= 0.9; n += 0.1) {
      const a = bloomAlpha(n);
      expect(a).toBeGreaterThan(prev);
      prev = a;
    }
  });
});

describe('lensDisplacement', () => {
  it('leaves the dot exactly under the cursor untouched (no direction to push)', () => {
    expect(lensDisplacement(0, 0, 100, 20)).toEqual([0, 0]);
  });

  it('pushes dots directly away from the cursor', () => {
    const [ox, oy] = lensDisplacement(30, -40, 100, 20);
    // Same direction as the offset vector (away from the pointer)
    expect(ox).toBeGreaterThan(0);
    expect(oy).toBeLessThan(0);
    // Radial: offset is parallel to (dx, dy)
    expect(ox / 30).toBeCloseTo(oy / -40, 10);
  });

  it('decays quadratically with distance (Delphi profile)', () => {
    const near = Math.hypot(...lensDisplacement(20, 0, 100, 20));
    const mid = Math.hypot(...lensDisplacement(80, 0, 100, 20));
    expect(near).toBeGreaterThan(mid);
    // (1 - d/R)² exactly: d=20,R=100 → 0.8² · 20 = 12.8
    expect(near).toBeCloseTo(12.8, 10);
    expect(mid).toBeCloseTo(0.8, 10);
  });

  it('is exactly zero at and beyond the lens radius (compact support)', () => {
    expect(lensDisplacement(100, 0, 100, 20)).toEqual([0, 0]);
    expect(lensDisplacement(300, 0, 100, 20)).toEqual([0, 0]);
  });

  it('never exceeds the configured strength', () => {
    for (let d = 1; d < 300; d += 7) {
      expect(Math.hypot(...lensDisplacement(d, 0, 100, 20))).toBeLessThanOrEqual(20);
    }
  });

  it('scales linearly with strength (so the lens can ease in and out)', () => {
    const full = lensDisplacement(50, 50, 100, 20);
    const half = lensDisplacement(50, 50, 100, 10);
    expect(half[0]).toBeCloseTo(full[0] / 2, 10);
    expect(half[1]).toBeCloseTo(full[1] / 2, 10);
  });
});
