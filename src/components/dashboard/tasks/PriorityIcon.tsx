/* PriorityIcon — Linear-style priority glyphs.
 *
 * Four levels match Linear's signature look:
 *   Urgent  → filled red square with white "!"
 *   High    → three bars, all filled
 *   Medium  → three bars, first two filled
 *   Low     → three bars, only the shortest filled
 *
 * A 5th `null` glyph (three faded dots) is rendered when no priority is set.
 * Bars share a 14×14 viewBox with 2px gaps and step heights 4 / 7 / 10
 * to read at small sizes. Color is driven by `currentColor` so callers
 * can tint by setting `color` (urgent gets its own red, others fall back
 * to the surrounding text color). */

import type { Priority } from '@/lib/types';

type Props = {
  level: Priority | null;
  className?: string;
  style?: React.CSSProperties;
};

const FILLED = 'currentColor';
const DIMMED = 'currentColor';
const DIMMED_OPACITY = 0.25;

function Bars({ filled }: { filled: 1 | 2 | 3 }) {
  // Bars stand on a shared baseline at y=12, widths 2.5, x positions 2 / 6 / 10.
  const bars: Array<{ x: number; y: number; h: number }> = [
    { x: 2, y: 8, h: 4 },
    { x: 6, y: 5, h: 7 },
    { x: 10, y: 2, h: 10 },
  ];
  return (
    <>
      {bars.map((b, i) => {
        const on = i < filled;
        return (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={2.5}
            height={b.h}
            rx={0.6}
            fill={on ? FILLED : DIMMED}
            fillOpacity={on ? 1 : DIMMED_OPACITY}
          />
        );
      })}
    </>
  );
}

export function PriorityIcon({ level, className, style }: Props) {
  if (level === 'Urgent') {
    return (
      <svg
        viewBox="0 0 14 14"
        className={className}
        style={style}
        aria-hidden="true"
        fill="none"
      >
        <rect x="1" y="1" width="12" height="12" rx="2.5" fill="currentColor" />
        {/* Exclamation: stem 1.4×4.4, dot 1.6 square — both white */}
        <rect x="6.3" y="3" width="1.4" height="5" rx="0.4" fill="#ffffff" />
        <rect x="6.2" y="9" width="1.6" height="1.6" rx="0.4" fill="#ffffff" />
      </svg>
    );
  }

  if (level == null) {
    return (
      <svg
        viewBox="0 0 14 14"
        className={className}
        style={style}
        aria-hidden="true"
        fill="currentColor"
      >
        <circle cx="2.5" cy="7" r="1" fillOpacity={DIMMED_OPACITY} />
        <circle cx="7" cy="7" r="1" fillOpacity={DIMMED_OPACITY} />
        <circle cx="11.5" cy="7" r="1" fillOpacity={DIMMED_OPACITY} />
      </svg>
    );
  }

  const filled = level === 'High' ? 3 : level === 'Medium' ? 2 : 1;
  return (
    <svg viewBox="0 0 14 14" className={className} style={style} aria-hidden="true">
      <Bars filled={filled as 1 | 2 | 3} />
    </svg>
  );
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  Urgent: '#e5484d',
  High: '#1a1a1a',
  Medium: '#1a1a1a',
  Low: '#1a1a1a',
};

export const PRIORITIES: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
