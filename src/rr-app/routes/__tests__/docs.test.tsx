import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocsRouteContent } from '../docs';
import type { DocsViewData } from '@/lib/dashboard-views';
import type { Doc, Profile } from '@/lib/types';

const account: DocsViewData['account'] = {
  email: 'member@example.invalid',
  initials: 'RE',
  displayName: 'Riley Example',
  isAdmin: true,
  unreadCount: 0,
  notifications: [],
  team: [{ id: 'user-1', display_name: 'Riley Example' }],
  areas: [{ id: 'area-1', name: 'Main Game' }],
};

const docs: Doc[] = [
  { id: 'doc-1', title: 'Game Design Doc', sort_order: 0, type: 'doc' },
  { id: 'doc-2', title: 'Onboarding', sort_order: 1, type: 'doc' },
];

const team: Profile[] = [
  { id: 'user-1', display_name: 'Riley Example', department: 'Coding', is_admin: true } as Profile,
];

const index: DocsViewData = {
  account,
  docs,
  team,
  userDepartment: 'Coding',
  isAdmin: true,
  currentUserId: 'user-1',
};

function renderDocs(data: Parameters<typeof DocsRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <DocsRouteContent data={data} />
    </MemoryRouter>,
  );
}

describe('DocsRouteContent', () => {
  it('renders an unauthorized state', () => {
    renderDocs({ status: 'unauthorized' });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
    expect(screen.getByText('Use your SEEKO account to view documents.')).toBeInTheDocument();
  });

  it('renders the real DocList inside the Docs LightShell', () => {
    renderDocs({ status: 'ready', data: index });

    // LightShell chrome (Issues + Docs flat tabs) + redesigned docs work surface.
    expect(screen.getByTestId('Documents tab')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search documents...')).toBeInTheDocument();
    expect(screen.getAllByText('Game Design Doc').length).toBeGreaterThan(0);
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText('Issues')).toBeInTheDocument();
  });
});
