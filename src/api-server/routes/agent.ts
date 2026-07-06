import { Hono, type Context } from 'hono';
import { loadTasksBoard } from '@/lib/tasks-board';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';
import { AGENT_TOOLS, getToolById } from '../agent/tool-registry';
import type { AgentWriteTarget, WriteTool } from '../agent/tool-contract';
import { runAgentLoop, createAnthropicCaller, EKO_AGENT_SYSTEM } from '../agent/runtime';
import { AgentActionError } from '../agent/errors';
import { assertAdmin } from '../agent/eko-activity';
import {
  getPendingActionById,
  isExecutable,
  markExecuting,
  markExecuted,
  markFailed,
  markRejected,
} from '../agent/pending-actions';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;
type AgentMode = 'chat' | 'approval';
type AgentDecision = 'approve' | 'reject';

type RecentHistoryItem = { role: 'user' | 'eko' | 'action'; text: string };

export type AgentChatInput = {
  message: string;
  mode?: AgentMode;
  decision?: AgentDecision;
  conversationId?: string;
  pendingActionIds?: string[];
  clientContext?: { path?: string; title?: string; recentHistory?: RecentHistoryItem[] };
};

export type StagedPendingDTO = { id: string; toolId: string; summary: string };
export type ExecutedActionDTO = {
  pendingActionId: string;
  ok: boolean;
  reply: string;
  target?: AgentWriteTarget;
};

export type AgentChatResult = {
  reply: string;
  provider: 'anthropic';
  model: string;
  pendingActions?: StagedPendingDTO[];
  executed?: ExecutedActionDTO[];
};

type AgentRunner = (input: AgentChatInput, user: AuthenticatedUser) => Promise<AgentChatResult>;

type AgentRoutesOptions = { authResolver?: AuthResolver; agentRunner?: AgentRunner };

export function createAgentRoutes(options: AgentRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const agentRunner = options.agentRunner ?? runAgentChat;

  return new Hono().post('/agent/chat', async (c) => {
    const user = await authResolver(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const input = await parseAgentInput(c);
    if ('error' in input) return c.json({ error: input.error }, 400);

    try {
      return c.json(await agentRunner(input, user));
    } catch (error) {
      if (error instanceof AgentActionError) {
        return c.json({ error: error.message }, { status: error.status as 500 });
      }
      console.error('[hono agent] chat failed:', error);
      return c.json({ error: 'EKO failed before making changes.' }, 500);
    }
  });
}

async function parseAgentInput(c: Context): Promise<AgentChatInput | { error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: 'Invalid JSON body' };
  }
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const record = body as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  const mode = record.mode === 'approval' ? 'approval' : 'chat';
  const decision =
    record.decision === 'approve' || record.decision === 'reject' ? record.decision : undefined;
  const pendingActionIds = Array.isArray(record.pendingActionIds)
    ? record.pendingActionIds.filter((id): id is string => typeof id === 'string')
    : undefined;

  if (mode === 'approval') {
    if (!decision) return { error: 'Approval decision is required' };
    if (decision === 'approve' && (!pendingActionIds || pendingActionIds.length === 0)) {
      return { error: 'pendingActionIds are required to approve' };
    }
  } else {
    if (!message) return { error: 'Message is required' };
    if (message.length > 2000) return { error: 'Message is too long' };
  }

  return {
    message,
    mode,
    decision,
    conversationId:
      typeof record.conversationId === 'string' && record.conversationId ? record.conversationId : undefined,
    pendingActionIds,
    clientContext: parseClientContext(record.clientContext),
  };
}

function parseClientContext(value: unknown): AgentChatInput['clientContext'] {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return {
    path: typeof record.path === 'string' ? record.path : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    recentHistory: parseRecentHistory(record.recentHistory),
  };
}

function parseRecentHistory(value: unknown): RecentHistoryItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item): RecentHistoryItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const role = record.role === 'user' || record.role === 'eko' || record.role === 'action' ? record.role : null;
      const text = typeof record.text === 'string' ? record.text.trim().slice(0, 280) : '';
      if (!role || !text) return null;
      return { role, text };
    })
    .filter((item): item is RecentHistoryItem => Boolean(item))
    .slice(-6);
}

