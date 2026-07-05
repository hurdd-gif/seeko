import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { InvestorProfile } from '@/lib/investor-index';
import { InvestorShell } from '../investor-layout';

// Investor chrome follows the same Paper top-tab grammar as the main dashboard,
// but exposes only investor-appropriate surfaces: Dashboard, Documents, Payments.
const profile: InvestorProfile = {
  id: 'investor-1',
  displayName: 'Investor Example',
  email: 'investor@example.invalid',
  avatarUrl: null,
  timezone: 'America/New_York',
  paypalEmail: null,
  isAdmin: false,
  isInvestor: true,
};

describe('InvestorShell', () => {
  it('wraps child content in the investor top-tab chrome', () => {
    render(
      <MemoryRouter initialEntries={['/investor']}>
        <InvestorShell profile={profile}>
          <p>Panel content</p>
        </InvestorShell>
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation', { name: 'Investor sections' });
    expect(screen.getByRole('link', { name: 'Investor dashboard' })).toHaveAttribute('href', '/investor');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/investor');
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/investor/docs');
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute('href', '/investor/payments');
    expect(nav).toContainElement(screen.getByTestId('Dashboard tab'));
    expect(screen.getByRole('button', { name: /Download PDF/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Settings' })).not.toBeInTheDocument();

    // Child content renders inside the shell.
    expect(screen.getByText('Panel content')).toBeInTheDocument();
  });

  it('groups settings, sign out, and admin dashboard in the profile dropdown', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/investor']}>
        <InvestorShell profile={profile}>
          <p>Panel content</p>
        </InvestorShell>
      </MemoryRouter>
    );

    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/investor/settings');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('menuitem', { name: 'Back to dashboard' })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/investor']}>
        <InvestorShell profile={{ ...profile, isAdmin: true }}>
          <p>Panel content</p>
        </InvestorShell>
      </MemoryRouter>
    );

    expect(screen.getByRole('menuitem', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });
});
