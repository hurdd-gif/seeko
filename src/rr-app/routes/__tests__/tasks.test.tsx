import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Area, Profile, TaskWithAssignee } from '@/lib/types';
import type { TasksBoardData } from '@/lib/tasks-board';
import { TasksRouteContent } from '../tasks';

vi.mock('@/components/dashboard/tasks/TasksBoard', () => ({
  TasksBoard: ({ tasks }: TasksBoardData) => (
    <section aria-label="Mock issues board">
      <h1>Issues</h1>
      <button type="button">Create</button>
      <button type="button" aria-label="Open menu" />
      {tasks.map((task) => (
        <p key={task.id}>{task.name}</p>
      ))}
    </section>
  ),
}));

const boardTask: TaskWithAssignee = {
  id: 'task-1',
  name: 'Ship task index',
  department: 'Coding',
  status: 'In Progress',
  priority: 'High',
  area_id: 'area-1',
  assignee_id: 'user-2',
  deadline: '2026-06-25',
  description: 'Move task board data into Hono.',
  bounty: 250,
  progress: 40,
  created_at: '2026-06-18T12:00:00.000Z',
  assignee: { id: 'user-2', display_name: 'Morgan Example', avatar_url: null },
};

const team: Profile[] = [
  {
    id: 'admin-1',
    display_name: 'Riley Admin',
    department: 'Coding',
    is_admin: true,
    onboarded: 1,
    tour_completed: 1,
  },
  {
    id: 'user-2',
    display_name: 'Morgan Example',
    department: 'Visual Art',
    is_admin: false,
    onboarded: 1,
    tour_completed: 1,
  },
];

const areas: Area[] = [
  { id: 'area-1', name: 'Migration', status: 'Active', progress: 40 },
];

const board: TasksBoardData = {
  tasks: [boardTask],
  team,
  areas,
  projectMilestones: [],
  projectActivity: [],
  isAdmin: true,
  currentUserId: 'admin-1',
  account: {
    email: 'admin@example.invalid',
    initials: 'RA',
    displayName: 'Riley Admin',
    isAdmin: true,
    unreadCount: 0,
    notifications: [],
    team: team.map((m) => ({ id: m.id, display_name: m.display_name })),
    areas: areas.map((a) => ({ id: a.id, name: a.name })),
  },
};

function renderBoard(data: Parameters<typeof TasksRouteContent>[0]['data']) {
  return render(
    <MemoryRouter>
      <TasksRouteContent data={data} />
    </MemoryRouter>,
  );
}

describe('TasksRouteContent', () => {
  it('renders an unauthorized state', () => {
    renderBoard({ status: 'unauthorized' });

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
    expect(screen.getByText('Use your SEEKO account to view tasks.')).toBeInTheDocument();
  });

  it('renders the original board with its chrome', () => {
    renderBoard({ status: 'ready', board });

    // Task card from the real <TasksBoard> grid.
    expect(screen.getByText('Ship task index')).toBeInTheDocument();
    // LightShell chrome cluster (StudioHeaderActions) — Create + the single
    // avatar menu trigger (the "More" nav button was retired) + Issues tab.
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    expect(screen.getByText('Issues')).toBeInTheDocument();
  });
});
