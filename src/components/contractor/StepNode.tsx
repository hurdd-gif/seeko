// src/components/contractor/StepNode.tsx
import { Check, TriangleAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { DerivedStep } from '@/lib/contractor-steps';
import { formatDueLabel, overdueLabel, parseDeadline } from '@/lib/contractor-buckets';
import { StateChip } from './StateChip';

export type StepNodeProps = {
  derived: DerivedStep;
  now: Date;
  onAdvance?: (stepId: string) => void | Promise<void>;
  /** True only for the step the contractor advanced in this session — gates the
   * "In review" entrance so server-seeded in_review rows never animate on load. */
  justAdvanced?: boolean;
  /** True when the OWNING CARD has a missed step — the card already escalates
   * (warm surface, red ring/chip), so its submit affordance escalates with it:
   * the one filled button on the page marks the "do this first" action. */
  urgent?: boolean;
};

/**
 * One admin-authored step as a row on the deliverable's hairline spine. The
 * journey rail (JourneyRail.tsx) carries the page's stepper nodes now, so the
 * rows themselves stay dot-free (user call 2026-07-11 — duplicate node
 * language read as noise): state lives in the trailing chip/date and the focal
 * row's weight. Only the focal `pending` row is interactive (tap → submit for
 * review). Missed/upcoming stay static — a recurring pulse on a persistent
 * condition would nag (design §6).
 */
export function StepNode({ derived, now, onAdvance, justAdvanced = false, urgent = false }: StepNodeProps) {
  const reduce = useReducedMotion();
  const { step, rendered, canAdvance } = derived;
  const dueLabel = step.deadline ? formatDueLabel(parseDeadline(step.deadline)) : null;

  const trailing =
    rendered === 'pending-review' ? (
      // Submitting is this page's one write — the chip springing in IS the
      // confirmation (emil: state indication). Blur bridges the swap from the
      // pill that just left. Server-seeded in_review rows mount static.
      <motion.span
        className="inline-flex shrink-0"
        initial={justAdvanced && !reduce ? { opacity: 0, scale: 0.9, filter: 'blur(2px)' } : false}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={reduce ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
      >
        <StateChip tone="blue">In review</StateChip>
      </motion.span>
    ) : rendered === 'missed' ? (
      <StateChip tone="red">
        <TriangleAlert className="size-3" strokeWidth={2.5} aria-hidden />
        {overdueLabel(step.deadline!, now)}
      </StateChip>
    ) : rendered === 'done' ? (
      // With the spine dots gone, done-ness rides in the trailing cluster — one
      // small green check ahead of the date (same glyph as the "N done" toggle).
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] tabular-nums text-ink-faint">
        <Check className="size-3 text-success" strokeWidth={2.5} aria-hidden />
        {dueLabel}
      </span>
    ) : (
      <span className={`shrink-0 text-[12px] tabular-nums ${dueLabel ? 'text-ink-muted' : 'text-ink-faintest'}`}>
        {dueLabel ?? 'No deadline'}
      </span>
    );

  // Focal steps carry weight, not hue — color on this page is reserved for
  // state (the node fill, review blue, overdue red); the app's light pages
  // stay monochrome + status color.
  const nameCls =
    rendered === 'active'
      ? 'font-medium text-ink-heading'
      : rendered === 'done'
        ? 'text-ink-muted'
        : 'text-ink-muted-strong';

  const row = (
    <>
      {/* grow (basis:auto), NOT flex-1 (basis:0) — the name must claim its
       * content width so a tight line WRAPS the trailing chip/pill instead of
       * crushing the name to nothing (375px focal rows carry chip + pill). */}
      <span className={`min-w-0 grow truncate text-[14px] ${nameCls}`}>{step.name}</span>
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
          className="group flex min-h-10 w-full flex-wrap items-center gap-2 py-1 pl-6 pr-1 text-left outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-seeko-accent/40 active:scale-[0.99]"
        >
          {row}
          {/* The page's one write gets a visible affordance — a quiet pill
           * (span, not a nested button: the whole row is the control and the
           * aria-label already names it). On an urgent card the pill fills
           * dark (the form-submit treatment, DeadlineExtensionControl) — the
           * card shouts overdue everywhere except the action otherwise. */}
          <span
            className={`ml-1 inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-medium transition-colors duration-150 ease-out motion-reduce:transition-none ${
              urgent
                ? 'bg-ink-title text-surface-1 group-hover:bg-ink-strong group-active:bg-ink-strong'
                : 'bg-surface-1 text-ink ring-1 ring-hairline group-hover:bg-[#f5f5f5] group-active:bg-[#efefef] dark:group-hover:bg-surface-3 dark:group-active:bg-surface-4'
            }`}
          >
            Submit for review
          </span>
        </button>
      ) : (
        <div className="flex min-h-10 flex-wrap items-center gap-2 py-1 pl-6 pr-1">{row}</div>
      )}
    </li>
  );
}
