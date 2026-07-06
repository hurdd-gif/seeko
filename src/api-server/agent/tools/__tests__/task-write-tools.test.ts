import { describe, expect, it } from 'vitest';
import { TASK_WRITE_TOOLS } from '../task-write-tools';
import type { ToolContext, WriteTool } from '../../tool-contract';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeTask(over: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  return { id: 't1', task_number: 12, name: 'UI Extension', department: 'Coding',
    status: 'In Progress', priority: 'High', ...over } as TaskWithAssignee;
}
function makeBoard(over: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'u1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...over,
  } as TasksBoardData;
}
function ctx(board: TasksBoardData | null): ToolContext {
  return { user: { id: 'u1', email: 'a@b.invalid' }, board, conversationId: 'c1' };
}
const tool = (id: string) => TASK_WRITE_TOOLS.find((t) => t.id === id) as WriteTool;

describe('set_task_status stage', () => {
  it('resolves a task by number and validates the status enum', async () => {
    const board = makeBoard({ tasks: [makeTask({ task_number: 22, name: 'Boss Fight' })] });
    const result = await tool('set_task_status').stage({ task: 'task 22', status: 'Done' }, ctx(board));
    expect(result).toEqual({
      ok: true,
      resolvedArgs: { taskId: 't1', taskName: 'Boss Fight', taskNumber: 22, status: 'Done' },
      summary: 'Move "Boss Fight" to Done',
    });
  });
  it('rejects an unknown status', async () => {
    const board = makeBoard({ tasks: [makeTask()] });
    const result = await tool('set_task_status').stage({ task: 'UI Extension', status: 'Shipped' }, ctx(board));
    expect(result.ok).toBe(false);
  });
  it('rejects when the task cannot be resolved', async () => {
    const result = await tool('set_task_status').stage({ task: 'nonexistent', status: 'Done' }, ctx(makeBoard()));
    expect(result).toMatchObject({ ok: false });
  });
});

describe('set_task_assignee stage', () => {
  it('resolves both task and assignee from the board', async () => {
    const board = makeBoard({ tasks: [makeTask({ name: 'Boss Fight', task_number: 22 })] });
    board.team = [{ id: 'p9', display_name: 'Karti' } as never];
    const result = await tool('set_task_assignee').stage({ task: 'Boss Fight', assignee: 'Karti' }, ctx(board));
    expect(result).toMatchObject({
      ok: true,
      resolvedArgs: { taskId: 't1', assigneeId: 'p9', assigneeName: 'Karti' },
    });
  });
});

describe('create_task stage', () => {
  it('requires title, status, and priority', async () => {
    const bad = await tool('create_task').stage({ title: 'New Thing' }, ctx(makeBoard()));
    expect(bad.ok).toBe(false);
    const ok = await tool('create_task').stage(
      { title: 'New Thing', status: 'Todo', priority: 'High', dueDate: '2026-08-01' },
      ctx(makeBoard()),
    );
    expect(ok).toMatchObject({
      ok: true,
      resolvedArgs: { name: 'New Thing', status: 'Todo', priority: 'High', deadline: '2026-08-01' },
    });
  });
});

describe('every task write tool is gated', () => {
  it('has gated:true', () => {
    expect(TASK_WRITE_TOOLS.every((t) => t.gated === true)).toBe(true);
  });
});
