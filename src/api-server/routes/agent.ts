import { Hono, type Context } from 'hono';
import { loadTasksBoard, type TasksBoardData } from '@/lib/tasks-board';
import { loadDocsIndex, type DocsIndexData } from '@/lib/docs-index';
import { loadPaymentsIndex, type PaymentsIndexData } from '@/lib/payments-index';
import { getServiceClient } from '@/lib/supabase/service';
import type { Priority, TaskStatus } from '@/lib/types';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';
import { buildAgentDashboardContext } from '../agent/context';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;
type AgentProvider = 'openai' | 'anthropic';
type AgentMode = 'chat' | 'approval';
type AgentDecision = 'approve' | 'reject';
type AgentIntent = 'answer' | 'clarification' | 'details_needed' | 'approval_required' | 'executed' | 'rejected';
type AgentApprovalDraft = {
  title?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  docType?: string;
  docTitle?: string;
  content?: string;
  noteBody?: string;
  taskName?: string;
  /** Board task_number as a string — the unique, user-facing task reference. */
  taskNumber?: string;
  /** Comma-separated task_numbers for bulk writes ("10,12,13"). */
  taskNumbers?: string;
  assigneeName?: string;
};
type AgentApproval = {
  kind: 'issue.create' | 'issue.update' | 'issue.delete' | 'doc.create' | 'doc.update' | 'note.create' | 'generic';
  title: string;
  copy: string;
  draft?: AgentApprovalDraft;
};
type RecentHistoryItem = {
  role: 'user' | 'eko' | 'action';
  text: string;
};
type AgentHistoryRow = {
  role: string | null;
  text: string | null;
  created_at?: string | null;
};
type AgentHistoryInsert = {
  user_id: string;
  role: RecentHistoryItem['role'];
  text: string;
  metadata: Record<string, unknown>;
};
type AgentHistoryQuery = {
  select: (columns: string) => AgentHistoryQuery;
  eq: (column: string, value: string) => AgentHistoryQuery;
  order: (column: string, options?: { ascending?: boolean }) => AgentHistoryQuery;
  limit: (count: number) => Promise<{ data: AgentHistoryRow[] | null; error: { message?: string } | null }>;
  insert: (rows: AgentHistoryInsert[]) => Promise<{ error: { message?: string } | null }>;
};
type AgentHistoryService = {
  from: (table: 'agent_chat_messages') => AgentHistoryQuery;
};

export type AgentChatInput = {
  message: string;
  mode?: AgentMode;
  decision?: AgentDecision;
  suggestion?: {
    id?: string;
    title?: string;
    meta?: string;
    approvalCopy?: string;
    approval?: AgentApproval;
  };
  revision?: string;
  clientContext?: {
    path?: string;
    title?: string;
    recentHistory?: RecentHistoryItem[];
  };
};

/**
 * Deep-link target for an executed write. Pure UI-choreography metadata: it
 * tells the tray WHICH card changed so the post-write receipt can spotlight
 * it via the EKO bus — it never carries or triggers a mutation itself.
 * Deletes intentionally return no target (the row is gone).
 */
export type AgentWriteTarget = {
  kind: 'task';
  taskId: string;
  taskNumber?: number | null;
  name: string;
  action: 'create' | 'status' | 'assignee' | 'priority' | 'dueDate';
};

export type AgentChatResult = {
  reply: string;
  provider: AgentProvider;
  model: string;
  intent?: AgentIntent;
  approval?: AgentApproval;
  /** Present only on `intent: 'executed'` responses that changed one task. */
  target?: AgentWriteTarget;
};

type AgentRunner = (input: AgentChatInput, user: AuthenticatedUser) => Promise<AgentChatResult>;
type AgentContextLoader = (user: AuthenticatedUser) => Promise<string>;

type AgentRoutesOptions = {
  authResolver?: AuthResolver;
  agentRunner?: AgentRunner;
  contextLoader?: AgentContextLoader;
};

class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

class AgentProviderError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AgentProviderError';
    this.status = status;
  }
}

const MAX_PERSISTED_HISTORY_ITEMS = 24;
const MAX_PROMPT_HISTORY_ITEMS = 10;

const EKO_INSTRUCTIONS = [
  'You are EKO, SEEKO Studio dashboard agent.',
  'Audience: admins and investors. Be concise, specific, and operational.',
  'You can help summarize dashboard state, draft investor-safe updates, review queues, and explain risk.',
  'Risky actions require approval first. Never claim a write, send, delete, payment, invite, or publish action has happened unless the request explicitly says it was approved and the product has executed it.',
  'When a write is needed, be specific about the target, fields, and action. If required fields are missing, ask for those fields instead of presenting it as approved.',
  'When proposing a complete write that needs user confirmation, start the reply with "Ready for approval:" followed by the specific action.',
  'Format for the dashboard tray: plain text only, no markdown, no bullets, no numbered lists. Keep replies to one or two short sentences.',
  'Use the supplied Dashboard context as live read context. Do not say you lack live task data unless the context explicitly says unavailable.',
].join('\n');

