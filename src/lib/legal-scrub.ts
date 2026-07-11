/**
 * One frame of the legal tick-rail drag-to-scrub glide loop.
 *
 * The scroller's `scrollTop` chases `target` a `factor` fraction per frame
 * (critically damped), snapping exactly onto `target` once within half a pixel.
 *
 * The load-bearing rule: the loop STOPS the instant the pointer is released
 * (`dragging === false`) and does NOT move scroll on that frame. Letting the
 * loop keep owning `scrollTop` past release is what caused the scroll-lock bug —
 * a missed pointerup, or the user's own scroll during the settle, fought the
 * loop and the page could no longer be scrolled. Ending on release hands scroll
 * control straight back to the user.
 */
export function glideStep(
  scrollTop: number,
  target: number,
  factor: number,
  dragging: boolean,
): { scrollTop: number; done: boolean } {
  if (!dragging) return { scrollTop, done: true };
  const delta = target - scrollTop;
  const next = scrollTop + (Math.abs(delta) < 0.5 ? delta : delta * factor);
  return { scrollTop: next, done: false };
}
