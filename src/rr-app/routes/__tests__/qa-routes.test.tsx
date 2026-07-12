import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { InvestorPreviewRoute } from '../investor-preview';
import { SignQaRoute } from '../sign-qa';

describe('QA preview routes', () => {
  it('renders the investor preview seed data', () => {
    // InvestorShell uses useLocation() for active-nav highlighting, so the
    // preview must mount inside a Router (it always does in the real app).
    render(
      <MemoryRouter>
        <InvestorPreviewRoute />
      </MemoryRouter>
    );

    // No visual hero (user call 2026-07-11) — only the screen-reader h1 remains.
    expect(screen.getByRole('heading', { name: 'Investor dashboard' })).toBeInTheDocument();
    // Both preview areas carry target dates, so each area names a row in the
    // Progress ledger AND the What's-shipping ledger.
    expect(screen.getAllByText('Main Game').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fighting Club').length).toBeGreaterThan(0);
    // Milestones dither chart seeded with three milestones (11 of 20 done).
    expect(screen.getByRole('heading', { name: 'Milestones' })).toBeInTheDocument();
    expect(screen.getByText('11 of 20 tasks shipped')).toBeInTheDocument();
  });

  it('renders the signer QA agreement seed data', () => {
    render(
      <MemoryRouter>
        <SignQaRoute />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Mutual NDA' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1. Confidential Information' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign agreement/i })).toBeInTheDocument();
  });
});
