import { describe, expect, it } from 'vitest';
import { MILESTONE_AREA_WRITE_TOOLS } from '../milestone-area-write-tools';
import type { ToolContext, WriteTool } from '../../tool-contract';
import type { TasksBoardData } from '@/lib/tasks-board';

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
const tool = (id: string) => MILESTONE_AREA_WRITE_TOOLS.find((t) => t.id === id) as WriteTool;

describe('set_milestone_health stage', () => {
  it('resolves a milestone by name and validates health', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', health: 'on_track', sort_order: 0, created_at: 'x' }] as never,
    });
    const result = await tool('set_milestone_health').stage({ milestone: 'Alpha', health: 'off_track' }, ctx(board));
    expect(result).toEqual({
      ok: true,
      resolvedArgs: { milestoneId: 'm1', milestoneName: 'Alpha', health: 'off_track' },
      summary: 'Set milestone "Alpha" health to off_track',
    });
  });
  it('rejects an unknown health value', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', sort_order: 0, created_at: 'x' }] as never,
    });
    expect((await tool('set_milestone_health').stage({ milestone: 'Alpha', health: 'green' }, ctx(board))).ok).toBe(false);
  });
});

describe('set_area_status / set_area_progress stage', () => {
  it('resolves and validates area status', async () => {
    const board = makeBoard({ areas: [{ id: 'a1', name: 'Main Game', status: 'Active', progress: 10 }] as never });
    expect(await tool('set_area_status').stage({ area: 'Main Game', status: 'Complete' }, ctx(board))).toMatchObject({
      ok: true, resolvedArgs: { areaId: 'a1', status: 'Complete' },
    });
  });
  it('validates progress is 0–100', async () => {
    const board = makeBoard({ areas: [{ id: 'a1', name: 'Main Game', status: 'Active', progress: 10 }] as never });
    expect((await tool('set_area_progress').stage({ area: 'Main Game', progress: 150 }, ctx(board))).ok).toBe(false);
    expect(await tool('set_area_progress').stage({ area: 'Main Game', progress: 75 }, ctx(board))).toMatchObject({
      ok: true, resolvedArgs: { areaId: 'a1', progress: 75 },
    });
  });
});
