// src/components/contractor/DeliverableSteps.tsx
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ContractorStep } from '@/lib/contractor-steps';
import { deriveSteps, summarizeSteps } from '@/lib/contractor-steps';
import type { LatestExtension } from '@/lib/contractor-index';
import { StepNode } from './StepNode';
import { DeadlineExtensionControl } from './DeadlineExtensionControl';

export type DeliverableStepsProps = {
  name: string;
  department: string | null;
  steps: ContractorStep[];
  now: Date;
  taskId: string;
  deadline: string | null;
  latestExtension: LatestExtension | null;
  onAdvance?: (stepId: string) => void | Promise<void>;
};

/**
 * One deliverable as a text group-heading (no node — the hairline runs behind it)
 * plus its admin-authored steps hanging off the same spine. Done steps sit above
 * the focal, so ≥2 collapse into a single "✓ N done — show" line; the focal + the
 * upcoming steps never collapse. The contractor's one write — advance the focal
 * step to In review — is applied optimistically here (this component owns the list).
 */
export function DeliverableSteps({
  name,
  department,
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

  const rollup = summarizeSteps(steps, now);
  const extControl = deadline ? (
    <DeadlineExtensionControl taskId={taskId} deadline={deadline} latestExtension={latestExtension} now={now} />
  ) : null;

  async function advance(stepId: string) {
    const prev = steps;
    setSteps((cur) => cur.map((s) => (s.id === stepId ? { ...s, state: 'in_review' as const } : s)));
    setError(false);
    try {
      await onAdvance?.(stepId);
    } catch {
      setSteps(prev);
      setError(true);
    }
  }

  const Heading = (
    <div className="mb-1.5 flex items-baseline justify-between gap-3 pl-6">
      <h3 className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {name}
      </h3>
      {rollup.label && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-ghost">{rollup.label}</span>
      )}
    </div>
  );

  if (steps.length === 0) {
    return (
      <div>
        {Heading}
        {extControl}
        <p className="pl-6 text-[13px] text-ink-faintest">No steps yet</p>
      </div>
    );
  }

  const derived = deriveSteps(steps, now);
  const doneSteps = derived.filter((d) => d.rendered === 'done');
  const liveSteps = derived.filter((d) => d.rendered !== 'done');
  const collapse = doneSteps.length >= 2 && !expanded;

  return (
    <div>
      {Heading}
      {extControl}
      <ol>
        {collapse ? (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="relative flex w-full items-center gap-2 py-1.5 pl-6 text-left text-[12px] text-ink-faint transition-colors duration-150 ease-out hover:text-ink active:text-[#111]"
            >
              <span
                className="absolute -left-[5px] top-1/2 flex size-2.5 -translate-y-1/2 items-center justify-center rounded-full bg-white ring-1 ring-hairline"
                aria-hidden
              >
                <Check className="size-2 text-[#15803d]" strokeWidth={3} aria-hidden />
              </span>
              {doneSteps.length} done
              <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
          </li>
        ) : (
          doneSteps.map((d, i) => (
            <div
              key={d.step.id}
              className={expanded ? 'animate-timeline-enter' : undefined}
              style={expanded ? { animationDelay: `${i * 60}ms` } : undefined}
            >
              <StepNode derived={d} department={department} now={now} />
            </div>
          ))
        )}

        {liveSteps.map((d) => (
          <StepNode key={d.step.id} derived={d} department={department} now={now} onAdvance={advance} />
        ))}
      </ol>

      {error && <p className="mt-1 pl-6 text-[11px] text-[#d4503e]">Couldn’t submit — try again.</p>}
    </div>
  );
}
