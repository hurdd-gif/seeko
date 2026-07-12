import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ContractorQaRoute } from '../contractor-qa';

describe('contractor QA route (canonical, step model)', () => {
  it('renders the step model: focal states, compaction, empty, and the timeline', () => {
    render(
      <MemoryRouter>
        <ContractorQaRoute />
      </MemoryRouter>,
    );
    // group headings from the seed — scoped to headings, since the journey
    // rail repeats each deliverable name as a stop
    expect(screen.getByRole('heading', { name: 'Main menu wireframes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Onboarding flow' })).toBeInTheDocument();
    // in_review focal state ("In review" shows on both the node and its rollup heading)
    expect(screen.getAllByText('In review').length).toBeGreaterThan(0);
    // missed focal state ("N days overdue" on both the node and its rollup heading)
    expect(screen.getAllByText(/days overdue/i).length).toBeGreaterThan(0);
    // zero-step deliverable (shows on the card and as the rail stop's sublabel)
    expect(screen.getAllByText(/no steps yet/i).length).toBeGreaterThan(0);
    // compaction toggle (≥2 leading done steps collapse to "N done")
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    // delivered work condensed into the Delivered history zone
    expect(screen.getByRole('heading', { name: /delivered/i })).toBeInTheDocument();
  });
});
