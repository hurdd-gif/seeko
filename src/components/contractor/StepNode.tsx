// src/components/contractor/StepNode.tsx
import { Check, TriangleAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { DerivedStep } from '@/lib/contractor-steps';
import { formatDueLabel, overdueLabel, parseDeadline } from '@/lib/contractor-buckets';
import { LIGHT_DEPT_COLOR } from '@/components/dashboard/lightKit';
import { springs } from '@/lib/motion';

/* Node fill hexes — the AA-on-white department ramp (mirrors LIGHT_DEPT_COLOR),
 * plus the shared status colors used across the light kit. */
const DEPT_HEX: Record<string, string> = {
  'Coding': '#0a63cc',
  'Visual Art': '#3f5fb5',
  'UI/UX': '#6e4fc4',
  'Animation': '#b8801a',
  'Asset Creation': '#bd3f7c',
};
const REVIEW_BLUE = '#3f5fb5';
const OVERDUE_RED = '#d4503e';
const SUCCESS_GREEN = '#15803d';
const FALLBACK_TINT = '#b8801a';
/** emil's strong ease-out — the advance-fill color move (background-color only). */
const EASE_OUT = 'cubic-bezier(0.23,1,0.32,1)';

export type StepNodeProps = {
  derived: DerivedStep;
  department: string | null;
  now: Date;
  onAdvance?: (stepId: string) => void | Promise<void>;
};

/**
 * One admin-authored step as a node on the single breadcrumb spine. The node fill
 * encodes the derived state; the focal node is enlarged. Only the focal `pending`
 * node is interactive (tap → submit for review). Missed/upcoming stay static — a
 * recurring pulse on a persistent condition would nag (design §6).
 */
export function StepNode({ derived, department, now, onAdvance }: StepNodeProps) {
  const reduce = useReducedMotion();
  const { step, rendered, isFocal, canAdvance } = derived;
  const deptTint = (department && DEPT_HEX[department]) || FALLBACK_TINT;
  const deptText = (department && LIGHT_DEPT_COLOR[department]) || 'text-ink-strong';
  const dueLabel = step.deadline ? formatDueLabel(parseDeadline(step.deadline)) : null;

  const filled = rendered === 'active' || rendered === 'pending-review' || rendered === 'missed';
  const fillColor =
    rendered === 'active' ? deptTint : rendered === 'pending-review' ? REVIEW_BLUE : OVERDUE_RED;
  const sizeCls = isFocal ? 'size-3 -left-[6px]' : 'size-2.5 -left-[5px]';

  const node = filled ? (
    <motion.span
      className={`absolute ${sizeCls} top-1/2 -translate-y-1/2 rounded-full ring-2 ring-white`}
      style={{ backgroundColor: fillColor, transition: `background-color 200ms ${EASE_OUT}` }}
      initial={isFocal && !reduce ? { scale: 0.6 } : false}
      animate={{ scale: 1 }}
      transition={reduce ? { duration: 0 } : springs.snappy}
      aria-hidden
    />
  ) : rendered === 'done' ? (
    <span
      className={`absolute ${sizeCls} top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white ring-1 ring-hairline`}
      aria-hidden
    >
      <span className="size-1 rounded-full bg-ink-ghost" />
    </span>
  ) : (
    // upcoming — hollow
    <span
      className={`absolute ${sizeCls} top-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-hairline`}
      aria-hidden
    />
  );

  const trailing =
    rendered === 'pending-review' ? (
      <span className="shrink-0 text-[12px] font-medium text-[#3f5fb5]">In review</span>
    ) : rendered === 'missed' ? (
      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-[#d4503e]">
        <TriangleAlert className="size-3" strokeWidth={2.5} aria-hidden />
        {overdueLabel(step.deadline!, now)}
      </span>
    ) : rendered === 'done' ? (
      <span className="inline-flex shrink-0 items-center gap-1.5">
        {dueLabel && <span className="text-[12px] tabular-nums text-ink-faint">{dueLabel}</span>}
        <Check className="size-3.5 text-[#15803d]" strokeWidth={2.5} aria-hidden />
      </span>
    ) : (
      <span className={`shrink-0 text-[12px] tabular-nums ${dueLabel ? 'text-ink-muted' : 'text-ink-faintest'}`}>
        {dueLabel ?? 'No deadline'}
      </span>
    );

  const nameCls =
    rendered === 'active'
      ? `font-medium ${deptText}`
      : rendered === 'done'
        ? 'text-ink-muted'
        : 'text-ink-muted-strong';

  const row = (
    <>
      {node}
      <span className={`min-w-0 flex-1 truncate text-[13px] ${nameCls}`}>{step.name}</span>
      {trailing}
    </>
  );

  return (
    <li className="relative">
      {canAdvance ? (
        <button
          type="button"
          onClick={() => onAdvance?.(step.id)}
          aria-label={`Submit ${step.name} for review`}
          className="flex w-full items-center gap-2 py-1.5 pl-6 pr-1 text-left outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#0d7aff]/40 active:scale-[0.99]"
        >
          {row}
        </button>
      ) : (
        <div className="flex items-center gap-2 py-1.5 pl-6 pr-1">{row}</div>
      )}
    </li>
  );
}