export function createAgentRoutes(options: AgentRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const contextLoader = options.contextLoader ?? loadAgentDashboardContext;
  const agentRunner = options.agentRunner ?? ((input, user) => runAgentChat(input, user, contextLoader));

  return new Hono().get('/agent/history', async (c) => {
    const user = await authResolver(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    try {
      return c.json({ history: await loadPersistedAgentHistory(user.id) });
    } catch (error) {
      console.error('[hono agent] history load failed:', error);
      return c.json({ error: 'EKO history is unavailable.' }, 503);
    }
  }).post('/agent/chat', async (c) => {
    const user = await authResolver(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const input = await parseAgentInput(c);
    if ('error' in input) return c.json({ error: input.error }, 400);

    try {
      const serverHistory = await safeLoadPersistedAgentHistory(user.id);
      const hydratedInput = mergeInputHistory(input, serverHistory);
      await safePersistAgentHistory(user.id, [
        {
          role: 'user',
          text: input.message,
          metadata: {
            path: input.clientContext?.path,
            title: input.clientContext?.title,
          },
        },
      ]);

      const result = await agentRunner(hydratedInput, user);
      await safePersistAgentHistory(user.id, [
        {
          role: 'eko',
          text: result.reply,
          metadata: {
            intent: result.intent,
            provider: result.provider,
            model: result.model,
          },
        },
      ]);

      return c.json(result);
    } catch (error) {
      if (error instanceof AgentConfigError) {
        return c.json({ error: error.message }, 503);
      }
      if (error instanceof AgentProviderError) {
        return c.json({ error: error.message }, { status: error.status as 502 });
      }

      console.error('[hono agent] chat failed:', error);
      return c.json({ error: 'EKO failed before making changes.' }, 500);
    }
  });
}

function getAgentHistoryService() {
  return getServiceClient() as unknown as AgentHistoryService;
}

function sanitizeHistoryRows(rows: AgentHistoryRow[] | null | undefined): RecentHistoryItem[] {
  return (rows ?? [])
    .map((row): RecentHistoryItem | null => {
      const role = row.role === 'user' || row.role === 'eko' || row.role === 'action' ? row.role : null;
      const text = typeof row.text === 'string' ? row.text.trim().slice(0, 420) : '';
      if (!role || !text) return null;
      return { role, text };
    })
    .filter((item): item is RecentHistoryItem => Boolean(item))
    .slice(-MAX_PERSISTED_HISTORY_ITEMS);
}

async function loadPersistedAgentHistory(userId: string): Promise<RecentHistoryItem[]> {
  const service = getAgentHistoryService();
  const { data, error } = await service
    .from('agent_chat_messages')
    .select('role,text,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_PERSISTED_HISTORY_ITEMS);

  if (error) throw new Error(error.message ?? 'history_load_failed');
  return sanitizeHistoryRows(data);
}

async function safeLoadPersistedAgentHistory(userId: string): Promise<RecentHistoryItem[]> {
  try {
    return await loadPersistedAgentHistory(userId);
  } catch (error) {
    if (!isMissingServiceConfigError(error)) {
      console.warn('[hono agent] history unavailable; continuing with client context only', error);
    }
    return [];
  }
}

function mergeInputHistory(input: AgentChatInput, serverHistory: RecentHistoryItem[]): AgentChatInput {
  const clientHistory = input.clientContext?.recentHistory ?? [];
  const seen = new Set<string>();
  const merged = [...serverHistory, ...clientHistory].filter((item) => {
    const key = `${item.role}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-MAX_PROMPT_HISTORY_ITEMS);

  return {
    ...input,
    clientContext: {
      ...input.clientContext,
      recentHistory: merged.length ? merged : undefined,
    },
  };
}

async function safePersistAgentHistory(
  userId: string,
  rows: Array<{ role: RecentHistoryItem['role']; text: string; metadata?: Record<string, unknown> }>,
) {
  const inserts = rows
    .map((row): AgentHistoryInsert | null => {
      const text = row.text.trim().slice(0, 2000);
      if (!text) return null;
      return {
        user_id: userId,
        role: row.role,
        text,
        metadata: row.metadata ?? {},
      };
    })
    .filter((row): row is AgentHistoryInsert => Boolean(row));

  if (!inserts.length) return;

  try {
    const service = getAgentHistoryService();
    const { error } = await service.from('agent_chat_messages').insert(inserts);
    if (error) throw new Error(error.message ?? 'history_insert_failed');
  } catch (error) {
    if (!isMissingServiceConfigError(error)) {
      console.warn('[hono agent] history persist failed:', error);
    }
  }
}

function isMissingServiceConfigError(error: unknown) {
  return error instanceof Error && /Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/.test(error.message);
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
  if (!message) return { error: 'Message is required' };
  if (message.length > 2000) return { error: 'Message is too long' };

  const mode = record.mode === 'approval' ? 'approval' : 'chat';
  const decision =
    record.decision === 'approve' || record.decision === 'reject' ? record.decision : undefined;
  if (mode === 'approval' && !decision) return { error: 'Approval decision is required' };

  return {
    message,
    mode,
    decision,
    suggestion: parseSuggestion(record.suggestion),
    revision: typeof record.revision === 'string' ? record.revision.trim().slice(0, 500) : undefined,
    clientContext: parseClientContext(record.clientContext),
  };
}

function parseSuggestion(value: unknown): AgentChatInput['suggestion'] {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;

  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    meta: typeof record.meta === 'string' ? record.meta : undefined,
    approvalCopy: typeof record.approvalCopy === 'string' ? record.approvalCopy : undefined,
    approval: parseApproval(record.approval),
  };
}

function parseApproval(value: unknown): AgentApproval | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const kind =
    record.kind === 'issue.create' ||
    record.kind === 'issue.update' ||
    record.kind === 'issue.delete' ||
    record.kind === 'doc.create' ||
    record.kind === 'doc.update' ||
    record.kind === 'note.create' ||
    record.kind === 'generic'
      ? record.kind
      : null;
  const title = typeof record.title === 'string' ? record.title.trim().slice(0, 120) : '';
  const copy = typeof record.copy === 'string' ? record.copy.trim().slice(0, 500) : '';
  if (!kind || !title || !copy) return undefined;

  return {
    kind,
    title,
    copy,
    draft: parseApprovalDraft(record.draft),
  };
}

function parseApprovalDraft(value: unknown): AgentApprovalDraft | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const draft: AgentApprovalDraft = {};
  for (const key of ['title', 'status', 'priority', 'dueDate', 'docType', 'docTitle', 'taskName', 'taskNumber', 'taskNumbers', 'assigneeName'] as const) {
    const field = record[key];
    if (typeof field === 'string' && field.trim()) draft[key] = field.trim().slice(0, 140);
  }
  if (typeof record.content === 'string' && record.content.trim()) {
    draft.content = record.content.trim().slice(0, 5_000);
  }
  if (typeof record.noteBody === 'string' && record.noteBody.trim()) {
    draft.noteBody = record.noteBody.trim().slice(0, 1_000);
  }
  return Object.keys(draft).length ? draft : undefined;
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
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(-6);
}

async function runAgentChat(
  input: AgentChatInput,
  _user: AuthenticatedUser,
  contextLoader: AgentContextLoader = loadAgentDashboardContext,
): Promise<AgentChatResult> {
  if (input.mode === 'approval' && input.decision) {
    return runApprovalDecision(input, _user);
  }

  // Slash commands are client-side tray actions (chat state lives in the
  // browser). Left unguarded, "/clear" reaches the LLM and gets a fabricated
  // "Cleared." while every bubble stays on screen.
  if (input.mode !== 'approval' && /^\/[a-z]+\b/i.test(input.message.trim())) {
    return {
      reply: 'That command runs in the tray, not on the server. Type /clear in the composer to reset this chat.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    };
  }

  const dashboardContext = await contextLoader(_user);

  if (input.mode !== 'approval' && isBareConfirmationMessage(input.message)) {
    const contextualConfirmation = answerLocalContextualConfirmation(input, dashboardContext);
    if (contextualConfirmation) return contextualConfirmation;
    return {
      reply: 'Use the Approve button on the pending action, or tell EKO the specific action you want prepared. Writes stay gated until approved.',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    };
  }

  const contextualDetail = answerLocalMissingDetail(input, dashboardContext);
  if (contextualDetail) return contextualDetail;

  const localNotePlan = planLocalNoteWrite(input);
  if (localNotePlan) return localNotePlan;

  const localDocumentPlan = planLocalDocumentWrite(input);
  if (localDocumentPlan) return localDocumentPlan;

  const localWritePlan = planLocalIssueWrite(input, dashboardContext);
  if (localWritePlan) return localWritePlan;

  const localFollowUp = answerLocalContextFollowUp(input, dashboardContext);
  if (localFollowUp) return localFollowUp;

  const providers = resolveProviderPlan(input);
  const prompt = buildPrompt(input, dashboardContext);

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const result = provider === 'openai' ? await runOpenAI(prompt) : await runAnthropic(prompt);
      return withTypedIntent(input, result);
    } catch (error) {
      lastError = error;
      if (providers.length === 1 || error instanceof AgentConfigError) throw error;
      console.warn(`[hono agent] ${provider} failed, trying fallback provider`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new AgentProviderError('EKO provider routing failed.');
}

async function runApprovalDecision(input: AgentChatInput, user: AuthenticatedUser): Promise<AgentChatResult> {
  if (input.decision === 'reject') {
    return {
      reply: 'Rejected. No dashboard changes were made.',
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'rejected',
    };
  }

  const typedApproval = input.suggestion?.approval;
  const typedAction = typedApproval ? await executeTypedApproval(typedApproval, user) : null;
  if (typedAction) return typedAction;

  if (typedApproval) {
    return {
      reply: 'Approval recorded, but EKO does not have enough typed issue details to execute safely. No dashboard changes were made.',
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
      approval: typedApproval,
    };
  }

  const action = input.revision || input.suggestion?.approvalCopy || input.message;
  const cleanAction = normalizeAgentReply(action).replace(/^ready for approval:\s*/i, '');
  const board = await loadTasksBoard(user).catch(() => null);
  const dashboardContext = board ? summarizeBoardContext(board) : await loadAgentDashboardContext(user);
  const execution = await executeApprovedIssueWrite(cleanAction, user, dashboardContext, board);
  if (execution) return execution;

  return {
    reply: cleanAction
      ? `Approval recorded, but EKO does not have a matching write tool for "${cleanAction}" yet. No dashboard changes were made.`
      : 'Approval recorded, but EKO did not receive a specific write action. No dashboard changes were made.',
    provider: 'openai',
    model: 'eko-local-approval',
    intent: 'answer',
  };
}

async function executeTypedApproval(approval: AgentApproval, user: AuthenticatedUser): Promise<AgentChatResult | null> {
  const board = await loadTasksBoard(user).catch(() => null);
  const dashboardContext = board ? summarizeBoardContext(board) : '';

  if (approval.kind === 'issue.create') {
    return executeIssueCreateDraft(approval.draft, user);
  }

  if (approval.kind === 'issue.update') {
    if (approval.draft?.assigneeName && approval.draft.taskNumbers) {
      return executeBulkAssigneeDraft(approval.draft.taskNumbers, approval.draft.assigneeName, user, board);
    }

    const status = parseTaskStatus(approval.draft?.status ?? approval.copy);
    if (approval.draft?.taskName && status) {
      return executeIssueStatusDraft({ taskName: approval.draft.taskName, status }, user, board);
    }

    if (approval.draft?.taskName && approval.draft.assigneeName) {
      return executeIssueAssigneeDraft(
        { taskName: approval.draft.taskName, assigneeName: approval.draft.assigneeName },
        user,
        board,
      );
    }

    const priority = parsePriority(approval.draft?.priority ?? approval.copy);
    if (approval.draft?.taskName && priority) {
      return executeIssuePriorityDraft({ taskName: approval.draft.taskName, priority }, user, board);
    }

    const dueDate = parseDueDate(approval.draft?.dueDate ?? approval.copy);
    if (approval.draft?.taskName && dueDate) {
      return executeIssueDueDateDraft({ taskName: approval.draft.taskName, dueDate }, user, board);
    }

    const parsedStatus = parseIssueStatusDraft(approval.copy, dashboardContext);
    if (parsedStatus?.taskName && parsedStatus.status) return executeIssueStatusDraft(parsedStatus, user, board);

    const parsedAssignee = parseIssueAssigneeDraft(approval.copy, dashboardContext);
    if (parsedAssignee?.taskName && parsedAssignee.assigneeName) return executeIssueAssigneeDraft(parsedAssignee, user, board);

    const parsedPriority = parseIssuePriorityDraft(approval.copy, dashboardContext);
    if (parsedPriority?.taskName && parsedPriority.priority) return executeIssuePriorityDraft(parsedPriority, user, board);

    const parsedDueDate = parseIssueDueDateDraft(approval.copy, dashboardContext);
    if (parsedDueDate?.taskName && parsedDueDate.dueDate) return executeIssueDueDateDraft(parsedDueDate, user, board);
  }

  if (approval.kind === 'issue.delete') {
    return executeIssueDeleteDraft(approval.draft, user, board);
  }

  if (approval.kind === 'doc.create') {
    return executeDocumentCreateDraft(approval.draft, user);
  }

  if (approval.kind === 'doc.update') {
    return executeDocumentUpdateDraft(approval.draft, user);
  }

  if (approval.kind === 'note.create') {
    return executeNoteCreateDraft(approval.draft, user);
  }

  return null;
}

function resolveProviderPlan(input: AgentChatInput): AgentProvider[] {
  const configured = (process.env.EKO_AGENT_PROVIDER ?? 'auto').toLowerCase();

  if (configured === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new AgentConfigError('Missing OPENAI_API_KEY for EKO.');
    return ['openai'];
  }

  if (configured === 'anthropic' || configured === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) throw new AgentConfigError('Missing ANTHROPIC_API_KEY for EKO.');
    return ['anthropic'];
  }

  const preferred = choosePrimaryProvider(input);
  const fallback: AgentProvider = preferred === 'openai' ? 'anthropic' : 'openai';
  const providers = [preferred, fallback].filter((provider, index, list) => {
    if (list.indexOf(provider) !== index) return false;
    return provider === 'openai' ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
  });

  if (providers.length) return providers;
  throw new AgentConfigError('Configure OPENAI_API_KEY or ANTHROPIC_API_KEY to use EKO.');
}

function choosePrimaryProvider(input: AgentChatInput): AgentProvider {
  const signal = [
    input.message,
    input.suggestion?.title,
    input.suggestion?.meta,
    input.suggestion?.approvalCopy,
    input.revision,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/\b(draft|investor|approval|approve|risky|risk|write|create|delete|move|send|publish|payment|invoice|invite|revise|review queue|digest)\b/.test(signal)) {
    return 'anthropic';
  }

  return 'openai';
}

async function loadAgentDashboardContext(user: AuthenticatedUser) {
  // Delegates to the richer structured builder in ../agent/context (team
  // roster, areas/milestones, task-number-grounded issues, activity, notes inbox,
  // docs, payments) which also appends the EKO_CAPABILITIES manifest. Each
  // section degrades to an "unavailable" line on failure — never throws.
  return buildAgentDashboardContext(user);
}

function summarizeBoardContext(data: TasksBoardData) {
  const statusCounts = new Map<string, number>();
  for (const task of data.tasks) {
    statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
  }
  const counts = [...statusCounts.entries()]
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');
  const overdueTasks = data.tasks.filter((task) => isTaskOverdue(task.deadline, task.status));
  const formatTask = (task: TasksBoardData['tasks'][number]) => {
    const flags = [
      task.status,
      task.priority ? `${task.priority} priority` : null,
      isTaskOverdue(task.deadline, task.status) ? 'overdue' : null,
      task.deadline ? `due ${task.deadline}` : null,
      task.assignee?.display_name ? `assigned to ${task.assignee.display_name}` : null,
    ].filter(Boolean);
    return `${task.name}${flags.length ? ` (${flags.join(', ')})` : ''}`;
  };
  const inProgressTasks = data.tasks
    .filter((task) => task.status === 'In Progress')
    .slice(0, 8)
    .map(formatTask);
  const riskTasks = data.tasks
    .filter((task) => isTaskOverdue(task.deadline, task.status) || task.priority === 'Urgent' || task.priority === 'High' || task.status === 'Backlog')
    .slice(0, 6)
    .map(formatTask);
  const reviewTasks = data.tasks
    .filter((task) => task.status === 'In Review')
    .slice(0, 4)
    .map(formatTask);
  const milestones = data.projectMilestones
    .slice(0, 8)
    .map((milestone) => `${milestone.name}${milestone.health ? ` (${milestone.health})` : ''}${milestone.target_date ? ` due ${milestone.target_date}` : ''}`);
  const recentActivity = data.projectActivity
    .slice(0, 6)
    .map((activity) => `${activity.action}: ${activity.target}`);
  const recentActivityTaskDetails = data.projectActivity
    .slice(0, 8)
    .map((activity) => data.tasks.find((task) => task.name.toLowerCase() === activity.target.toLowerCase()))
    .filter((task, index, tasks): task is TasksBoardData['tasks'][number] => {
      if (!task) return false;
      return tasks.findIndex((item) => item?.id === task.id) === index;
    })
    .slice(0, 5)
    .map(formatTask);

  return [
    `Issues context: ${data.tasks.length} tasks, ${overdueTasks.length} overdue, ${data.team.length} staff, ${data.areas.length} areas, ${data.projectMilestones.length} milestones.`,
    `Task counts by status: ${counts}.`,
    inProgressTasks.length ? `In progress: ${inProgressTasks.join('; ')}.` : 'In progress: no tasks currently visible.',
    riskTasks.length ? `Risk queue: ${riskTasks.join('; ')}.` : 'Risk queue: no urgent, high-priority, backlog, or overdue tasks visible.',
    reviewTasks.length ? `In review: ${reviewTasks.join('; ')}.` : 'In review: no tasks currently visible.',
    data.team.length ? `Staff: ${data.team.map((member) => `${member.display_name ?? 'Unnamed'}${member.department ? ` (${member.department})` : ''}`).slice(0, 12).join('; ')}.` : 'Staff: no roster entries visible.',
    data.areas.length ? `Areas: ${data.areas.map((area) => `${area.name}${typeof area.progress === 'number' ? ` ${area.progress}%` : ''}`).slice(0, 10).join('; ')}.` : 'Areas: no areas visible.',
    milestones.length ? `Milestones: ${milestones.join('; ')}.` : 'Milestones: no milestones visible.',
    recentActivity.length ? `Recent activity: ${recentActivity.join('; ')}.` : 'Recent activity: no recent activity visible.',
    recentActivityTaskDetails.length ? `Recent activity task details: ${recentActivityTaskDetails.join('; ')}.` : null,
    data.account.notifications.length ? `Notifications: ${data.account.unreadCount} unread; ${data.account.notifications.slice(0, 5).map((notification) => notification.title).join('; ')}.` : 'Notifications: none visible.',
  ].filter(Boolean).join('\n');
}

function summarizeDocsContext(data: DocsIndexData) {
  const visibleDocs = data.docs.filter((doc) => !doc.locked).slice(0, 10);
  const lockedDocs = data.docs.filter((doc) => doc.locked).slice(0, 6);

  return [
    `Docs context: ${data.docCount} docs, ${data.deckCount} decks, ${data.lockedCount} locked.`,
    visibleDocs.length ? `Accessible docs: ${visibleDocs.map((doc) => `${doc.title}${doc.type === 'deck' ? ' (deck)' : ''}`).join('; ')}.` : 'Accessible docs: none visible.',
    lockedDocs.length ? `Locked docs: ${lockedDocs.map((doc) => doc.title).join('; ')}.` : 'Locked docs: none visible.',
  ].join('\n');
}

function summarizePaymentsContext(data: PaymentsIndexData) {
  return [
    `Payments context: ${data.stats.peopleOwed} people owed, ${data.stats.paymentsThisMonth} payments this month, pending total ${data.stats.pendingTotal} ${data.recentPaid[0]?.currency ?? 'USD'}, paid this month ${data.stats.paidThisMonth}.`,
    data.people.length ? `Payment roster: ${data.people.slice(0, 8).map((person) => `${person.displayName ?? 'Unnamed'}${person.pendingAmount ? ` pending ${person.pendingAmount}` : ''}`).join('; ')}.` : 'Payment roster: none visible.',
    data.pendingRequests.length ? `Pending payment requests: ${data.pendingRequests.slice(0, 5).map((payment) => `${payment.recipientEmail ?? payment.description ?? payment.id} ${payment.amount}`).join('; ')}.` : 'Pending payment requests: none visible.',
  ].join('\n');
}

function isTaskOverdue(deadline: string | undefined | null, status: string | null | undefined) {
  if (!deadline || status === 'Done') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(deadline).getTime() < today.getTime();
}

type IssueWriteDraft = {
  title?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: string;
  assigneeName?: string;
  taskName?: string;
};

type DocumentWriteDraft = {
  title?: string;
  docTitle?: string;
  docType?: 'doc' | 'deck';
  content?: string;
};

type NoteWriteDraft = {
  noteBody?: string;
};

export function planLocalNoteWrite(input: AgentChatInput): AgentChatResult | null {
  if (input.mode === 'approval') return null;

  const draft = parseNoteCreateDraft(input.message.trim());
  if (!draft) return null;
  if (!draft.noteBody) {
    return {
      reply: 'What should EKO add to the notes inbox?',
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    };
  }

  return {
    reply: 'Ready for approval: add note to inbox.',
    provider: 'openai',
    model: 'eko-local-planner',
    intent: 'approval_required',
    approval: {
      kind: 'note.create',
      title: 'Add note',
      copy: `Add this note to the inbox: ${draft.noteBody}`,
      draft,
    },
  };
}

export function planLocalDocumentWrite(input: AgentChatInput): AgentChatResult | null {
  if (input.mode === 'approval') return null;

  const updateDraft = parseDocumentUpdateDraft(input.message.trim());
  if (updateDraft) {
    if (!updateDraft.docTitle) {
      return {
        reply: 'Which document should EKO update?',
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'clarification',
      };
    }
    if (!updateDraft.content) {
      return {
        reply: `What should EKO write in ${updateDraft.docTitle}?`,
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'clarification',
      };
    }

    return {
      reply: `Ready for approval: update document ${updateDraft.docTitle}.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'doc.update',
        title: `Update ${updateDraft.docTitle}`,
        copy: `Replace the content in document ${updateDraft.docTitle}.`,
        draft: updateDraft,
      },
    };
  }

  const draft = parseDocumentCreateDraft(input.message.trim());
  if (!draft) return null;
  if (!draft.title) {
    return {
      reply: `What should EKO call the ${draft.docType === 'deck' ? 'deck' : 'document'}?`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    };
  }

  const label = draft.docType === 'deck' ? 'deck' : 'document';
  return {
    reply: `Ready for approval: create ${label} ${draft.title}.`,
    provider: 'openai',
    model: 'eko-local-planner',
    intent: 'approval_required',
    approval: {
      kind: 'doc.create',
      title: `Create ${draft.title}`,
      copy: `Create ${label} ${draft.title}.`,
      draft,
    },
  };
}

export function planLocalIssueWrite(input: AgentChatInput, dashboardContext: string): AgentChatResult | null {
  if (input.mode === 'approval') return null;

  const message = input.message.trim();
  const createDraft = parseIssueCreateDraft(message);
  if (createDraft) {
    const missing = [
      createDraft.title ? null : 'title',
      createDraft.status ? null : 'status',
      createDraft.priority ? null : 'priority',
      createDraft.dueDate ? null : 'due date',
    ].filter(Boolean);

    if (missing.length) {
      return {
        reply: `Add ${formatList(missing)} so EKO can prepare the issue for approval.`,
        provider: 'openai',
        model: 'eko-local-planner',
        intent: 'details_needed',
        approval: {
          kind: 'issue.create',
          title: createDraft.title ? `Create ${createDraft.title}` : 'Create issue',
          copy: 'Add issue details below. This write stays gated until you review and approve it.',
          draft: createDraft,
        },
      };
    }

    return {
      reply: `Ready for approval: create ${createDraft.title} as ${createDraft.status}, ${createDraft.priority} priority, due ${createDraft.dueDate}.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'issue.create',
        title: `Create ${createDraft.title}`,
        copy: `Create ${createDraft.title} as ${createDraft.status}, ${createDraft.priority} priority, due ${createDraft.dueDate}.`,
        draft: createDraft,
      },
    };
  }

  const statusDraft = parseIssueStatusDraft(message, dashboardContext);
  if (statusDraft?.taskName && statusDraft.status) {
    return {
      reply: `Ready for approval: move ${statusDraft.taskName} to ${statusDraft.status}.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'issue.update',
        title: `Move ${statusDraft.taskName}`,
        copy: `Move ${statusDraft.taskName} to ${statusDraft.status}.`,
        draft: statusDraft,
      },
    };
  }

  const assigneeDraft = parseIssueAssigneeDraft(message, dashboardContext);
  if (assigneeDraft?.taskName && assigneeDraft.assigneeName) {
    return {
      reply: `Ready for approval: assign ${assigneeDraft.taskName} to ${assigneeDraft.assigneeName}.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'issue.update',
        title: `Assign ${assigneeDraft.taskName}`,
        copy: `Assign ${assigneeDraft.taskName} to ${assigneeDraft.assigneeName}.`,
        draft: assigneeDraft,
      },
    };
  }

  const priorityDraft = parseIssuePriorityDraft(message, dashboardContext);
  if (priorityDraft?.taskName && priorityDraft.priority) {
    return {
      reply: `Ready for approval: set ${priorityDraft.taskName} to ${priorityDraft.priority} priority.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'issue.update',
        title: `Update ${priorityDraft.taskName} priority`,
        copy: `Set ${priorityDraft.taskName} to ${priorityDraft.priority} priority.`,
        draft: priorityDraft,
      },
    };
  }

  const dueDateDraft = parseIssueDueDateDraft(message, dashboardContext);
  if (dueDateDraft?.taskName && dueDateDraft.dueDate) {
    const dueLabel = /no date/i.test(dueDateDraft.dueDate) ? 'no due date' : `due ${dueDateDraft.dueDate}`;
    return {
      reply: `Ready for approval: set ${dueDateDraft.taskName} to ${dueLabel}.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'issue.update',
        title: `Update ${dueDateDraft.taskName} due date`,
        copy: `Set ${dueDateDraft.taskName} to ${dueLabel}.`,
        draft: dueDateDraft,
      },
    };
  }

  const bulkAssign = parseBulkAssignFromHistory(message, dashboardContext, input.clientContext?.recentHistory);
  if (bulkAssign) {
    const taskList = bulkAssign.tasks.map((task) => `"${task.name}" (#${task.taskNumber})`).join(', ');
    return {
      reply: `Ready for approval: assign ${bulkAssign.tasks.length} tasks to ${bulkAssign.assigneeName} — ${taskList}.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'issue.update',
        title: `Assign ${bulkAssign.tasks.length} tasks`,
        copy: `Assign ${taskList} to ${bulkAssign.assigneeName}.`,
        draft: {
          assigneeName: bulkAssign.assigneeName,
          taskNumbers: bulkAssign.tasks.map((task) => task.taskNumber).join(','),
        },
      },
    };
  }

  const recentHistory = input.clientContext?.recentHistory;
  const deleteResolution = parseIssueDeleteDraft(message, dashboardContext, recentHistory);
  if (deleteResolution) return deleteResolutionResult(deleteResolution);

  // Slot-fill turn: EKO just asked which task to delete, and this message is
  // the answer ("22", "the task we just created", the bare name). Re-run the
  // resolver with the delete verb restored so number/name/referent rules apply.
  const lastEkoRow = [...(recentHistory ?? [])].reverse().find((row) => row.role === 'eko');
  if (lastEkoRow && /\btask to delete\b/i.test(lastEkoRow.text)) {
    const followUp = parseIssueDeleteDraft(`delete ${message}`, dashboardContext, recentHistory);
    if (followUp?.outcome === 'match' || followUp?.outcome === 'ambiguous') {
      return deleteResolutionResult(followUp);
    }
  }

  return null;
}

function deleteResolutionResult(resolution: IssueDeleteResolution): AgentChatResult {
  if (resolution.outcome === 'match') {
    const numberLabel = resolution.taskNumber != null ? ` (#${resolution.taskNumber})` : '';
    return {
      reply: `Ready for approval: delete "${resolution.taskName}"${numberLabel} from Issues.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'approval_required',
      approval: {
        kind: 'issue.delete',
        title: `Delete ${resolution.taskName}`,
        copy: `Delete "${resolution.taskName}" (${resolution.status ?? 'status unknown'}) from Issues. This cannot be undone.`,
        draft: {
          taskName: resolution.taskName,
          ...(resolution.taskNumber != null ? { taskNumber: String(resolution.taskNumber) } : {}),
        },
      },
    };
  }

  if (resolution.outcome === 'ambiguous') {
    return {
      reply: `EKO found ${resolution.candidates.length} matching tasks: ${resolution.candidates.join('; ')}. Give the task number or exact name so EKO can prepare the delete for approval.`,
      provider: 'openai',
      model: 'eko-local-planner',
      intent: 'clarification',
    };
  }

  return {
    reply: 'EKO could not match that to a single task in the current Issues context. Give the task number shown on the board (like "task 22") or the exact task name so EKO can prepare the delete for approval.',
    provider: 'openai',
    model: 'eko-local-planner',
    intent: 'clarification',
  };
}

async function executeApprovedIssueWrite(
  action: string,
  user: AuthenticatedUser,
  dashboardContext: string,
  board: TasksBoardData | null,
): Promise<AgentChatResult | null> {
  const createDraft = parseIssueCreateDraft(action);
  if (createDraft?.title) {
    return executeIssueCreateDraft(createDraft, user);
  }

  const statusDraft = parseIssueStatusDraft(action, dashboardContext);
  if (statusDraft?.taskName && statusDraft.status) {
    return executeIssueStatusDraft(statusDraft, user, board);
  }

  const assigneeDraft = parseIssueAssigneeDraft(action, dashboardContext);
  if (assigneeDraft?.taskName && assigneeDraft.assigneeName) {
    return executeIssueAssigneeDraft(assigneeDraft, user, board);
  }

  const priorityDraft = parseIssuePriorityDraft(action, dashboardContext);
  if (priorityDraft?.taskName && priorityDraft.priority) {
    return executeIssuePriorityDraft(priorityDraft, user, board);
  }

  const dueDateDraft = parseIssueDueDateDraft(action, dashboardContext);
  if (dueDateDraft?.taskName && dueDateDraft.dueDate) {
    return executeIssueDueDateDraft(dueDateDraft, user, board);
  }

  return null;
}

async function executeIssueCreateDraft(
  draft: AgentApprovalDraft | IssueWriteDraft | undefined,
  user: AuthenticatedUser,
): Promise<AgentChatResult | null> {
  if (!draft?.title) return null;
  const status = parseTaskStatus(draft.status ?? '');
  const priority = parsePriority(draft.priority ?? '');
  const dueDate = draft.dueDate;

  if (!status || !priority || !dueDate) {
    return {
      reply: `Add ${formatList([
        status ? null : 'status',
        priority ? null : 'priority',
        dueDate ? null : 'due date',
      ].filter(Boolean))} before EKO can create "${draft.title}". No dashboard changes were made.`,
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
      approval: {
        kind: 'issue.create',
        title: `Create ${draft.title}`,
        copy: 'Add issue details below. This write stays gated until you review and approve it.',
        draft,
      },
    };
  }

  const deadline = normalizeDueDate(dueDate);
  await assertAdminUser(user.id);
  const service = getServiceClient();
  const { data, error } = await service
    .from('tasks')
    .insert({
      name: draft.title,
      department: 'Coding',
      status,
      priority,
      deadline,
      description: null,
    } as never)
    .select('id, task_number, name, status, priority, deadline')
    .single();
  if (error) throw new AgentProviderError('EKO could not create the issue.', 500);

  // `as unknown` hop: the generated row types predate task_number, so the
  // typed select-string parser can't prove the column — runtime has it.
  const created = data as unknown as { id: string; task_number?: number | null } | null;
  if (created) await markLatestTaskActivityAsEko({ taskId: created.id, kind: 'created', userId: user.id });
  return {
    reply: `Created issue "${draft.title}" in ${status}.`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
    target: created
      ? {
          kind: 'task',
          taskId: created.id,
          taskNumber: created.task_number,
          name: draft.title,
          action: 'create',
        }
      : undefined,
  };
}

async function executeDocumentCreateDraft(
  draft: AgentApprovalDraft | DocumentWriteDraft | undefined,
  user: AuthenticatedUser,
): Promise<AgentChatResult | null> {
  if (!draft?.title) {
    return {
      reply: 'Add a document title before EKO can create it. No dashboard changes were made.',
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
      approval: {
        kind: 'doc.create',
        title: 'Create document',
        copy: 'Add a title so EKO can prepare the document for approval.',
        draft,
      },
    };
  }

  await assertAdminUser(user.id);
  const docType = draft.docType === 'deck' ? 'deck' : 'doc';
  const service = getServiceClient();
  const insertPayload = {
    title: draft.title,
    content: '',
    sort_order: 0,
    restricted_department: null,
    granted_user_ids: null,
    ...(docType === 'deck' ? { type: 'deck', slides: [] } : {}),
  };
  const { data, error } = await service
    .from('docs')
    .insert(insertPayload as never)
    .select('id, title, type')
    .single();
  if (error) throw new AgentProviderError(`EKO could not create the ${docType === 'deck' ? 'deck' : 'document'}.`, 500);

  const doc = data as unknown as { id: string; title: string; type?: string } | null;
  if (doc?.id) {
    await service.from('activity_log').insert({
      user_id: user.id,
      action: 'Created',
      target: `doc: ${draft.title}`,
      doc_id: doc.id,
      source: 'eko',
    } as never);
  }

  return {
    reply: `Created ${docType === 'deck' ? 'deck' : 'document'} "${draft.title}".`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
  };
}

async function executeDocumentUpdateDraft(
  draft: AgentApprovalDraft | DocumentWriteDraft | undefined,
  user: AuthenticatedUser,
): Promise<AgentChatResult | null> {
  const docTitle = draft?.docTitle ?? draft?.title;
  const content = draft?.content;
  if (!docTitle || !content) {
    return {
      reply: `Add ${formatList([docTitle ? null : 'document title', content ? null : 'content'].filter(Boolean))} before EKO can update the document. No dashboard changes were made.`,
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
      approval: {
        kind: 'doc.update',
        title: docTitle ? `Update ${docTitle}` : 'Update document',
        copy: 'Add the document title and content so EKO can prepare the update for approval.',
        draft,
      },
    };
  }

  await assertAdminUser(user.id);
  const service = getServiceClient();
  const { data: existing, error: findError } = await service
    .from('docs')
    .select('id, title, type')
    .eq('title', docTitle)
    .single();
  if (findError || !existing) throw new AgentProviderError(`EKO could not find document "${docTitle}".`, 404);

  const doc = existing as unknown as { id: string; title: string; type?: string } | null;
  if (!doc?.id) throw new AgentProviderError(`EKO could not find document "${docTitle}".`, 404);
  if (doc.type === 'deck') {
    return {
      reply: `EKO can create decks, but slide editing for "${doc.title}" is not supported yet. No dashboard changes were made.`,
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
    };
  }

  const updatePayload = {
    content: contentToDocHtml(content),
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await service
    .from('docs')
    .update(updatePayload as never)
    .eq('id', doc.id)
    .select('id')
    .single();
  if (updateError) throw new AgentProviderError('EKO could not update the document.', 500);

  await service.from('activity_log').insert({
    user_id: user.id,
    action: 'Updated',
    target: `doc: ${doc.title}`,
    doc_id: doc.id,
    source: 'eko',
  } as never);

  return {
    reply: `Updated document "${doc.title}".`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
  };
}

async function executeNoteCreateDraft(
  draft: AgentApprovalDraft | NoteWriteDraft | undefined,
  user: AuthenticatedUser,
): Promise<AgentChatResult | null> {
  const noteBody = draft?.noteBody;
  if (!noteBody) {
    return {
      reply: 'Add note text before EKO can capture it. No dashboard changes were made.',
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
      approval: {
        kind: 'note.create',
        title: 'Add note',
        copy: 'Add the note text so EKO can capture it in the inbox.',
        draft,
      },
    };
  }

  await assertAdminUser(user.id);
  const service = getServiceClient();
  const { error } = await service
    .from('notes')
    .insert({
      body: noteBody,
      source: 'web',
      created_by: user.id,
    } as never)
    .select('id, body, status, source')
    .single();
  if (error) throw new AgentProviderError('EKO could not add the note.', 500);

  return {
    reply: 'Added note to inbox.',
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
  };
}

async function executeIssueStatusDraft(
  draft: Pick<IssueWriteDraft, 'taskName' | 'status'>,
  user: AuthenticatedUser,
  board: TasksBoardData | null,
): Promise<AgentChatResult | null> {
  if (!draft.taskName || !draft.status) return null;
  await assertAdminUser(user.id);
  const task = findTaskInBoard(draft.taskName, board);
  if (!task) throw new AgentProviderError(`EKO could not find "${draft.taskName}" in the current issues context.`, 404);
  const service = getServiceClient();
  const { error } = await service.from('tasks').update({ status: draft.status } as never).eq('id', task.id);
  if (error) throw new AgentProviderError('EKO could not update the issue status.', 500);
  await markLatestTaskActivityAsEko({ taskId: task.id, kind: 'status_changed', userId: user.id });

  return {
    reply: `Moved "${task.name}" to ${draft.status}.`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
    target: {
      kind: 'task',
      taskId: task.id,
      taskNumber: task.task_number,
      name: task.name,
      action: 'status',
    },
  };
}

async function executeIssueAssigneeDraft(
  draft: Pick<IssueWriteDraft, 'taskName' | 'assigneeName'>,
  user: AuthenticatedUser,
  board: TasksBoardData | null,
): Promise<AgentChatResult | null> {
  if (!draft.taskName || !draft.assigneeName) return null;
  await assertAdminUser(user.id);
  const task = findTaskInBoard(draft.taskName, board);
  const member = findStaffInBoard(draft.assigneeName, board);
  if (!task) throw new AgentProviderError(`EKO could not find "${draft.taskName}" in the current issues context.`, 404);
  if (!member) throw new AgentProviderError(`EKO could not find "${draft.assigneeName}" in the current roster.`, 404);
  const service = getServiceClient();
  const { error } = await service.from('tasks').update({ assignee_id: member.id } as never).eq('id', task.id);
  if (error) throw new AgentProviderError('EKO could not assign the issue.', 500);
  await markLatestTaskActivityAsEko({ taskId: task.id, kind: 'assignee_changed', userId: user.id });
  await hideLatestHumanAssignedEcho({ taskId: task.id, taskName: task.name, userId: user.id });

  return {
    reply: `Assigned "${task.name}" to ${member.display_name ?? 'the selected teammate'}.`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
    target: {
      kind: 'task',
      taskId: task.id,
      taskNumber: task.task_number,
      name: task.name,
      action: 'assignee',
    },
  };
}

async function executeIssuePriorityDraft(
  draft: Pick<IssueWriteDraft, 'taskName' | 'priority'>,
  user: AuthenticatedUser,
  board: TasksBoardData | null,
): Promise<AgentChatResult | null> {
  if (!draft.taskName || !draft.priority) return null;
  await assertAdminUser(user.id);
  const task = findTaskInBoard(draft.taskName, board);
  if (!task) throw new AgentProviderError(`EKO could not find "${draft.taskName}" in the current issues context.`, 404);
  const service = getServiceClient();
  const { error } = await service.from('tasks').update({ priority: draft.priority } as never).eq('id', task.id);
  if (error) throw new AgentProviderError('EKO could not update the issue priority.', 500);
  await markLatestTaskActivityAsEko({ taskId: task.id, action: 'Changed priority', userId: user.id });

  return {
    reply: `Set "${task.name}" to ${draft.priority} priority.`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
    target: {
      kind: 'task',
      taskId: task.id,
      taskNumber: task.task_number,
      name: task.name,
      action: 'priority',
    },
  };
}

async function executeIssueDueDateDraft(
  draft: Pick<IssueWriteDraft, 'taskName' | 'dueDate'>,
  user: AuthenticatedUser,
  board: TasksBoardData | null,
): Promise<AgentChatResult | null> {
  if (!draft.taskName || !draft.dueDate) return null;
  await assertAdminUser(user.id);
  const task = findTaskInBoard(draft.taskName, board);
  if (!task) throw new AgentProviderError(`EKO could not find "${draft.taskName}" in the current issues context.`, 404);
  const deadline = normalizeDueDate(draft.dueDate);
  const service = getServiceClient();
  const { error } = await service.from('tasks').update({ deadline } as never).eq('id', task.id);
  if (error) throw new AgentProviderError('EKO could not update the issue due date.', 500);
  await service.from('activity_log').insert({
    user_id: user.id,
    action: 'Due date changed',
    target: deadline ? `task: ${task.name} → ${deadline}` : `task: ${task.name} → no date`,
    task_id: task.id,
    before_value: task.deadline ?? null,
    after_value: deadline,
    source: 'eko',
  } as never);

  return {
    reply: deadline ? `Set "${task.name}" due date to ${deadline}.` : `Cleared the due date for "${task.name}".`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
    target: {
      kind: 'task',
      taskId: task.id,
      taskNumber: task.task_number,
      name: task.name,
      action: 'dueDate',
    },
  };
}

/**
 * Bulk assign: every task_number re-resolves against the fresh board; refs
 * that vanished since approval are skipped and reported, never guessed. One
 * DB update per task so each write lands its own activity_log row via the
 * single-task executor.
 */
async function executeBulkAssigneeDraft(
  taskNumbers: string,
  assigneeName: string,
  user: AuthenticatedUser,
  board: TasksBoardData | null,
): Promise<AgentChatResult | null> {
  const numbers = taskNumbers
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num));
  if (!numbers.length || !board) return null;

  const assigned: string[] = [];
  const missing: number[] = [];
  let lastResult: AgentChatResult | null = null;
  for (const taskNumber of numbers) {
    const task = board.tasks.find((entry) => entry.task_number === taskNumber);
    if (!task) {
      missing.push(taskNumber);
      continue;
    }
    lastResult = await executeIssueAssigneeDraft({ taskName: task.name, assigneeName }, user, board);
    assigned.push(`"${task.name}" (#${taskNumber})`);
  }

  if (!assigned.length) {
    return {
      reply: `Approval recorded, but none of the referenced tasks (${numbers.map((num) => `#${num}`).join(', ')}) exist on the board anymore. No dashboard changes were made.`,
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
    };
  }

  const missingNote = missing.length
    ? ` Skipped ${missing.map((num) => `#${num}`).join(', ')} — no longer on the board.`
    : '';
  return {
    reply: `Assigned ${assigned.length} task${assigned.length === 1 ? '' : 's'} to ${assigneeName}: ${assigned.join(', ')}.${missingNote}`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
    // Receipt deep-links target exactly one task; a bulk write only carries
    // one when the batch collapsed to a single assignment.
    target: assigned.length === 1 ? lastResult?.target : undefined,
  };
}

async function executeIssueDeleteDraft(
  draft: AgentApprovalDraft | Pick<IssueWriteDraft, 'taskName'> | undefined,
  user: AuthenticatedUser,
  board: TasksBoardData | null,
): Promise<AgentChatResult | null> {
  const taskName = draft?.taskName;
  if (!taskName) return null;

  // Re-resolve against the fresh board load: the board may have changed since
  // the approval card was prepared. Deletes never guess — anything other than
  // exactly one match makes no change. The unique task_number wins over the
  // name when the draft carries it (two tasks can share a name).
  const draftNumber = 'taskNumber' in (draft ?? {}) ? Number((draft as AgentApprovalDraft).taskNumber) : NaN;
  const byNumber = board && Number.isFinite(draftNumber)
    ? board.tasks.filter((task) => task.task_number === draftNumber)
    : [];
  const matches = byNumber.length
    ? byNumber
    : board
      ? board.tasks.filter((task) => task.name.toLowerCase() === taskName.toLowerCase())
      : [];

  if (matches.length !== 1) {
    return {
      reply: matches.length
        ? `Approval recorded, but "${taskName}" now matches ${matches.length} tasks. No dashboard changes were made; name the exact task to delete.`
        : `Approval recorded, but EKO could not find "${taskName}" in the current issues context. No dashboard changes were made.`,
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
    };
  }

  const task = matches[0];
  await assertAdminUser(user.id);
  const service = getServiceClient();
  // FK relations (payment_items set-null, notes set-null, task_milestone
  // cascade) make a plain row delete safe; the AFTER DELETE trigger writes the
  // activity_log row. Afterward, relabel that trigger row as EKO-authored.
  const { data, error } = await service.from('tasks').delete().eq('id', task.id).select('id');
  if (error) throw new AgentProviderError('EKO could not delete the issue.', 500);
  if (!data?.length) {
    return {
      reply: `Approval recorded, but "${task.name}" was already removed. No dashboard changes were made.`,
      provider: 'openai',
      model: 'eko-local-approval',
      intent: 'details_needed',
    };
  }
  await markLatestDeletedTaskActivityAsEko({ taskName: task.name, userId: user.id });

  return {
    reply: `Deleted "${task.name}" from Issues.`,
    provider: 'openai',
    model: 'eko-local-write',
    intent: 'executed',
  };
}

function withTypedIntent(input: AgentChatInput, result: AgentChatResult): AgentChatResult {
  if (result.intent) return result;
  const reply = result.reply;
  if (isClarifyingReply(reply)) return { ...result, intent: 'clarification' };
  if (isApprovalReply(reply)) {
    // Deletes only execute through the typed issue.delete path prepared by
    // parseIssueDeleteDraft. A delete proposal that reaches this fallback has
    // no typed draft, and marking it details_needed would route it into the
    // create-shaped details flow — turning "remove the task" into a create.
    if (/\b(delete|remove)\b/i.test(`${input.message} ${reply}`) && !/\b(create|add|make)\b/i.test(input.message)) {
      return {
        ...result,
        reply: 'Name the exact task to delete (as it appears in Issues) so EKO can prepare a gated delete for approval.',
        intent: 'clarification',
      };
    }
    const draft = parseIssueCreateDraft(`${input.message} ${reply}`) ?? undefined;
    const intent = needsWriteDetails(reply) || (draft && (!draft.title || !draft.status || !draft.priority || !draft.dueDate))
      ? 'details_needed'
      : 'approval_required';
    return {
      ...result,
      intent,
      approval: {
        kind: draft ? 'issue.create' : 'generic',
        title: draft?.title ? `Create ${draft.title}` : getApprovalTitle(input.message, reply),
        copy: reply,
        draft,
      },
    };
  }
  return { ...result, intent: 'answer' };
}

function parseDocumentCreateDraft(value: string): DocumentWriteDraft | null {
  const type = /\b(deck|presentation|slides?)\b/i.test(value)
    ? 'deck'
    : /\b(doc|docs|document|note|notes|brief|memo)\b/i.test(value)
      ? 'doc'
      : null;
  if (!type || !/\b(create|add|make|new|draft)\b/i.test(value)) return null;

  const quoted = value.match(/["“]([^"”]{2,100})["”]/)?.[1];
  const afterNamed = value.match(/\b(?:called|named|titled|for)\s+([^,.]+?)(?:[,.]|$)/i)?.[1];
  const beforeType = value.match(/\b(?:create|add|make|draft)\s+(?:a|an|the|new)?\s*([^,.]+?)\s+(?:doc|docs|document|note|notes|brief|memo|deck|presentation|slides?)(?:[,.]|$)/i)?.[1];
  const afterCreate = value.match(/\b(?:create|add|make|draft)\s+(?:a|an|the|new)?\s*(?:doc|docs|document|note|notes|brief|memo|deck|presentation|slides?)\s*(?:called|named|titled|for)?\s*([^,.]+?)(?:[,.]|$)/i)?.[1];
  const title = cleanDocumentTitle(quoted || afterNamed || beforeType || afterCreate || '');

  return { title: title || undefined, docType: type };
}

function parseNoteCreateDraft(value: string): NoteWriteDraft | null {
  if (!/\b(?:add|capture|save|remember|log)\b/i.test(value)) return null;
  if (!/\b(?:note|notes inbox|quick note|sticky note|memo)\b/i.test(value)) return null;
  if (/\b(?:doc|document|deck|presentation|slides?)\b/i.test(value)) return null;

  const afterColon = value.match(/:\s*([\s\S]+)$/)?.[1];
  const afterThat = value.match(/\b(?:that|to|saying)\s+([\s\S]+)$/i)?.[1];
  const quoted = value.match(/["“]([^"”]{2,500})["”]/)?.[1];
  const noteBody = cleanNoteBody(afterColon || quoted || afterThat || '');

  return { noteBody: noteBody || undefined };
}

function parseDocumentUpdateDraft(value: string): DocumentWriteDraft | null {
  if (!/\b(update|edit|replace|rewrite|add to|append to)\b/i.test(value)) return null;
  if (!/\b(doc|docs|document|note|notes|brief|memo)\b/i.test(value)) return null;
  if (/\b(create|new|make)\b/i.test(value)) return null;

  const quotedTitle = value.match(/\b(?:update|edit|replace|rewrite|add to|append to)\s+(?:the\s+)?["“]([^"”]{2,100})["”]/i)?.[1];
  const beforeExplicitDocType = value.match(/\b(?:update|edit|replace|rewrite|add to|append to)\s+(?:the\s+)?([^:,.]+?)\s+(?:doc|docs|document)\b/i)?.[1];
  const beforeType = beforeExplicitDocType
    || value.match(/\b(?:update|edit|replace|rewrite|add to|append to)\s+(?:the\s+)?([^:,.]+?)\s+(?:brief|memo)\b/i)?.[1];
  const afterType = value.match(/\b(?:update|edit|replace|rewrite)\s+(?:the\s+)?(?:doc|docs|document|note|notes|brief|memo)\s+(?:called|named|titled)?\s*([^:,.]+?)(?:\s+(?:to say|with|saying)\b|:|[,.]|$)/i)?.[1];
  const docTitle = cleanDocumentTitle(quotedTitle || beforeType || afterType || '');
  const content = cleanDocumentContent(
    value.match(/\b(?:to say|with|saying)\s+([\s\S]+)$/i)?.[1]
      || value.match(/:\s*([\s\S]+)$/)?.[1]
      || '',
  );

  if (!docTitle && !content) return null;
  return {
    docTitle: docTitle || undefined,
    content: content || undefined,
    docType: 'doc',
  };
}

function parseIssueCreateDraft(value: string): IssueWriteDraft | null {
  if (!/\b(create|add|make|new)\b/i.test(value) || !/\b(task|issue|todo|work item)\b/i.test(value)) return null;
  const quoted = value.match(/["“]([^"”]{2,80})["”]/)?.[1];
  const afterCreate = value.match(/\b(?:create|add|make)\s+(?:a|an|the|new)?\s*(?:task|issue|todo|work item)?\s*(?:called|named|titled|for)?\s*([^,.]+?)(?:\s+(?:as|with|under|in|due|priority|status)\b|[,.]|$)/i)?.[1];
  const title = cleanIssueTitle(quoted || afterCreate || '');
  const status = parseTaskStatus(value);
  const priority = parsePriority(value);
  const dueDate = parseDueDate(value);
  return { title: title || undefined, status, priority, dueDate };
}

function parseIssueStatusDraft(value: string, dashboardContext: string): IssueWriteDraft | null {
  const status = parseTaskStatus(value);
  if (!status || !/\b(move|set|change|mark)\b/i.test(value)) return null;
  const taskName = findMentionedTaskName(value, dashboardContext);
  return taskName ? { taskName, status } : null;
}

function parseIssueAssigneeDraft(value: string, dashboardContext: string): IssueWriteDraft | null {
  if (!/\b(assign|reassign|give)\b/i.test(value)) return null;
  const taskName = findMentionedTaskName(value, dashboardContext);
  const staff = parseStaffFromText(value, dashboardContext);
  return taskName && staff ? { taskName, assigneeName: staff.name } : null;
}

function parseIssuePriorityDraft(value: string, dashboardContext: string): IssueWriteDraft | null {
  const priority = parsePriority(value);
  if (!priority) return null;
  if (!/\b(set|change|mark|make|raise|lower|bump|prioriti[sz]e)\b/i.test(value)) return null;
  if (!/\b(priority|urgent|high|medium|low)\b/i.test(value)) return null;
  const taskName = findMentionedTaskName(value, dashboardContext);
  return taskName ? { taskName, priority } : null;
}

function parseIssueDueDateDraft(value: string, dashboardContext: string): IssueWriteDraft | null {
  const dueDate = parseDueDate(value);
  if (!dueDate) return null;
  if (!/\b(set|change|mark|make|add|clear|remove)\b/i.test(value)) return null;
  if (!/\b(due|deadline|date)\b/i.test(value)) return null;
  const taskName = findMentionedTaskName(value, dashboardContext);
  return taskName ? { taskName, dueDate } : null;
}

/**
 * Bulk assign via plural anaphora: "assign them all to karti" right after EKO
 * listed tasks. The referent list is the #n references in EKO's most recent
 * reply that contains any — the exact set the user is looking at. Each number
 * must still resolve in the current index; unresolvable refs drop out.
 */
function parseBulkAssignFromHistory(
  value: string,
  dashboardContext: string,
  recentHistory?: RecentHistoryItem[],
): { assigneeName: string; tasks: Array<{ name: string; taskNumber: number }> } | null {
  if (!/\b(assign|reassign|give)\b/i.test(value)) return null;
  if (!/\b(?:them(?:\s+all)?|these|those|all of them|everything listed|all \d+)\b/i.test(value)) return null;
  const staff = parseStaffFromText(value, dashboardContext);
  if (!staff || !recentHistory?.length) return null;

  const index = parseDashboardTaskIndex(dashboardContext);
  for (let i = recentHistory.length - 1; i >= 0; i -= 1) {
    const row = recentHistory[i];
    if (row.role !== 'eko') continue;
    const refs = [...row.text.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
    if (!refs.length) continue;
    const tasks = [...new Set(refs)]
      .map((taskNumber) => {
        const task = index.find((entry) => entry.taskNumber === taskNumber);
        return task ? { name: task.name, taskNumber } : null;
      })
      .filter((task): task is NonNullable<typeof task> => Boolean(task));
    return tasks.length ? { assigneeName: staff.name, tasks } : null;
  }
  return null;
}

type IssueDeleteResolution =
  | { outcome: 'match'; taskName: string; status?: string; taskNumber?: number }
  | { outcome: 'ambiguous'; candidates: string[] }
  | { outcome: 'none' };

function parseIssueDeleteDraft(
  value: string,
  dashboardContext: string,
  recentHistory?: RecentHistoryItem[],
): IssueDeleteResolution | null {
  if (!/\b(?:delete|remove)\b/i.test(value)) return null;
  // Field-level edits ("remove the assignee/priority/…") are not issue deletes.
  if (/\b(?:delete|remove)\s+(?:the\s+|its\s+)?(?:assignee|status|priority|due date|deadline|label|milestone|comment|description)\b/i.test(value)) {
    return null;
  }

  const tasks = parseDashboardTaskIndex(dashboardContext);
  const normalized = value.toLowerCase();
  const quotedName = value.match(/["“]([^"”]{2,120})["”]/)?.[1]?.trim();
  const statusQualifier = parseTaskStatus(value);
  const mentionsIssueNoun = /\b(?:task|issue|todo|work item)\b/i.test(value);

  // Task numbers are unique, so an explicit "#22" / "task 22" is the most
  // precise reference there is — it resolves before any name matching.
  const numberRef = parseTaskNumberRef(value);
  if (numberRef != null) {
    const byNumber = tasks.filter((task) => task.taskNumber === numberRef);
    return byNumber.length === 1
      ? { outcome: 'match', taskName: byNumber[0].name, status: byNumber[0].status, taskNumber: numberRef }
      : { outcome: 'none' };
  }

  // Referential delete ("delete it", "remove that task") right after EKO
  // executed a create: resolve against the receipt line in recent history.
  if (/\b(?:it|that(?: one| task| issue)?|this(?: one| task| issue)?|the (?:task|issue|one) (?:we|you|i) just (?:created|made|added))\b/i.test(value)) {
    const referent = findRecentCreatedTask(recentHistory, tasks);
    if (referent) {
      return { outcome: 'match', taskName: referent.name, status: referent.status, taskNumber: referent.taskNumber };
    }
  }

  // Deletes never guess: a quoted name must match a task name exactly, an
  // unquoted mention must contain a known task name, and a status qualifier
  // ("in backlog") narrows candidates instead of picking one.
  let candidates: typeof tasks;
  if (quotedName) {
    candidates = tasks.filter((task) => task.name.toLowerCase() === quotedName.toLowerCase());
    if (statusQualifier && candidates.length > 1) {
      const narrowed = candidates.filter((task) => task.status?.toLowerCase() === statusQualifier.toLowerCase());
      if (narrowed.length) candidates = narrowed;
    }
  } else {
    // A task literally named "Task" (or "Issue" etc.) would match the noun in
    // every delete sentence — generic names resolve only via quotes or a
    // status qualifier, never by containment.
    candidates = tasks.filter(
      (task) =>
        !/^(?:task|issue|todo|item|ticket|work item)$/i.test(task.name.trim())
        && normalized.includes(task.name.toLowerCase()),
    );
    if (!candidates.length && !mentionsIssueNoun) return null;
    if (statusQualifier) {
      if (!candidates.length) {
        candidates = tasks.filter((task) => task.status?.toLowerCase() === statusQualifier.toLowerCase());
      } else if (candidates.length > 1) {
        const narrowed = candidates.filter((task) => task.status?.toLowerCase() === statusQualifier.toLowerCase());
        if (narrowed.length) candidates = narrowed;
      }
    }
  }

  if (candidates.length === 1) {
    return { outcome: 'match', taskName: candidates[0].name, status: candidates[0].status, taskNumber: candidates[0].taskNumber };
  }
  if (candidates.length > 1) {
    return { outcome: 'ambiguous', candidates: candidates.map((task) => task.name).slice(0, 6) };
  }
  return { outcome: 'none' };
}

/**
 * The task EKO itself just created, recovered from the executed-write receipt
 * in recent chat history ('Created issue "X" in Todo.'). Only a task that
 * still exists in the current index counts — a stale referent never resolves.
 */
function findRecentCreatedTask(
  recentHistory: RecentHistoryItem[] | undefined,
  tasks: ReturnType<typeof parseDashboardTaskIndex>,
) {
  if (!recentHistory?.length) return null;
  for (let i = recentHistory.length - 1; i >= 0; i -= 1) {
    const row = recentHistory[i];
    if (row.role !== 'eko') continue;
    const created = row.text.match(/Created issue ["“]([^"”]{1,140})["”]/i)?.[1]?.trim();
    if (!created) continue;
    return tasks.find((task) => task.name.toLowerCase() === created.toLowerCase()) ?? null;
  }
  return null;
}

function parseTaskStatus(value: string): TaskStatus | undefined {
  if (/\bin progress\b/i.test(value)) return 'In Progress';
  if (/\bin review\b/i.test(value)) return 'In Review';
  if (/\bbacklog\b/i.test(value)) return 'Backlog';
  if (/\b(?:todo|to do)\b/i.test(value)) return 'Todo';
  if (/\bdone\b/i.test(value)) return 'Done';
  if (/\bcanceled\b/i.test(value)) return 'Canceled';
  if (/\bduplicate\b/i.test(value)) return 'Duplicate';
  return undefined;
}

function parsePriority(value: string): Priority | undefined {
  if (/\burgent\b/i.test(value)) return 'Urgent';
  if (/\bhigh\b/i.test(value)) return 'High';
  if (/\bmedium\b/i.test(value)) return 'Medium';
  if (/\blow\b/i.test(value)) return 'Low';
  return undefined;
}

function parseDueDate(value: string): string | undefined {
  const iso = value.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return iso;
  if (/\btoday\b/i.test(value)) return 'Today';
  if (/\btomorrow\b/i.test(value)) return 'Tomorrow';
  if (/\bnext week\b/i.test(value)) return 'Next week';
  if (/\bno date\b/i.test(value) || /\b(?:clear|remove)\s+(?:the\s+)?(?:due date|deadline|date)\b/i.test(value)) return 'No date';
  return undefined;
}

function normalizeDueDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (/tomorrow/i.test(value)) date.setDate(date.getDate() + 1);
  if (/next week/i.test(value)) date.setDate(date.getDate() + 7);
  if (/no date/i.test(value)) return null;
  return date.toISOString().slice(0, 10);
}

function cleanIssueTitle(value: string) {
  return value
    .replace(/\b(?:in progress|in review|backlog|todo|to do|urgent|high|medium|low|today|tomorrow|next week|no date)\b/gi, '')
    .replace(/\b(?:status|priority|due|date)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[.?!:;,-]+$/g, '')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanDocumentTitle(value: string) {
  const clean = value
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/\b(?:doc|docs|document|deck|presentation|slides?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[.?!:;,-]+$/g, '')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return /^(?:A|An|The)$/i.test(clean) ? '' : clean;
}

function cleanDocumentContent(value: string) {
  return value
    .replace(/^["“]|["”]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanNoteBody(value: string) {
  return value
    .replace(/^["“]|["”]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentToDocHtml(value: string) {
  const clean = value.trim();
  if (/^\s*</.test(clean)) return clean;
  return clean
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatList(items: unknown[]) {
  const strings = items.map(String).filter(Boolean);
  if (strings.length <= 1) return strings[0] ?? '';
  return `${strings.slice(0, -1).join(', ')} and ${strings[strings.length - 1]}`;
}

function isApprovalReply(reply: string) {
  return /^\s*ready for approval\s*:/i.test(reply);
}

function isBareConfirmationMessage(message: string) {
  return /^\s*(?:yes|yeah|yep|ok|okay|sure|confirmed?|confirm|go ahead|proceed|do it|approve(?: it)?|approved(?: it)?|i approve)\s*[.!?]*\s*$/i.test(message);
}

function isClarifyingReply(reply: string) {
  return /\b(please specify|which item|which task|what would you like|tell me what|i need (?:the|a)|since none|none (?:is|are) currently pending|no .* currently pending)\b/i.test(reply);
}

function needsWriteDetails(reply: string) {
  return /\b(task name|issue title|\btitle\b|priority|due date|area|assignee|status|please share|please confirm|specify which|which item)\b/i.test(reply);
}

function getApprovalTitle(message: string, reply: string) {
  const action = normalizeAgentReply(reply).replace(/^ready for approval:\s*/i, '').split(/[.;]/)[0]?.trim();
  if (action) return action.slice(0, 72);
  return normalizeAgentReply(message).slice(0, 72) || 'Approval request';
}

async function assertAdminUser(userId: string) {
  const { data, error } = await getServiceClient().from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (error) throw new AgentProviderError('EKO could not verify your permissions.', 500);
  if (!data?.is_admin) throw new AgentProviderError('Only admins can approve EKO writes.', 403);
}

async function markLatestTaskActivityAsEko({
  taskId,
  userId,
  kind,
  action,
}: {
  taskId: string;
  userId: string;
  kind?: string;
  action?: string;
}) {
  const service = getServiceClient();
  let query = service
    .from('activity_log')
    .select('id')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (kind) query = query.eq('kind', kind);
  if (action) query = query.eq('action', action);

  const { data } = await query;
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return;

  await service.from('activity_log').update({ source: 'eko', user_id: userId } as never).eq('id', id);
}

async function hideLatestHumanAssignedEcho({
  taskId,
  taskName,
  userId,
}: {
  taskId: string;
  taskName: string;
  userId: string;
}) {
  const service = getServiceClient();
  const { data } = await service
    .from('activity_log')
    .select('id')
    .eq('task_id', taskId)
    .eq('action', 'Assigned')
    .like('target', `task: ${taskName}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return;

  await service.from('activity_log').delete().eq('id', id).eq('user_id', userId);
}

async function markLatestDeletedTaskActivityAsEko({
  taskName,
  userId,
}: {
  taskName: string;
  userId: string;
}) {
  const service = getServiceClient();
  const { data } = await service
    .from('activity_log')
    .select('id')
    .eq('action', 'Deleted')
    .eq('target', `task: ${taskName}`)
    .is('task_id', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;

  if (id) {
    await service
      .from('activity_log')
      .update({ action: 'deleted this task', target: '', source: 'eko', user_id: userId } as never)
      .eq('id', id);
    return;
  }

  await service.from('activity_log').insert({
    user_id: userId,
    action: 'deleted this task',
    target: '',
    task_id: null,
    source: 'eko',
  } as never);
}

function findMentionedTaskName(value: string, dashboardContext: string) {
  return findTaskInContext(value, dashboardContext)?.name;
}

function findTaskInBoard(value: string, board: TasksBoardData | null) {
  if (!board) return null;
  const normalized = value.toLowerCase();
  return [...board.tasks]
    .sort((a, b) => b.name.length - a.name.length)
    .find((task) => normalized.includes(task.name.toLowerCase())) ?? null;
}

function findStaffInBoard(value: string, board: TasksBoardData | null) {
  if (!board) return null;
  const normalized = value.toLowerCase();
  return [...board.team]
    .sort((a, b) => (b.display_name ?? '').length - (a.display_name ?? '').length)
    .find((member) => member.display_name && normalized.includes(member.display_name.toLowerCase())) ?? null;
}

function findTaskInContext(value: string, dashboardContext: string) {
  const index = parseDashboardTaskIndex(dashboardContext);
  // "move task 22 to done" / "assign #22 to karti" — the unique number wins.
  const numberRef = parseTaskNumberRef(value);
  if (numberRef != null) {
    const byNumber = index.find((task) => task.taskNumber === numberRef);
    if (byNumber) return byNumber;
  }
  const normalized = value.toLowerCase();
  return index
    .sort((a, b) => b.name.length - a.name.length)
    .find((task) => normalized.includes(task.name.toLowerCase()));
}

function parseDashboardTaskIndex(dashboardContext: string) {
  // "All issues" is the exhaustive index (every open task, "#22 Name (Status)"
  // shape); the queue lines are filtered views with richer meta. A task can
  // appear in several lines, so entries merge instead of first-line-wins.
  const taskLines = dashboardContext
    .split('\n')
    .filter((line) => /^(?:All issues|In progress|Risk queue|In review|Overdue|Unassigned high priority|Recent activity task details):/i.test(line));
  const tasks = new Map<string, { id?: string; name: string; status?: string; assigneeName?: string; taskNumber?: number }>();
  for (const line of taskLines) {
    // Everything after the FIRST colon — not split(/:/, 2), which keeps only
    // the first two segments and so truncates the value at a second colon
    // inside a task name (e.g. "Concept Art: Characters …"), dropping every
    // task listed after it.
    const value = line.slice(line.indexOf(':') + 1).trim();
    for (const part of value.split(';')) {
      const raw = part.trim().replace(/\.$/, '');
      const match = raw.match(/^(?:#(\d+)\s+)?(.+?)(?:\s+\((.*?)\))?$/);
      const name = match?.[2]?.trim();
      if (!name || /^no tasks|^none$|^…and \d+ more/i.test(name)) continue;
      const meta = match?.[3] ?? '';
      const metaNumber = meta.match(/#(\d+)/)?.[1];
      const taskNumber = match?.[1] ?? metaNumber;
      const entry = tasks.get(name.toLowerCase()) ?? { name };
      entry.status ??= meta
        .split(',')
        .map((item) => item.trim())
        .find((item) => item && !item.startsWith('#'));
      entry.assigneeName ??= meta.match(/\bassigned to ([^,)]+)/i)?.[1]?.trim();
      entry.taskNumber ??= taskNumber ? Number(taskNumber) : undefined;
      tasks.set(name.toLowerCase(), entry);
    }
  }
  return [...tasks.values()];
}

/**
 * Explicit task-number reference in a user message: "task 22", "issue #22",
 * "#22". A bare number with no noun or # marker never matches — dates and
 * quantities would false-positive.
 */
function parseTaskNumberRef(value: string): number | null {
  const match = value.match(/(?:\b(?:task|issue|todo|ticket)\s*#?|#)(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function parseStaffFromText(value: string, dashboardContext: string) {
  const normalized = value.toLowerCase();
  return parseStaffIndex(dashboardContext)
    .sort((a, b) => b.name.length - a.name.length)
    .find((member) => normalized.includes(member.name.toLowerCase()));
}

function findStaffInContext(value: string, dashboardContext: string) {
  const normalized = value.toLowerCase();
  return parseStaffIndex(dashboardContext)
    .sort((a, b) => b.name.length - a.name.length)
    .find((member) => normalized.includes(member.name.toLowerCase()));
}

function parseStaffIndex(dashboardContext: string) {
  const staffLine = dashboardContext.split('\n').find((line) => /^Staff:/i.test(line));
  if (!staffLine) return [];
  const value = staffLine.slice(staffLine.indexOf(':') + 1).trim();
  return value
    .split(';')
    .map((part) => {
      const name = part.trim().replace(/\s+\([^)]*\).*$/, '').replace(/\.$/, '');
      return name && !/^no roster/i.test(name) ? { id: '', name } : null;
    })
    .filter((member): member is { id: string; name: string } => Boolean(member));
}

type ContextTask = {
  name: string;
  status?: string;
  priority?: string;
  assigneeName?: string;
  deadline?: string;
  raw: string;
};

export function answerLocalContextFollowUp(input: AgentChatInput, dashboardContext: string): AgentChatResult | null {
  if (input.mode === 'approval') return null;

  const message = input.message.trim();
  const tasks = parseContextTasks(dashboardContext);
  if (!tasks.length) return null;

  const referencedTasks = findReferencedContextTasks(input, tasks);
  if (referencedTasks.length > 1 && asksForPluralReference(message) && asksForStatus(message)) {
    return {
      reply: referencedTasks.map(formatContextTaskProgress).join(' '),
      provider: 'openai',
      model: 'eko-local-context',
    };
  }

  const referencedTask = referencedTasks[0];
  if (!referencedTask) return null;

  if (asksForDueDate(message)) {
    return {
      reply: referencedTask.deadline
        ? `${referencedTask.name} is due ${referencedTask.deadline}.`
        : `${referencedTask.name} does not have a due date. Would you like EKO to prepare adding one for approval?`,
      provider: 'openai',
      model: 'eko-local-context',
    };
  }

  if (asksForAssignee(message)) {
    return {
      reply: referencedTask.assigneeName
        ? `${referencedTask.name} is assigned to ${referencedTask.assigneeName}.`
        : `${referencedTask.name} is currently unassigned. Would you like EKO to prepare assigning it for approval?`,
      provider: 'openai',
      model: 'eko-local-context',
    };
  }

  if (asksForStatus(message)) {
    return {
      reply: referencedTask.status
        ? `${referencedTask.name} is ${referencedTask.status}.`
        : `${referencedTask.name} does not have a visible status in the current dashboard context.`,
      provider: 'openai',
      model: 'eko-local-context',
    };
  }

  if (asksForPriority(message)) {
    return {
      reply: referencedTask.priority
        ? `${referencedTask.name} is ${referencedTask.priority} priority.`
        : `${referencedTask.name} does not have a priority set in the current dashboard context.`,
      provider: 'openai',
      model: 'eko-local-context',
    };
  }

  return null;
}

function answerLocalContextualConfirmation(input: AgentChatInput, dashboardContext: string): AgentChatResult | null {
  if (!isBareConfirmationMessage(input.message)) return null;

  const lastEkoReply = [...(input.clientContext?.recentHistory ?? [])]
    .reverse()
    .find((item) => item.role === 'eko')?.text;
  if (!lastEkoReply || !/\bwould you like EKO to prepare\b/i.test(lastEkoReply)) return null;

  const tasks = parseContextTasks(dashboardContext);
  const [referencedTask] = findReferencedContextTasks(input, tasks);
  if (!referencedTask) return null;

  if (/\b(?:due date|deadline|date)\b/i.test(lastEkoReply)) {
    return {
      reply: `What due date should EKO set for ${referencedTask.name}?`,
      provider: 'openai',
      model: 'eko-local-context',
      intent: 'details_needed',
      approval: {
        kind: 'issue.update',
        title: `Update ${referencedTask.name} due date`,
        copy: `Set ${referencedTask.name} due date after you provide the date.`,
        draft: { taskName: referencedTask.name },
      },
    };
  }

  if (/\bassign/i.test(lastEkoReply)) {
    return {
      reply: `Who should EKO assign ${referencedTask.name} to?`,
      provider: 'openai',
      model: 'eko-local-context',
      intent: 'details_needed',
      approval: {
        kind: 'issue.update',
        title: `Assign ${referencedTask.name}`,
        copy: `Assign ${referencedTask.name} after you provide the assignee.`,
        draft: { taskName: referencedTask.name },
      },
    };
  }

  return null;
}

function answerLocalMissingDetail(input: AgentChatInput, dashboardContext: string): AgentChatResult | null {
  if (input.mode === 'approval') return null;

  const lastEkoReply = [...(input.clientContext?.recentHistory ?? [])]
    .reverse()
    .find((item) => item.role === 'eko')?.text;
  if (!lastEkoReply) return null;

  const tasks = parseContextTasks(dashboardContext);
  const [referencedTask] = findReferencedContextTasks(input, tasks);
  if (!referencedTask) return null;

  if (/^what due date should EKO set for\b/i.test(lastEkoReply)) {
    const dueDate = parseDueDate(input.message);
    if (!dueDate) return null;
    const dueLabel = /no date/i.test(dueDate) ? 'no due date' : `due ${dueDate}`;
    return {
      reply: `Ready for approval: set ${referencedTask.name} to ${dueLabel}.`,
      provider: 'openai',
      model: 'eko-local-context',
      intent: 'approval_required',
      approval: {
        kind: 'issue.update',
        title: `Update ${referencedTask.name} due date`,
        copy: `Set ${referencedTask.name} to ${dueLabel}.`,
        draft: { taskName: referencedTask.name, dueDate },
      },
    };
  }

  if (/^who should EKO assign\b/i.test(lastEkoReply)) {
    const staff = parseStaffFromText(input.message, dashboardContext);
    if (!staff) return null;
    return {
      reply: `Ready for approval: assign ${referencedTask.name} to ${staff.name}.`,
      provider: 'openai',
      model: 'eko-local-context',
      intent: 'approval_required',
      approval: {
        kind: 'issue.update',
        title: `Assign ${referencedTask.name}`,
        copy: `Assign ${referencedTask.name} to ${staff.name}.`,
        draft: { taskName: referencedTask.name, assigneeName: staff.name },
      },
    };
  }

  return null;
}

function asksForDueDate(message: string) {
  return /\b(?:when|due|deadline|date)\b/i.test(message);
}

function asksForAssignee(message: string) {
  return /\b(?:who|owner|owns|assigned|assignee|responsible)\b/i.test(message);
}

function asksForStatus(message: string) {
  return /\b(?:status|stage|state|progress|where is it|where's it)\b/i.test(message);
}

function asksForPriority(message: string) {
  return /\b(?:priority|urgent|urgency|how important)\b/i.test(message);
}

function asksForPluralReference(message: string) {
  return /\b(?:those|them|these|both|all of them|the tasks|the issues)\b/i.test(message);
}

function formatContextTaskProgress(task: ContextTask) {
  const status = task.status ?? 'without a visible status';
  return `${task.name} is ${status}${task.deadline ? `, due ${task.deadline}` : ''}.`;
}

function parseContextTasks(dashboardContext: string): ContextTask[] {
  const taskLines = dashboardContext
    .split('\n')
    .filter((line) =>
      /^(?:In progress|Risk queue|In review|Recent activity task details):/i.test(line),
    );
  const seen = new Set<string>();
  const tasks: ContextTask[] = [];

  for (const line of taskLines) {
    // Everything after the FIRST colon — not split(/:/, 2), which keeps only
    // the first two segments and so truncates the value at a second colon
    // inside a task name (e.g. "Concept Art: Characters …"), dropping every
    // task listed after it.
    const value = line.slice(line.indexOf(':') + 1).trim();
    for (const part of value.split(';')) {
      const raw = part.trim().replace(/\.$/, '');
      if (!raw || /^no tasks/i.test(raw)) continue;
      const match = raw.match(/^(.+?)(?:\s+\((.*?)\))?$/);
      if (!match) continue;
      const name = match[1]?.trim();
      const meta = match[2] ?? '';
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      tasks.push({
        name,
        raw,
        status: meta.split(',').map((item) => item.trim()).find((item) => item && !item.startsWith('#') && !/\b(?:urgent|high|medium|low) priority\b/i.test(item) && !/^due\b/i.test(item) && !/^assigned to\b/i.test(item)),
        priority: meta.match(/\b(Urgent|High|Medium|Low) priority\b/i)?.[1],
        assigneeName: meta.match(/\bassigned to ([^,)]+)/i)?.[1]?.trim(),
        deadline: meta.match(/\bdue\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1],
      });
    }
  }

  return tasks;
}

function findReferencedContextTasks(input: AgentChatInput, tasks: ContextTask[]) {
  const sortedTasks = [...tasks].sort((a, b) => b.name.length - a.name.length);
  const history = [...(input.clientContext?.recentHistory ?? [])].reverse();

  for (const item of history) {
    const text = item.text.toLowerCase();
    const matches = sortedTasks
      .filter((task) => text.includes(task.name.toLowerCase()))
      .sort((a, b) => text.indexOf(a.name.toLowerCase()) - text.indexOf(b.name.toLowerCase()));
    if (matches.length) return matches;
  }

  return [];
}

function formatContextError(error: unknown) {
  return error instanceof Error ? error.message : 'unknown';
}

function buildPrompt(input: AgentChatInput, dashboardContext: string) {
  const recentHistory = input.clientContext?.recentHistory?.length
    ? [
        'Recent EKO conversation:',
        ...input.clientContext.recentHistory.map((item) => `${item.role.toUpperCase()}: ${item.text}`),
      ].join('\n')
    : null;
  const parts = [
    `Authenticated user: signed in`,
    `Mode: ${input.mode ?? 'chat'}`,
    input.decision ? `Decision: ${input.decision}` : null,
    input.suggestion?.title ? `Selected action: ${input.suggestion.title}` : null,
    input.suggestion?.meta ? `Action context: ${input.suggestion.meta}` : null,
    input.suggestion?.approvalCopy ? `Approval copy: ${input.suggestion.approvalCopy}` : null,
    input.revision ? `Saved revision: ${input.revision}` : null,
    input.clientContext?.path ? `Dashboard path: ${input.clientContext.path}` : null,
    recentHistory,
    dashboardContext,
    'Answer from Recent EKO conversation first when the user uses follow-ups like "those", "that", or "it". Keep the same subject unless the user clearly changes it; then verify details against Dashboard context. Avoid mentioning missing integrations or asking the user to paste data if the context includes task counts.',
    `User request: ${input.message}`,
  ].filter(Boolean);

  return parts.join('\n');
}

async function runOpenAI(prompt: string): Promise<AgentChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AgentConfigError('Missing OPENAI_API_KEY for EKO.');
  const model = process.env.EKO_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: EKO_INSTRUCTIONS,
      input: prompt,
      max_output_tokens: 500,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AgentProviderError(extractProviderError(body) ?? 'OpenAI request failed.', response.status);
  }

  const reply = normalizeAgentReply(extractOpenAIText(body));
  if (!reply) throw new AgentProviderError('OpenAI returned an empty EKO response.');

  return { reply, provider: 'openai', model };
}

async function runAnthropic(prompt: string): Promise<AgentChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AgentConfigError('Missing ANTHROPIC_API_KEY for EKO.');
  const model = process.env.EKO_ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: EKO_INSTRUCTIONS,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AgentProviderError(extractProviderError(body) ?? 'Anthropic request failed.', response.status);
  }

  const reply = normalizeAgentReply(extractAnthropicText(body));
  if (!reply) throw new AgentProviderError('Anthropic returned an empty EKO response.');

  return { reply, provider: 'anthropic', model };
}

function extractOpenAIText(body: unknown) {
  if (!body || typeof body !== 'object') return '';
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text.trim();

  const output = Array.isArray(record.output) ? record.output : [];
  const text: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const value = (block as Record<string, unknown>).text;
      if (typeof value === 'string') text.push(value);
    }
  }
  return text.join('\n').trim();
}

function extractAnthropicText(body: unknown) {
  if (!body || typeof body !== 'object') return '';
  const content = (body as Record<string, unknown>).content;
  if (!Array.isArray(content)) return '';

  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const record = block as Record<string, unknown>;
      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractProviderError(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return null;
}

function normalizeAgentReply(reply: string) {
  return reply
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\b\d+\.\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);
}
