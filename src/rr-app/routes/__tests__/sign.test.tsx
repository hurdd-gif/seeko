import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignRouteContent } from '../sign';

describe('SignRouteContent', () => {
  it('renders a missing-link terminal state', () => {
    render(<SignRouteContent token="missing-token" initialData={{ status: 'notfound' }} />);

    expect(screen.getByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
    expect(screen.getByText(/couldn't find this signing request/i)).toBeInTheDocument();
  });

  it('renders an expired-link terminal state', () => {
    render(<SignRouteContent token="expired-token" initialData={{ status: 'expired' }} />);

    expect(screen.getByRole('heading', { name: 'Link expired' })).toBeInTheDocument();
    expect(screen.getByText(/this signing link has expired/i)).toBeInTheDocument();
  });

  it('renders a pending signing verification state', () => {
    render(
      <SignRouteContent
        token="pending-token"
        initialData={{
          status: 'pending',
          maskedEmail: 'r********@example.invalid',
          templateName: 'Contractor Agreement',
          personalNote: 'Please sign',
          isGuardianSigning: false,
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Contractor Agreement' })).toBeInTheDocument();
    expect(screen.getByText('r********@example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
  });
});
