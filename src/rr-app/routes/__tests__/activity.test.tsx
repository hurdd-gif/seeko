import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityRouteContent } from '../activity';
import type { ActivityViewData } from '@/lib/dashboard-views';
import type { TaskActivity } from '@/lib/types';

const account: ActivityViewData['account'] = {
  email: 'member@example.invalid',
  initials: 'RE',
  displayName: 'Riley Example',
  isAdmin: true,
  unreadCount: 0,
  notifications: [],
  team: [{ id: 'user-1', display_name: 'Riley Example' }],
  areas: [{ id: 'area-1', name: 'Main Game' }],
};

const activity: TaskActivity[] = [
  {
    id: 'a1',
    user_id: 'user-1',
    action: 'task.status_changed',
    // The tasks_audit triggers put the TASK NAME in target on typed rows.
    target: 'Game Combat',
    task_id: 'task-1',
    doc_id: null,
    kind: 'status_changed',
    before_value: 'Todo',
    after_value: 'In Progress',
    created_at: '2026-06-18T09:30:00.000Z',
    profiles: { display_name: 'Riley Example', avatar_url: null },
  } as unknown as TaskActivity,
];

const view: ActivityViewData = {
  account,
  activity,
  team: [{ id: 'user-1', display_name: 'Riley Example' }] as ActivityViewData['team'],
  heatmap: [{ date: '2026-06-18', count: 1 }],
};

function renderActivity(data: Parameters<typeof ActivityRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <ActivityRouteContent data={data} />
    </MemoryRouter>,
  );
}

describe('ActivityRouteContent', () => {
  it('renders an unauthorized state', () => {
    renderActivity({ status: 'unauthorized' });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
  });

  it('renders the ActivityView (heatmap + feed) inside the LightShell', () => {
    renderActivity({ status: 'ready', view });

    expect(screen.getByText('Issues')).toBeInTheDocument();
    // Heatmap card header sums the daily counts.
    expect(screen.getByText('1 event in the past six months')).toBeInTheDocument();
    // Feed row uses the actor join + task name from `target`.
    expect(screen.getByText('Riley Example')).toBeInTheDocument();
    expect(screen.getByText('Game Combat')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    // The empty-state card must NOT show when activity exists.
    expect(screen.queryByText('No activity yet.')).not.toBeInTheDocument();
  });

  it('shows the empty state when there is no activity', () => {
    renderActivity({ status: 'ready', view: { ...view, activity: [] } });

    expect(screen.getByText('No activity yet.')).toBeInTheDocument();
  });
});
