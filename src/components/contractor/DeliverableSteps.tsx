// src/components/contractor/DeliverableSteps.tsx
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ContractorStep } from '@/lib/contractor-steps';
import { deriveSteps, summarizeSteps } from '@/lib/contractor-steps';
import type { LatestExtension } from '@/lib/contractor-index';
import { StepNode } from './StepNode';
import { StateChip } from './StateChip';
import { DeadlineExtensionControl } from './DeadlineExtensionControl';

export type DeliverableStepsProps = {
  name: string;
  steps: ContractorStep[];
  now: Date;
  taskId: string;
  deadline: string | null;
  latestExtension: LatestExtension | null;
  onAdvance?: (stepId: string) => void | Promise<void>;
};

/**
 * One deliverable as an entity card: the NAME owns the card's left edge (the
 * letter-monogram chips were retired 2026-07-11 — with duplicate initials they
 * decorated rather than identified, and the rail already carries wayfinding),
 * with the unit's hairline spine indented beneath it — the same
 * header-at-margin / spine-indented grammar as the rail and the Delivered
 * history, so the whole page speaks one spine language. A missed step tints
 * the WHOLE card (warm surface + red-tinted ring — Vercel production-checklist
 * pattern) so urgency reads before any text does. Done steps sit above the
 * focal, so ≥2 collapse into a single "✓ N done — show" line; the focal +
 * upcoming steps never collapse. The contractor's one write — advance the
 * focal step to In review — is applied optimistically here (this component
 * owns the list).
 */
export function DeliverableSteps({
  name,
  steps: initial,
  now,
  taskId,
  deadline,
  latestExtension,
  onAdvance,
}: DeliverableStepsProps) {
  const [steps, setSteps] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  // The step advanced in THIS session — its "In review" chip animates in as
  // submit feedback. Server-seeded in_review rows never animate (no page-load
  // motion for a state the contractor didn't just cause).
  const [advancedId, setAdvancedId] = useState<string | null>(null);

  const rollup = summarizeSteps(steps, now);
  const derived = deriveSteps(steps, now);
  const hasMissed = derived.some((d) => d.rendered === 'missed');
  const extControl = deadline ? (
    <DeadlineExtensionControl taskId={taskId} deadline={deadline} latestExtension={latestExtension} now={now} />
  ) : null;

  async function advance(stepId: string) {
    const prev = steps;
    setSteps((cur) => cur.map((s) => (s.id === stepId ? { ...s, state: 'in_review' as const } : s)));
    setAdvancedId(stepId);
    setError(false);
    try {
      await onAdvance?.(stepId);
    } catch {
      setSteps(prev);
      setAdvancedId(null);
      setError(true);
    }
  }

  // Card surface: state tints the whole card, not just a label — one glance
  // separates "needs me" from "on track".
  const surface = hasMissed
    ? '[--card-bg:#fdf7f4] ring-1 ring-danger/20'
    : '[--card-bg:#ffffff]';
  // 20px radius + 24px padding — one step airier than the old 16/20 pair; the
  // card count is small, so each unit can afford to breathe.
  const cardCls = `relative rounded-[20px] bg-[var(--card-bg)] p-6 shadow-seeko ${surface}`;

  // Header chips mirror the old rollup suppression: single-step units let the
  // row's own chip carry state (stating it twice reads as noise). Missed wins
  // over In review — a card can hold both, and "Action needed" is the one the
  // contractor must act on. The quiet "M of N · next date" rollup keeps its
  // text form on the right; it's schedule, not state.
  const headerChip =
    steps.length > 1 ? (
      hasMissed ? (
        <StateChip tone="red">Action needed</StateChip>
      ) : rollup.label === 'In review' ? (
        <StateChip tone="blue">In review</StateChip>
      ) : null
    ) : null;
  const quietRollup = !headerChip && Boolean(rollup.label) && steps.length > 1 ? rollup.label : null;

  // The name IS the entity anchor — 16px semibold at the padding edge, chips
  // beside it, schedule rollup right-aligned. The spine indents beneath.
  const Heading = (
    <div className="flex items-center gap-2">
      <h3 className="min-w-0 truncate text-[16px] font-semibold tracking-[-0.01em] text-ink-heading">
        {name}
      </h3>
      {headerChip}
      {quietRollup && (
        <span className="ml-auto shrink-0 pl-3 text-[12px] tabular-nums text-ink-faint">
          {quietRollup}
        </span>
      )}
    </div>
  );

  // Deadline/extension matter lives in a card footer, not on the spine: the
  // spine is the work path, and status sentences hanging off it read as loose
  // prose (user call 2026-07-11 — "too text heavy"). A full-bleed hairline
  // gives the card a fixed anatomy: header → steps → footer.
  const footer = extControl && (
    <div className="-mx-6 mt-4 border-t border-hairline px-6 pt-3">{extControl}</div>
  );

  if (steps.length === 0) {
    // No spine when there's nothing to connect — a hairline with one dangling
    // note read as chrome without content.
    return (
      <section className={cardCls}>
        {Heading}
        <p className="mt-3 text-[13px] text-ink-faintest">No steps yet</p>
        {footer}
      </section>
    );
  }

  const doneSteps = derived.filter((d) => d.rendered === 'done');
  const liveSteps = derived.filter((d) => d.rendered !== 'done');
  const collapse = doneSteps.length >= 2 && !expanded;

  return (
    <section className={cardCls}>
      {Heading}
      {/* Margin spine (ml-1.5 + pl-6) — the same indent grammar as the
       * Delivered history and the rail, one spine language page-wide. */}
      <div className="relative mt-4 ml-1.5 border-l border-hairline">
        <ol>
          {/* The "N done" row is a true toggle, not a one-way reveal — once
           * expanded it stays as the collapse affordance (chevron flips), so
           * the reader can tuck history away again (user call 2026-07-11). */}
          {doneSteps.length >= 2 && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="relative flex min-h-10 w-full items-center gap-2 py-1 pl-6 text-left text-[12px] text-ink-faint transition-colors duration-150 ease-out hover:text-ink active:text-ink-title"
              >
                <Check className="size-3 text-success" strokeWidth={2.5} aria-hidden />
                {doneSteps.length} done
                <ChevronDown
                  className={`size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            </li>
          )}
          {!collapse &&
            doneSteps.map((d, i) => (
              <div
                key={d.step.id}
                className={expanded ? 'animate-timeline-enter' : undefined}
                style={expanded ? { animationDelay: `${i * 60}ms` } : undefined}
              >
                <StepNode derived={d} now={now} />
              </div>
            ))}

          {liveSteps.map((d) => (
            <StepNode
              key={d.step.id}
              derived={d}
              now={now}
              onAdvance={advance}
              justAdvanced={d.step.id === advancedId}
              urgent={hasMissed}
            />
          ))}
        </ol>

        {error && <p className="mt-1 pl-6 text-[11px] text-danger">Couldn’t submit — try again.</p>}
      </div>
      {footer}
    </section>
  );
}
