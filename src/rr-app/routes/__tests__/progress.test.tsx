import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressRouteContent } from '../progress';
import type { ProgressViewData } from '@/lib/dashboard-views';
import type { Area, Milestone } from '@/lib/types';

const account: ProgressViewData['account'] = {
  email: 'member@example.invalid',
  initials: 'RE',
  displayName: 'Riley Example',
  isAdmin: true,
  unreadCount: 0,
  notifications: [],
  team: [{ id: 'user-1', display_name: 'Riley Example' }],
  areas: [{ id: 'area-1', name: 'Main Game' }],
};

const areas: Area[] = [
  { id: 'area-1', name: 'Main Game', status: 'Active', progress: 60 } as Area,
  { id: 'area-2', name: 'Fighting Club', status: 'Planned', progress: 20 } as Area,
];

const milestones: Milestone[] = [
  { id: 'm1', name: 'Vertical slice', target_date: '2026-07-15', area_id: 'area-1', sort_order: 0 } as Milestone,
];

const view: ProgressViewData = { account, areas, milestones, isAdmin: true };

function renderProgress(data: Parameters<typeof ProgressRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <ProgressRouteContent data={data} />
    </MemoryRouter>,
  );
}

describe('ProgressRouteContent', () => {
  it('renders an unauthorized state', () => {
    renderProgress({ status: 'unauthorized' });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
  });

  it('renders the real StudioProgressRing inside the LightShell', () => {
    renderProgress({ status: 'ready', view });

    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByText('Issues')).toBeInTheDocument();
  });
});
