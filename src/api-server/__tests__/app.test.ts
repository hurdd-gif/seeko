import { afterEach, describe, expect, it, vi } from 'vitest';
import { app, createApiApp } from '../app';
import { answerLocalContextFollowUp, planLocalIssueWrite } from '../routes/agent';

describe('API server', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('exposes a health endpoint', async () => {
    const response = await app.request('/api/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      service: 'seeko-api',
      runtime: 'hono',
    });
  });

  it('requires auth before running EKO', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize tasks' }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('validates EKO chat payloads', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Message is required' });
  });

  it('requires an approval decision in approval mode', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Create Issue A', mode: 'approval' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Approval decision is required' });
  });

  it('never creates a new approval from a bare confirmation chat message', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    for (const message of ['Yes', 'go ahead', 'do it', 'Okay!', 'approve it', 'yep.']) {
      const response = await testApp.request('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, mode: 'chat' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        reply: 'Use the Approve button on the pending action, or tell EKO the specific action you want prepared. Writes stay gated until approved.',
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'clarification',
      });
    }
  });

  it('runs EKO through an injected agent runner', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      agentRunner: async (input, user) => ({
        reply: `Handled ${input.mode ?? 'chat'} for ${user.email}: ${input.message}`,
        provider: 'openai',
        model: 'test-model',
      }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize tasks', mode: 'chat' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: 'Handled chat for member@example.invalid: Summarize tasks',
      provider: 'openai',
      model: 'test-model',
    });
  });

  it('returns a config error when EKO provider keys are missing', async () => {
    vi.stubEnv('EKO_AGENT_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', '');
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize tasks' }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Missing OPENAI_API_KEY for EKO.' });
  });

  it('does not claim approval decisions already changed the dashboard', async () => {
    vi.stubEnv('EKO_AGENT_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', '');
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Move Additional Props to In Progress',
        mode: 'approval',
        decision: 'approve',
        suggestion: {
          id: 'risky-changes',
          title: 'Pending write',
          meta: 'Approval required',
          approvalCopy: 'Move Additional Props to In Progress',
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reply: 'Approval recorded, but EKO does not have a matching write tool for "Move Additional Props to In Progress" yet. No dashboard changes were made.',
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'answer',
    });
  });

  it('does not execute incomplete typed issue create approvals', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Create UI Extension',
        mode: 'approval',
        decision: 'approve',
        suggestion: {
          id: 'risky-changes',
          title: 'Create UI Extension',
          meta: 'Approval required',
          approvalCopy: 'Create UI Extension',
          approval: {
            kind: 'issue.create',
            title: 'Create UI Extension',
            copy: 'Create UI Extension',
            draft: { title: 'UI Extension' },
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reply: 'Add status, priority and due date before EKO can create "UI Extension". No dashboard changes were made.',
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
      approval: {
        kind: 'issue.create',
        title: 'Create UI Extension',
        draft: { title: 'UI Extension' },
      },
    });
  });

  describe('typed issue deletes', () => {
    const deleteContext = [
      'Issues context: 3 tasks, 0 overdue, 2 staff, 1 areas, 0 milestones.',
      'Task counts by status: Backlog: 1, In Progress: 1, In Review: 1.',
      'In progress: Gem Vector (In Progress, High priority, due 2026-07-10).',
      'Risk queue: Loot Table Pass (Backlog, Medium priority); Gem Vector (In Progress, High priority, due 2026-07-10).',
      'In review: UI Extension (In Review).',
    ].join('\n');

    it('proposes an approval-gated delete when a status qualifier resolves one task', () => {
      const result = planLocalIssueWrite({ message: 'Remove the task in backlog' }, deleteContext);

      expect(result).toEqual({
        reply: 'Ready for approval: delete "Loot Table Pass" from Issues.',
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'approval_required',
        approval: {
          kind: 'issue.delete',
          title: 'Delete Loot Table Pass',
          copy: 'Delete "Loot Table Pass" (Backlog) from Issues. This cannot be undone.',
          draft: { taskName: 'Loot Table Pass' },
        },
      });
    });

    it('resolves quoted task names exactly', () => {
      const result = planLocalIssueWrite(
        { message: 'Delete the backlog issue "Loot Table Pass"' },
        deleteContext,
      );

      expect(result).toMatchObject({
        intent: 'approval_required',
        approval: { kind: 'issue.delete', draft: { taskName: 'Loot Table Pass' } },
      });
    });

    it('resolves an unquoted task name mentioned in the message', () => {
      const result = planLocalIssueWrite({ message: 'delete Gem Vector' }, deleteContext);

      expect(result).toMatchObject({
        reply: 'Ready for approval: delete "Gem Vector" from Issues.',
        intent: 'approval_required',
        approval: {
          kind: 'issue.delete',
          copy: 'Delete "Gem Vector" (In Progress) from Issues. This cannot be undone.',
          draft: { taskName: 'Gem Vector' },
        },
      });
    });

    it('asks for clarification instead of guessing when multiple tasks match', () => {
      const ambiguousContext = [
        'Issues context: 2 tasks, 0 overdue, 2 staff, 1 areas, 0 milestones.',
        'Task counts by status: Backlog: 2.',
        'Risk queue: Loot Table Pass (Backlog, Medium priority); Old Login Flow (Backlog, Low priority).',
      ].join('\n');

      const result = planLocalIssueWrite({ message: 'remove the task in backlog' }, ambiguousContext);

      expect(result).toEqual({
        reply: 'EKO found 2 matching tasks: Loot Table Pass; Old Login Flow. Give the task number or exact name so EKO can prepare the delete for approval.',
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'clarification',
      });
      expect(result?.approval).toBeUndefined();
    });

    it('asks for clarification when no task matches a delete request', () => {
      const result = planLocalIssueWrite({ message: 'Delete the task "Ghost Feature"' }, deleteContext);

      expect(result).toEqual({
        reply: 'EKO could not match that to a single task in the current Issues context. Give the task number shown on the board (like "task 22") or the exact task name so EKO can prepare the delete for approval.',
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'clarification',
      });
    });

    it('does not treat field-level removals as issue deletes', () => {
      expect(planLocalIssueWrite({ message: 'Remove the assignee from Gem Vector' }, deleteContext)).toBeNull();
    });

    const numberedContext = [
      'Issues context: 3 tasks, 0 overdue, 2 staff, 1 areas, 0 milestones.',
      'Task counts by status: Todo: 2, In Progress: 1.',
      'All issues: #22 this is a test (Todo); #7 Gem Vector (In Progress); #9 Quiet Chore (Todo).',
      'In progress: Gem Vector (In Progress, #7, High priority, due 2026-07-10).',
    ].join('\n');

    it('resolves a delete by bare task number, including tasks only in the All issues index', () => {
      const result = planLocalIssueWrite({ message: 'Delete task 22' }, numberedContext);

      expect(result).toMatchObject({
        reply: 'Ready for approval: delete "this is a test" (#22) from Issues.',
        intent: 'approval_required',
        approval: {
          kind: 'issue.delete',
          draft: { taskName: 'this is a test', taskNumber: '22' },
        },
      });
    });

    it('asks for clarification when the referenced task number does not exist', () => {
      expect(planLocalIssueWrite({ message: 'Delete task 99' }, numberedContext)).toMatchObject({
        intent: 'clarification',
      });
    });

    it('parses tasks listed after a colon-containing task name in the All issues index', () => {
      // "Concept Art: Characters …" has a colon in its name; a naive
      // split(/:/, 2) truncates the index there and drops #18 after it.
      const colonContext = [
        'Issues context: 3 tasks, 0 overdue.',
        'All issues: #6 Concept Art: Characters icons and currency (Done); #18 UI Extension (Todo); #2 Game Mechanics (Todo).',
      ].join('\n');

      expect(planLocalIssueWrite({ message: 'Delete task 18' }, colonContext)).toMatchObject({
        intent: 'approval_required',
        approval: {
          kind: 'issue.delete',
          draft: { taskName: 'UI Extension', taskNumber: '18' },
        },
      });
    });

    it('resolves "delete it" against the create receipt in recent history', () => {
      const result = planLocalIssueWrite(
        {
          message: 'Delete it',
          clientContext: {
            recentHistory: [
              { role: 'user', text: 'Create a task' },
              { role: 'eko', text: 'Created issue "this is a test" in Todo.' },
            ],
          },
        },
        numberedContext,
      );

      expect(result).toMatchObject({
        intent: 'approval_required',
        approval: { kind: 'issue.delete', draft: { taskName: 'this is a test', taskNumber: '22' } },
      });
    });

    it('treats the answer to a which-task-to-delete clarification as the delete target', () => {
      const result = planLocalIssueWrite(
        {
          message: 'the task we just created',
          clientContext: {
            recentHistory: [
              { role: 'eko', text: 'Created issue "this is a test" in Todo.' },
              { role: 'user', text: 'Delete it please' },
              { role: 'eko', text: 'Give the task number shown on the board (like "task 22") or the exact task name so EKO can prepare the delete for approval. Name the task to delete.' },
            ],
          },
        },
        numberedContext,
      );

      expect(result).toMatchObject({
        intent: 'approval_required',
        approval: { kind: 'issue.delete', draft: { taskName: 'this is a test' } },
      });
    });

    it("prepares a bulk assign from plural anaphora over EKO's last numbered list", () => {
      const bulkContext = [
        numberedContext,
        'Staff: Karti (Coding, admin); Jamie (Visual Art).',
      ].join('\n');
      const result = planLocalIssueWrite(
        {
          message: 'Assign them all to Karti',
          clientContext: {
            recentHistory: [
              { role: 'user', text: 'What tasks are overdue?' },
              { role: 'eko', text: 'Overdue tasks are this is a test (#22) and Quiet Chore (#9).' },
            ],
          },
        },
        bulkContext,
      );

      expect(result).toMatchObject({
        intent: 'approval_required',
        approval: {
          kind: 'issue.update',
          draft: { assigneeName: 'Karti', taskNumbers: '22,9' },
        },
      });
      expect(result?.reply).toContain('assign 2 tasks to Karti');
    });

    it('never returns an executed intent from planning a delete', () => {
      for (const message of [
        'Remove the task in backlog',
        'delete Gem Vector',
        'Delete the task "Ghost Feature"',
        'remove "Loot Table Pass"',
      ]) {
        expect(planLocalIssueWrite({ message }, deleteContext)?.intent).not.toBe('executed');
      }
    });

    it('makes no change when an approved delete no longer resolves against the board', async () => {
      const testApp = createApiApp({
        agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      });

      const response = await testApp.request('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Delete "Gem Vector" from Issues',
          mode: 'approval',
          decision: 'approve',
          suggestion: {
            id: 'risky-changes',
            title: 'Delete Gem Vector',
            meta: 'Approval required',
            approval: {
              kind: 'issue.delete',
              title: 'Delete Gem Vector',
              copy: 'Delete "Gem Vector" (In Progress) from Issues. This cannot be undone.',
              draft: { taskName: 'Gem Vector' },
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reply: 'Approval recorded, but EKO could not find "Gem Vector" in the current issues context. No dashboard changes were made.',
        provider: 'openai',
        model: 'eko-local-approval',
        intent: 'details_needed',
      });
    });

    it('answers delete chat requests locally without calling a provider', async () => {
      vi.stubEnv('EKO_AGENT_PROVIDER', 'openai');
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      const fetchMock = vi.fn(async () => {
        throw new Error('provider should not be called for delete requests');
      });
      vi.stubGlobal('fetch', fetchMock);
      const testApp = createApiApp({
        agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      });

      const response = await testApp.request('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Delete the task "Gem Vector"', mode: 'chat' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        model: 'eko-local-planner',
        intent: 'clarification',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('typed issue field updates', () => {
    const updateContext = [
      'Issues context: 3 tasks, 0 overdue, 2 staff, 1 areas, 0 milestones.',
      'Task counts by status: Todo: 2, In Progress: 1.',
      'All issues: #22 UI Extension (Todo); #7 Gem Vector (In Progress); #9 Quiet Chore (Todo).',
      'In progress: Gem Vector (In Progress, #7, High priority, due 2026-07-10).',
    ].join('\n');

    it('prepares priority changes as gated issue updates', () => {
      const result = planLocalIssueWrite({ message: 'Make UI Extension high priority' }, updateContext);

      expect(result).toMatchObject({
        reply: 'Ready for approval: set UI Extension to High priority.',
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'approval_required',
        approval: {
          kind: 'issue.update',
          title: 'Update UI Extension priority',
          draft: { taskName: 'UI Extension', priority: 'High' },
        },
      });
    });

    it('prepares due-date changes as gated issue updates', () => {
      const result = planLocalIssueWrite({ message: 'Set UI Extension due today' }, updateContext);

      expect(result).toMatchObject({
        reply: 'Ready for approval: set UI Extension to due Today.',
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'approval_required',
        approval: {
          kind: 'issue.update',
          title: 'Update UI Extension due date',
          draft: { taskName: 'UI Extension', dueDate: 'Today' },
        },
      });
    });

    it('prepares due-date clearing as a gated issue update', () => {
      const result = planLocalIssueWrite({ message: 'Clear the due date for Gem Vector' }, updateContext);

      expect(result).toMatchObject({
        reply: 'Ready for approval: set Gem Vector to no due date.',
        intent: 'approval_required',
        approval: {
          kind: 'issue.update',
          title: 'Update Gem Vector due date',
          draft: { taskName: 'Gem Vector', dueDate: 'No date' },
        },
      });
    });
  });

  it('normalizes provider markdown before returning EKO replies', async () => {
    vi.stubEnv('EKO_AGENT_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('EKO_ANTHROPIC_MODEL', 'test-model');
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ type: 'text', text: '**Ready.** 1. Check tasks\n- Confirm review.' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ));
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'What tasks are in progress?' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reply: 'Ready. Check tasks Confirm review.',
      provider: 'anthropic',
      model: 'test-model',
    });
  });

  it('routes general EKO chat to OpenAI in hybrid mode', async () => {
    vi.stubEnv('EKO_AGENT_PROVIDER', 'hybrid');
    vi.stubEnv('OPENAI_API_KEY', 'openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'anthropic-key');
    vi.stubEnv('EKO_OPENAI_MODEL', 'openai-test-model');
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: 'OpenAI status response.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'What tasks are outstanding?' }),
    });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.openai.com/v1/responses');
    expect(await response.json()).toMatchObject({
      reply: 'OpenAI status response.',
      provider: 'openai',
      model: 'openai-test-model',
    });
  });

  it('includes recent EKO conversation context in provider prompts', async () => {
    vi.stubEnv('EKO_AGENT_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'openai-key');
    vi.stubEnv('EKO_OPENAI_MODEL', 'openai-test-model');
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: 'UI Extension and Gem Vector are mixed; I checked those from the prior turn.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Any progress on those?',
        clientContext: {
          path: '/issues',
          title: 'Issues',
          recentHistory: [
            { role: 'user', text: 'What task was recently added?' },
            { role: 'eko', text: 'The recently added task was UI Extension. Recent activity also shows Gem Vector as newly created.' },
          ],
        },
      }),
    });

    expect(response.status).toBe(200);
    const providerBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { input: string };
    expect(providerBody.input).toContain('Recent EKO conversation:');
    expect(providerBody.input).toContain('EKO: The recently added task was UI Extension');
    expect(providerBody.input).toContain('User request: Any progress on those?');
  });

  it('answers due-date follow-ups from the referenced recent task before provider routing', () => {
    const result = answerLocalContextFollowUp(
      {
        message: 'When is it due?',
        clientContext: {
          recentHistory: [
            { role: 'user', text: 'What is the most recently added task?' },
            { role: 'eko', text: 'The most recently added task is UI Extension.' },
          ],
        },
      },
      [
        'Issues context: 2 tasks, 1 overdue, 1 staff, 0 areas, 0 milestones.',
        'Recent activity task details: UI Extension (Todo); Gem Vector (In Progress, due 2026-07-10).',
      ].join('\n'),
    );

    expect(result).toMatchObject({
      reply: 'UI Extension does not have a due date. Would you like EKO to prepare adding one for approval?',
      provider: 'openai',
      model: 'eko-local-context',
    });
  });

  it('answers owner/status/priority follow-ups from the referenced recent task before provider routing', () => {
    const context = [
      'Issues context: 3 tasks, 1 overdue, 2 staff, 0 areas, 0 milestones.',
      'All issues: #18 UI Extension (In Progress, High priority, due 2026-07-10, assigned to Member Example); #19 Gem Vector (Todo, Low priority).',
      'Recent activity task details: UI Extension (In Progress, #18, High priority, due 2026-07-10, assigned to Member Example).',
    ].join('\n');
    const recentHistory = [
      { role: 'user' as const, text: 'What is the most recently added task?' },
      { role: 'eko' as const, text: 'The most recently added task is UI Extension.' },
    ];

    expect(answerLocalContextFollowUp({ message: 'Who owns it?', clientContext: { recentHistory } }, context)).toMatchObject({
      reply: 'UI Extension is assigned to Member Example.',
      provider: 'openai',
      model: 'eko-local-context',
    });
    expect(answerLocalContextFollowUp({ message: 'What status is it?', clientContext: { recentHistory } }, context)).toMatchObject({
      reply: 'UI Extension is In Progress.',
      provider: 'openai',
      model: 'eko-local-context',
    });
    expect(answerLocalContextFollowUp({ message: 'What priority is it?', clientContext: { recentHistory } }, context)).toMatchObject({
      reply: 'UI Extension is High priority.',
      provider: 'openai',
      model: 'eko-local-context',
    });
  });

  it('answers plural progress follow-ups for tasks named in the recent conversation', () => {
    const context = [
      'Issues context: 3 tasks, 1 overdue, 2 staff, 0 areas, 0 milestones.',
      'All issues: #18 UI Extension (Todo); #19 Gem Vector (In Progress).',
      'Recent activity task details: UI Extension (Todo); Gem Vector (In Progress, #19, High priority, due 2026-07-10, assigned to Member Example).',
    ].join('\n');
    const recentHistory = [
      { role: 'user' as const, text: 'What task was recently added?' },
      { role: 'eko' as const, text: 'The recently added task was UI Extension. Recent activity also shows Gem Vector as newly created.' },
    ];

    expect(answerLocalContextFollowUp({ message: 'Any progress on those?', clientContext: { recentHistory } }, context)).toMatchObject({
      reply: 'UI Extension is Todo. Gem Vector is In Progress, due 2026-07-10.',
      provider: 'openai',
      model: 'eko-local-context',
    });
  });

  it('routes risky EKO write prep to Claude in hybrid mode', async () => {
    vi.stubEnv('EKO_AGENT_PROVIDER', 'hybrid');
    vi.stubEnv('OPENAI_API_KEY', 'openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'anthropic-key');
    vi.stubEnv('EKO_ANTHROPIC_MODEL', 'anthropic-test-model');
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Ready for approval: create a task after review.' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Draft an investor update after reviewing risky changes' }),
    });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.anthropic.com/v1/messages');
    expect(await response.json()).toMatchObject({
      reply: 'Ready for approval: create a task after review.',
      provider: 'anthropic',
      model: 'anthropic-test-model',
    });
  });

  it('redirects after signout', async () => {
    const testApp = createApiApp({
      authSignOut: async () => {},
    });
    const response = await testApp.request('/auth/signout', { method: 'POST' });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login');
  });

  it('returns 404 for a missing invoice request token', async () => {
    const testApp = createApiApp({
      invoiceLoader: async () => ({ found: false, initialData: { status: 'not_found' } }),
    });

    const response = await testApp.request('/api/invoice-request/missing-token');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Invite not found' });
  });

  it('returns invoice request data for a valid token', async () => {
    let receivedSessionToken: string | null | undefined;
    const testApp = createApiApp({
      invoiceLoader: async (_token, sessionToken) => {
        receivedSessionToken = sessionToken;
        return {
          found: true,
          initialData: {
            status: 'pending',
            maskedEmail: 'r********@example.invalid',
            expiresAt: '2026-06-20T00:00:00.000Z',
          },
        };
      },
    });

    const response = await testApp.request('/api/invoice-request/pending-token', {
      headers: { cookie: 'invoice_request_session=session-123' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedSessionToken).toBe('session-123');
    expect(body).toEqual({
      status: 'pending',
      maskedEmail: 'r********@example.invalid',
      expiresAt: '2026-06-20T00:00:00.000Z',
    });
  });

  it('returns expired invoice request data', async () => {
    const testApp = createApiApp({
      invoiceLoader: async () => ({ found: true, initialData: { status: 'expired' } }),
    });

    const response = await testApp.request('/api/invoice-request/expired-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'expired' });
  });

  it('requires an authenticated user before returning agreement data', async () => {
    const testApp = createApiApp({
      agreementAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/agreement-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns agreement data and validates signing payloads', async () => {
    const testApp = createApiApp({
      agreementAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      agreementLoader: async (user) => ({
        status: 'ready',
        userId: user.id,
        userEmail: user.email ?? '',
        title: 'SEEKO Agreement',
        sections: [{ number: 1, title: 'Terms', content: '<p>Agreement terms.</p>' }],
        department: 'Coding',
        role: 'Developer',
        isContractor: false,
        onboarded: 0,
      }),
      agreementSigner: async () => ({ success: true, redirect: '/onboarding' }),
    });

    const loadResponse = await testApp.request('/api/agreement-index');
    expect(loadResponse.status).toBe(200);
    expect(await loadResponse.json()).toMatchObject({
      status: 'ready',
      title: 'SEEKO Agreement',
    });

    const invalidResponse = await testApp.request('/api/agreement/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ full_name: '', address: '', engagement_type: 'team_member' }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({ error: 'full_name is required' });

    const signResponse = await testApp.request('/api/agreement/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Member Example',
        address: '123 Example St',
        engagement_type: 'team_member',
      }),
    });
    expect(signResponse.status).toBe(200);
    expect(await signResponse.json()).toEqual({ success: true, redirect: '/onboarding' });
  });

  it('returns 404 for a missing doc-share token', async () => {
    const testApp = createApiApp({
      docShareLoader: async () => ({ found: false, initialData: { status: 'not_found' } }),
    });

    const response = await testApp.request('/api/doc-share/missing-token');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Invite not found' });
  });

  it('returns doc-share data for a valid token', async () => {
    const testApp = createApiApp({
      docShareLoader: async () => ({
        found: true,
        initialData: {
          status: 'pending',
          maskedEmail: 'r********@example.invalid',
          docTitle: 'Pitch Deck',
          docType: 'deck',
          expiresAt: '2026-06-20T00:00:00.000Z',
        },
      }),
    });

    const response = await testApp.request('/api/doc-share/pending-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'pending',
      maskedEmail: 'r********@example.invalid',
      docTitle: 'Pitch Deck',
      docType: 'deck',
      expiresAt: '2026-06-20T00:00:00.000Z',
    });
  });

  it('validates doc-share send-code payloads before service access', async () => {
    const response = await app.request('/api/doc-share/send-code', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('requires a doc-share session cookie before viewing content', async () => {
    const response = await app.request('/api/doc-share/view', {
      method: 'POST',
      body: JSON.stringify({ token: 'shared-token' }),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'session_expired' });
  });

  it('returns 404 for a missing external-signing token', async () => {
    const testApp = createApiApp({
      externalSigningLoader: async () => ({ found: false, initialData: { status: 'notfound' } }),
    });

    const response = await testApp.request('/api/external-signing/missing-token');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Invite not found' });
  });

  it('returns external-signing data for a valid token', async () => {
    const testApp = createApiApp({
      externalSigningLoader: async () => ({
        found: true,
        initialData: {
          status: 'pending',
          maskedEmail: 'r********@example.invalid',
          templateName: 'Contractor Agreement',
          personalNote: 'Please sign',
          isGuardianSigning: false,
        },
      }),
    });

    const response = await testApp.request('/api/external-signing/pending-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'pending',
      maskedEmail: 'r********@example.invalid',
      templateName: 'Contractor Agreement',
      personalNote: 'Please sign',
      isGuardianSigning: false,
    });
  });

  it('validates external-signing send-code payloads before service access', async () => {
    const response = await app.request('/api/external-signing/send-code', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('validates external-signing sign payloads before service access', async () => {
    const response = await app.request('/api/external-signing/sign', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('requires admin auth before external-signing admin actions', async () => {
    const testApp = createApiApp({
      externalSigningAdminAuthResolver: async () => null,
    });

    const inviteResponse = await testApp.request('/api/external-signing/invite', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const parsePdfResponse = await testApp.request('/api/external-signing/parse-pdf', {
      method: 'POST',
    });
    const resendResponse = await testApp.request('/api/external-signing/resend', {
      method: 'POST',
      body: JSON.stringify({ invite_id: 'invite-1' }),
      headers: { 'content-type': 'application/json' },
    });
    const revokeResponse = await testApp.request('/api/external-signing/revoke', {
      method: 'POST',
      body: JSON.stringify({ invite_id: 'invite-1' }),
      headers: { 'content-type': 'application/json' },
    });
    const syncResponse = await testApp.request('/api/external-signing/sync', {
      method: 'POST',
      body: JSON.stringify({ invite_id: 'invite-1' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(inviteResponse.status).toBe(401);
    expect(await inviteResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(parsePdfResponse.status).toBe(401);
    expect(await parsePdfResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(resendResponse.status).toBe(401);
    expect(await resendResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(revokeResponse.status).toBe(401);
    expect(await revokeResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(syncResponse.status).toBe(401);
    expect(await syncResponse.json()).toEqual({ error: 'Unauthorized' });
  });

  it('keeps external-signing download on the fixed download route', async () => {
    const testApp = createApiApp({
      externalSigningLoader: async () => {
        throw new Error('download route should not hit token loader');
      },
    });

    const response = await testApp.request('/api/external-signing/download');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('keeps external-signing reissue disabled on the migrated route', async () => {
    const response = await app.request('/api/external-signing/reissue', {
      method: 'POST',
      body: JSON.stringify({ token: 'public-token' }),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Public link reissue is disabled. Contact the sender for a new link.' });
  });

  it('requires an authenticated admin before returning external-signing admin data', async () => {
    const testApp = createApiApp({
      externalSigningAdminAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/external-signing-admin');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns external-signing admin index data', async () => {
    const testApp = createApiApp({
      externalSigningAdminAuthResolver: async () => ({ id: 'admin-1', email: 'admin@example.invalid' }),
      externalSigningAdminLoader: async () => ({
        profile: {
          id: 'admin-1',
          displayName: 'Admin Example',
          email: 'admin@example.invalid',
          isAdmin: true,
        },
        invites: [
          {
            id: 'invite-1',
            recipient_email: 'signer@example.invalid',
            template_type: 'preset',
            template_id: 'contractor',
            custom_title: null,
            personal_note: null,
            expires_at: '2026-06-25T12:00:00.000Z',
            verification_attempts: 0,
            verified_at: null,
            status: 'pending',
            signer_name: null,
            signed_at: null,
            created_at: '2026-06-18T12:00:00.000Z',
            is_guardian_signing: false,
            minor_name: null,
            expired: false,
            title: 'contractor',
          },
        ],
        stats: {
          total: 1,
          active: 1,
          verified: 0,
          signed: 0,
          archive: 0,
        },
      }),
    });

    const response = await testApp.request('/api/external-signing-admin');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stats: { total: 1, active: 1 },
      invites: [expect.objectContaining({ id: 'invite-1', recipient_email: 'signer@example.invalid' })],
    });
  });

  it('requires an authenticated user before returning team data', async () => {
    const testApp = createApiApp({
      teamAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/team');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns authenticated team roster data', async () => {
    const testApp = createApiApp({
      teamAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      teamLoader: async (user) => ({
        currentUser: user,
        currentProfile: {
          id: 'user-1',
          display_name: 'Riley Example',
          is_admin: true,
          onboarded: 1,
          tour_completed: 1,
        },
        isAdmin: true,
        team: [
          {
            id: 'user-1',
            display_name: 'Riley Example',
            department: 'Coding',
            is_admin: true,
            onboarded: 1,
            tour_completed: 1,
          },
        ],
        members: [
          {
            id: 'user-1',
            display_name: 'Riley Example',
            department: 'Coding',
            is_admin: true,
            onboarded: 1,
            tour_completed: 1,
          },
        ],
        contractors: [],
        onlineCount: 0,
      }),
    });

    const response = await testApp.request('/api/team');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      isAdmin: true,
      members: [expect.objectContaining({ id: 'user-1', department: 'Coding' })],
      contractors: [],
    });
  });

  it('requires admin access before notifying an arbitrary user', async () => {
    const testApp = createApiApp({
      workflowAdminGuard: async () => ({ ok: false, status: 403, error: 'Forbidden' }),
    });

    const response = await testApp.request('/api/notify/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 'user-2',
        kind: 'task_handoff',
        title: 'Task update',
        link: '/tasks?task=task-1',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('requires an authenticated user before returning docs index data', async () => {
    const testApp = createApiApp({
      docsAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/docs-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns authenticated docs index data', async () => {
    const testApp = createApiApp({
      docsAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      docsIndexLoader: async (user) => ({
        currentUser: user,
        profile: {
          id: 'user-1',
          displayName: 'Riley Example',
          department: 'Coding',
          avatarUrl: null,
          isAdmin: false,
        },
        docs: [
          {
            id: 'doc-1',
            title: 'Engineering Notes',
            type: 'doc',
            restrictedDepartments: ['Coding'],
            locked: false,
            preview: 'Build notes',
            slideCount: 0,
            thumbnailUrl: null,
            updatedAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            recentlyUpdated: true,
          },
        ],
        docCount: 1,
        deckCount: 0,
        lockedCount: 0,
      }),
    });

    const response = await testApp.request('/api/docs-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      docCount: 1,
      deckCount: 0,
      docs: [expect.objectContaining({ id: 'doc-1', title: 'Engineering Notes' })],
    });
  });

  it('requires an authenticated user before returning tasks index data', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/tasks-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns authenticated tasks index data', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      tasksIndexLoader: async (user) => ({
        currentUser: user,
        profile: {
          id: 'user-1',
          displayName: 'Riley Example',
          department: 'Coding',
          avatarUrl: null,
          isAdmin: true,
        },
        tasks: [
          {
            id: 'task-1',
            name: 'Ship task index',
            department: 'Coding',
            status: 'In Progress',
            priority: 'High',
            areaId: 'area-1',
            areaName: 'Migration',
            assigneeId: 'user-1',
            assigneeName: 'Riley Example',
            assigneeAvatarUrl: null,
            deadline: '2026-06-25',
            description: 'Move task board data into Hono.',
            bounty: null,
            createdAt: '2026-06-18T12:00:00.000Z',
            overdue: false,
          },
        ],
        columns: [
          {
            status: 'In Progress',
            tasks: [
              {
                id: 'task-1',
                name: 'Ship task index',
                department: 'Coding',
                status: 'In Progress',
                priority: 'High',
                areaId: 'area-1',
                areaName: 'Migration',
                assigneeId: 'user-1',
                assigneeName: 'Riley Example',
                assigneeAvatarUrl: null,
                deadline: '2026-06-25',
                description: 'Move task board data into Hono.',
                bounty: null,
                createdAt: '2026-06-18T12:00:00.000Z',
                overdue: false,
              },
            ],
          },
        ],
        totalCount: 1,
        overdueCount: 0,
      }),
    });

    const response = await testApp.request('/api/tasks-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      totalCount: 1,
      tasks: [expect.objectContaining({ id: 'task-1', status: 'In Progress' })],
    });
  });

  it('returns authenticated task detail data', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      taskDetailLoader: async (_user, taskId) => ({
        profile: {
          id: 'user-1',
          displayName: 'Riley Example',
          department: 'Coding',
          avatarUrl: null,
          isAdmin: true,
        },
        task: {
          id: taskId,
          name: 'Ship task detail',
          department: 'Coding',
          status: 'In Progress',
          priority: 'High',
          areaId: 'area-1',
          areaName: 'Migration',
          assigneeId: 'user-1',
          assigneeName: 'Riley Example',
          assigneeAvatarUrl: null,
          deadline: '2026-06-25',
          description: 'Move task detail into Hono.',
          bounty: null,
          createdAt: '2026-06-18T12:00:00.000Z',
          overdue: false,
        },
        activity: [
          {
            id: 'activity-1',
            action: 'created',
            target: 'Ship task detail',
            createdAt: '2026-06-18T12:00:00.000Z',
          },
        ],
      }),
    });

    const response = await testApp.request('/api/tasks-index/task-1');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      task: { id: 'task-1', name: 'Ship task detail' },
      activity: [expect.objectContaining({ action: 'created' })],
    });
  });

  it('requires an authenticated investor before returning investor overview data', async () => {
    const testApp = createApiApp({
      investorAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/investor-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns investor overview data', async () => {
    const testApp = createApiApp({
      investorAuthResolver: async () => ({ id: 'investor-1', email: 'investor@example.invalid' }),
      investorOverviewLoader: async () => ({
        profile: {
          id: 'investor-1',
          displayName: 'Investor Example',
          email: 'investor@example.invalid',
          avatarUrl: null,
          timezone: 'America/New_York',
          paypalEmail: null,
          isAdmin: false,
          isInvestor: true,
        },
        stats: {
          totalTasks: 10,
          completedTasks: 4,
          overallProgress: 40,
          blockedTasks: 1,
          overdueTasks: 0,
          activeAreas: 2,
          completedThisWeek: 2,
        },
        areas: [
          {
            id: 'area-1',
            name: 'Gameplay',
            status: 'Active',
            progress: 55,
            description: null,
            phase: 'Build',
            targetDate: null,
            taskCount: 5,
            completedTaskCount: 2,
          },
        ],
        recentActivity: [
          {
            id: 'activity-1',
            action: 'Completed',
            target: 'Prototype',
            createdAt: '2026-06-18T12:00:00.000Z',
            taskId: 'task-1',
            docId: null,
          },
        ],
        healthSummary: '2 tasks completed this week.',
      }),
    });

    const response = await testApp.request('/api/investor-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stats: { overallProgress: 40 },
      areas: [expect.objectContaining({ id: 'area-1', name: 'Gameplay' })],
    });
  });

  it('returns investor docs and payments data', async () => {
    const investorAuthResolver = async () => ({ id: 'investor-1', email: 'investor@example.invalid' });
    const profile = {
      id: 'investor-1',
      displayName: 'Investor Example',
      email: 'investor@example.invalid',
      avatarUrl: null,
      timezone: 'America/New_York',
      paypalEmail: null,
      isAdmin: false,
      isInvestor: true,
    };
    const testApp = createApiApp({
      investorAuthResolver,
      investorDocsLoader: async () => ({
        profile,
        docs: [
          {
            id: 'doc-1',
            title: 'Investor Update',
            type: 'doc',
            restrictedDepartments: [],
            locked: false,
            preview: 'Monthly update',
            slideCount: 0,
            thumbnailUrl: null,
            updatedAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            recentlyUpdated: true,
          },
        ],
        docCount: 1,
        deckCount: 0,
      }),
      investorPaymentsLoader: async () => ({
        profile,
        stats: {
          thisMonth: 500,
          lastMonth: 250,
          allTime: 750,
          peoplePaid: 2,
          paymentCount: 2,
        },
        payments: [
          {
            id: 'payment-1',
            recipientId: 'user-1',
            recipientName: 'Riley Example',
            recipientAvatarUrl: null,
            recipientDepartment: 'Coding',
            amount: 500,
            currency: 'USD',
            description: 'Milestone',
            paidAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            itemCount: 1,
          },
        ],
      }),
      investorSettingsLoader: async () => ({
        profile: {
          ...profile,
          timezone: 'America/New_York',
          paypalEmail: 'payments@example.invalid',
        },
      }),
      investorSettingsUpdater: async (_user, input) => ({
        profile: {
          ...profile,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? null,
          timezone: input.timezone ?? null,
          paypalEmail: input.paypalEmail ?? null,
        },
      }),
    });

    const docsResponse = await testApp.request('/api/investor-docs-index');
    const paymentsResponse = await testApp.request('/api/investor-payments-index');
    const settingsResponse = await testApp.request('/api/investor-settings-index');
    const updateSettingsResponse = await testApp.request('/api/investor-settings-index', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Updated Investor',
        avatarUrl: null,
        timezone: 'America/New_York',
        paypalEmail: 'payments@example.invalid',
      }),
    });

    expect(docsResponse.status).toBe(200);
    expect(await docsResponse.json()).toMatchObject({
      docCount: 1,
      docs: [expect.objectContaining({ id: 'doc-1' })],
    });
    expect(paymentsResponse.status).toBe(200);
    expect(await paymentsResponse.json()).toMatchObject({
      stats: { allTime: 750 },
      payments: [expect.objectContaining({ id: 'payment-1' })],
    });
    expect(settingsResponse.status).toBe(200);
    expect(await settingsResponse.json()).toMatchObject({
      profile: { paypalEmail: 'payments@example.invalid' },
    });
    expect(updateSettingsResponse.status).toBe(200);
    expect(await updateSettingsResponse.json()).toMatchObject({
      profile: { displayName: 'Updated Investor' },
    });
  });

  it('requires an authenticated user before returning onboarding profile data', async () => {
    const testApp = createApiApp({
      profileAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/profile/onboarding');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns and updates onboarding profile data', async () => {
    const profile = {
      currentUser: { id: 'user-1', email: 'member@example.invalid' },
      profile: {
        id: 'user-1',
        displayName: 'Member Example',
        avatarUrl: null,
        email: 'member@example.invalid',
        onboarded: 1,
      },
    };
    const testApp = createApiApp({
      profileAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      onboardingLoader: async () => profile,
      onboardingUpdater: async (_user, input) => ({
        ...profile,
        profile: {
          ...profile.profile,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? null,
        },
      }),
    });

    const loadResponse = await testApp.request('/api/profile/onboarding');
    expect(loadResponse.status).toBe(200);
    expect(await loadResponse.json()).toMatchObject({
      profile: { displayName: 'Member Example' },
    });

    const saveResponse = await testApp.request('/api/profile/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Updated Member', avatarUrl: null, timezone: 'America/New_York' }),
    });

    expect(saveResponse.status).toBe(200);
    expect(await saveResponse.json()).toMatchObject({
      profile: { displayName: 'Updated Member' },
    });
  });

  it('requires a payments token before returning payments index data', async () => {
    const testApp = createApiApp({
      paymentsAuthResolver: async () => ({
        ok: false,
        status: 401,
        error: 'payments_token_required',
      }),
    });

    const response = await testApp.request('/api/payments-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'payments_token_required' });
  });

  it('returns authenticated payments index data', async () => {
    const testApp = createApiApp({
      paymentsAuthResolver: async () => ({
        ok: true,
        auth: {
          user: { id: 'admin-1', email: 'admin@example.invalid' },
          supabase: {} as never,
          isAdmin: true,
          isInvestor: false,
          tokenValid: true,
        },
      }),
      paymentsIndexLoader: async (user) => ({
        currentUser: user,
        stats: {
          pendingTotal: 250,
          paidThisMonth: 500,
          peopleOwed: 1,
          paymentsThisMonth: 2,
        },
        people: [
          {
            id: 'user-1',
            displayName: 'Riley Example',
            department: 'Coding',
            avatarUrl: null,
            paypalEmail: 'payments@example.invalid',
            pendingAmount: 250,
            hasPaid: true,
          },
        ],
        pendingRequests: [],
        recentPaid: [
          {
            id: 'payment-1',
            recipientId: 'user-1',
            recipientName: 'Riley Example',
            recipientEmail: null,
            recipientAvatarUrl: null,
            amount: 500,
            currency: 'USD',
            description: 'Milestone',
            status: 'paid',
            paidAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            itemCount: 1,
          },
        ],
      }),
    });

    const response = await testApp.request('/api/payments-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stats: { pendingTotal: 250, paidThisMonth: 500 },
      people: [expect.objectContaining({ id: 'user-1', pendingAmount: 250 })],
      recentPaid: [expect.objectContaining({ id: 'payment-1', status: 'paid' })],
    });
  });
});
