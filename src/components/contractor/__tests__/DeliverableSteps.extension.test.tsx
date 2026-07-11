import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContractorStep } from '@/lib/contractor-steps';
import { DeliverableSteps } from '../DeliverableSteps';

const NOW = new Date('2026-07-05T09:00:00');
const steps: ContractorStep[] = [{ id: 's1', name: 'Draft', deadline: '2026-07-10', state: 'pending', sort_order: 0 }];

describe('DeliverableSteps extension affordance', () => {
  it('renders the request affordance when the deliverable has a deadline', () => {
    render(<DeliverableSteps name="Wireframes" department="UI/UX" steps={steps} now={NOW} taskId="task-1" deadline="2026-07-18" latestExtension={null} />);
    expect(screen.getByRole('button', { name: /request more time/i })).toBeInTheDocument();
  });

  it('omits the affordance when the deliverable has no deadline', () => {
    render(<DeliverableSteps name="Wireframes" department="UI/UX" steps={steps} now={NOW} taskId="task-1" deadline={null} latestExtension={null} />);
    expect(screen.queryByRole('button', { name: /request more time/i })).not.toBeInTheDocument();
  });
});
