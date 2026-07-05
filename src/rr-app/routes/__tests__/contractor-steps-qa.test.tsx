// src/rr-app/routes/__tests__/contractor-steps-qa.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ContractorStepsQaRoute } from '../contractor-steps-qa';

describe('contractor steps QA route', () => {
  it('renders every node state from the seed', () => {
    render(
      <MemoryRouter>
        <ContractorStepsQaRoute />
      </MemoryRouter>,
    );
    // group headings
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
    // states present across the seed ("In review" shows on both the node and its
    // rollup heading for a focal-in_review deliverable, hence getAllByText)
    expect(screen.getAllByText('In review').length).toBeGreaterThan(0);
    // overdue label likewise appears on both the missed node and its rollup heading
    expect(screen.getAllByText(/days overdue/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
    // compaction toggle + timeline zone
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /timeline/i })).toBeInTheDocument();
  });
});
