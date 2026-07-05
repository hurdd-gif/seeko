// src/components/contractor/__tests__/StepNode.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DerivedStep } from '@/lib/contractor-steps';
import { StepNode } from '../StepNode';

const NOW = new Date('2026-07-05T09:00:00');

function derived(over: Partial<DerivedStep> & { rendered: DerivedStep['rendered'] }): DerivedStep {
  return {
    step: { id: 's1', name: 'High-fi mockup', deadline: '2026-07-18', state: 'pending', sort_order: 0, ...over.step },
    rendered: over.rendered,
    isFocal: over.isFocal ?? false,
    canAdvance: over.canAdvance ?? false,
  };
}

function renderNode(d: DerivedStep, onAdvance?: (id: string) => void) {
  return render(
    <ul>
      <StepNode derived={d} department="UI/UX" now={NOW} onAdvance={onAdvance} />
    </ul>,
  );
}

describe('StepNode', () => {
  it('renders an upcoming step with its due date and no button', () => {
    renderNode(derived({ rendered: 'upcoming' }));
    expect(screen.getByText('High-fi mockup')).toBeInTheDocument();
    expect(screen.getByText('Sat, Jul 18')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders "No deadline" for an undated step', () => {
    renderNode(derived({ rendered: 'upcoming', step: { id: 's1', name: 'Handoff', deadline: null, state: 'pending', sort_order: 0 } }));
    expect(screen.getByText('No deadline')).toBeInTheDocument();
  });

  it('renders a pending-review step with a blue "In review" label', () => {
    renderNode(derived({ rendered: 'pending-review', step: { id: 's1', name: 'Sprites', deadline: '2026-07-25', state: 'in_review', sort_order: 0 } }));
    expect(screen.getByText('In review')).toBeInTheDocument();
  });

  it('renders a missed step with an overdue label', () => {
    renderNode(derived({ rendered: 'missed', step: { id: 's1', name: 'Tutorial copy', deadline: '2026-07-03', state: 'pending', sort_order: 0 } }));
    expect(screen.getByText('2 days overdue')).toBeInTheDocument();
  });

  it('renders the focal active step as a button that advances on click', async () => {
    const onAdvance = vi.fn();
    renderNode(derived({ rendered: 'active', isFocal: true, canAdvance: true }), onAdvance);
    const button = screen.getByRole('button', { name: /submit high-fi mockup for review/i });
    fireEvent.click(button);
    expect(onAdvance).toHaveBeenCalledWith('s1');
  });

  it('does not render a button when the step cannot be advanced', () => {
    renderNode(derived({ rendered: 'active', isFocal: true, canAdvance: false }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
