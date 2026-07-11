import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskDetailRouteContent } from '../task-detail';
import type { TaskDetailFullData } from '@/lib/tasks-board';
import type { Area, PendingExtension, Profile, TaskActivity, TaskWithAssignee } from '@/lib/types';

const task: TaskWithAssignee = {
  id: 'task-1',
  task_number: 42,
  name: 'Ship task detail',
  department: 'Coding',
  status: 'In Progress',
  priority: 'High',
  area_id: 'area-1',
  assignee_id: 'user-1',
  deadline: '2026-06-25',
  description: 'Move task detail into Hono.',
  bounty: null,
  progress: 40,
  created_at: '2026-06-18T12:00:00.000Z',
  assignee: { id: 'user-1', display_name: 'Riley Example', avatar_url: null },
};

const team: Profile[] = [
  {
    id: 'user-1',
    display_name: 'Riley Example',
    department: 'Coding',
    role: 'Engineer',
    avatar_url: null,
    is_admin: true,
  } as Profile,
];

const areas: Area[] = [
  { id: 'area-1', name: 'Migration', status: 'Active', progress: 60 } as Area,
];

const activity: TaskActivity[] = [];

const detail: TaskDetailFullData = {
  task,
  areas,
  team,
  milestones: [],
  activity,
  isAdmin: true,
  pendingExtension: null,
};

const PENDING_EXTENSION: PendingExtension = {
  id: 'ext-1',
  requesterName: 'Riley Example',
  originalDeadline: '2026-06-25',
  requestedDeadline: '2026-07-02',
  reason: 'Scope grew',
};

/** Reuses the full fixture, flipping only `isAdmin` / `pendingExtension`. */
function withPendingExtension(overrides: Pick<TaskDetailFullData, 'isAdmin' | 'pendingExtension'>): TaskDetailFullData {
  return { ...detail, ...overrides };
}

function renderDetail(data: Parameters<typeof TaskDetailRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <TaskDetailRouteContent data={data} />
    </MemoryRouter>,
  );
}

describe('TaskDetailRouteContent', () => {
  it('renders the real TaskDetailPage from the full board shape', () => {
    renderDetail({ status: 'ready', data: detail });

    expect(screen.getByRole('heading', { name: 'Ship task detail' })).toBeInTheDocument();
    expect(screen.getByText('Move task detail into Hono.')).toBeInTheDocument();
    // Original chrome: bare task-number id label + Issues back-link.
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Issues')).toBeInTheDocument();
  });

  it('shows a sign-in state when unauthorized', () => {
    renderDetail({ status: 'unauthorized' });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
  });

  it('never shows the deadline-extension banner to a non-admin, even with a pending extension', () => {
    renderDetail({
      status: 'ready',
      detail: withPendingExtension({ isAdmin: false, pendingExtension: PENDING_EXTENSION }),
    });

    expect(screen.queryByText(/requested a deadline extension/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });

  it('shows the deadline-extension banner to an admin with a pending extension', () => {
    renderDetail({
      status: 'ready',
      detail: withPendingExtension({ isAdmin: true, pendingExtension: PENDING_EXTENSION }),
    });

    expect(screen.getByText(/requested a deadline extension/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
  });
});
