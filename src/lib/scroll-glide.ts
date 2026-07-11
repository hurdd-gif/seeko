/**
 * A critically-damped scroll chase: scrollTop moves a fixed fraction of the
 * remaining distance toward `target` each frame, which is what makes a
 * drag-to-scrub feel wired to the hand instead of teleporting per detent.
 * Used by the legal-page tick rail; extracted so the loop's exit conditions
 * are unit-testable.
 *
 * The exits are the whole point. A naive chase with a single "close enough"
 * threshold can run forever: browsers quantize scrollTop writes to device
 * pixels, so near the target the per-frame increment (delta * factor) rounds
 * to zero movement while |delta| is still above the threshold — the loop
 * idles eternally, re-pinning scrollTop and locking the page against wheel
 * and keyboard scroll. This helper treats three situations as "done" once
 * the hand is gone (isHeld() false):
 *
 *   1. settled  — |delta| < 0.5px: snap to target and stop.
 *   2. stalled  — a write produced no movement (quantization): as settled
 *                 as the hardware allows; stop where we are.
 *   3. usurped  — something else moved the scroller between our frames
 *                 (wheel, keyboard, anchor jump): the user wins; stop
 *                 without pulling back.
 *
 * While held, all three keep idling — the next pointermove only retargets,
 * and a stall must stay alive so a retarget can resume the chase.
 */

type ScrollBox = Pick<HTMLElement, 'scrollTop'>;

export type ScrollGlide = {
  /** Point the chase somewhere new (each pointermove during a scrub). */
  retarget: (top: number) => void;
  /** Kill the loop immediately (unmount, or superseded by a new glide). */
  stop: () => void;
  /** False once any exit has fired — used only by tests and diagnostics. */
  readonly active: boolean;
};

export function startScrollGlide({
  getEl,
  isHeld,
  factor,
  raf = cb => requestAnimationFrame(cb),
  caf = id => cancelAnimationFrame(id),
}: {
  /** Re-read every frame so a mid-glide unmount stops the loop. */
  getEl: () => ScrollBox | null;
  /** True while the pointer is still down on the scrub surface. */
  isHeld: () => boolean;
  /** Fraction of the remaining distance per frame; 1 tracks 1:1 (reduced motion). */
  factor: number;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
}): ScrollGlide {
  let target = getEl()?.scrollTop ?? 0;
  // scrollTop exactly as we left it last frame (post-quantization read-back);
  // any difference at the top of a frame means someone else scrolled.
  let last: number | null = null;
  let rafId = 0;
  let active = true;

  const stop = () => {
    if (!active) return;
    active = false;
    caf(rafId);
  };

  const tick = () => {
    if (!active) return;
    const el = getEl();
    if (!el) {
      stop();
      return;
    }
    const held = isHeld();
    if (!held && last !== null && el.scrollTop !== last) {
      stop(); // usurped
      return;
    }
    const delta = target - el.scrollTop;
    if (Math.abs(delta) < 0.5) {
      el.scrollTop = target;
      if (!held) {
        stop(); // settled
        return;
      }
    } else {
      const before = el.scrollTop;
      el.scrollTop = before + delta * factor;
      if (!held && el.scrollTop === before) {
        // stalled — incremental writes can't get closer, but a direct write
        // of the target lands as near as the hardware allows.
        el.scrollTop = target;
        stop();
        return;
      }
    }
    last = el.scrollTop;
    rafId = raf(tick);
  };
  rafId = raf(tick);

  return {
    retarget: top => {
      target = top;
    },
    stop,
    get active() {
      return active;
    },
  };
}
