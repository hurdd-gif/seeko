'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Overview progress ring
 *
 *     0ms   gray track + "X% / Overall" center painted at rest
 *   350ms   green arc sweeps 0% → overall%, top-start, clockwise
 *  hover/   "Health by area" card pops UP out of the ring (spring, origin
 *  focus    bottom-center); rows cascade in just behind it — see RING_TOOLTIP.
 *           (per-area health is no longer always-visible — decision: on hover)
 *
 * For non-admins the ring is a pure stat (role="img", no action) — Overview
 * dropped the old "Open studio →" CTA. For admins the focusable element is a
 * button: clicking it opens the stacked "Studio progress" editor, and a pencil
 * chip fades in on hover/focus to advertise that the ring is editable.
 * ───────────────────────────────────────────────────────── */

import { motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { Area, MilestoneHealth } from '@/lib/types';
import { RING_TOOLTIP, ringTooltip, springs } from '@/lib/motion';
import { MilestoneHealthBadge } from './tasks/MilestoneHealthBadge';
import { clampPercent, ringDashOffset } from './ringGeometry';
import { StudioProgressEditor } from './StudioProgressEditor';

// Sampled from the Paper mockup: green arc #56e268, gray track #d9d9d9.
const ARC = '#56e268';
const TRACK = '#d9d9d9';

const SIZE = 220;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2; // 101 — keeps the 18px band inside the box
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Arc sweep lands just after the page content stagger (hero→recents→tasks).
const SWEEP_DELAY_S = 0.35;

export type RingAreaHealth = {
  id: string;
  name: string;
  health: MilestoneHealth | null;
};

export function ProgressRing({
  overall,
  areas,
  isAdmin = false,
  editableAreas = [],
}: {
  overall: number;
  areas: RingAreaHealth[];
  /** Admins get an editable ring (button → stacked progress editor). */
  isAdmin?: boolean;
  /** Full area rows for the editor — only passed/used when isAdmin. */
  editableAreas?: Area[];
}) {
  const pct = clampPercent(overall);
  const shouldReduce = useReducedMotion();
  const tooltipId = useId();
  const target = ringDashOffset(pct, CIRCUMFERENCE);

  // Reveal the per-area detail on pointer hover OR keyboard focus (the ring is
  // focusable). Tracked separately so leaving with the mouse doesn't close the
  // card while it still holds keyboard focus, and vice-versa.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused;
  const tip = ringTooltip(shouldReduce);

  // Admin-only: clicking the ring opens the stacked "Studio progress" editor.
  const [editorOpen, setEditorOpen] = useState(false);

  // The painted ring (track + sweeping arc + center stat). Decorative — the
  // accessible name lives on the focusable wrapper (img stat / edit button).
  const ringGraphic = (
    <>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={TRACK} strokeWidth={STROKE} />
        {/* rotate -90 on a static <g> so the arc starts at 12 o'clock and
            sweeps clockwise; motion only drives the dash offset. */}
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={ARC}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: shouldReduce ? target : CIRCUMFERENCE }}
            animate={{ strokeDashoffset: target }}
            transition={shouldReduce ? { duration: 0 } : { ...springs.gentle, delay: SWEEP_DELAY_S }}
          />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--ov-heading)]">
          {pct}%
        </span>
        <span className="mt-2 text-[15px] leading-none text-[var(--ov-muted)]">Overall</span>
      </div>
    </>
  );

  // Shared focus-ring + sizing for both the stat and the edit-button wrappers.
  const ringFrame =
    'relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ov-bg)]';

  return (
    <div
      className="relative flex flex-col items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/* The focusable ring. Admins get a <button> (opens the editor) with a
          pencil chip on hover/focus; everyone else gets a role="img" stat. Both
          carry the per-area health tooltip via aria-describedby, and focus on
          either bubbles to the wrapper above to reveal that tooltip. */}
      {isAdmin ? (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          aria-label={`Edit studio progress (${pct}% overall)`}
          aria-describedby={tooltipId}
          className={`${ringFrame} group cursor-pointer transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]`}
          style={{ width: SIZE, height: SIZE }}
        >
          {ringGraphic}
          {/* Edit affordance — fades + settles in on hover/focus (scale 0.95→1,
              never from 0; motion-reduce keeps it instant). Corner of the square
              box sits outside the circle, so it never overlaps the arc. */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-1 top-1 flex size-7 scale-95 items-center justify-center rounded-full bg-surface-1 text-ink-body opacity-0 shadow-seeko transition-[opacity,transform] duration-150 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          >
            <Pencil className="size-3.5" />
          </span>
        </button>
      ) : (
        <div
          role="img"
          aria-label={`${pct}% overall progress across the studio`}
          aria-describedby={tooltipId}
          tabIndex={0}
          className={ringFrame}
          style={{ width: SIZE, height: SIZE }}
        >
          {ringGraphic}
        </div>
      )}

      {/* Health-by-area detail. The OUTER wrapper owns the static centering
          (left-1/2 + -translate-x-1/2) so Motion's animated transform on the
          card never fights it. The card is ALWAYS mounted as the described-by
          target (SR/keyboard always get it); `open` toggles its variant. It
          pops UP out of the ring — origin bottom-center, scale .96→1, rise. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 w-[224px] -translate-x-1/2">
        <motion.div
          id={tooltipId}
          role="tooltip"
          variants={tip.shell}
          initial={false}
          animate={open ? 'shown' : 'hidden'}
          style={{ transformOrigin: RING_TOOLTIP.shell.transformOrigin }}
          className="rounded-2xl bg-surface-1 p-3 shadow-seeko-pop"
        >
          <p className="mb-2 px-1 text-[12px] leading-none text-[var(--ov-muted)]">
            Health by area
          </p>
          <motion.ul
            variants={tip.list}
            initial={false}
            animate={open ? 'shown' : 'hidden'}
            className="flex flex-col gap-1.5"
          >
            {areas.map((a) => (
              <motion.li
                key={a.id}
                variants={tip.row}
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl px-1"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] leading-[18px] tracking-[-0.03em] text-[var(--ov-text)]">
                  {a.name}
                </span>
                {a.health ? (
                  <MilestoneHealthBadge level={a.health} showLabel light />
                ) : (
                  <span className="shrink-0 text-[12px] leading-[18px] text-[var(--ov-faint)]">
                    No signal
                  </span>
                )}
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>
      </div>

      {isAdmin && (
        <StudioProgressEditor open={editorOpen} onOpenChange={setEditorOpen} areas={editableAreas} />
      )}
    </div>
  );
}
