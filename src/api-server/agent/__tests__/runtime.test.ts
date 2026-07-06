import { describe, expect, it } from 'vitest';
import { runAgentLoop, type AssistantMessage, type ModelCaller } from '../runtime';
import { AGENT_TOOLS } from '../tool-registry';
import type { ToolContext } from '../tool-contract';
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
/** Records staged rows in memory instead of hitting Supabase. */
function memoryStager() {
  const staged: Array<Record<string, unknown>> = [];
  const stagePending = async (row: Record<string, unknown>) => {
    const id = `pa-${staged.length + 1}`;
    staged.push({ id, ...row });
    return id;
  };
  return { staged, stagePending };
}
/** Turn a fixed script of assistant messages into a ModelCaller. */
function scriptedCaller(script: AssistantMessage[]): ModelCaller {
  let turn = 0;
  return async () => script[Math.min(turn++, script.length - 1)];
}

describe('runAgentLoop', () => {
  it('runs a read tool, feeds the result back, and returns the final text', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-01-01', sort_order: 0, created_at: 'x' }] as never,
    });
    const { staged, stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'list_milestones', input: {} }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Alpha is on track.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'How is Alpha doing?', system: 'sys', ctx: ctx(board), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(result.text).toBe('Alpha is on track.');
    expect(staged).toHaveLength(0);
  });

  it('stages a write tool call as a pending action instead of executing it', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', health: 'on_track', sort_order: 0, created_at: 'x' }] as never,
    });
    const { staged, stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'set_milestone_health', input: { milestone: 'Alpha', health: 'off_track' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Staged the milestone update for your approval.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'Mark Alpha off track', system: 'sys', ctx: ctx(board), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(result.pendingActions).toEqual([
      { id: 'pa-1', toolId: 'set_milestone_health', summary: 'Set milestone "Alpha" health to off_track' },
    ]);
    // The stager receives the raw camelCase row the runtime builds.
    expect(staged[0]).toMatchObject({ toolId: 'set_milestone_health', conversationId: 'c1', userId: 'u1' });
    expect(staged[0].resolvedArgs).toEqual({ milestoneId: 'm1', milestoneName: 'Alpha', health: 'off_track' });
  });

  it('SCREENSHOT SCENARIO: conditional milestone update stages TWO writes from one turn', async () => {
    const board = makeBoard({
      projectMilestones: [
        { id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-01-01', sort_order: 0, created_at: 'x' },
        { id: 'm2', name: 'Beta', health: 'on_track', target_date: '2026-02-01', sort_order: 1, created_at: 'x' },
      ] as never,
    });
    const { stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'r1', name: 'list_milestones', input: {} }] },
      { stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 'w1', name: 'set_milestone_health', input: { milestone: 'Alpha', health: 'off_track' } },
        { type: 'tool_use', id: 'w2', name: 'set_milestone_health', input: { milestone: 'Beta', health: 'off_track' } },
      ] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Both milestones are overdue; staged updates for approval.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'Update the milestones if they aren\'t on track', system: 'sys', ctx: ctx(board), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(result.pendingActions).toHaveLength(2);
    expect(result.pendingActions.map((p) => p.summary)).toEqual([
      'Set milestone "Alpha" health to off_track',
      'Set milestone "Beta" health to off_track',
    ]);
  });

  it('feeds a stage error back to the model rather than crashing', async () => {
    const { staged, stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'set_task_status', input: { task: 'ghost', status: 'Done' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'I could not find that task.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'move ghost to done', system: 'sys', ctx: ctx(makeBoard()), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(staged).toHaveLength(0);
    expect(result.text).toContain('could not find');
  });
});
