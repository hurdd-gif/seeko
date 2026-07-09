import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TaskCard } from '../TaskCard';
import type { TaskWithAssignee } from '@/lib/types';

// motion/react renders plain DOM in jsdom; no mock needed. createPortal lands
// in document.body, which RTL queries by default.

const baseTask: TaskWithAssignee = {
  id: 'task-1',
  task_number: 42,
  name: 'Placeholder task',
  department: 'Coding',
  status: 'Backlog',
  priority: 'Medium',
  created_at: '2026-05-13T00:00:00.000Z',
  assignee: null,
};

describe('TaskCard — quick status switcher (status dot)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the status dot as a plain span (no menu trigger) when onStatusChange is omitted', () => {
    render(<TaskCard task={baseTask} isAdmin onClick={vi.fn()} />);
    // No status-change menu trigger should exist.
    expect(
      screen.queryByRole('button', { name: /change status/i }),
    ).not.toBeInTheDocument();
  });

  it('exposes an interactive status trigger when onStatusChange is provided (admin)', () => {
    render(
      <TaskCard
        task={baseTask}
        isAdmin
        onStatusChange={vi.fn()}
        onClick={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /change status for Placeholder task/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render the interactive trigger when not admin, even if onStatusChange is passed', () => {
    render(
      <TaskCard
        task={baseTask}
        isAdmin={false}
        onStatusChange={vi.fn()}
        onClick={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /change status/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking the status dot opens the menu and does NOT fire the card onClick (no navigation)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TaskCard task={baseTask} isAdmin onStatusChange={vi.fn()} onClick={onClick} />,
    );

    await user.click(
      screen.getByRole('button', { name: /change status for Placeholder task/i }),
    );

    // Menu opens with all 7 statuses as radio items.
    const menu = await screen.findByRole('menu', { name: /change status/i });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items).toHaveLength(7);
    // Current status is the checked one.
    expect(within(menu).getByRole('menuitemradio', { name: /Backlog/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Card navigation must NOT have fired.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('selecting a different status calls onStatusChange with the task id + next status', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const onClick = vi.fn();
    render(
      <TaskCard
        task={baseTask}
        isAdmin
        onStatusChange={onStatusChange}
        onClick={onClick}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /change status for Placeholder task/i }),
    );
    const menu = await screen.findByRole('menu', { name: /change status/i });
    await user.click(within(menu).getByRole('menuitemradio', { name: /In Progress/ }));

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'In Progress');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('selecting the current status is a no-op (does not call onStatusChange)', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <TaskCard task={baseTask} isAdmin onStatusChange={onStatusChange} onClick={vi.fn()} />,
    );

    await user.click(
      screen.getByRole('button', { name: /change status for Placeholder task/i }),
    );
    const menu = await screen.findByRole('menu', { name: /change status/i });
    await user.click(within(menu).getByRole('menuitemradio', { name: /Backlog/ }));

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('opens edit and delete quick actions from the card context menu', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onDelete = vi.fn();
    render(<TaskCard task={baseTask} isAdmin onClick={onClick} onDelete={onDelete} />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /open Placeholder task/i }));

    const menu = await screen.findByRole('menu', {
      name: /quick actions for Placeholder task/i,
    });
    await user.click(within(menu).getByRole('menuitem', { name: /edit issue/i }));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(screen.getByRole('button', { name: /open Placeholder task/i }));
    const reopenedMenu = await screen.findByRole('menu', {
      name: /quick actions for Placeholder task/i,
    });
    await user.click(within(reopenedMenu).getByRole('menuitem', { name: /delete issue/i }));
    expect(onDelete).toHaveBeenCalledWith('task-1');
  });
});
