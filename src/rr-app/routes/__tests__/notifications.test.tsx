import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NotificationsRouteContent } from '../notifications';
import type { NotificationsViewData } from '@/lib/dashboard-views';
import type { ViewState } from '../../load-view';

// The legacy `(dashboard)/notifications/page.tsx` rendered the original
// <NotificationsPanel> (a notification-PREFERENCES surface: level cards +
// channel switches), wrapped in <FadeRise>. The faithful rr-app route must mount
// that same component verbatim — NOT a fabricated "Inbox" feed. The route DOES
// take a loader now, but only to dress the page in the real signed-in account
// chrome (it was the last page wearing the static "SK" ShellFrame mirror) — so
// the test drives NotificationsRouteContent with a ready ViewState, same as the
// other LightShell route tests.
const READY: ViewState<NotificationsViewData> = {
  status: 'ready',
  data: {
    account: {
      email: 'user@example.com',
      initials: 'TU',
      displayName: 'Test User',
      userId: 'profile-uuid-1',
      isAdmin: false,
      unreadCount: 0,
      notifications: [],
      team: [],
      areas: [],
    },
  },
};

const renderRoute = () =>
  render(
    <MemoryRouter>
      <NotificationsRouteContent data={READY} />
    </MemoryRouter>,
  );

describe('NotificationsRoute', () => {
  it('renders the original NotificationsPanel preferences (not a fabricated inbox feed)', () => {
    renderRoute();

    // Panel header + copy (verbatim component)
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(
      screen.getByText('Choose what you want to be notified about.'),
    ).toBeInTheDocument();

    // The two preference cards
    expect(screen.getByText('Notification Level')).toBeInTheDocument();
    expect(screen.getByText('Channels')).toBeInTheDocument();

    // Real channel rows
    expect(screen.getByText('Task Updates')).toBeInTheDocument();
    expect(screen.getByText('Security Alerts')).toBeInTheDocument();

    // Real save control
    expect(
      screen.getByRole('button', { name: 'Save Preferences' }),
    ).toBeInTheDocument();
  });

  it('wears the real account chrome, not the static "SK" identity', () => {
    renderRoute();

    // The signed-in account cluster is present (LightShell + StudioHeaderActions)…
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();

    // …and the old hardcoded ShellFrame identity is gone.
    expect(screen.queryByText('SK')).not.toBeInTheDocument();
    expect(screen.queryByText('studio@seeko.app')).not.toBeInTheDocument();
  });
});
