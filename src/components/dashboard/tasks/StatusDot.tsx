/**
 * StatusDot — shared status indicator, used by:
 *   • TaskCard (sm, inline next to title)
 *   • TasksBoardColumn header (md, paired with status name)
 *   • HiddenColumnsStack rows (md)
 *   • Status-change dropdown rows (md)
 *
 * Light-mode palette (Paper TA-0 adapted; see docs/plans/2026-05-19-tasks-board-redesign.md
 * for the canonical table). Backlog renders a dashed ring (Linear convention);
 * Done renders a filled accent disk with an inline check.
 *
 * `size` is the visual diameter — sm = 8px (card row), md = 14px (column header).
 */

import { Check, X } from 'lucide-react';
import type { TaskStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export const STATUS_COLOR: Record<TaskStatus, string> = {
  Backlog:       '#a3a3a3', // neutral-400
  Todo:          '#9ca3af', // neutral-400 (deliberately ≠ Backlog tone so they read different)
  'In Progress': '#fbbf24', // --color-status-progress
  'In Review':   '#93c5fd', // --color-status-review (blue-300)
  Done:          '#0d7aff', // --color-seeko-accent
  Canceled:      '#a3a3a3', // neutral-400
  Duplicate:     '#a3a3a3', // neutral-400
};

type Size = 'sm' | 'md';

const SIZE_PX: Record<Size, number> = { sm: 8, md: 14 };

export function StatusDot({
  status,
  size = 'sm',
  className,
}: {
  status: TaskStatus;
  size?: Size;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const color = STATUS_COLOR[status];
  const stroke = size === 'md' ? 2 : 1.5;

  // Done — filled disk with inline check.
  if (status === 'Done') {
    return (
      <span
        className={cn('inline-flex items-center justify-center rounded-full text-white', className)}
        style={{ width: px, height: px, backgroundColor: color }}
        aria-label="Done"
      >
        {size === 'md' && <Check className="size-2.5" strokeWidth={3} />}
      </span>
    );
  }

  // Canceled / Duplicate — circle outline with inline X.
  if (status === 'Canceled' || status === 'Duplicate') {
    return (
      <span
        className={cn('inline-flex items-center justify-center rounded-full', className)}
        style={{
          width: px,
          height: px,
          backgroundColor: color,
          color: 'white',
        }}
        aria-label={status}
      >
        {size === 'md' && <X className="size-2.5" strokeWidth={3} />}
      </span>
    );
  }

  // In Progress — pie/wedge feel via conic-gradient (50% fill).
  if (status === 'In Progress') {
    return (
      <span
        className={cn('inline-block rounded-full', className)}
        style={{
          width: px,
          height: px,
          background: `conic-gradient(${color} 0 50%, transparent 50% 100%)`,
          boxShadow: `inset 0 0 0 ${stroke}px ${color}`,
        }}
        aria-label="In Progress"
      />
    );
  }

  // In Review — solid disk with inner ring (eye-style).
  if (status === 'In Review') {
    return (
      <span
        className={cn('inline-flex items-center justify-center rounded-full', className)}
        style={{ width: px, height: px, backgroundColor: color }}
        aria-label="In Review"
      >
        <span
          className="block rounded-full"
          style={{ width: px / 2.5, height: px / 2.5, backgroundColor: 'white' }}
        />
      </span>
    );
  }

  // Backlog — dashed ring (empty interior).
  if (status === 'Backlog') {
    return (
      <span
        className={cn('inline-block rounded-full', className)}
        style={{
          width: px,
          height: px,
          border: `${stroke}px dashed ${color}`,
        }}
        aria-label="Backlog"
      />
    );
  }

  // Todo (default) — solid ring (empty interior).
  return (
    <span
      className={cn('inline-block rounded-full', className)}
      style={{
        width: px,
        height: px,
        border: `${stroke}px solid ${color}`,
      }}
      aria-label="Todo"
    />
  );
}
