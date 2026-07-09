import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InvoiceRouteContent } from '../invoice';

describe('InvoiceRouteContent', () => {
  it('renders a missing-link state', () => {
    render(<InvoiceRouteContent token="missing-token" initialData={{ status: 'not_found' }} />);

    expect(screen.getByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
    expect(screen.getByText('This invoice link is invalid or has been removed.')).toBeInTheDocument();
  });

  it('renders an expired-link state', () => {
    render(<InvoiceRouteContent token="expired-token" initialData={{ status: 'expired' }} />);

    expect(screen.getByRole('heading', { name: 'Link Expired' })).toBeInTheDocument();
    expect(screen.getByText('This invoice request link has expired.')).toBeInTheDocument();
  });

  it('renders a pending invoice verification state', () => {
    render(
      <InvoiceRouteContent
        token="pending-token"
        initialData={{
          status: 'pending',
          maskedEmail: 'r********@example.invalid',
          expiresAt: '2026-06-20T00:00:00.000Z',
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Invoice Request' })).toBeInTheDocument();
    expect(screen.getByText('r********@example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
  });
});
