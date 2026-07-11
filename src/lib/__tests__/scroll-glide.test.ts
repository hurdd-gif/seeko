import { describe, expect, it } from 'vitest';
import { startScrollGlide } from '../scroll-glide';

/**
 * Test rig: a fake scroller whose scrollTop quantizes writes the way real
 * browsers do (nearest device-pixel step — 0.5px on the machines that
 * reproduced the bug), plus a manual rAF pump so frames advance only when
 * the test says so.
 */
function rig({ scrollTop = 0, step = 0.5 } = {}) {
  let top = scrollTop;
  const el = {
    get scrollTop() {
      return top;
    },
    set scrollTop(v: number) {
      top = Math.round(v / step) * step;
    },
  };
  const frames: Array<FrameRequestCallback | null> = [];
  const raf = (cb: FrameRequestCallback) => frames.push(cb);
  const caf = (id: number) => {
    frames[id - 1] = null;
  };
  let next = 0;
  const pump = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const cb = frames[next++];
      if (cb) cb(next * 16);
      if (next >= frames.length) break;
    }
  };
  const pending = () => frames.slice(next).some(Boolean);
  return { el, raf, caf, pump, pending };
}

describe('startScrollGlide', () => {
  it('chases the target exponentially and snaps + stops once settled with the hand gone', () => {
    const { el, raf, caf, pump, pending } = rig();
    const glide = startScrollGlide({ getEl: () => el, isHeld: () => false, factor: 0.22, raf, caf });
    glide.retarget(400);
    pump(60);
    expect(el.scrollTop).toBe(400);
    expect(glide.active).toBe(false);
    expect(pending()).toBe(false);
  });

  it('keeps idling while held, then settles and stops after release', () => {
    const { el, raf, caf, pump, pending } = rig();
    let held = true;
    const glide = startScrollGlide({ getEl: () => el, isHeld: () => held, factor: 0.22, raf, caf });
    glide.retarget(400);
    pump(80);
    expect(el.scrollTop).toBeGreaterThanOrEqual(399); // parked within a device pixel
    expect(glide.active).toBe(true); // pointer still down — stay wired to the hand
    held = false;
    pump(3);
    expect(el.scrollTop).toBe(400); // release snaps the last stalled pixel
    expect(glide.active).toBe(false);
    expect(pending()).toBe(false);
  });

  it('THE BUG: a quantization stall (write rounds to no movement, |delta| still ≥ 0.5) must stop the loop after release, not pin the scroller forever', () => {
    // Real repro: scroller parked at 2017.5 with a fractional target ~2018.2.
    // delta ≈ 0.7 → increment ≈ 0.15 → rounds back to 2017.5 every frame, so
    // the |delta| < 0.5 settle exit never fires and the rAF loop ran forever,
    // re-pinning scrollTop and locking the page against wheel scroll.
    const { el, raf, caf, pump, pending } = rig({ scrollTop: 2017.5 });
    const glide = startScrollGlide({ getEl: () => el, isHeld: () => false, factor: 0.22, raf, caf });
    glide.retarget(2018.2);
    pump(20);
    expect(glide.active).toBe(false);
    expect(pending()).toBe(false);
    expect(el.scrollTop).toBe(2018); // snapped as close as the hardware allows — and released
  });

  it('a quantization stall while still held keeps idling (retarget must be able to resume the chase)', () => {
    const { el, raf, caf, pump } = rig({ scrollTop: 2017.5 });
    let held = true;
    const glide = startScrollGlide({ getEl: () => el, isHeld: () => held, factor: 0.22, raf, caf });
    glide.retarget(2018.2);
    pump(10);
    expect(glide.active).toBe(true); // hand still down — stay alive
    glide.retarget(2400);
    pump(60);
    expect(el.scrollTop).toBeGreaterThan(2300); // chase resumed
  });

  it('yields to external scroll (wheel/keyboard) during the post-release settle instead of fighting it', () => {
    const { el, raf, caf, pump } = rig();
    const glide = startScrollGlide({ getEl: () => el, isHeld: () => false, factor: 0.22, raf, caf });
    glide.retarget(1000);
    pump(3); // mid-glide
    const midway = el.scrollTop;
    el.scrollTop = midway + 300; // user wheels
    pump(5);
    expect(glide.active).toBe(false);
    expect(el.scrollTop).toBe(midway + 300); // user's position wins — no pull-back
  });

  it('stop() cancels the pending frame and further retargets are inert', () => {
    const { el, raf, caf, pump, pending } = rig();
    const glide = startScrollGlide({ getEl: () => el, isHeld: () => true, factor: 0.22, raf, caf });
    glide.retarget(500);
    pump(2);
    glide.stop();
    const at = el.scrollTop;
    glide.retarget(900);
    pump(10);
    expect(el.scrollTop).toBe(at);
    expect(pending()).toBe(false);
  });

  it('stops cleanly when the element disappears (route unmount mid-glide)', () => {
    const { el, raf, caf, pump, pending } = rig();
    let mounted = true;
    const glide = startScrollGlide({
      getEl: () => (mounted ? el : null),
      isHeld: () => false,
      factor: 0.22,
      raf,
      caf,
    });
    glide.retarget(1000);
    pump(2);
    mounted = false;
    pump(3);
    expect(glide.active).toBe(false);
    expect(pending()).toBe(false);
  });
});
