/* ─────────────────────────────────────────────────────────
 * BoardFilterBar — Delphi's filter-bar pattern, on the board.
 * Reference: https://build.delphi.ai/system/filter-bar
 *
 * WHAT IT REPLACES. BoardFilterPopover put every facet inside one dropdown and
 * reported the result as a bare number on the trigger: "3". Which three? You had
 * to reopen the menu to find out, and to drop just one of them you had to hunt
 * it down among four scrolling sections. The filter was legible only while you
 * were editing it — the rest of the time the board was quietly lying about how
 * much of itself it was showing.
 *
 * Delphi's answer, which this follows: the trigger opens a ROW OF CHIPS, one per
 * facet, and each chip carries its own values in its own body — `Status │ Todo
 * or In Progress`. The state of the filter is the appearance of the bar. Each
 * chip clears itself (inline ×), so removing one facet never means re-navigating
 * the others.
 *
 * FAITHFUL TO THE REFERENCE
 *   · trigger and content are SIBLINGS, not nested — the trigger rides in the
 *     header toolbar, the row unfolds beneath it (LightShell's `subBar` slot)
 *   · chips: 32px tall, rounded-full, 12px side padding, 14px/500, 1.5 gap
 *   · inactive = 1px hairline border, transparent fill
 *   · active   = NO border, tinted fill — the border would fight the fill
 *   · active values live inside the chip after a │ divider, in accent blue,
 *     multiple values joined with "or"
 *   · no shadows anywhere on the bar; 150ms ease-out
 *
 * TRANSLATED, NOT COPIED: Delphi's sand palette and `bg-info` become our wash
 * tokens and --color-seeko-accent, and the row sits on the app's 52px chrome
 * gutter rather than Delphi's 16px. Delphi's trigger lives at the left of its
 * bar, so its chips unfold left; ours lives at the right of the toolbar, so the
 * chips are RIGHT-aligned — a drawer opens under its own handle, and a row
 * pinned to the opposite corner from the button that summoned it reads as an
 * unrelated second nav.
 *
 * ANIMATION STORYBOARD
 *    0ms   trigger flips to its active tint
 *    0ms   row unfolds (height 0 → auto, 200ms ease-out-quart)
 *    0ms   chips fade in over it (150ms) — opacity only, no y. A slide layered on
 *          top of a clip-reveal is two motions on the same pixels, and the eye
 *          reads the disagreement as stutter.
 *  exit    same transition, reversed. The row never unmounts (see below).
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, CircleDashed, Filter, Shapes, SignalHigh, UserRound, X } from 'lucide-react';
import type { Priority, Profile, TaskStatus } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { PriorityIcon, PRIORITY_COLOR } from './PriorityIcon';

export type BoardFilterState = {
  status: TaskStatus[];
  priority: Priority[];
  department: string[];
  assignee: string[]; // profile.id
};

export const EMPTY_FILTER: BoardFilterState = {
  status: [],
  priority: [],
  department: [],
  assignee: [],
};

const PRIORITIES: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];

/** Delphi's chip transition: 150ms, ease-out-quart. */
const EASE_OUT_QUART = 'cubic-bezier(0.165, 0.84, 0.44, 1)';

/** Two values read as a sentence ("Todo or In Progress"); five don't. Past the
 *  cap the chip counts instead, so it can never outgrow the row it lives in. */
const VALUE_CAP = 2;

export function activeFilterCount(f: BoardFilterState): number {
  return f.status.length + f.priority.length + f.department.length + f.assignee.length;
}

/* ── Is the row unfolded? — state kept OUTSIDE React ─────────────────────────
 *
 * This is the fix for the choppy unfold, and it is worth explaining, because the
 * obvious diagnosis was wrong twice.
 *
 * The unfold dropped one ~58ms frame — four frames of dead air at the moment of
 * the click, then a perfectly smooth animation. It was not the animation. Raw
 * proof: setting the row's height by hand, in the console, with no React and no
 * Motion involved — the identical layout change, the whole board reflowing and
 * repainting under it — costs nothing (9.3ms, indistinguishable from an idle
 * frame). The browser was never the problem.
 *
 * The problem was that `open` was a useState in TasksBoard. TasksBoard renders
 * the board, the rail, the composer, the header actions and the agent pill, so
 * one boolean about a strip of chrome re-rendered all of it — in dev, where
 * StrictMode renders everything twice — inside the same frame the animation was
 * trying to start on.
 *
 * Only two components in the app care about this boolean: the trigger that flips
 * it and the row that obeys it. They are siblings across a shell (the trigger
 * rides in LightShell's toolbar, the row in its subBar slot), so there is no
 * common parent to hold the state that isn't also the entire page. So it lives
 * out here, and they subscribe. TasksBoard never re-renders for it now.
 * ─────────────────────────────────────────────────────────────────────────── */
