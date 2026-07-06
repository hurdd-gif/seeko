import { describe, expect, it } from 'vitest';
import { READ_TOOLS, daysOverdue } from '../read-tools';
import type { ToolContext } from '../../tool-contract';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeBoard(over: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'u1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...over,
  } as TasksBoardData;
}
function ctxFor(board: TasksBoardData | null): ToolContext {
  return { user: { id: 'u1', email: 'a@b.invalid' }, board, conversationId: 'c1' };
}
const byId = (id: string) => READ_TOOLS.find((t) => t.id === id)!;

describe('daysOverdue', () => {
  it('computes exact UTC day-bucket differences with a fixed clock', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    // 2026-04-24 -> 2026-06-01: 6 (Apr 24-30) + 31 (May) + 1 (Jun 1) = 38 days overdue.
    expect(daysOverdue('2026-04-24', now)).toBe(38);
    // No target date -> not overdue.
    expect(daysOverdue(undefined, now)).toBe(0);
    // Unparseable date -> not overdue.
    expect(daysOverdue('not-a-date', now)).toBe(0);
    // Future target -> negative (unclamped); the tool clamps with Math.max(0, ...).
    expect(daysOverdue('2026-06-10', now)).toBe(-9);
  });
});

describe('list_milestones', () => {
  it('returns name, health, targetDate, and computed overdueDays', async () => {
    const board = makeBoard({
      projectMilestones: [
        { id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-04-24', sort_order: 0, created_at: 'x' },
      ] as never,
    });
    const out = (await byId('list_milestones').run({}, ctxFor(board))) as Array<Record<string, unknown>>;
    expect(out[0]).toMatchObject({ name: 'Alpha', health: 'on_track', targetDate: '2026-04-24' });
    expect(typeof out[0].overdueDays).toBe('number');
  });
});

describe('list_tasks', () => {
  it('lists tasks with number, name, status, priority, assignee', async () => {
    const task = { id: 't1', task_number: 12, name: 'UI Extension', department: 'Coding',
      status: 'In Progress', priority: 'High', assignee: { display_name: 'Karti' } } as unknown as TaskWithAssignee;
    const out = (await byId('list_tasks').run({}, ctxFor(makeBoard({ tasks: [task] })))) as Array<Record<string, unknown>>;
    expect(out[0]).toMatchObject({ number: 12, name: 'UI Extension', status: 'In Progress', priority: 'High', assignee: 'Karti' });
  });
  it('returns [] when the board is null', async () => {
    expect(await byId('list_tasks').run({}, ctxFor(null))).toEqual([]);
  });
});

describe('read tools are ungated', () => {
  it('every read tool has gated:false', () => {
    expect(READ_TOOLS.every((t) => t.gated === false)).toBe(true);
  });
});
