import { describe, expect, it } from 'vitest';
import { planLocalIssueWrite, type AgentChatInput } from '../agent';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeTask(overrides: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  return { id: 'task-1', task_number: 12, name: 'UI Extension',
    department: 'Coding', status: 'In Progress', priority: 'High', ...overrides } as TaskWithAssignee;
}
function makeBoard(tasks: TaskWithAssignee[]): TasksBoardData {
  return { tasks, team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'user-1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
  } as TasksBoardData;
}
function chat(message: string): AgentChatInput {
  return { message, mode: 'chat' };
}

describe('planLocalIssueWrite delete resolution', () => {
  it('resolves a task by number even when it is far past the old prose truncation cap', () => {
    const tasks = Array.from({ length: 60 }, (_, i) =>
      makeTask({ id: `t${i}`, task_number: i + 1, name: `Task ${i + 1}` }));
    const result = planLocalIssueWrite(chat('delete task 47'), makeBoard(tasks));
    expect(result?.intent).toBe('approval_required');
    expect(result?.approval?.kind).toBe('issue.delete');
    expect(result?.approval?.draft?.taskNumber).toBe('47');
  });

  it('resolves a status move by name from the structured board', () => {
    const result = planLocalIssueWrite(chat('move UI Extension to Done'), makeBoard([makeTask()]));
    expect(result?.intent).toBe('approval_required');
    expect(result?.approval?.copy).toContain('Done');
  });
});

describe('planLocalIssueWrite assignee resolution', () => {
  it('resolves an assignee from the structured team roster', () => {
    const board = makeBoard([makeTask({ name: 'Boss Fight', task_number: 22 })]);
    board.team = [{ id: 'p-9', display_name: 'Karti' } as never];
    const result = planLocalIssueWrite(chat('assign Boss Fight to Karti'), board);
    expect(result?.intent).toBe('approval_required');
    expect(result?.approval?.copy).toContain('Karti');
  });
});
