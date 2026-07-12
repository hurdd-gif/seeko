// src/components/contractor/StepDeliverableTimeline.tsx
import { Inbox } from 'lucide-react';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { DeliverableSteps } from './DeliverableSteps';
import { CompletedTimeline } from './CompletedTimeline';

export type StepDeliverableTimelineProps = {
  /** Incomplete deliverables — each a group of admin-authored steps on the spine. */
  active: ContractorStepDeliverable[];
  /** Delivered deliverables condensed into the month-grouped history below. */
  timeline: TimelineMonth[];
  now: Date;
  onAdvance?: (taskId: string, stepId: string) => void | Promise<void>;
};

/**
 * Everything sits frameless on the canvas (the /docs ledger lineage — user
 * call 2026-07-11: no visible container). Each active deliverable renders as
 * its own compact unit (heading + its own short spine) with generous space
 * between units; the delivered history condenses below. No top-level
 * "Deliverables" header.
 */
export function StepDeliverableTimeline({ active, timeline, now, onAdvance }: StepDeliverableTimelineProps) {
  if (active.length === 0 && timeline.length === 0) {
    return (
      <div className="py-12 text-center">
        <Inbox className="mx-auto size-6 text-ink-ghost" strokeWidth={1.75} aria-hidden />
        <p className="mt-3 text-[15px] font-medium text-ink-heading">No deliverables assigned yet</p>
        <p className="mt-1 text-sm text-ink-faint">New work will show up here.</p>
      </div>
    );
  }

  return (
    <>
      {active.length > 0 ? (
        // 20px between cards — surfaces need less separation than frameless
        // units, but 16px read packed once every card carried a shadow.
        // Entrances stagger 50ms per card (capped) — one settling cascade,
        // not a page that pops in as a block.
        <div className="space-y-5">
          {active.map((d, i) => (
            <div
              key={d.id}
              id={`deliverable-${d.id}`}
              className="scroll-mt-24 animate-timeline-enter"
              style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
            >
              <DeliverableSteps
                name={d.name}
                steps={d.steps}
                now={now}
                taskId={d.id}
                deadline={d.deadline}
                latestExtension={d.latestExtension}
                onAdvance={onAdvance ? (stepId) => onAdvance(d.id, stepId) : undefined}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-faint">
          You’re all caught up — nothing needs your attention right now.
        </p>
      )}

      {timeline.length > 0 ? (
        // Anchor for the rail's "Delivered" stop (JourneyRail jump target).
        <div id="delivered-history" className="scroll-mt-24">
          <CompletedTimeline timeline={timeline} />
        </div>
      ) : (
        <CompletedTimeline timeline={timeline} />
      )}
    </>
  );
}
