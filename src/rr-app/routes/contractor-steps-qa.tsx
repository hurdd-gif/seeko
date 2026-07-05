// src/rr-app/routes/contractor-steps-qa.tsx
import { CircleHelp } from 'lucide-react';
import type { ContractorStep, ContractorStepDeliverable } from '@/lib/contractor-steps';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { StepDeliverableTimeline } from '@/components/contractor/StepDeliverableTimeline';

/**
 * No-backend visual-QA preview for the breadcrumb-steps model. Seeds every node
 * state at once: a five-step deliverable with ≥2 done (compaction) + a focal active
 * step, a deliverable whose focal step is In review, a single overdue (missed) step,
 * a 0-step deliverable ("No steps yet"), and a delivered deliverable in the Timeline
 * zone. Fixed now (2026-07-05) keeps the overdue day-counts deterministic. Not in
 * routeInventory. Chrome is a throwaway QA scaffold — the live route wires the real
 * chrome (see contractor.tsx / plan Task 9).
 */
const NOW = new Date('2026-07-05T09:00:00');

function d(partial: Partial<ContractorStepDeliverable> & { steps: ContractorStep[] }): ContractorStepDeliverable {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Deliverable',
    department: partial.department ?? 'Coding',
    status: partial.status ?? 'In Progress',
    priority: partial.priority ?? 'Medium',
    deadline: partial.deadline ?? null,
    progress: partial.progress ?? 0,
    description: partial.description ?? null,
    steps: partial.steps,
  };
}

const active: ContractorStepDeliverable[] = [
  d({
    id: 'd1',
    name: 'Main menu wireframes',
    department: 'UI/UX',
    steps: [
      { id: 's1', name: 'Low-fi flows', deadline: '2026-06-30', state: 'done', sort_order: 0 },
      { id: 's2', name: 'Component pass', deadline: '2026-07-04', state: 'done', sort_order: 1 },
      { id: 's3', name: 'Content review', deadline: '2026-07-06', state: 'done', sort_order: 2 },
      { id: 's4', name: 'High-fi mockup', deadline: '2026-07-18', state: 'pending', sort_order: 3 },
      { id: 's5', name: 'Handoff spec', deadline: '2026-07-22', state: 'pending', sort_order: 4 },
    ],
  }),
  d({
    id: 'd2',
    name: 'Combat HUD',
    department: 'Animation',
    steps: [
      { id: 's6', name: 'Damage-state sprites', deadline: '2026-07-16', state: 'in_review', sort_order: 0 },
      { id: 's7', name: 'HUD integration', deadline: '2026-07-25', state: 'pending', sort_order: 1 },
    ],
  }),
  d({
    id: 'd3',
    name: 'Onboarding flow',
    department: 'UI/UX',
    steps: [{ id: 's8', name: 'Tutorial copy', deadline: '2026-07-03', state: 'pending', sort_order: 0 }],
  }),
  d({ id: 'd4', name: 'Character portraits', department: 'Visual Art', steps: [] }),
];

const timeline: TimelineMonth[] = [
  {
    key: '2026-06',
    label: 'June 2026',
    items: [
      { id: 't1', name: 'Loading screen polish', department: 'Coding', status: 'Done', priority: 'Low', deadline: '2026-06-28', progress: 100, description: null },
    ],
  },
];

export function ContractorStepsQaRoute() {
  return (
    <div className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased [scrollbar-gutter:stable_both-edges]">
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-ink-muted-strong">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20contractor%20help"
          className="flex items-center gap-2 text-base text-ink-muted-strong transition-colors duration-150 hover:text-ink active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      <main className="mx-auto w-full max-w-[620px] flex-col pt-[clamp(5rem,11vh,6.5rem)] pb-16">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-heading">Good morning, Dana</h1>
          <p className="mt-1 text-sm text-ink-faint tabular-nums">4 deliverables · next due Thu, Jul 16</p>
        </div>
        <StepDeliverableTimeline active={active} timeline={timeline} now={NOW} />
      </main>
    </div>
  );
}
