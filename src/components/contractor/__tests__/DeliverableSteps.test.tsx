// src/components/contractor/__tests__/DeliverableSteps.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContractorStep } from '@/lib/contractor-steps';
import { DeliverableSteps } from '../DeliverableSteps';

const NOW = new Date('2026-07-05T09:00:00');

function s(partial: Partial<ContractorStep>): ContractorStep {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Step',
    deadline: partial.deadline ?? null,
    state: partial.state ?? 'pending',
    sort_order: partial.sort_order ?? 0,
  };
}

describe('DeliverableSteps', () => {
  it('renders the heading name and the derived rollup', () => {
    render(
      <ul>
        <DeliverableSteps
          name="Main menu wireframes"
          department="UI/UX"
          now={NOW}
          steps={[
            s({ id: 'a', state: 'done', sort_order: 0 }),
            s({ id: 'b', state: 'pending', deadline: '2026-07-18', sort_order: 1 }),
          ]}
        />
      </ul>,
    );
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 · next Sat, Jul 18')).toBeInTheDocument();
  });

  it('shows a "No steps yet" line when the deliverable has no steps', () => {
    render(
      <ul>
        <DeliverableSteps name="Character portraits" department="Visual Art" now={NOW} steps={[]} />
      </ul>,
    );
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
  });

  it('collapses two or more done steps behind a "✓ N done — show" toggle', () => {
    render(
      <ul>
        <DeliverableSteps
          name="Main menu wireframes"
          department="UI/UX"
          now={NOW}
          steps={[
            s({ id: 'a', name: 'Low-fi flows', state: 'done', sort_order: 0 }),
            s({ id: 'b', name: 'Component pass', state: 'done', sort_order: 1 }),
            s({ id: 'c', name: 'High-fi mockup', state: 'pending', deadline: '2026-07-18', sort_order: 2 }),
          ]}
        />
      </ul>,
    );
    // done steps hidden behind the toggle, focal always visible
    expect(screen.queryByText('Low-fi flows')).not.toBeInTheDocument();
    expect(screen.getByText('High-fi mockup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2 done/i }));
    expect(screen.getByText('Low-fi flows')).toBeInTheDocument();
    expect(screen.getByText('Component pass')).toBeInTheDocument();
  });

  it('renders a single done step inline (no toggle)', () => {
    render(
      <ul>
        <DeliverableSteps
          name="Combat HUD"
          department="Animation"
          now={NOW}
          steps={[
            s({ id: 'a', name: 'Damage sprites', state: 'done', sort_order: 0 }),
            s({ id: 'b', name: 'HUD integration', state: 'pending', deadline: '2026-07-25', sort_order: 1 }),
          ]}
        />
      </ul>,
    );
    expect(screen.getByText('Damage sprites')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /done/i })).not.toBeInTheDocument();
  });

  it('optimistically flips the focal step to In review and calls onAdvance', async () => {
    const onAdvance = vi.fn().mockResolvedValue(undefined);
    render(
      <ul>
        <DeliverableSteps
          name="Combat HUD"
          department="Animation"
          now={NOW}
          onAdvance={onAdvance}
          steps={[s({ id: 'b', name: 'HUD integration', state: 'pending', deadline: '2026-07-25', sort_order: 0 })]}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /submit hud integration for review/i }));
    // Optimistic flip: the node now reads "In review" (the rollup heading mirrors it
    // for a single-step deliverable, hence getAllByText), and the submit button is gone.
    expect(screen.getAllByText('In review').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /submit hud integration for review/i })).not.toBeInTheDocument();
    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith('b'));
  });

  it('reverts and shows an error when the advance fails', async () => {
    const onAdvance = vi.fn().mockRejectedValue(new Error('nope'));
    render(
      <ul>
        <DeliverableSteps
          name="Combat HUD"
          department="Animation"
          now={NOW}
          onAdvance={onAdvance}
          steps={[s({ id: 'b', name: 'HUD integration', state: 'pending', deadline: '2026-07-25', sort_order: 0 })]}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /submit hud integration for review/i }));
    await waitFor(() => expect(screen.getByText(/couldn’t submit/i)).toBeInTheDocument());
    // reverted: the focal step is tappable again
    expect(screen.getByRole('button', { name: /submit hud integration for review/i })).toBeInTheDocument();
  });
});
