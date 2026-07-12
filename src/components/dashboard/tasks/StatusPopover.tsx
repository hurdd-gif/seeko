/* ─────────────────────────────────────────────────────────
 * StatusPopover — quick status switcher anchored to a task card's
 * status dot. Picking a status moves the card to that column.
 *
 * Same portal pattern as AssigneePopover/PropertyPopover: the panel is
 * portaled to document.body with fixed coordinates measured from the
 * trigger's bounding rect, so it can't be clipped by the card's
 * overflow-hidden parent or the column tray.
 *
 * Why a dedicated component instead of PropertyPopover directly:
 * PropertyPopover's trigger does NOT stopPropagation, so dropped onto a
 * card whose onClick navigates to /tasks/[id], clicking the dot would
 * BOTH open the menu AND route away. This mirrors AssigneePopover, whose
 * trigger deliberately swallows pointerdown + click (and here also keydown)
 * so the card click never fires when changing status. Rows reuse the exact
 * PropertyPopover row styling (menuitemradio, StatusDot leading glyph,
 * accent check) so the two card popovers read as siblings.
 *
 * Origin: the status dot sits at the card's LEFT, so the panel left-aligns
 * to the trigger and scales from origin-top-left (vs AssigneePopover's
 * origin-top-right, since the avatar sits at the card's right).
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import type { TaskStatus } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { StatusDot } from './StatusDot';

/** Matches PropertyPopover / AssigneePopover spring (340/30). */
const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };
const PANEL_WIDTH = 200;
const GAP = 4;
const EDGE = 8;

type Coords = { left: number; top: number };

function computeCoords(rect: DOMRect, panelHeight: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Left-align with the trigger (the status dot sits at the card's left edge).
  let left = rect.left;
  if (left + PANEL_WIDTH + EDGE > vw) left = vw - PANEL_WIDTH - EDGE;
  if (left < EDGE) left = EDGE;

  // Prefer below the trigger; flip above if it would clip the viewport.
  let top = rect.bottom + GAP;
  if (top + panelHeight + EDGE > vh) {
    const above = rect.top - GAP - panelHeight;
    top = above >= EDGE ? above : Math.max(EDGE, vh - panelHeight - EDGE);
  }
  return { left, top };
}

export function StatusPopover({
  value,
  onSelect,
  ariaLabel,
  children,
}: {
  /** Current status. */
  value: TaskStatus;
  /** Called with the chosen status. */
  onSelect: (next: TaskStatus) => void;
  ariaLabel: string;
  /** Trigger content — the status dot. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const h = panelRef.current?.offsetHeight ?? 280;
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

  const panel = (
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={panelRef}
          key="status-panel"
          role="menu"
          aria-label={ariaLabel}
          initial={reduce ? false : { opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
          transition={reduce ? { duration: 0 } : SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: PANEL_WIDTH }}
          className="z-[200] origin-top-left overflow-hidden rounded-[14px] bg-surface-1 p-1 shadow-seeko-pop"
        >
          <div className="max-h-[320px] overflow-y-auto [scrollbar-width:thin]">
            {TASK_STATUSES.map((s) => {
              const selected = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (s !== value) onSelect(s);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left transition-colors hover:bg-wash-4 hover:text-ink-title ${selected ? 'text-ink-title' : 'text-ink-body'}`}
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    <StatusDot status={s} size="sm" />
                  </span>
                  <span className="flex-1 truncate text-[13px]">{s}</span>
                  {selected && <Check className="size-3 text-seeko-accent" strokeWidth={3} />}
                </button>
              );
            })}
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
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        // Swallow the gesture so the parent card's onClick (navigate) and
        // its Enter/Space keydown handler never fire when toggling status.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="-m-1 flex items-center justify-center rounded-full p-1 transition-[background-color,transform] duration-150 ease-out hover:bg-wash-5 motion-safe:active:scale-[0.95]"
      >
        {children}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
