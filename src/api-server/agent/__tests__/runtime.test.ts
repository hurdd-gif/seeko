import { describe, expect, it } from 'vitest';
import { runAgentLoop, buildInitialMessages, formatExecutedActionsContext, EKO_AGENT_SYSTEM, type AssistantMessage, type ModelCaller, type PriorTurn } from '../runtime';
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

  it('threads prior conversation history into the model so a bare "yes" has context', async () => {
    const board = makeBoard();
    const { stagePending } = memoryStager();
    const calls: unknown[][] = [];
    const caller: ModelCaller = async ({ messages }) => {
      calls.push([...messages]); // snapshot: the loop appends to `messages` after this call
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] };
    };
    await runAgentLoop({
      userMessage: 'Yes',
      history: [
        { role: 'user', text: 'Are we on track?' },
        { role: 'assistant', text: 'ALPHA is overdue. Want me to set it off_track?' },
      ],
      system: 'sys', ctx: ctx(board), tools: AGENT_TOOLS, caller, stagePending,
    });
    const first = calls[0] as Array<{ role: string; content: Array<{ text: string }> }>;
    expect(first.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(first[1].content[0].text).toContain('off_track');
    expect(first[2].content[0].text).toBe('Yes');
  });
});

describe('buildInitialMessages', () => {
  it('returns just the current user message when there is no history', () => {
    expect(buildInitialMessages('Hello')).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);
  });

  it('threads prior turns and ends with the current user message, alternating', () => {
    const history: PriorTurn[] = [
      { role: 'user', text: 'Are we on track?' },
      { role: 'assistant', text: 'Want me to set both off_track?' },
    ];
    const msgs = buildInitialMessages('Yes', history);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1].content[0].text).toContain('off_track');
    expect(msgs[2].content[0].text).toBe('Yes');
  });

  it('drops leading assistant turns so the first message is always user', () => {
    const history: PriorTurn[] = [
      { role: 'assistant', text: 'Hi, I am EKO.' },
      { role: 'user', text: 'status?' },
      { role: 'assistant', text: 'All good. Want a report?' },
    ];
    const msgs = buildInitialMessages('Yes', history);
    expect(msgs[0].role).toBe('user');
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('does not duplicate the current message when history already ends with it', () => {
    const history: PriorTurn[] = [
      { role: 'user', text: 'Are we on track?' },
      { role: 'assistant', text: 'Want me to set both off_track?' },
      { role: 'user', text: 'Yes' },
    ];
    const msgs = buildInitialMessages('Yes', history);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[2].content[0].text).toBe('Yes');
  });

  it('collapses consecutive same-role turns to keep messages strictly alternating', () => {
    const history: PriorTurn[] = [
      { role: 'user', text: 'q' },
      { role: 'assistant', text: 'a1' },
      { role: 'assistant', text: 'a2' },
    ];
    const msgs = buildInitialMessages('next', history);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1].content[0].text).toContain('a1');
    expect(msgs[1].content[0].text).toContain('a2');
  });
});

describe('formatExecutedActionsContext', () => {
  it('returns an empty string when nothing has executed this conversation', () => {
    expect(formatExecutedActionsContext([])).toBe('');
  });

  it('lists executed summaries and tells EKO to acknowledge them truthfully', () => {
    const ctx = formatExecutedActionsContext([
      'Set milestone "ALPHA" health to off_track',
      'Set milestone "BETA" health to at_risk',
    ]);
    expect(ctx).toContain('Set milestone "ALPHA" health to off_track');
    expect(ctx).toContain('Set milestone "BETA" health to at_risk');
    expect(ctx.toLowerCase()).toContain('executed');
    expect(ctx.toLowerCase()).toMatch(/acknowledge|taken effect/);
  });
});

describe('EKO_AGENT_SYSTEM', () => {
  it('no longer carries the unconditional gag that made EKO deny committed writes', () => {
    // The narration bug: this line told EKO to deny writes even after they committed.
    expect(EKO_AGENT_SYSTEM).not.toContain('Never claim a write happened.');
  });

  it('lets EKO acknowledge an already approved and executed write', () => {
    expect(EKO_AGENT_SYSTEM).toContain('already approved and executed');
  });
});
