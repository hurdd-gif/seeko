import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Profile, Task } from '@/lib/types';
import type { SettingsViewData } from '@/lib/dashboard-views';
import { SettingsRouteContent } from '../settings';

const profile = {
  id: 'user-1',
  display_name: 'Riley Example',
  email: 'member@example.invalid',
  department: 'Coding',
  role: 'Engineer',
  is_admin: true,
  timezone: 'America/New_York',
  paypal_email: 'pay@example.invalid',
  onboarded: 1,
  tour_completed: 1,
} as Profile;

const completedTasks: Pick<Task, 'id' | 'name' | 'bounty'>[] = [
  { id: 'task-1', name: 'Ship board', bounty: 200 },
];

const view: SettingsViewData = {
  profile,
  isAdmin: true,
  team: [profile],
  completedTasks,
};

function renderSettings(data: Parameters<typeof SettingsRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <SettingsRouteContent data={data} />
    </MemoryRouter>,
  );
}

describe('SettingsRouteContent', () => {
  it('renders an unauthorized state', () => {
    renderSettings({ status: 'unauthorized' });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
  });

  it('renders the real SettingsPanel inside its full-bleed LightShell', () => {
    renderSettings({ status: 'ready', data: view });

    // Full-bleed Paper chrome: a back-link returns to the board (/tasks).
    const backLink = screen.getByRole('link', { name: /Settings/i });
    expect(backLink).toHaveAttribute('href', '/tasks');

    // The real SettingsPanel renders the Settings heading + Account/Profile card.
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Riley Example')).toBeInTheDocument();
  });
});
