/* ─────────────────────────────────────────────────────────
 * AssigneePopover — quick-assign menu for a task card.
 *
 * Same portal pattern as PropertyPopover/DatePopover: panel is
 * portaled to document.body with fixed coordinates measured from
 * the trigger's bounding rect, so it can't be clipped by the card's
 * overflow-hidden parent or the column tray.
 *
 * Rows:
 *   • "No assignee"               (selectable; passes null)
 *   • <team member>               (selectable; passes profile.id)
 *   • separator
 *   • "New user"                  (stub; disabled, tooltip)
 *   • "Invite and assign…"        (stub; disabled, tooltip)
 *
 * The trigger swallows pointerdown/click so the parent card click
 * (which opens the right rail) doesn't fire when opening the menu.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, UserPlus, Send, CircleDashed } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };
const PANEL_WIDTH = 240;
const GAP = 4;
const EDGE = 8;

type Coords = { left: number; top: number };

function computeCoords(rect: DOMRect, panelHeight: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Right-align with the trigger (assignee chips sit at the card's right edge).
  let left = rect.right - PANEL_WIDTH;
  if (left + PANEL_WIDTH + EDGE > vw) left = vw - PANEL_WIDTH - EDGE;
  if (left < EDGE) left = EDGE;

  let top = rect.bottom + GAP;
  if (top + panelHeight + EDGE > vh) {
    const above = rect.top - GAP - panelHeight;
    top = above >= EDGE ? above : Math.max(EDGE, vh - panelHeight - EDGE);
  }
  return { left, top };
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AssigneePopover({
  value,
  team,
  onSelect,
  ariaLabel,
  children,
}: {
  /** Current assignee id, or null/undefined for unassigned. */
  value: string | null | undefined;
  team: Profile[];
  /** Called with the chosen profile id, or null to unassign. */
  onSelect: (next: string | null) => void;
  ariaLabel: string;
  /** Trigger content — usually the assignee avatar/fallback. */
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

  const panel = (
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={panelRef}
          key="assignee-panel"
          role="menu"
          aria-label={ariaLabel}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduce ? { duration: 0 } : SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: PANEL_WIDTH }}
          className="z-[200] origin-top-right overflow-hidden rounded-lg bg-white p-1 shadow-seeko-pop"
        >
          <div className="max-h-[320px] overflow-y-auto [scrollbar-width:thin]">
            {/* No assignee */}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!value}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-[#b8b8b8]">
                <CircleDashed className="size-4" strokeWidth={1.5} />
              </span>
              <span className="flex-1 truncate text-[12.5px] text-[#1a1a1a]">No assignee</span>
              {!value && <Check className="size-3 text-[#0d7aff]" strokeWidth={3} />}
            </button>

            {/* Team members */}
            {team.map((p) => {
              const selected = value === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(p.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
                >
                  <Avatar className="size-5 shrink-0 ring-1 ring-black/[0.04]">
                    <AvatarImage src={p.avatar_url ?? undefined} alt={p.display_name ?? ''} />
                    <AvatarFallback className="bg-[#e5e5e5] text-[8px] font-medium text-[#505050]">
                      {initials(p.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-[12.5px] text-[#1a1a1a]">
                    {p.display_name ?? 'Unnamed'}
                  </span>
                  {selected && <Check className="size-3 text-[#0d7aff]" strokeWidth={3} />}
                </button>
              );
            })}
          </div>

          {/* Stub actions — disabled for now */}
          <div className="mt-1 border-t border-black/[0.05] pt-1">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-left opacity-50"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-[#9a9a9a]">
                <UserPlus className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="flex-1 truncate text-[12.5px] text-[#9a9a9a]">New user</span>
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-left opacity-50"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-[#9a9a9a]">
                <Send className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="flex-1 truncate text-[12.5px] text-[#9a9a9a]">Invite and assign…</span>
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
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="-m-0.5 inline-flex items-center justify-center rounded-full p-0.5 transition-colors hover:bg-black/[0.04]"
      >
        {children}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
