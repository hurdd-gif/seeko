import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TeamRosterData } from '@/lib/team-roster';
import { TeamRouteContent } from '../team';

const roster: TeamRosterData = {
  currentUser: {
    id: 'user-1',
    email: 'member@example.invalid',
  },
  currentProfile: {
    id: 'user-1',
    display_name: 'Riley Example',
    is_admin: true,
    onboarded: 1,
    tour_completed: 1,
  },
  isAdmin: true,
  onlineCount: 0,
  team: [
    {
      id: 'user-1',
      display_name: 'Riley Example',
      role: 'Engineer',
      department: 'Coding',
      is_admin: true,
      onboarded: 1,
      tour_completed: 1,
      last_seen_at: '2026-06-18T12:00:00.000Z',
      timezone: 'America/New_York',
      nda_accepted_at: '2026-06-01T12:00:00.000Z',
    },
    {
      id: 'user-2',
      display_name: 'Morgan Example',
      role: 'Illustrator',
      department: 'Visual Art',
      is_admin: false,
      is_contractor: true,
      onboarded: 1,
      tour_completed: 1,
    },
  ],
  members: [
    {
      id: 'user-1',
      display_name: 'Riley Example',
      role: 'Engineer',
      department: 'Coding',
      is_admin: true,
      onboarded: 1,
      tour_completed: 1,
      last_seen_at: '2026-06-18T12:00:00.000Z',
      timezone: 'America/New_York',
      nda_accepted_at: '2026-06-01T12:00:00.000Z',
    },
  ],
  contractors: [
    {
      id: 'user-2',
      display_name: 'Morgan Example',
      role: 'Illustrator',
      department: 'Visual Art',
      is_admin: false,
      is_contractor: true,
      onboarded: 1,
      tour_completed: 1,
    },
  ],
};

function nonAdminRoster(): TeamRosterData {
  return {
    ...roster,
    isAdmin: false,
    currentProfile: { ...roster.currentProfile!, is_admin: false },
  };
}

function renderTeam(data: Parameters<typeof TeamRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <TeamRouteContent data={data} />
    </MemoryRouter>,
  );
}

describe('TeamRouteContent', () => {
  it('renders an unauthorized state', () => {
    renderTeam({ status: 'unauthorized' });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
    expect(screen.getByText('Use your SEEKO account to view the team roster.')).toBeInTheDocument();
  });

  it('renders the Team header with member + contractor sections inside the LightShell', () => {
    renderTeam({ status: 'ready', roster });

    // Full-bleed Paper chrome: a back-link returns to the board (/tasks).
    const backLink = screen.getByRole('link', { name: /Team/i });
    expect(backLink).toHaveAttribute('href', '/tasks');

    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Contractors')).toBeInTheDocument();
    expect(screen.getByText('Riley Example')).toBeInTheDocument();
    expect(screen.getByText('Morgan Example')).toBeInTheDocument();
  });

  it('shows the invite form and per-member admin controls for admins', () => {
    renderTeam({ status: 'ready', roster });

    // InviteForm header (collapsed, but its title is always visible)
    expect(screen.getByText('Invite Member')).toBeInTheDocument();
    // Department renders as an interactive select trigger (a button) for admins.
    expect(screen.getByRole('button', { name: 'Coding' })).toBeInTheDocument();
    // Contractor toggle actions are admin-only.
    expect(screen.getByText('Make Contractor')).toBeInTheDocument();
    expect(screen.getByText('Make Member')).toBeInTheDocument();
  });

  it('shows department chips and hides admin controls for non-admins', () => {
    renderTeam({ status: 'ready', roster: nonAdminRoster() });

    expect(screen.queryByText('Invite Member')).not.toBeInTheDocument();
    expect(screen.queryByText('Make Contractor')).not.toBeInTheDocument();
    // Department renders as a static chip (span), not an interactive select button.
    expect(screen.queryByRole('button', { name: 'Coding' })).not.toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
    expect(screen.getByText('Visual Art')).toBeInTheDocument();
  });
});
