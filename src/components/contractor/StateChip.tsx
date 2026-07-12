// src/components/contractor/StateChip.tsx
import type { ReactNode } from 'react';

/* Tinted status chips (Meridian-labs reference language, 2026-07-11): state
 * reads as a contained pill — tinted bg + colored text — never as colored
 * prose floating in the row. Tones stay on the portal's status palette:
 * blue = in review, red = missed/overdue. 8% tint keeps the canvas quiet. */
const TONES = {
  blue: 'bg-seeko-accent-ink/[0.08] text-seeko-accent-ink',
  red: 'bg-danger/[0.08] text-danger',
} as const;

export type StateChipTone = keyof typeof TONES;

export function StateChip({
  tone,
  children,
  className = '',
}: {
  tone: StateChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-[3px] text-[11px] font-medium leading-none tabular-nums ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
