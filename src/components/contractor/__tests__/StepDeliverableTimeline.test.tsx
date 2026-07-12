// src/components/contractor/__tests__/StepDeliverableTimeline.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { StepDeliverableTimeline } from '../StepDeliverableTimeline';

const NOW = new Date('2026-07-05T09:00:00');

function deliverable(over: Partial<ContractorStepDeliverable>): ContractorStepDeliverable {
  return {
    id: over.id ?? 'd1',
    name: over.name ?? 'Deliverable',
    department: over.department ?? 'Coding',
    status: over.status ?? 'In Progress',
    priority: over.priority ?? 'Medium',
    deadline: over.deadline ?? null,
    progress: over.progress ?? 0,
    description: over.description ?? null,
    steps: over.steps ?? [],
  };
}

const mayTimeline: TimelineMonth[] = [
  {
    key: '2026-05',
    label: 'May 2026',
    items: [
      { id: 'c', name: 'Combat SFX', department: 'Asset Creation', status: 'Done', priority: 'Low', deadline: '2026-05-20', progress: 100, description: null },
    ],
  },
];

describe('StepDeliverableTimeline', () => {
  it('renders the empty state when there is no active work and no history', () => {
    render(<StepDeliverableTimeline active={[]} timeline={[]} now={NOW} />);
    expect(screen.getByText(/no deliverables assigned yet/i)).toBeInTheDocument();
  });

  it('renders each active deliverable as a step group', () => {
    render(
      <StepDeliverableTimeline
        active={[
          deliverable({
            id: 'd1',
            name: 'Main menu wireframes',
            steps: [{ id: 's1', name: 'High-fi mockup', deadline: '2026-07-18', state: 'pending', sort_order: 0 }],
          }),
        ]}
        timeline={[]}
        now={NOW}
      />,
    );
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('High-fi mockup')).toBeInTheDocument();
  });

  it('shows the "all caught up" line plus the timeline when active is empty but history exists', () => {
    render(<StepDeliverableTimeline active={[]} timeline={mayTimeline} now={NOW} />);
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /delivered/i })).toBeInTheDocument();
    expect(screen.getByText('Combat SFX')).toBeInTheDocument();
  });
});
