import { describe, expect, it } from 'vitest';
import {
  buildTaskIndex,
  buildStaffIndex,
  resolveTaskRef,
  parseTaskNumberRef,
  buildMilestoneIndex,
  buildAreaIndex,
  resolveMilestoneRef,
  resolveAreaRef,
  resolveStaffRef,
} from '../entity-index';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeTask(overrides: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  return {
    id: 'task-1', task_number: 12, name: 'UI Extension',
    department: 'Coding', status: 'In Progress', priority: 'High',
    ...overrides,
  } as TaskWithAssignee;
}

function makeBoard(overrides: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'user-1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...overrides,
  } as TasksBoardData;
}

describe('buildTaskIndex', () => {
  it('maps every board task to an entry with real id, number, status, assignee', () => {
    const board = makeBoard({
      tasks: [makeTask({ id: 'abc', task_number: 22, name: 'Boss Fight', status: 'Backlog',
        assignee: { display_name: 'Mel' } as never })],
    });
    expect(buildTaskIndex(board)).toEqual([
      { id: 'abc', name: 'Boss Fight', status: 'Backlog', assigneeName: 'Mel', taskNumber: 22 },
    ]);
  });

  it('includes ALL tasks — no truncation cap (regression for prose-index #…and N more)', () => {
    const tasks = Array.from({ length: 60 }, (_, i) =>
      makeTask({ id: `t${i}`, task_number: i + 1, name: `Task ${i + 1}` }));
    const index = buildTaskIndex(makeBoard({ tasks }));
    expect(index).toHaveLength(60);
    expect(resolveTaskRef('delete task 47', index)).toMatchObject({ id: 't46', taskNumber: 47 });
  });

  it('returns [] for a null board', () => {
    expect(buildTaskIndex(null)).toEqual([]);
  });
});

describe('buildStaffIndex', () => {
  it('maps each named team member to { id, name }', () => {
    const board = makeBoard({
      team: [
        { id: 'staff-1', display_name: 'Karti' },
        { id: 'staff-2', display_name: 'Mel' },
      ],
    });
    expect(buildStaffIndex(board)).toEqual([
      { id: 'staff-1', name: 'Karti' },
      { id: 'staff-2', name: 'Mel' },
    ]);
  });

  it('drops team members with no display_name', () => {
    const board = makeBoard({
      team: [
        { id: 'staff-1', display_name: 'Karti' },
        { id: 'staff-2', display_name: 'Mel' },
        { id: 'staff-3', display_name: undefined },
      ],
    });
    const result = buildStaffIndex(board);
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { id: 'staff-1', name: 'Karti' },
      { id: 'staff-2', name: 'Mel' },
    ]);
  });
});

describe('resolveTaskRef', () => {
  const index = [
    { id: 'a', name: 'Boss Fight', taskNumber: 22 },
    { id: 'b', name: 'Boss Fight Arena', taskNumber: 23 },
  ];
  it('prefers an explicit task number over name containment', () => {
    expect(resolveTaskRef('move #23 to done', index)).toMatchObject({ id: 'b' });
  });
  it('matches the longest task name contained in the message', () => {
    expect(resolveTaskRef('assign boss fight arena to karti', index)).toMatchObject({ id: 'b' });
  });
});

describe('parseTaskNumberRef', () => {
  it('reads task/issue/# number references, not bare numbers', () => {
    expect(parseTaskNumberRef('delete task 22')).toBe(22);
    expect(parseTaskNumberRef('#22 please')).toBe(22);
    expect(parseTaskNumberRef('due in 22 days')).toBeNull();
  });
});

describe('buildMilestoneIndex', () => {
  it('maps every board milestone to an entry with id, name, health, targetDate', () => {
    const board = makeBoard({
      projectMilestones: [
        { id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-05-01', sort_order: 0, created_at: 'x' },
        { id: 'm2', name: 'Beta', health: null, sort_order: 1, created_at: 'x' },
      ] as never,
    });
    expect(buildMilestoneIndex(board)).toEqual([
      { id: 'm1', name: 'Alpha', health: 'on_track', targetDate: '2026-05-01' },
      { id: 'm2', name: 'Beta', health: undefined, targetDate: undefined },
    ]);
  });
  it('returns [] for a null board', () => {
    expect(buildMilestoneIndex(null)).toEqual([]);
  });
});

describe('buildAreaIndex', () => {
  it('maps every board area to an entry with id, name, status, progress, phase', () => {
    const board = makeBoard({
      areas: [{ id: 'a1', name: 'Main Game', status: 'Active', progress: 40, phase: 'Beta' }] as never,
    });
    expect(buildAreaIndex(board)).toEqual([
      { id: 'a1', name: 'Main Game', status: 'Active', progress: 40, phase: 'Beta' },
    ]);
  });
});

describe('resolveMilestoneRef / resolveAreaRef / resolveStaffRef', () => {
  it('resolves the longest contained name', () => {
    const milestones = [
      { id: 'm1', name: 'Alpha' },
      { id: 'm2', name: 'Alpha Combat' },
    ];
    expect(resolveMilestoneRef('mark alpha combat off track', milestones)).toMatchObject({ id: 'm2' });
    const areas = [{ id: 'a1', name: 'Main Game' }];
    expect(resolveAreaRef('set main game to complete', areas)).toMatchObject({ id: 'a1' });
    const staff = [{ id: 's1', name: 'Karti' }];
    expect(resolveStaffRef('assign it to karti', staff)).toMatchObject({ id: 's1' });
  });
  it('returns undefined when nothing matches', () => {
    expect(resolveAreaRef('set nothing', [{ id: 'a1', name: 'Main Game' }])).toBeUndefined();
  });
});