let rowOpen = false;
const rowListeners = new Set<() => void>();

function setRowOpen(next: boolean) {
  if (next === rowOpen) return;
  rowOpen = next;
  rowListeners.forEach((l) => l());
}

function subscribeRowOpen(listener: () => void): () => void {
  rowListeners.add(listener);
  return () => rowListeners.delete(listener);
}

/** Module state outlives the mount, so a board that unmounts with the row open
 *  would come back open. Reset on unmount — see BoardFilterBar. */
export function resetFilterBar(): void {
  setRowOpen(false);
}

function useRowOpen(): boolean {
  return useSyncExternalStore(
    subscribeRowOpen,
    () => rowOpen,
    () => false, // SSR/hydration: always folded
  );
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/* ── Trigger — lives in the header toolbar, a sibling of the row ─────────── */

export function BoardFilterTrigger({ count }: { count: number }) {
  const open = useRowOpen();

  /* The trigger carries TWO facts, and Delphi's palette is what keeps them
     apart. In the reference, the "filters on" trigger is not merely highlighted
     — it turns BLUE (bg-info/10 + a blue glyph), because a filter that is on is
     not a panel that is open: it means the board is hiding rows from you, and
     that deserves the one saturated pixel in an otherwise monochrome toolbar.
       filters on   → accent tint, ANY fold state (the board is lying by omission)
       open, empty  → the toolbar's ordinary neutral pressed tint
       neither      → ghost
     Collapsing these into one gray "active" (what this had) said "something is
     going on here" for both, which is exactly the ambiguity the color removes. */
  const filtersOn = count > 0;
  const base =
    'relative flex size-9 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]';
  const tone = filtersOn
    ? 'bg-seeko-accent/10 text-seeko-accent hover:bg-seeko-accent/15'
    : open
      ? 'bg-wash-5 text-ink'
      : 'text-ink-muted-strong hover:bg-wash-4 hover:text-ink';
  return (
    <button
      type="button"
      aria-label="Filter tasks"
      aria-expanded={open}
      onClick={() => setRowOpen(!rowOpen)}
      className={`${base} ${tone}`}
    >
      <Filter className="size-4" />
      {/* The count only appears when the row is FOLDED. Open, the chips are the
          count — a badge next to them would be the same fact said twice. */}
      {count > 0 && !open && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-seeko-accent px-1 text-[10px] font-medium leading-none text-white tabular-nums ring-2 ring-[#eeeeee] dark:ring-[oklch(0.240_0_0)]">
          {count}
        </span>
      )}
    </button>
  );
}

/* ── The row ────────────────────────────────────────────────────────────── */

export function BoardFilterBar({
  filter,
  onChange,
  team,
}: {
  filter: BoardFilterState;
  onChange: (next: BoardFilterState) => void;
  team: Profile[];
}) {
  const open = useRowOpen();
  const reduce = useReducedMotion();
  const count = activeFilterCount(filter);

  // The store outlives this mount; leave it as we found it.
  useEffect(() => resetFilterBar, []);

  const statusOptions = TASK_STATUSES.map((s) => ({
    value: s,
    label: s,
    leading: <StatusDot status={s} size="sm" />,
  }));
  const priorityOptions = PRIORITIES.map((p) => ({
    value: p,
    label: p,
    leading: <PriorityIcon level={p} className="size-3.5" style={{ color: PRIORITY_COLOR[p] }} />,
  }));
  const departmentOptions = DEPARTMENTS.map((d) => ({ value: d, label: d }));
  const assigneeOptions = team.map((p) => ({ value: p.id, label: p.display_name ?? 'Unnamed' }));

  /* The row STAYS MOUNTED and animates between height 0 and auto. It used to
     mount on open (AnimatePresence), and that cost a measured 65.7ms on the
     first frame of every unfold — four chips, their icons, seven status dots and
     four priority glyphs all constructing inside the same frame the animation
     starts on, plus Motion's auto-height measure forcing a layout on top. Four
     frames of nothing, then motion: the "choppy" was one stall at the front, not
     a slow animation. Mounted, the open is a transition over DOM that is already
     built and already laid out.

     `inert` is what makes that safe: a height-0 row is still in the document, and
     without it the chips would stay tabbable and screen-reader-visible while the
     bar is folded shut. */
  return (
    <motion.div
      initial={false}
      animate={{ height: open ? 'auto' : 0 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: [0.165, 0.84, 0.44, 1] }}
      className="overflow-hidden"
      inert={!open}
    >
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.15, ease: 'easeOut' }}
        className="flex justify-end px-[52px] pt-1 pb-5"
        role="group"
        aria-label="Task filters"
      >
        {/* Right-aligned, under the trigger that opened it. A filter row is a
            drawer belonging to its handle — pinned hard-left it read as a second,
            unrelated nav, 1400px away from the button you pressed and aligned with
            the tabs it has nothing to do with. The chips now fall out of the
            funnel. min-w-0 + the inner scroller keep it honest when the facets
            outgrow the space. */}
        <div className="scrollbar-none flex min-w-0 items-center gap-2 overflow-x-auto">
          <FacetChip
            label="Status"
            icon={<CircleDashed className="size-3.5" strokeWidth={2} />}
            options={statusOptions}
            selected={filter.status}
            onToggle={(v) => onChange({ ...filter, status: toggle(filter.status, v) })}
            onClear={() => onChange({ ...filter, status: [] })}
          />
          <FacetChip
            label="Priority"
            icon={<SignalHigh className="size-3.5" strokeWidth={2} />}
            options={priorityOptions}
            selected={filter.priority}
            onToggle={(v) => onChange({ ...filter, priority: toggle(filter.priority, v) })}
            onClear={() => onChange({ ...filter, priority: [] })}
          />
          <FacetChip
            label="Department"
            icon={<Shapes className="size-3.5" strokeWidth={2} />}
            options={departmentOptions}
            selected={filter.department}
            onToggle={(v) => onChange({ ...filter, department: toggle(filter.department, v) })}
            onClear={() => onChange({ ...filter, department: [] })}
          />
          {assigneeOptions.length > 0 && (
            <FacetChip
              label="Assignee"
              icon={<UserRound className="size-3.5" strokeWidth={2} />}
              options={assigneeOptions}
              selected={filter.assignee}
              onToggle={(v) => onChange({ ...filter, assignee: toggle(filter.assignee, v) })}
              onClear={() => onChange({ ...filter, assignee: [] })}
            />
          )}

          {/* Appears only when there is something to clear — a permanently
              visible "Clear all" on an empty filter is a dead control. */}
          <AnimatePresence initial={false}>
            {count > 0 && (
              <motion.button
                key="clear-all"
                type="button"
                initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                transition={{ duration: reduce ? 0 : 0.15, ease: 'easeOut' }}
                onClick={() => onChange(EMPTY_FILTER)}
                className="ml-1 shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[13px] font-medium text-ink-muted transition-colors duration-150 ease-out hover:text-ink-title"
              >
                Clear all
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Chip ───────────────────────────────────────────────────────────────── */

type Option<T> = { value: T; label: string; leading?: React.ReactNode };

const MENU_WIDTH = 240;
const MENU_GAP = 8; // chip → menu
const VIEWPORT_MARGIN = 12; // never touch the window edge

/**
 * The menu escapes to a PORTAL, and its position is measured, not inherited.
 * It has to: the chip sits inside two nested clipping contexts — the row's
 * height-collapse wrapper (`overflow-hidden`, the thing that makes the bar
 * unfold) and the row's own `overflow-x-auto` — and an `absolute` child cannot
 * leave either one, no matter its z-index. That is why the dropdowns were
 * getting guillotined at the header's hairline. Nothing about the fix is
 * cosmetic; a popover simply cannot live inside a scroll container it must
 * overflow.
 */
function useAnchoredMenu(open: boolean, itemCount: number) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      // Chips are right-aligned under the trigger, so most of them sit near the
      // right edge: flip to right-alignment rather than let the menu run off.
      const flush = r.left + MENU_WIDTH > window.innerWidth - VIEWPORT_MARGIN;
      const left = flush
        ? Math.max(VIEWPORT_MARGIN, r.right - MENU_WIDTH)
        : r.left;
      const top = r.bottom + MENU_GAP;
      setPos({
        top,
        left,
        maxHeight: Math.max(160, window.innerHeight - top - VIEWPORT_MARGIN),
      });
    };
    place();
    window.addEventListener('resize', place);
    // capture: the board and the row are both scrollable ancestors.
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, itemCount]);

  return { anchorRef, pos };
}

