'use client';

/* ─────────────────────────────────────────────────────────
 * BOARD SCROLLBAR — custom horizontal scroll indicator
 *
 * The board scroller's native bars are hidden (.scrollbar-none);
 * this overlay speaks the page's own control vocabulary instead:
 * a white pill (the segmented-control thumb) riding a quiet ink
 * channel, inset to the board's px-6 gutter.
 *
 *   hidden    opacity 0 — no horizontal scroll in the last beat
 *   awake     4px channel + white pill · horizontal scroll wakes it
 *   engaged   hover or drag grows the strip to 8px
 *   …900ms after the last horizontal movement it fades back out
 *
 * Vertical scrolling never wakes it. Thumb position is written as
 * a transform straight from scroll events — no per-frame React
 * state. Dragging is 1:1 with pointer capture and the grab offset
 * respected; pressing the channel jumps the view there and hands
 * off into the same drag.
 * ───────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from 'react';

const BAR = {
  restHeight: 4, //   px — channel at rest
  engagedHeight: 8, //px — channel while hovered/dragged
  hitHeight: 20, //   px — invisible interactive strip (edge bar, macOS-sized)
  minThumb: 56, //    px — floor so the pill stays grabbable
  idleFadeMs: 900, // ms of horizontal stillness before fading out
  keyStep: 160, //    px per arrow-key press (≈ half a column)
} as const;

export function BoardScrollbar({
  scrollerRef,
}: {
  scrollerRef: React.RefObject<HTMLElement | null>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [awake, setAwake] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const hoveredRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; grabOffset: number } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLeftRef = useRef(0);

  /* Geometry: thumb width from the visible fraction, position from
     scrollLeft — written directly to the element, never through state. */
  const sync = useCallback(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    setHasOverflow(max > 1);
    if (max <= 1 || !track || !thumb) return;
    const trackW = track.clientWidth;
    const thumbW = Math.max(
      BAR.minThumb,
      (scroller.clientWidth / scroller.scrollWidth) * trackW,
    );
    const x = (scroller.scrollLeft / max) * (trackW - thumbW);
    thumb.style.width = `${thumbW}px`;
    thumb.style.transform = `translateX(${x}px)`;
    track.setAttribute(
      'aria-valuenow',
      String(Math.round((scroller.scrollLeft / max) * 100)),
    );
  }, [scrollerRef]);

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!hoveredRef.current && !dragRef.current) setAwake(false);
    }, BAR.idleFadeMs);
  }, []);

  const wake = useCallback(() => {
    setAwake(true);
    scheduleIdle();
  }, [scheduleIdle]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    lastLeftRef.current = scroller.scrollLeft;
    sync();
    const onScroll = () => {
      sync();
      // Only horizontal movement wakes the bar — vertical scroll is not its business.
      if (scroller.scrollLeft !== lastLeftRef.current) {
        lastLeftRef.current = scroller.scrollLeft;
        wake();
      }
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(scroller);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [scrollerRef, sync, wake]);

  const scrollLeftForThumbLeft = (thumbLeft: number) => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scroller || !track || !thumb) return 0;
    const range = track.clientWidth - thumb.offsetWidth;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (range <= 0) return 0;
    return (Math.min(Math.max(thumbLeft, 0), range) / range) * max;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scroller || !track || !thumb || e.button !== 0) return;
    const thumbRect = thumb.getBoundingClientRect();
    const onThumb = e.clientX >= thumbRect.left && e.clientX <= thumbRect.right;
    // Grab the pill where the pointer landed; a channel press jumps the
    // pill under the pointer and hands off into the same drag.
    const grabOffset = onThumb
      ? e.clientX - thumbRect.left
      : thumb.offsetWidth / 2;
    if (!onThumb) {
      const trackLeft = track.getBoundingClientRect().left;
      scroller.scrollLeft = scrollLeftForThumbLeft(
        e.clientX - trackLeft - grabOffset,
      );
    }
    dragRef.current = { pointerId: e.pointerId, grabOffset };
    track.setPointerCapture(e.pointerId);
    setEngaged(true);
    setAwake(true);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !scroller || !track) return;
    const trackLeft = track.getBoundingClientRect().left;
    scroller.scrollLeft = scrollLeftForThumbLeft(
      e.clientX - trackLeft - drag.grabOffset,
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!hoveredRef.current) setEngaged(false);
    scheduleIdle();
  };

  if (!hasOverflow) return null;

  const stripHeight = engaged ? BAR.engagedHeight : BAR.restHeight;

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-controls="board-scroller"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onPointerEnter={() => {
        hoveredRef.current = true;
        setEngaged(true);
        setAwake(true);
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        if (!dragRef.current) {
          setEngaged(false);
          scheduleIdle();
        }
      }}
      onKeyDown={(e) => {
        // Keyboard steps are instant — no animation on repeatable key actions.
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          scrollerRef.current?.scrollBy({
            left: e.key === 'ArrowLeft' ? -BAR.keyStep : BAR.keyStep,
          });
          e.preventDefault();
        }
      }}
      className="absolute inset-x-6 bottom-1 z-30 flex touch-none items-end outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/40"
      style={{
        height: BAR.hitHeight,
        opacity: awake ? 1 : 0,
        // Opacity fade + channel growth only — both interruptible mid-flight.
        transition: 'opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      <div
        className="relative w-full overflow-visible rounded-full bg-wash-5"
        style={{
          height: stripHeight,
          transition: 'height 160ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <div
          ref={thumbRef}
          className="shadow-seeko absolute inset-y-0 left-0 rounded-full bg-surface-1"
        />
      </div>
    </div>
  );
}
