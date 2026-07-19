/* MilestoneHealthBadge — small status glyph for milestone health.
 *
 * Four signal levels:
 *   on_track   → green ring with check
 *   at_risk    → amber filled square (paused / hold)
 *   off_track  → red diamond (alert)
 *   completed  → green filled circle with white check (the terminal state —
 *                the solid sibling of on_track's outline, same family, done)
 *
 * Compact 14×14 glyphs designed to sit inline with the milestone name
 * and date in the rail row. Pass `showLabel` to render a small text label
 * next to the glyph (used in the edit popover picker, not the rail row). */

import type { MilestoneHealth } from '@/lib/types';

// Dark issues-rail palette (default). Tuned for the dark /tasks surface; the
// MilestoneEditPopover + MilestonesSection consumers depend on these.
const COLOR: Record<MilestoneHealth, string> = {
  on_track: '#22c55e',
  at_risk: '#f59e0b',
  off_track: '#ef4444',
  completed: '#22c55e',
};

// AA-on-white palette for the light Overview card (opt-in `light`). The dark
// greens/ambers fall ~2.1:1 on #fff — below the 3:1 graphic-contrast floor —
// so the relayed glyph would be faint. These clear ≥3:1 and reuse the same
// validated signal palette as the Overview priority chevrons (#bd7e10 amber,
// #f04438 red); on_track deepens to green-600 #16a34a (~3.3:1, still reads as a
// healthy green, not forest).
const LIGHT_COLOR: Record<MilestoneHealth, string> = {
  on_track: '#16a34a',
  at_risk: '#bd7e10',
  off_track: '#f04438',
  completed: '#16a34a',
};

const LABEL: Record<MilestoneHealth, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  completed: 'Completed',
};

function Glyph({
  level,
  className,
  light = false,
}: {
  level: MilestoneHealth;
  className?: string;
  light?: boolean;
}) {
  const color = (light ? LIGHT_COLOR : COLOR)[level];

  if (level === 'on_track') {
    return (
      <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" />
        <path
          d="M4.4 7.2 L6.2 9 L9.6 5.4"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (level === 'completed') {
    // Same check as on_track, but the circle is FILLED — outline = in motion,
    // solid = landed. The check knocks out in white on both palettes.
    return (
      <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
        <circle cx="7" cy="7" r="6" fill={color} />
        <path
          d="M4.4 7.2 L6.2 9 L9.6 5.4"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (level === 'at_risk') {
    return (
      <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
        <rect x="1.5" y="1.5" width="11" height="11" rx="2.2" fill={color} />
        <rect x="4.6" y="4.2" width="1.4" height="5.6" rx="0.4" fill="#ffffff" />
        <rect x="8" y="4.2" width="1.4" height="5.6" rx="0.4" fill="#ffffff" />
      </svg>
    );
  }

  // off_track — red diamond with white slash
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
      <path d="M7 1.2 L12.8 7 L7 12.8 L1.2 7 Z" fill={color} />
      <rect
        x="3.4"
        y="6.3"
        width="7.2"
        height="1.4"
        rx="0.4"
        fill="#ffffff"
        transform="rotate(-45 7 7)"
      />
    </svg>
  );
}

export function MilestoneHealthBadge({
  level,
  showLabel = false,
  light = false,
  className,
}: {
  level: MilestoneHealth | null | undefined;
  showLabel?: boolean;
  // Relight the glyph for the white Overview card. Default false keeps the dark
  // issues-rail consumers (MilestoneEditPopover, MilestonesSection) unchanged.
  light?: boolean;
  className?: string;
}) {
  if (!level) return null;
  if (!showLabel) {
    return <Glyph level={level} light={light} className={className ?? 'size-3.5 shrink-0'} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Glyph level={level} light={light} className="size-3.5 shrink-0" />
      <span className="text-[12px] text-ink-strong">{LABEL[level]}</span>
    </span>
  );
}

export const HEALTH_LEVELS: MilestoneHealth[] = ['on_track', 'at_risk', 'off_track', 'completed'];
export const HEALTH_LABEL = LABEL;
export const HEALTH_COLOR = COLOR;
