import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SharedDocRouteContent } from '../shared';

describe('SharedDocRouteContent', () => {
  it('renders a missing-link state', () => {
    render(<SharedDocRouteContent token="missing-token" initialData={{ status: 'not_found' }} />);

    expect(screen.getByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
    expect(screen.getByText('This document link is invalid or has been removed.')).toBeInTheDocument();
  });

  it('renders an expired-link state', () => {
    render(<SharedDocRouteContent token="expired-token" initialData={{ status: 'expired' }} />);

    expect(screen.getByRole('heading', { name: 'Link Expired' })).toBeInTheDocument();
    expect(screen.getByText('This document link has expired.')).toBeInTheDocument();
  });

  it('renders a pending shared document verification state', () => {
    render(
      <SharedDocRouteContent
        token="pending-token"
        initialData={{
          status: 'pending',
          maskedEmail: 'r********@example.invalid',
          docTitle: 'Pitch Deck',
          docType: 'deck',
          expiresAt: '2026-06-20T00:00:00.000Z',
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Pitch Deck' })).toBeInTheDocument();
    expect(screen.getByText('r********@example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
  });
});
