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

    expect(screen.getByRole('heading', { name: 'Current state of SEEKO' })).toBeInTheDocument();
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Fighting Club')).toBeInTheDocument();
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