function FacetChip<T extends string>({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  icon: React.ReactNode;
  options: Option<T>[];
  selected: T[];
  onToggle: (v: T) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);
  const { anchorRef, pos } = useAnchoredMenu(open, options.length);
  const active = selected.length > 0;

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const t = e.target as Node;
      // The menu is portalled out of the chip's subtree, so "inside" is now two
      // separate elements, not one wrapper.
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
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
  }, [open, anchorRef]);

  const labelFor = (v: T) => options.find((o) => o.value === v)?.label ?? String(v);
  const shown = selected.slice(0, VALUE_CAP).map(labelFor);
  const overflow = selected.length - shown.length;
  const valueText = overflow > 0 ? `${shown.join(' or ')} +${overflow}` : shown.join(' or ');

  /* Three states, and OPEN is the loud one. The chip you are editing right now
     takes the same accent tint the funnel trigger takes — one blue thing on the
     bar at a time, and it is always the thing you are touching. Merely-active
     chips (a facet with values, menu closed) stay on the neutral fill and let
     their VALUES carry the blue, so the bar can show four filled facets without
     turning into four buttons all shouting at once. */
  const tone = open
    ? 'border border-transparent bg-seeko-accent/10 text-seeko-accent'
    : active
      ? 'border border-transparent bg-wash-5 text-ink-title'
      : 'border border-wash-6 bg-transparent text-ink-body hover:bg-wash-4 hover:text-ink-title';
  const iconTone = open ? 'text-seeko-accent' : active ? 'text-ink-muted-strong' : 'text-ink-faint';

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-label={`Filter by ${label.toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
        style={{ transitionTimingFunction: EASE_OUT_QUART }}
        className={[
          'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium leading-5',
          'transition-[background-color,border-color,color] duration-150',
          tone,
        ].join(' ')}
      >
        <span className={iconTone}>{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
        {active && (
          <>
            <span
              aria-hidden
              className={`select-none ${open ? 'text-seeko-accent/40' : 'text-wash-6'}`}
            >
              │
            </span>
            <span className="max-w-[200px] truncate text-seeko-accent">{valueText}</span>
            {/* stopPropagation: the × clears the facet, it does not open the menu
                the rest of the chip opens. */}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label.toLowerCase()} filter`}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }
              }}
              className={`-mr-1 ml-0.5 flex size-4 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-out ${
                open
                  ? 'text-seeko-accent/60 hover:bg-seeko-accent/15 hover:text-seeko-accent'
                  : 'text-ink-faint hover:bg-wash-6 hover:text-ink-title'
              }`}
            >
              <X className="size-3" strokeWidth={2.5} />
            </span>
          </>
        )}
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={menuRef}
                key="menu"
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 30 }
                }
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  width: MENU_WIDTH,
                  maxHeight: pos.maxHeight,
                }}
                className="z-[100] origin-top overflow-y-auto rounded-[14px] bg-overlay p-1.5 shadow-seeko-pop"
                role="menu"
                aria-label={label}
              >
                {options.map((o) => {
                  const checked = selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      onClick={() => onToggle(o.value)}
                      className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-ink-body transition-[color,background-color] hover:bg-wash-4 hover:text-ink-title"
                    >
                      {o.leading && (
                        <span className="flex size-3.5 shrink-0 items-center justify-center">
                          {o.leading}
                        </span>
                      )}
                      <span className="flex-1 truncate text-[13px]">{o.label}</span>
                      <span
                        className={
                          checked
                            ? 'flex size-3.5 shrink-0 items-center justify-center rounded-[4px] bg-seeko-accent text-white'
                            : 'size-3.5 shrink-0 rounded-[4px] border border-black/[0.18] dark:border-white/20'
                        }
                      >
                        {checked && <Check className="size-2.5" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
