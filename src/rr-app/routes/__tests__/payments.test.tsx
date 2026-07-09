import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PaymentsRouteContent } from '../payments';
import type { Profile } from '@/lib/types';

// The route renders the ORIGINAL <PaymentsAdmin> verbatim (Family A — it owns
// its own LightShell and self-gates with the passkey flow). In jsdom there's no
// window.PublicKeyCredential, so the gate settles into its "unsupported" mode
// synchronously, with no network — letting us assert the real component mounted.

function renderPayments(data: Parameters<typeof PaymentsRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <PaymentsRouteContent data={data} />
    </MemoryRouter>
  );
}

const team: (Profile & { paypal_email?: string })[] = [
  {
    id: 'p1',
    display_name: 'Riley Example',
    department: 'Coding',
    role: 'Engineer',
    paypal_email: 'riley@example.com',
  } as Profile & { paypal_email?: string },
];

describe('PaymentsRouteContent', () => {
  it('shows a sign-in prompt when unauthorized', () => {
    renderPayments({ status: 'unauthorized' });
    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
  });

  it('shows an admin-only prompt when forbidden', () => {
    renderPayments({ status: 'forbidden' });
    expect(screen.getByText(/payments access required/i)).toBeInTheDocument();
  });

  it('mounts the real PaymentsAdmin (passkey gate) for admins when ready', () => {
    renderPayments({ status: 'ready', team, isAdmin: true, isInvestor: false });
    // PaymentsAdmin → PaymentsPasskeyGate, "unsupported" mode in jsdom.
    expect(screen.getByText(/passkeys unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /payments/i })).toBeInTheDocument();
  });

  it('mounts the shared payments screen directly for investor viewers', () => {
    renderPayments({ status: 'ready', team, isAdmin: false, isInvestor: true });
    expect(screen.getByRole('link', { name: /investor dashboard/i })).toHaveAttribute('href', '/investor');
    expect(screen.queryByText(/passkeys unavailable/i)).not.toBeInTheDocument();
  });
});
