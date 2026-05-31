/* MilestoneHealthBadge — small status glyph for milestone health.
 *
 * Three signal levels:
 *   on_track   → green ring with check
 *   at_risk    → amber filled square (paused / hold)
 *   off_track  → red diamond (alert)
 *
 * Compact 14×14 glyphs designed to sit inline with the milestone name
 * and date in the rail row. Pass `showLabel` to render a small text label
 * next to the glyph (used in the edit popover picker, not the rail row). */

import type { MilestoneHealth } from '@/lib/types';

const COLOR: Record<MilestoneHealth, string> = {
  on_track: '#22c55e',
  at_risk: '#f59e0b',
  off_track: '#ef4444',
};

const LABEL: Record<MilestoneHealth, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
};

function Glyph({ level, className }: { level: MilestoneHealth; className?: string }) {
  const color = COLOR[level];

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
  className,
}: {
  level: MilestoneHealth | null | undefined;
  showLabel?: boolean;
  className?: string;
}) {
  if (!level) return null;
  if (!showLabel) {
    return <Glyph level={level} className={className ?? 'size-3.5 shrink-0'} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Glyph level={level} className="size-3.5 shrink-0" />
      <span className="text-[12px] text-[#2a2a2a]">{LABEL[level]}</span>
    </span>
  );
}

export const HEALTH_LEVELS: MilestoneHealth[] = ['on_track', 'at_risk', 'off_track'];
export const HEALTH_LABEL = LABEL;
export const HEALTH_COLOR = COLOR;
