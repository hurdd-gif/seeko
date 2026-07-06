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
 * The contractor's single vertical breadcrumb. One continuous hairline spine runs
 * the full height. Up top, each active deliverable is a text group-heading whose
 * steps are the nodes; down the spine, delivered work condenses into the existing
 * month-grouped Timeline. Group headings (top-margin separated) are the only
 * "new group" signal — no card frames, no top-level "Deliverables" header.
 */
export function StepDeliverableTimeline({ active, timeline, now, onAdvance }: StepDeliverableTimelineProps) {
  if (active.length === 0 && timeline.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-seeko">
        <Inbox className="mx-auto size-6 text-ink-ghost" strokeWidth={1.75} aria-hidden />
        <p className="mt-3 text-[15px] font-medium text-ink-heading">No deliverables assigned yet</p>
        <p className="mt-1 text-sm text-ink-faint">New work will show up here.</p>
      </div>
    );
  }

  return (
    <div className="relative ml-1.5 border-l border-hairline">
      <section className="space-y-8 pb-9">
        {active.length > 0 ? (
          active.map((d) => (
            <DeliverableSteps
              key={d.id}
              name={d.name}
              department={d.department}
              steps={d.steps}
              now={now}
              taskId={d.id}
              deadline={d.deadline}
              latestExtension={d.latestExtension}
              onAdvance={onAdvance ? (stepId) => onAdvance(d.id, stepId) : undefined}
            />
          ))
        ) : (
          <p className="pl-6 text-sm text-ink-faint">
            You’re all caught up — nothing needs your attention right now.
          </p>
        )}
      </section>

      <CompletedTimeline timeline={timeline} />
    </div>
  );
}
