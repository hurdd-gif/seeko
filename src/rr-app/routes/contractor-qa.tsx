import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import { ContractorRouteContent } from './contractor';

/**
 * No-backend visual-QA preview (no loader gate) for the contractor portal's
 * breadcrumb-steps model, rendered through the REAL `ContractorRouteContent`
 * (which runs the seed through `splitDeliverables` → `StepDeliverableTimeline`).
 * The seed exercises every node state at once: a five-step deliverable with ≥2
 * done (compaction toggle) + a focal active step, a deliverable whose focal step
 * is In review, a single overdue (missed) step, a 0-step deliverable ("No steps
 * yet"), and a six-item Done history spanning June→April so the "Show 2 earlier"
 * timeline collapse is exercised. Fixed `now` (2026-07-05) keeps the overdue
 * day-counts deterministic. Not in routeInventory.
 */

const NOW = new Date('2026-07-05T09:00:00');

function d(partial: Partial<ContractorStepDeliverable>): ContractorStepDeliverable {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Task',
    department: partial.department ?? 'Coding',
    status: partial.status ?? 'Todo',
    priority: partial.priority ?? 'Medium',
    deadline: partial.deadline ?? null,
    progress: partial.progress ?? 0,
    description: partial.description ?? null,
    latestExtension: partial.latestExtension ?? null,
    steps: partial.steps ?? [],
  };
}

const deliverables: ContractorStepDeliverable[] = [
  // Five-step deliverable: 3 leading done → "3 done" compaction toggle, focal
  // active step (High-fi mockup, not overdue), then an upcoming step.
  d({
    id: 'd1',
    name: 'Main menu wireframes',
    department: 'UI/UX',
    status: 'In Progress',
    priority: 'Medium',
    progress: 60,
    steps: [
      { id: 's1', name: 'Low-fi flows', deadline: '2026-06-30', state: 'done', sort_order: 0 },
      { id: 's2', name: 'Component pass', deadline: '2026-07-04', state: 'done', sort_order: 1 },
      { id: 's3', name: 'Content review', deadline: '2026-07-06', state: 'done', sort_order: 2 },
      { id: 's4', name: 'High-fi mockup', deadline: '2026-07-18', state: 'pending', sort_order: 3 },
      { id: 's5', name: 'Handoff spec', deadline: '2026-07-22', state: 'pending', sort_order: 4 },
    ],
  }),
  // Focal step submitted → "In review".
  d({
    id: 'd2',
    name: 'Combat HUD',
    department: 'Animation',
    status: 'In Progress',
    priority: 'High',
    progress: 40,
    steps: [
      { id: 's6', name: 'Damage-state sprites', deadline: '2026-07-16', state: 'in_review', sort_order: 0 },
      { id: 's7', name: 'HUD integration', deadline: '2026-07-25', state: 'pending', sort_order: 1 },
    ],
  }),
  // Single pending step past its deadline → "missed" (N days overdue).
  d({
    id: 'd3',
    name: 'Onboarding flow',
    department: 'UI/UX',
    status: 'In Progress',
    priority: 'Medium',
    steps: [{ id: 's8', name: 'Tutorial copy', deadline: '2026-07-03', state: 'pending', sort_order: 0 }],
  }),
  // Zero steps → "No steps yet".
  d({ id: 'd4', name: 'Character portraits', department: 'Visual Art', status: 'Todo', priority: 'Low', steps: [] }),
  // Delivered — condense into the Timeline zone (splitDeliverables files Done
  // deliverables under the month-grouped history). All steps done.
  d({ id: 't1', name: 'Combat SFX pack', department: 'Asset Creation', status: 'Done', deadline: '2026-06-20', progress: 100, steps: [{ id: 't1s1', name: 'Delivered', deadline: '2026-06-20', state: 'done', sort_order: 0 }] }),
  d({ id: 't2', name: 'Inventory UI build', department: 'UI/UX', status: 'Done', deadline: '2026-06-11', progress: 100, steps: [{ id: 't2s1', name: 'Delivered', deadline: '2026-06-11', state: 'done', sort_order: 0 }] }),
  d({ id: 't3', name: 'Title screen logo', department: 'Visual Art', status: 'Done', deadline: '2026-05-28', progress: 100, steps: [{ id: 't3s1', name: 'Delivered', deadline: '2026-05-28', state: 'done', sort_order: 0 }] }),
  d({ id: 't4', name: 'Tutorial copy pass', department: 'UI/UX', status: 'Done', deadline: '2026-05-15', progress: 100, steps: [{ id: 't4s1', name: 'Delivered', deadline: '2026-05-15', state: 'done', sort_order: 0 }] }),
  d({ id: 't5', name: 'Color palette lock', department: 'Visual Art', status: 'Done', deadline: '2026-04-30', progress: 100, steps: [{ id: 't5s1', name: 'Delivered', deadline: '2026-04-30', state: 'done', sort_order: 0 }] }),
  d({ id: 't6', name: 'Font licensing', department: 'Asset Creation', status: 'Done', deadline: '2026-04-12', progress: 100, steps: [{ id: 't6s1', name: 'Delivered', deadline: '2026-04-12', state: 'done', sort_order: 0 }] }),
];

export function ContractorQaRoute() {
  return (
    <ContractorRouteContent
      now={NOW}
      data={{
        status: 'ready',
        index: {
          profile: {
            id: 'qa',
            displayName: 'Dana Okafor',
            email: 'dana@example.invalid',
            avatarUrl: null,
            isAdmin: false,
            isContractor: true,
          },
          deliverables,
        },
      }}
    />
  );
}
