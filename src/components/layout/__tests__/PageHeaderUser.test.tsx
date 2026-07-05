import { render, screen, fireEvent } from '@testing-library/react';
import { PageHeaderUser } from '../PageHeaderUser';

// The dropdown's lazy child (NotificationBell) is not under test here — stub
// @/lib/react-router-adapters so it doesn't pull its tree in.
vi.mock('@/lib/react-router-adapters', () => ({
  Link: ({ href, to, ...props }: { href?: string; to?: string; children?: unknown }) => (
    <a href={href ?? to} {...props} />
  ),
  dynamic: () => () => null,
}));

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
}

describe('PageHeaderUser dropdown', () => {
  it('shows Payments in the menu for admins, linking to /payments', () => {
    render(<PageHeaderUser email="a@seeko.dev" isAdmin />);
    openMenu();
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute(
      'href',
      '/payments',
    );
  });

  it('hides Payments from the menu for non-admins', () => {
    render(<PageHeaderUser email="b@seeko.dev" />);
    openMenu();
    expect(screen.queryByRole('link', { name: 'Payments' })).not.toBeInTheDocument();
  });
});