async function runAgentChat(input: AgentChatInput, user: AuthenticatedUser): Promise<AgentChatResult> {
  if (input.mode === 'approval' && input.decision) {
    return runApprovalDecision(input, user);
  }

  // Slash commands run in the tray, not the model.
  if (/^\/[a-z]+\b/i.test(input.message.trim())) {
    return {
      reply: 'That command runs in the tray, not on the server. Type /clear in the composer to reset this chat.',
      provider: 'anthropic',
      model: 'eko-local',
    };
  }

  // A bare "yes"/"approve" in chat mode must never burn a model call or stage a
  // fresh write — approvals go through the Approve button, not free-text chat.
  if (/^\s*(?:yes|yeah|yep|ok|okay|sure|confirmed?|confirm|go ahead|proceed|do it|approve(?: it)?|approved(?: it)?|i approve)\s*[.!?]*\s*$/i.test(input.message)) {
    return {
      reply: 'Use the Approve button on the pending action, or tell EKO the specific action you want prepared. Writes stay gated until approved.',
      provider: 'anthropic',
      model: 'eko-local',
    };
  }

  const board = await loadTasksBoard(user).catch(() => null);
  const conversationId = input.conversationId ?? 'default';
  const { caller, model } = createAnthropicCaller();
  const loop = await runAgentLoop({
    userMessage: input.message,
    system: EKO_AGENT_SYSTEM,
    ctx: { user, board, conversationId },
    tools: AGENT_TOOLS,
    caller,
  });

  return {
    reply: loop.text || 'Done.',
    provider: 'anthropic',
    model,
    pendingActions: loop.pendingActions,
  };
}

async function runApprovalDecision(
  input: AgentChatInput,
  user: AuthenticatedUser,
): Promise<AgentChatResult> {
  if (input.decision === 'reject') {
    for (const id of input.pendingActionIds ?? []) {
      await markRejected(id).catch(() => undefined);
    }
    return { reply: 'Rejected. No dashboard changes were made.', provider: 'anthropic', model: 'eko-local' };
  }

  const executed: ExecutedActionDTO[] = [];
  for (const id of input.pendingActionIds ?? []) {
    executed.push(await executeById(id, user));
  }
  const okCount = executed.filter((e) => e.ok).length;
  const reply = okCount
    ? executed.filter((e) => e.ok).map((e) => e.reply).join(' ')
    : executed[0]?.reply ?? 'No changes were made.';

  return { reply, provider: 'anthropic', model: 'eko-local', executed };
}

/**
 * Execute one staged action by id. Idempotent on status (re-approving an
 * executed/rejected/failed row is a no-op). Gate runs on every approval.
 */
export async function executeById(id: string, user: AuthenticatedUser): Promise<ExecutedActionDTO> {
  const row = await getPendingActionById(id);
  if (!row) return { pendingActionId: id, ok: false, reply: 'That action is no longer available.' };
  if (!isExecutable(row.status)) {
    return { pendingActionId: id, ok: false, reply: `That action is already ${row.status}. No changes were made.` };
  }

  await assertAdmin(user.id);
  await markExecuting(id);

  const tool = getToolById(row.tool_id);
  if (!tool || !tool.gated) {
    await markFailed(id, `No write tool for ${row.tool_id}`);
    return { pendingActionId: id, ok: false, reply: 'EKO no longer has a matching write tool for that action.' };
  }

  try {
    const result = await (tool as WriteTool).commit(row.resolved_args, user);
    await markExecuted(id);
    return { pendingActionId: id, ok: true, reply: result.reply, target: result.target };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'EKO could not complete the action.';
    await markFailed(id, message);
    if (error instanceof AgentActionError && error.status === 403) throw error; // surface gate failures
    return { pendingActionId: id, ok: false, reply: message };
  }
}
