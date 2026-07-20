/* ─────────────────────────────────────────────────────────
 * DatePopover — calendar popover anchored to a row trigger.
 *
 * Same portal pattern as PropertyPopover: panel is portaled to
 * document.body with position: fixed coordinates from the trigger's
 * bounding rect, so it can't be clipped by the rail's overflow-hidden
 * cards. Used by PropertiesSection for the Deadline row.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };
const PANEL_WIDTH = 260;
const GAP = 4;
const EDGE = 8;

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

type Coords = { left: number; top: number };

function computeCoords(rect: DOMRect, panelHeight: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.left;
  if (left + PANEL_WIDTH + EDGE > vw) left = vw - PANEL_WIDTH - EDGE;
  if (left < EDGE) left = EDGE;

  let top = rect.bottom + GAP;
  if (top + panelHeight + EDGE > vh) {
    const above = rect.top - GAP - panelHeight;
    top = above >= EDGE ? above : Math.max(EDGE, vh - panelHeight - EDGE);
  }
  return { left, top };
}

export function DatePopover({
  value,
  onChange,
  ariaLabel,
  children,
  triggerClassName,
}: {
  /** ISO date string (YYYY-MM-DD) or null. */
  value: string | null | undefined;
  /** Called with the new ISO date or null when cleared. */
  onChange: (next: string | null) => void;
  ariaLabel: string;
  children: ReactNode;
  /** Override the default row-style trigger styling for inline-flex pills. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => parseISO(value), [value]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => setMounted(true), []);

  // Reset the visible month each time the popover opens so it shows the
  // currently-selected date (or today) instead of a stale month.
  useEffect(() => {
    if (!open) return;
    const base = selected ?? new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [open, selected]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const h = panelRef.current?.offsetHeight ?? 320;
      setCoords(computeCoords(trigger.getBoundingClientRect(), h));
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const panel = (
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={panelRef}
          key="date-panel"
          role="dialog"
          aria-label={ariaLabel}
          /* Marker for container popovers (MilestoneEditPopover): the panel is
             portaled to body, so a parent's outside-click handler must be able
             to recognize clicks in here as "inside". */
          data-date-popover-panel=""
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduce ? { duration: 0 } : SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: PANEL_WIDTH }}
          className="z-[200] origin-top-left overflow-hidden rounded-[14px] bg-overlay p-2.5 shadow-seeko-pop"
        >
          {/* Month nav */}
          <div className="flex items-center justify-between px-1 pb-2">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              aria-label="Previous month"
              className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-wash-4 hover:text-ink-title"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="text-[12px] font-medium tabular-nums text-ink-title">
              {MONTHS[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              aria-label="Next month"
              className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-wash-4 hover:text-ink-title"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5 pb-1">
            {WEEKDAYS.map((d, i) => (
              <span
                key={i}
                className="flex h-6 items-center justify-center text-[10px] font-medium text-ink-faintest"
              >
                {d}
              </span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} className="h-7" />;
              const iso = toISO(d);
              const isSelected = iso === value;
              const isToday = d.getTime() === today.getTime();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={
                    isSelected
                      ? 'flex h-7 items-center justify-center rounded-md bg-seeko-accent text-[12px] font-medium tabular-nums text-white transition-colors'
                      : isToday
                      ? 'flex h-7 items-center justify-center rounded-md text-[12px] font-medium tabular-nums text-seeko-accent transition-colors hover:bg-seeko-accent/[0.08]'
                      : 'flex h-7 items-center justify-center rounded-md text-[12px] tabular-nums text-ink-body transition-colors hover:bg-wash-4 hover:text-ink-title'
                  }
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="mt-2 flex items-center justify-between border-t border-wash-5 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-[11.5px] text-ink-muted transition-colors hover:bg-wash-4 hover:text-ink-title"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(toISO(today));
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-[11.5px] text-ink-title transition-colors hover:bg-wash-4"
            >
              Today
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ??
          '-mx-1.5 -my-0.5 flex w-[calc(100%+12px)] min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-wash-4'
        }
      >
        {children}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
