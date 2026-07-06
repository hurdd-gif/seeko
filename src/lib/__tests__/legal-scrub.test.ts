import { describe, it, expect } from 'vitest';
import { glideStep } from '../legal-scrub';

describe('glideStep — legal tick-rail scrub glide loop', () => {
  it('stops immediately once the pointer is released (dragging=false), without moving scroll', () => {
    // Regression: the drag-to-scrub loop used to keep owning scrollTop after
    // release until it happened to reach target. A missed pointerup, or the
    // user's own scroll during the settle, then fought it and the page read as
    // scroll-locked. On release the loop must stop AND not touch scroll.
    const r = glideStep(120, 900, 0.22, false);
    expect(r.done).toBe(true);
    expect(r.scrollTop).toBe(120);
  });

  it('chases the target by `factor` per frame while dragging', () => {
    const r = glideStep(100, 500, 0.22, true);
    expect(r.done).toBe(false);
    expect(r.scrollTop).toBeCloseTo(188, 5); // 100 + (500 - 100) * 0.22
  });

  it('lands exactly on target within half a pixel, and keeps idling while held', () => {
    const r = glideStep(499.7, 500, 0.22, true);
    expect(r.done).toBe(false);
    expect(r.scrollTop).toBeCloseTo(500, 5);
  });
});
