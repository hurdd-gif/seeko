/* ─────────────────────────────────────────────────────────
 * PropertyPopover — single-select popover anchored to a row trigger.
 *
 * The panel is portaled to document.body and positioned with
 * fixed coordinates measured from the trigger's bounding rect.
 * This is what keeps it from being clipped by the RailSection's
 * overflow-hidden card (or the rail's outer scroll container).
 *
 * Used by PropertiesSection for admin edits: click a property row →
 * opens a small popover with options → selecting writes via the
 * provided callback.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };

/** Panel width in px — kept in sync with the visual w-56 class (224px). */
const PANEL_WIDTH = 224;
/** Vertical gap between trigger and panel. */
const GAP = 4;
/** Safety margin from viewport edges. */
const EDGE = 8;

export type PropertyOption<V extends string> = {
  value: V | null;
  label: string;
  leading?: ReactNode;
};

type Coords = { left: number; top: number };
type Align = 'start' | 'end';

function computeCoords(
  triggerRect: DOMRect,
  panelHeight: number,
  panelWidth: number,
  align: Align,
): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer trigger-aligned; clamp to viewport.
  let left = align === 'end' ? triggerRect.right - panelWidth : triggerRect.left;
  if (left + panelWidth + EDGE > vw) left = vw - panelWidth - EDGE;
  if (left < EDGE) left = EDGE;

  // Prefer below the trigger; flip above if it would clip.
  let top = triggerRect.bottom + GAP;
  if (top + panelHeight + EDGE > vh) {
    const above = triggerRect.top - GAP - panelHeight;
    if (above >= EDGE) top = above;
    else top = Math.max(EDGE, vh - panelHeight - EDGE);
  }

  return { left, top };
}

export function PropertyPopover<V extends string>({
  value,
  options,
  onSelect,
  ariaLabel,
  children,
  allowClear = false,
  triggerClassName,
  panelWidth = PANEL_WIDTH,
  align = 'start',
  panelClassName,
  optionClassName,
  labelClassName,
  leadingClassName,
}: {
  value: V | null | undefined;
  options: PropertyOption<V>[];
  onSelect: (next: V | null) => void;
  ariaLabel: string;
  children: ReactNode;
  /** When true, an "Unassigned" / clear row appears at the top. */
  allowClear?: boolean;
  /** Override the default row-style trigger button styling. When set, this
   *  replaces the default classes entirely — supply your own layout. Use
   *  for inline-flex pill triggers in the composer. */
  triggerClassName?: string;
  /** Panel width in px. Defaults to the task-detail menu width. */
  panelWidth?: number;
  /** How the panel aligns to its trigger. */
  align?: Align;
  /** Optional styling overrides for smaller embedded popovers. */
  panelClassName?: string;
  optionClassName?: string;
  labelClassName?: string;
  leadingClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Measure & position whenever opened or the viewport changes.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      // Use panel's actual rendered height if available; otherwise assume a reasonable default.
      const panelH = panelRef.current?.offsetHeight ?? 320;
      setCoords(computeCoords(rect, panelH, panelWidth, align));
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, panelWidth, align]);

  // Dismiss: click outside or Escape.
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

  const finalOptions: PropertyOption<V | ''>[] = allowClear
    ? [{ value: '' as V | '', label: 'Unassigned' }, ...(options as PropertyOption<V | ''>[])]
    : (options as PropertyOption<V | ''>[]);

  const panel = (
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={panelRef}
          key="panel"
          role="menu"
          aria-label={ariaLabel}
          data-property-popover-panel="true"
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduce ? { duration: 0 } : SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: panelWidth }}
          className={
            panelClassName ??
            'z-[200] origin-top-left overflow-hidden rounded-[14px] bg-surface-1 p-1 shadow-seeko-pop'
          }
        >
          <div className="max-h-[360px] overflow-y-auto [scrollbar-width:thin]">
            {finalOptions.map((opt) => {
              const selected = (value ?? '') === (opt.value ?? '');
              return (
                <button
                  key={String(opt.value ?? '__none__')}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onSelect(opt.value === '' ? null : (opt.value as V));
                    setOpen(false);
                  }}
                  className={
                    optionClassName ??
                    `flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left transition-colors hover:bg-wash-4 hover:text-ink-title ${selected ? 'text-ink-title' : 'text-ink-body'}`
                  }
                >
                  {opt.leading && (
                    <span
                      className={
                        leadingClassName ?? 'flex size-3.5 shrink-0 items-center justify-center'
                      }
                    >
                      {opt.leading}
                    </span>
                  )}
                  <span
                    className={
                      labelClassName ?? 'flex-1 truncate text-[13px]'
                    }
                  >
                    {opt.label}
                  </span>
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
