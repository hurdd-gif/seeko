import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudioHeaderActions } from '../StudioHeaderActions';

// The lazy child (NotificationBell) pulls a Supabase realtime channel that
// doesn't belong in this unit. Stub @/lib/react-router-adapters so it renders
// nothing — we test the header's own wiring.
vi.mock('@/lib/react-router-adapters', () => ({
  Link: ({ href, to, ...props }: { href?: string; to?: string; children?: unknown }) => (
    <a href={href ?? to} {...props} />
  ),
  // CreateIssueButton (rendered inside the header) navigates on press.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  dynamic: () => () => null,
}));

/* The header ships ONE menu: pressing the profile photo blooms a single
 * panel (clip-path circle from the avatar) holding identity → nav → admin
 * → Sign out. There is no separate "More" trigger. */
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
}

describe('StudioHeaderActions', () => {
  it('renders the Create button', () => {
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" />);
    expect(screen.getByRole('button', { name: /Create/ })).toBeInTheDocument();
  });

  it('exposes a single menu trigger — the profile photo', () => {
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // The retired two-menu chrome had a separate "More" nav trigger.
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('is closed until the photo is clicked', () => {
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" displayName="Studio User" />);
    expect(screen.queryByText('Studio User')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Activity' })).not.toBeInTheDocument();
  });

  it('opens identity (name · email) and the nav rows in one panel', () => {
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" displayName="Studio User" />);
    openMenu();
    expect(screen.getByText('Studio User')).toBeInTheDocument();
    expect(screen.getByText('a@seeko.dev')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/activity');
    expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute('href', '/team');
    // Progress disabled 2026-07 — the nav row was removed with it.
    expect(screen.queryByRole('link', { name: 'Progress' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('shows the admin section for admins (Payments, External Signing, Investor)', () => {
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" isAdmin />);
    openMenu();
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute('href', '/payments');
    expect(screen.getByRole('link', { name: 'External Signing' })).toHaveAttribute(
      'href',
      '/admin/external-signing',
    );
    expect(screen.getByRole('link', { name: 'Investor Panel' })).toHaveAttribute(
      'href',
      '/investor',
    );
  });

  it('hides the admin section for non-admins', () => {
    render(<StudioHeaderActions email="b@seeko.dev" initials="KB" />);
    openMenu();
    expect(screen.queryByRole('link', { name: 'Payments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Investor Panel' })).not.toBeInTheDocument();
  });

  it('Sign out reveals a confirm toggle (Yes / Cancel), with Yes posting to /auth/signout', async () => {
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" />);
    openMenu();
    fireEvent.click(screen.getByText('Sign out'));
    // mode="wait" swaps the row → confirm after the exit settles
    expect(await screen.findByText('Sign out?')).toBeInTheDocument();
    const yes = screen.getByRole('button', { name: 'Yes' });
    expect(yes).toBeInTheDocument();
    expect(yes.closest('form')).toHaveAttribute('action', '/auth/signout');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('Escape closes the menu', async () => {
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" displayName="Studio User" />);
    openMenu();
    expect(screen.getByText('Studio User')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    // AnimatePresence exit — the panel unmounts once the fade settles
    await waitFor(() => expect(screen.queryByText('Studio User')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('Appearance is a three-state radiogroup defaulting to System', () => {
    localStorage.removeItem('seeko-theme');
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" />);
    openMenu();
    const group = screen.getByRole('radiogroup', { name: 'Appearance' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
  });

  it('selecting a segment persists the preference and flips the html class', () => {
    localStorage.removeItem('seeko-theme');
    document.documentElement.classList.remove('dark');
    render(<StudioHeaderActions email="a@seeko.dev" initials="KA" />);
    openMenu();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(localStorage.getItem('seeko-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

    // The menu stays open so the flip is visible in place.
    fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(localStorage.getItem('seeko-theme')).toBe('system');
    // jsdom's matchMedia stub never matches → system resolves light.
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
