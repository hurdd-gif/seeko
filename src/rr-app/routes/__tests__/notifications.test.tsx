import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NotificationsRoute } from '../notifications';

// The legacy `(dashboard)/notifications/page.tsx` rendered the original
// <NotificationsPanel> (a notification-PREFERENCES surface: level cards +
// channel switches), wrapped in <FadeRise>. The faithful rr-app route must mount
// that same component verbatim — NOT a fabricated "Inbox" feed reading loader
// data. Rendering the route directly (no data router) also proves the route no
// longer depends on useLoaderData.
const renderRoute = () =>
  render(
    <MemoryRouter>
      <NotificationsRoute />
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
});
