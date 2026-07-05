import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ExternalSigningAdminRouteContent } from '../external-signing-admin';

// The faithful route renders the ORIGINAL <ExternalSigningAdmin> composition,
// whose <InviteTable> loads its rows straight from the browser Supabase client
// on mount. Stub the client to resolve empty so the real table reaches its
// "No invites sent yet" state headlessly — this proves the route mounts the
// ORIGINAL SendInviteForm + InviteTable verbatim, not a hand-rewritten scaffold.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

const renderRoute = (props: React.ComponentProps<typeof ExternalSigningAdminRouteContent>) =>
  render(
    <MemoryRouter>
      <ExternalSigningAdminRouteContent {...props} />
    </MemoryRouter>,
  );

describe('ExternalSigningAdminRouteContent', () => {
  it('gates non-admins with a Paper access state', () => {
    renderRoute({ data: { status: 'forbidden' } });

    expect(screen.getByRole('heading', { name: 'Admin access required' })).toBeInTheDocument();
    expect(
      screen.getByText('Only studio admins can manage external signing.'),
    ).toBeInTheDocument();
  });

  it('gates signed-out visitors with a Paper sign-in state', () => {
    renderRoute({ data: { status: 'unauthorized' } });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
  });

  it('renders the redesigned composition (drill-in chrome, table-first, composer in a dialog)', async () => {
    renderRoute({ data: { status: 'ready' } });

    // Drill-in chrome: the LightShell leftSlot back-link carries the page
    // identity — there is no hero heading anymore.
    expect(screen.getByText('External Signing')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'External Signing' })).not.toBeInTheDocument();

    // Real InviteTable — resolves to its empty state via the stubbed client.
    expect(await screen.findByText('No invites sent yet')).toBeInTheDocument();

    // The composer no longer renders inline; it mounts inside the New Invite
    // dialog (bar pill + empty-state CTA both open it).
    expect(screen.queryByPlaceholderText('name@company.com')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /new invite/i })[0]);
    expect(await screen.findByRole('dialog', { name: 'New invite' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
  });
});
