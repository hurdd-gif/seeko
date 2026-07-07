'use client';

import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import {
  Check,
  CircleAlert,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { emitEkoEvent, requestEkoSpotlight } from '@/lib/eko-bus';
import { newConversationId, executedTarget } from '@/lib/eko-agent-client';

const suggestions = [
  {
    id: 'investor-update',
    icon: Plus,
    title: 'Draft investor update',
    meta: 'Investor-safe brief',
    action: 'Draft',
    step: 'Drafting investor update',
    approvalCopy: 'Create an investor-safe update from blocked tasks.',
    response: 'Draft is ready. I kept internal notes out and flagged one approval.',
  },
  {
    id: 'digest-queue',
    icon: FileText,
    title: 'Review digest queue',
    meta: '1 draft waiting',
    action: 'Open',
    step: 'Opening digest queue',
    approvalCopy: 'Open the queued digest and mark it reviewed.',
    response: 'Digest queue opened. One draft needs approval before it can be shared.',
  },
  {
    id: 'risky-changes',
    icon: ShieldCheck,
    title: 'Check risky changes',
    meta: 'Review before write',
    action: 'Review',
    step: 'Checking risky changes',
    approvalCopy: 'Move one blocked task into review.',
    response: 'Risk check found one write action. Approval is required before it runs.',
  },
];

type Suggestion = (typeof suggestions)[number];
type ApprovalStatus = 'pending' | 'editing' | 'approved' | 'rejected' | 'answered';
type AgentPhase = 'idle' | 'thinking' | 'approval' | 'committing' | 'complete' | 'error';
type AgentIconState = 'idle' | 'thinking' | 'working' | 'finished' | 'permission' | 'error';
type FailedAction = 'select' | 'approve' | 'reject' | 'prompt' | 'edit' | null;
type AgentError = {
  title: string;
  message: string;
  action: FailedAction;
};
type EkoApiRequest = {
  message: string;
  mode?: 'chat' | 'approval';
  decision?: 'approve' | 'reject';
  conversationId?: string;
  pendingActionIds?: string[];
  suggestion?: {
    id: string;
    title: string;
    meta: string;
    approvalCopy: string;
    approval?: EkoApiResponse['approval'];
  };
  revision?: string;
  clientContext?: {
    path: string;
    title: string;
    recentHistory?: Array<{
      role: 'user' | 'eko' | 'action';
      text: string;
    }>;
  };
};
type EkoApiResponse = {
  reply: string;
  provider?: string;
  model?: string;
  intent?: 'answer' | 'clarification' | 'details_needed' | 'approval_required' | 'executed' | 'rejected';
  approval?: {
    kind?: 'issue.create' | 'issue.update' | 'generic';
    title?: string;
    copy?: string;
    draft?: {
      title?: string;
      status?: string;
      priority?: string;
      dueDate?: string;
    };
  };
  /**
   * Mirrors AgentWriteTarget in src/api-server/agent/tool-contract.ts —
   * present only on `executed` responses that changed one task. Drives the
   * post-write receipt row; UI choreography metadata only, never a write path.
   */
  target?: {
    kind: 'task';
    taskId: string;
    taskNumber?: number | null;
    name: string;
    action: 'create' | 'status' | 'assignee' | 'priority' | 'dueDate';
  };
  /** Staged writes awaiting approval, keyed server-side by conversationId. */
  pendingActions?: Array<{ id: string; toolId: string; summary: string }>;
  /** Results of an approval decision — one entry per approved pendingActionId. */
  executed?: Array<{ pendingActionId: string; ok: boolean; reply: string; target?: EkoApiResponse['target'] }>;
};
type WriteReceipt = {
  target: NonNullable<EkoApiResponse['target']>;
  /** The executed reply this receipt belongs to — hides the row once a newer response replaces demoResponse. */
  reply: string;
};
type PendingWriteDraft = {
  title: string;
  status: string;
  priority: string;
  dueDate: string;
};
type WriteDetailsStep = 'title' | 'status' | 'priority' | 'dueDate' | 'review';
type SuggestionStats = Record<string, { count: number; lastUsed: number }>;
type ChatHistoryItem = {
  id: string;
  role: 'user' | 'eko' | 'action';
  text: string;
};

const emptyPendingWriteDraft: PendingWriteDraft = {
  title: '',
  status: '',
  priority: '',
  dueDate: '',
};
const writeStatusOptions = ['Todo', 'In Progress', 'In Review', 'Backlog'];
const writePriorityOptions = ['Urgent', 'High', 'Medium', 'Low'];
const writeDueDateOptions = ['Today', 'Tomorrow', 'Next week', 'No date'];
const writeDetailsSteps: Array<{ id: WriteDetailsStep; label: string }> = [
  { id: 'title', label: 'Name' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'dueDate', label: 'Due' },
  { id: 'review', label: 'Review' },
];
const EKO_OPEN_STORAGE_KEY = 'seeko:eko-open';
const EKO_LEARNING_STORAGE_PREFIX = 'seeko:eko-learning';
const EKO_HISTORY_STORAGE_PREFIX = 'seeko:eko-history';
const MAX_HISTORY_ITEMS = 10;

function readStoredEkoOpen() {
  try {
    return window.sessionStorage.getItem(EKO_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredEkoOpen(open: boolean) {
  try {
    window.sessionStorage.setItem(EKO_OPEN_STORAGE_KEY, String(open));
  } catch {
    // EKO still works if storage is blocked; it just won't persist between routes.
  }
}

function hashStorageSegment(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getLearningStorageKey(userKey?: string) {
  return `${EKO_LEARNING_STORAGE_PREFIX}:${userKey ? hashStorageSegment(userKey) : 'local'}`;
}

function getHistoryStorageKey(userKey?: string) {
  return `${EKO_HISTORY_STORAGE_PREFIX}:${userKey ? hashStorageSegment(userKey) : 'local'}`;
}

function readSuggestionStats(userKey?: string): SuggestionStats {
  try {
    const raw = window.localStorage.getItem(getLearningStorageKey(userKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const stats: SuggestionStats = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!suggestions.some((suggestion) => suggestion.id === id)) continue;
      if (!value || typeof value !== 'object') continue;
      const record = value as Record<string, unknown>;
      const count = typeof record.count === 'number' ? record.count : 0;
      const lastUsed = typeof record.lastUsed === 'number' ? record.lastUsed : 0;
      if (count > 0) stats[id] = { count, lastUsed };
    }
    return stats;
  } catch {
    return {};
  }
}

function writeSuggestionStats(userKey: string | undefined, stats: SuggestionStats) {
  try {
    window.localStorage.setItem(getLearningStorageKey(userKey), JSON.stringify(stats));
  } catch {
    // Suggestion learning is a progressive enhancement; EKO still works without it.
  }
}

function readChatHistory(userKey?: string): ChatHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(getHistoryStorageKey(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): ChatHistoryItem | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const role = record.role === 'user' || record.role === 'eko' || record.role === 'action' ? record.role : null;
        const text = typeof record.text === 'string' ? record.text.trim() : '';
        const id = typeof record.id === 'string' ? record.id : `${Date.now()}-${Math.random()}`;
        if (!role || !text) return null;
        return { id, role, text: text.slice(0, 420) };
      })
      .filter((item): item is ChatHistoryItem => Boolean(item))
      .slice(-MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function writeChatHistory(userKey: string | undefined, history: ChatHistoryItem[]) {
  try {
    window.localStorage.setItem(getHistoryStorageKey(userKey), JSON.stringify(history.slice(-MAX_HISTORY_ITEMS)));
  } catch {
    // History is a local convenience. EKO can still answer if storage is blocked.
  }
}

function inferSuggestionId(prompt: string) {
  if (/\b(investor|update|brief|draft|memo|summary)\b/i.test(prompt)) return 'investor-update';
  if (/\b(digest|queue)\b/i.test(prompt)) return 'digest-queue';
  if (/\b(risk|risky|approval|approve|blocked|permission|safe)\b/i.test(prompt)) return 'risky-changes';
  return null;
}

function isApprovalPromptResponse(reply: string) {
  return /^\s*ready for approval\s*:/i.test(reply);
}

function isClarifyingFollowupResponse(reply: string) {
  return /\b(please specify|which item|which task|what would you like|tell me what|i need (?:the|a)|since none|none (?:is|are) currently pending|no .* currently pending)\b/i.test(reply);
}

function shouldOpenApprovalFlow(reply: string) {
  if (isClarifyingFollowupResponse(reply)) return false;
  if (!isApprovalPromptResponse(reply)) return false;
  return true;
}

function shouldOpenApprovalFromResponse(response: EkoApiResponse) {
  if (response.intent === 'approval_required' || response.intent === 'details_needed') return true;
  if (response.intent) return false;
  return shouldOpenApprovalFlow(response.reply);
}

function responseNeedsWriteDetails(response: EkoApiResponse) {
  if (response.intent === 'details_needed') return true;
  if (response.intent === 'approval_required') return false;
  return needsInlineWriteDetails(response.reply);
}

function isApprovalConfirmationPrompt(prompt: string) {
  return /\b(i (?:already )?approved|approved it|approve it|i approve|confirmed?|go ahead|proceed|do it|yes)\b/i.test(prompt);
}

function isAmbiguousStandaloneConfirmation(prompt: string) {
  return /^\s*(?:yes|yeah|yep|ok|okay|sure|do it|confirmed?|confirm|go ahead|proceed|approve it|approved it|i approve|i already approved it)\s*[.!?]*\s*$/i.test(prompt);
}

function needsInlineWriteDetails(reply: string) {
  return /\b(task name|issue title|\btitle\b|priority|due date|area|assignee|status|please share the|please confirm the task|specify which|which item|what action)\b/i.test(reply);
}

function stripApprovalPrefix(reply: string) {
  return reply.replace(/^\s*ready for approval\s*:\s*/i, '').trim();
}

function normalizeApprovalLabel(value: string) {
  return titleCaseIssue(
    value
      .replace(/\s+/g, ' ')
      .replace(/\b(?:please|confirm|share|provide|tell me|let me know)\b.*$/i, '')
      .replace(/\b(?:so|and)\s+i\s+can\b.*$/i, '')
      .replace(/\s+(?:in|under)\s+\/issues\b/gi, '')
      .replace(/[,;:.!?]+$/g, '')
      .trim(),
  );
}

function getGeneratedApprovalLabel(prompt: string, reply: string) {
  const action = normalizeApprovalLabel(stripApprovalPrefix(reply).split(/[,;]/)[0] ?? '');
  if (action && action.length >= 6) return action.slice(0, 72);

  const promptAction = normalizeApprovalLabel(prompt);
  return promptAction ? promptAction.slice(0, 72) : 'Approval request';
}

function createGeneratedApprovalSuggestion(_prompt: string, reply: string): Suggestion {
  const title = getGeneratedApprovalLabel(_prompt, reply);
  return {
    ...suggestions[2],
    id: 'risky-changes',
    title,
    meta: 'Approval required',
    action: 'Review',
    step: title,
    approvalCopy: reply,
    response: reply,
  };
}

function createGeneratedApprovalSuggestionFromResponse(prompt: string, response: EkoApiResponse): Suggestion {
  const title = response.approval?.title || getGeneratedApprovalLabel(prompt, response.reply);
  const copy = response.approval?.copy || response.reply;
  return {
    ...suggestions[2],
    id: 'risky-changes',
    title,
    meta: response.intent === 'details_needed' ? 'Details needed' : 'Approval required',
    action: response.intent === 'details_needed' ? 'Details' : 'Review',
    step: title,
    approvalCopy: copy,
    response: copy,
  };
}

function draftFromResponse(response: EkoApiResponse, _prompt: string): PendingWriteDraft {
  return {
    title: response.approval?.draft?.title ?? '',
    status: response.approval?.draft?.status ?? '',
    priority: response.approval?.draft?.priority ?? '',
    dueDate: response.approval?.draft?.dueDate ?? '',
  };
}

function titleCaseIssue(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/g, '')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractQuotedTitle(value: string) {
  const match = value.match(/["“]([^"”]{3,80})["”]/);
  return match ? titleCaseIssue(match[1]) : '';
}

function getInitialWriteDetailsStep(draft: PendingWriteDraft): WriteDetailsStep {
  if (!draft.title.trim()) return 'title';
  if (!draft.status.trim()) return 'status';
  if (!draft.priority.trim()) return 'priority';
  if (!draft.dueDate.trim()) return 'dueDate';
  return 'review';
}

function priorityEdgeClass(option: string, selected: boolean) {
  if (option === 'Urgent') {
    return selected
      ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(255,112,104,0.36)]'
      : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(255,112,104,0.28)]';
  }
  if (option === 'High') {
    return selected
      ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(255,183,82,0.34)]'
      : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(255,183,82,0.24)]';
  }
  if (option === 'Medium') {
    return selected
      ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(85,156,255,0.32)]'
      : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(85,156,255,0.22)]';
  }
  return selected
    ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(135,231,177,0.26)]'
    : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(135,231,177,0.18)]';
}

export function AgentCompanion({ userKey }: { userKey?: string }) {
  const [open, setOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('pending');
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [composerValue, setComposerValue] = useState('');
  const [editValue, setEditValue] = useState('');
  const [revisedRequest, setRevisedRequest] = useState('');
  const [generatedApprovalCopy, setGeneratedApprovalCopy] = useState('');
  const [activeApproval, setActiveApproval] = useState<EkoApiResponse['approval'] | null>(null);
  const [pendingWriteDraft, setPendingWriteDraft] = useState<PendingWriteDraft>(emptyPendingWriteDraft);
  const [writeDetailsStep, setWriteDetailsStep] = useState<WriteDetailsStep>('title');
  const [demoResponse, setDemoResponse] = useState('');
  const [writeReceipt, setWriteReceipt] = useState<WriteReceipt | null>(null);
  const [agentError, setAgentError] = useState<AgentError | null>(null);
  const [editError, setEditError] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<string[]>([]);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [suggestionStats, setSuggestionStats] = useState<SuggestionStats>({});
  const [actionFeedback, setActionFeedback] = useState<'approve' | 'edit' | 'reject' | null>(null);
  const [pendingActionIds, setPendingActionIds] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();
  const conversationIdRef = useRef<string>(newConversationId());
  const decisionTimerRef = useRef<number | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const trayScrollRef = useRef<HTMLDivElement | null>(null);
  const trayHeaderRef = useRef<HTMLDivElement | null>(null);
  const trayEndRef = useRef<HTMLDivElement | null>(null);
  const promptRequestRef = useRef(0);
  const titleId = useId();
  const personalizedSuggestions = [...suggestions].sort((a, b) => {
    const aStats = suggestionStats[a.id];
    const bStats = suggestionStats[b.id];
    const countDelta = (bStats?.count ?? 0) - (aStats?.count ?? 0);
    if (countDelta !== 0) return countDelta;
    const recencyDelta = (bStats?.lastUsed ?? 0) - (aStats?.lastUsed ?? 0);
    if (recencyDelta !== 0) return recencyDelta;
    return suggestions.findIndex((item) => item.id === a.id) - suggestions.findIndex((item) => item.id === b.id);
  });
  const visibleSuggestions = personalizedSuggestions.slice(0, 2);
  const hasApproval = Boolean(activeSuggestion && phase === 'approval');
  const hasError = phase === 'error' && Boolean(agentError);
  const shouldCollectWriteDetails =
    hasApproval
    && approvalStatus === 'editing'
    && Boolean(generatedApprovalCopy)
    // The wizard collects title/status/priority/due — an issue.create shape.
    // Opening it for delete/update/generic approvals silently converts the
    // request into a create draft ("remove the task" ends up creating one).
    && (!activeApproval || activeApproval.kind === 'issue.create')
    && !/\b(delete|remove)\b/i.test(activeSuggestion?.title ?? '')
    && (activeSuggestion?.meta === 'Details needed' || needsInlineWriteDetails(generatedApprovalCopy));
  const selectedCardDuplicatesApproval = Boolean(
    hasApproval
    && activeSuggestion
    && (activeApproval?.copy ?? (generatedApprovalCopy || activeSuggestion.approvalCopy))
      ?.toLowerCase()
      .includes(activeSuggestion.title.toLowerCase()),
  );
  const writeDetailsStepIndex = Math.max(
    0,
    writeDetailsSteps.findIndex((step) => step.id === writeDetailsStep),
  );
  const writeDetailsStepMeta =
    writeDetailsStep === 'title'
      ? {
          title: 'Name the issue',
          detail: 'Use the exact task name EKO should prepare.',
          value: pendingWriteDraft.title,
          complete: Boolean(pendingWriteDraft.title.trim()),
        }
      : writeDetailsStep === 'status'
        ? {
            title: 'Choose status',
            detail: 'Where should the issue appear once approved?',
            value: pendingWriteDraft.status,
            complete: Boolean(pendingWriteDraft.status.trim()),
          }
      : writeDetailsStep === 'priority'
        ? {
            title: 'Set priority',
            detail: 'Help EKO rank this against the active work queue.',
            value: pendingWriteDraft.priority,
            complete: Boolean(pendingWriteDraft.priority.trim()),
          }
      : writeDetailsStep === 'dueDate'
        ? {
            title: 'Set due window',
            detail: 'Pick a lightweight timing signal for the approval.',
            value: pendingWriteDraft.dueDate,
            complete: Boolean(pendingWriteDraft.dueDate.trim()),
          }
      : {
          title: 'Review request',
          detail: 'EKO will prepare this as a gated approval, not write it yet.',
          value: 'Ready',
          complete: true,
        };
  const isThinking = phase === 'thinking';
  const isCommitting = phase === 'committing';
  const traceCompact =
    phase === 'approval' || phase === 'committing' || phase === 'complete' || phase === 'error';
  const expanded = open;
  const showTray = open;
  const hasSelectedAction = Boolean(activeSuggestion);
  const eventResponseVisible = Boolean(demoResponse);
  const visibleChatHistory =
    eventResponseVisible && chatHistory[chatHistory.length - 1]?.role === 'eko' && chatHistory[chatHistory.length - 1]?.text === demoResponse
      ? chatHistory.slice(0, -1)
      : chatHistory;
  const activeStep = activeSuggestion?.step ?? (lastPrompt ? `You asked: ${lastPrompt}` : 'Checking dashboard context');
  const shouldShowWorkflowTrace = Boolean(activeSuggestion || workflowSteps.length);
  const currentSteps = [
    ...workflowSteps,
    ...(shouldShowWorkflowTrace && (activeSuggestion || phase === 'thinking' || phase === 'committing')
      ? [activeStep]
      : []),
  ]
    .filter((step, index, steps) => step && steps.indexOf(step) === index)
    // Drop steps that are a case-insensitive substring of another step —
    // keep the longer one (e.g. "Assign X" vs "Approval requested: Assign X").
    .filter((step, _index, steps) =>
      !steps.some(
        (other) =>
          other !== step
          && other.toLowerCase() !== step.toLowerCase()
          && other.toLowerCase().includes(step.toLowerCase()),
      ),
    );
  const hasUserChat = chatHistory.some((item) => item.role === 'user');
  const latestUserPrompt =
    [...chatHistory].reverse().find((item) => item.role === 'user')?.text ?? lastPrompt;
  const inferredChatSuggestion = latestUserPrompt ? inferSuggestionId(latestUserPrompt) : null;
  const contextualChatSuggestions =
    hasUserChat && !activeSuggestion && inferredChatSuggestion && phase !== 'thinking' && phase !== 'committing'
      ? suggestions.filter((item) => item.id === inferredChatSuggestion)
      : [];
  // While an action flow is live, its "Approval requested:" receipt already
  // shows in the selected card / approval card — hide the duplicate history
  // row (display-only; stored history is untouched) until the flow resolves.
  const actionFlowLive =
    Boolean(activeSuggestion)
    && (phase === 'thinking' || phase === 'approval' || phase === 'committing');
  const visibleChatRows: Array<ChatHistoryItem & { pending?: boolean }> = [
    ...visibleChatHistory.filter(
      (item) =>
        !(
          actionFlowLive
          && item.role === 'action'
          && activeSuggestion
          && item.text.toLowerCase().includes(activeSuggestion.title.toLowerCase())
        ),
    ),
    ...(isThinking && !shouldShowWorkflowTrace
      ? [{
          id: 'eko-thinking-row',
          role: 'eko' as const,
          text: 'Checking live dashboard context',
          pending: true,
        }]
      : []),
  ];
  const hasConversationStarted = hasUserChat || conversationStarted || Boolean(lastPrompt);
  const showSuggestions = phase === 'idle' && !hasConversationStarted && chatHistory.length === 0;
  const SelectedIcon = activeSuggestion?.icon;
  const statusLine =
    phase === 'idle'
      ? '2 suggestions · approvals gated'
      : phase === 'error'
        ? agentError?.title ?? 'EKO hit an error'
      : phase === 'thinking'
        ? 'Thinking through next action'
        : phase === 'approval'
          ? shouldCollectWriteDetails
            ? 'Details needed before approval'
          : approvalStatus === 'editing'
            ? 'Revision requested'
            : 'Approval required before write'
          : phase === 'committing'
            ? approvalStatus === 'approved'
              ? 'Approving action'
              : 'Rejecting action'
          : shouldCollectWriteDetails
            ? 'Details needed before approval'
          : approvalStatus === 'editing'
            ? 'Revision requested'
          : approvalStatus === 'answered'
            ? 'Answer ready.'
            : approvalStatus === 'approved'
            ? 'Action approved. Draft is ready.'
            : 'Rejected. Dashboard unchanged.';
  const statusDetail =
    phase === 'idle'
      ? 'Choose a suggested studio action or ask EKO directly.'
      : phase === 'error'
        ? agentError?.message ?? 'The agent stopped before making changes.'
      : phase === 'thinking'
        ? 'Reading dashboard state and checking approval rules.'
        : phase === 'approval'
          ? shouldCollectWriteDetails
            ? 'Add issue details in the drawer. EKO will keep the write gated.'
          : approvalStatus === 'editing'
            ? 'Describe the change below. Approval stays gated until you confirm.'
            : 'Review the risky action before EKO writes anything.'
          : phase === 'committing'
            ? 'Saving the decision and closing the approval prompt.'
          : shouldCollectWriteDetails
            ? 'Add issue details in the drawer. EKO will keep the write gated.'
          : approvalStatus === 'editing'
            ? 'Describe the change below. Approval stays gated until you confirm.'
          : approvalStatus === 'answered'
            ? 'EKO answered from the latest dashboard context.'
            : approvalStatus === 'approved'
            ? 'Audit trail saved. Nothing shared without approval.'
            : 'No changes were made. You can revise the request.';
  const approvalTitle =
    approvalStatus === 'approved'
      ? 'Approved'
      : approvalStatus === 'rejected'
        ? 'Rejected'
        : shouldCollectWriteDetails
          ? 'Details needed'
        : approvalStatus === 'editing'
          ? 'Revision requested'
        : 'Approval required';
  const approvalCopy =
    shouldCollectWriteDetails
      ? 'Add the issue details below. This write stays gated until you review and approve it.'
    : approvalStatus === 'editing'
      ? 'Tell EKO what to revise below. This action stays gated until you approve it.'
    : generatedApprovalCopy
      ? generatedApprovalCopy
      : revisedRequest
        ? `Revised request: ${revisedRequest}`
        : activeSuggestion?.approvalCopy;
  const statusCta =
    phase === 'idle'
      ? 'Ask'
      : phase === 'error'
        ? 'Retry'
      : phase === 'thinking'
        ? 'Working'
        : phase === 'approval'
          ? shouldCollectWriteDetails
            ? 'Details'
          : approvalStatus === 'editing'
            ? 'Editing'
            : 'Review'
          : phase === 'committing'
            ? 'Done'
          : shouldCollectWriteDetails
            ? 'Details'
          : approvalStatus === 'editing'
            ? 'Editing'
          : approvalStatus === 'answered'
            ? 'Ready'
          : approvalStatus === 'approved'
            ? 'View draft'
            : 'Done';
  const agentIconState: AgentIconState =
    phase === 'thinking'
      ? 'thinking'
      : phase === 'error'
        ? 'error'
      : phase === 'committing'
        ? 'working'
      : phase === 'approval'
        ? 'permission'
        : phase === 'complete'
          ? 'finished'
          : 'idle';
  const responseIconState: AgentIconState = phase === 'complete' ? 'finished' : 'working';
  const surfaceTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 430, damping: 42, mass: 0.85 };
  const dockTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 820, damping: 64, mass: 0.52 };
  const fadeTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.11, ease: [0.22, 1, 0.36, 1] as const };
  // Swapped regions (suggestions ↔ selected action/trace/history) share one
  // popLayout surface; the exit must finish before the enter becomes visible
  // or both states double-render on the translucent glass.
  const swapExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.07, ease: [0.22, 1, 0.36, 1] as const };
  const swapEnterTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.11, ease: [0.22, 1, 0.36, 1] as const, delay: 0.1 };
  const approvalTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
  const drawerTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.72 };
  // Dock ↔ tray is one continuous surface: both content layers crossfade IN
  // PLACE while the container morphs. Enter starts immediately (no delay) so
  // the surface never reads as an empty shell mid-morph; exit lingers through
  // most of the travel. Both layers carry `layout` so Motion counter-scales
  // them against the container's morph — nothing scale-distorts.
  const morphExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
  const morphEnterTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
  // The tray is a large surface: on close its content must dissolve WITH the
  // collapse (gentler curve, a beat longer than the dock's exit) or the
  // shrinking panel reads as an empty grey shell.
  const trayExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.26, ease: [0.4, 0, 0.2, 1] as const };
  const pulseTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
  const writeDetailsDrawerClass =
    writeDetailsStep === 'review'
      ? 'min-h-[424px]'
      : writeDetailsStep === 'status' || writeDetailsStep === 'priority' || writeDetailsStep === 'dueDate'
        ? 'min-h-[386px]'
        : 'min-h-[318px]';
  const writeDetailsBodyClass =
    writeDetailsStep === 'review'
      ? 'min-h-[166px]'
      : writeDetailsStep === 'title'
        ? 'min-h-[58px]'
        : 'min-h-[128px]';

  useEffect(() => {
    if (!activeSuggestion || phase !== 'thinking') return;

    const timer = window.setTimeout(() => {
      setPhase('approval');
      setDemoResponse(activeSuggestion.response);
    }, reduceMotion ? 0 : 650);

    return () => window.clearTimeout(timer);
  }, [activeSuggestion, phase, reduceMotion]);

  useEffect(() => {
    if (!actionFeedback) return;

    const timer = window.setTimeout(() => setActionFeedback(null), reduceMotion ? 0 : 900);
    return () => window.clearTimeout(timer);
  }, [actionFeedback, reduceMotion]);

  useEffect(() => {
    return () => {
      if (decisionTimerRef.current !== null) window.clearTimeout(decisionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const storedOpen = readStoredEkoOpen();
    if (storedOpen && !open) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    writeStoredEkoOpen(open);
  }, [open]);

  useEffect(() => {
    setSuggestionStats(readSuggestionStats(userKey));
    setChatHistory(readChatHistory(userKey));
    setStorageHydrated(true);
  }, [userKey]);

  useEffect(() => {
    if (!storageHydrated) return;
    writeSuggestionStats(userKey, suggestionStats);
  }, [storageHydrated, suggestionStats, userKey]);

  useEffect(() => {
    if (!storageHydrated) return;
    writeChatHistory(userKey, chatHistory);
  }, [chatHistory, storageHydrated, userKey]);

  useEffect(() => {
    if (!open || !hasConversationStarted) return;
    const tray = trayScrollRef.current;
    if (!tray) return;

    const lockToBottom = () => {
      tray.scrollTop = tray.scrollHeight;
    };

    lockToBottom();
    if (reduceMotion) return;

    // Hold the lock while entering surfaces spring to size, or the growing
    // approval card slides under the sticky composer mid-animation.
    let frame = 0;
    const startedAt = performance.now();
    const tick = () => {
      lockToBottom();
      if (performance.now() - startedAt < 550) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [open, hasConversationStarted, reduceMotion, visibleChatHistory.length, demoResponse, phase, shouldCollectWriteDetails, writeDetailsStep]);

  useLayoutEffect(() => {
    if (!open) return;
    const tray = trayScrollRef.current;
    const header = trayHeaderRef.current;
    if (!tray || !header) return;

    const syncHeaderInset = () => {
      const inset = header.offsetHeight;
      tray.style.paddingTop = `${inset}px`;
      // The header's backdrop-blur scrims cannot veil the chat bubbles: the tray
      // container's own backdrop-filter makes it a backdrop root, and Chromium's
      // nested backdrop-filters only sample the page BEHIND that root — never
      // sibling content painted inside it (verified live; bubbles stay legible
      // even with the container filter disabled). So veil at the source: mask
      // the scroller so its content dissolves before it reaches the header.
      const mask = `linear-gradient(to bottom, transparent ${Math.max(0, inset - 30)}px, black ${inset + 10}px)`;
      tray.style.maskImage = mask;
      tray.style.webkitMaskImage = mask;
    };

    syncHeaderInset();
    const observer = new ResizeObserver(syncHeaderInset);
    observer.observe(header);
    return () => observer.disconnect();
  }, [open]);

  function cancelDecisionTimer() {
    if (decisionTimerRef.current !== null) {
      window.clearTimeout(decisionTimerRef.current);
      decisionTimerRef.current = null;
    }
  }

  function openCompanion() {
    promptRequestRef.current += 1;
    cancelDecisionTimer();
    setOpen(true);
    setActiveSuggestion(null);
    setApprovalStatus('pending');
    setActionFeedback(null);
    setPhase('idle');
    setComposerValue('');
    setEditValue('');
    setRevisedRequest('');
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
    setWriteDetailsStep('title');
    setDemoResponse('');
    setAgentError(null);
    setEditError('');
    setLastPrompt('');
    setWorkflowSteps([]);
  }

  function closeCompanion() {
    promptRequestRef.current += 1;
    cancelDecisionTimer();
    setOpen(false);
  }

  function selectSuggestion(item: Suggestion) {
    promptRequestRef.current += 1;
    cancelDecisionTimer();
    rememberSuggestion(item.id);
    appendHistory({ role: 'action', text: `Requested: ${item.title}` });
    setWorkflowSteps([`Requested: ${item.title}`]);
    setConversationStarted(true);
    setActiveSuggestion(item);
    setApprovalStatus('pending');
    setActionFeedback(null);
    setDemoResponse('');
    setAgentError(null);
    setEditError('');
    setPhase('thinking');
    setEditValue('');
    setRevisedRequest('');
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
  }

  function shouldDemoFail(value: string) {
    return /\b(error|fail|offline|timeout)\b/i.test(value);
  }

  function rememberSuggestion(id: string | null) {
    if (!id) return;
    setSuggestionStats((current) => {
      const existing = current[id] ?? { count: 0, lastUsed: 0 };
      return {
        ...current,
        [id]: {
          count: existing.count + 1,
          lastUsed: Date.now(),
        },
      };
    });
  }

  function appendHistory(item: Omit<ChatHistoryItem, 'id'>) {
    const text = item.text.trim();
    if (!text) return;
    setChatHistory((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: item.role,
        text: text.slice(0, 420),
      },
    ].slice(-MAX_HISTORY_ITEMS));
  }

  function failAgent(error: AgentError) {
    cancelDecisionTimer();
    setConversationStarted(true);
    setAgentError(error);
    setPhase('error');
    appendHistory({ role: 'eko', text: error.title });
  }

  async function requestEko(input: EkoApiRequest): Promise<EkoApiResponse> {
    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
          ? (body as { error: string }).error
          : 'EKO request failed.';
      throw new Error(message);
    }

    if (!body || typeof body !== 'object' || typeof (body as { reply?: unknown }).reply !== 'string') {
      throw new Error('EKO returned an invalid response.');
    }

    return body as EkoApiResponse;
  }

  function buildApiRequest(message: string, overrides: Partial<EkoApiRequest> = {}): EkoApiRequest {
    const hasSuggestionOverride = Object.prototype.hasOwnProperty.call(overrides, 'suggestion');

    return {
      message,
      conversationId: conversationIdRef.current,
      clientContext: {
        path: window.location.pathname,
        title: document.title,
        recentHistory: chatHistory.slice(-6).map((item) => ({
          role: item.role,
          text: item.text,
        })),
      },
      ...overrides,
      suggestion: hasSuggestionOverride ? overrides.suggestion : (activeSuggestion
        ? {
            id: activeSuggestion.id,
            title: activeSuggestion.title,
            meta: activeSuggestion.meta,
            approvalCopy: generatedApprovalCopy || activeSuggestion.approvalCopy,
            approval: activeApproval ?? undefined,
          }
        : undefined),
    };
  }

  async function approveAction() {
    if (!activeSuggestion) return;
    const approvalMessage = generatedApprovalCopy || revisedRequest || activeSuggestion.approvalCopy;
    cancelDecisionTimer();
    setActionFeedback('approve');
    setAgentError(null);
    setApprovalStatus('approved');
    setPhase('committing');
    setDemoResponse('');

    try {
      if (shouldDemoFail(revisedRequest)) {
        setApprovalStatus('pending');
        failAgent({
          title: 'Approval could not run',
          message: 'EKO stopped before writing changes. Your approval was not applied.',
          action: 'approve',
        });
        return;
      }

      const response = await requestEko(
        buildApiRequest(approvalMessage, {
          mode: 'approval',
          decision: 'approve',
          pendingActionIds,
          suggestion: undefined,
        }),
      );
      setApprovalStatus('answered');
      setPhase('complete');
      setDemoResponse(response.reply);
      // Read-only bus signal for ALL executed writes (deletes included, with
      // no target): consumers revalidate loader data — no mutation rides this.
      const target = executedTarget(response as unknown as import('@/lib/eko-agent-client').EkoChatResponse);
      const didExecute = (response.executed ?? []).some((e) => e.ok);
      if (didExecute) {
        emitEkoEvent({
          type: 'write-executed',
          target: target ? { id: target.taskId, taskNumber: target.taskNumber ?? undefined, name: target.name } : undefined,
        });
      }
      // Post-write receipt: executed writes return the changed task so the
      // tray can offer a "view it on the board" deep link (bus spotlight).
      setWriteReceipt(
        target
          ? {
              target: {
                kind: 'task',
                taskId: target.taskId,
                taskNumber: target.taskNumber ?? null,
                name: target.name,
                action: target.action as 'create' | 'status' | 'assignee' | 'priority' | 'dueDate',
              },
              reply: response.reply,
            }
          : null,
      );
      appendHistory({ role: 'eko', text: response.reply });
      setActiveSuggestion(null);
      setGeneratedApprovalCopy('');
      setActiveApproval(null);
      setRevisedRequest('');
      setPendingWriteDraft(emptyPendingWriteDraft);
      setWriteDetailsStep('title');
      setWorkflowSteps((steps) => (steps.length ? [...steps, 'Approval saved'].slice(-4) : steps));
    } catch (error) {
      setApprovalStatus('pending');
      failAgent({
        title: 'Approval could not run',
        message: error instanceof Error ? error.message : 'EKO stopped before writing changes.',
        action: 'approve',
      });
    }
  }

  /**
   * Receipt deep-link: park a spotlight for the changed card on the EKO bus,
   * then ask the shell to navigate if the board isn't already on screen. The
   * bus carries UI choreography only — the write already happened upstream.
   */
  function viewWriteReceipt() {
    if (!writeReceipt) return;
    const { taskId, taskNumber, name } = writeReceipt.target;
    requestEkoSpotlight({ id: taskId, taskNumber: taskNumber ?? undefined, name });
    if (window.location.pathname !== '/issues') {
      emitEkoEvent({ type: 'navigate', path: '/issues' });
    }
  }

  async function rejectAction() {
    if (!activeSuggestion) return;
    const approvalMessage = generatedApprovalCopy || revisedRequest || activeSuggestion.approvalCopy;
    cancelDecisionTimer();
    setActionFeedback('reject');
    setAgentError(null);
    setApprovalStatus('rejected');
    setPhase('committing');
    setDemoResponse('');

    try {
      const response = await requestEko(
        buildApiRequest(approvalMessage, {
          mode: 'approval',
          decision: 'reject',
          revision: approvalMessage || undefined,
        }),
      );
      setApprovalStatus('answered');
      setPhase('complete');
      setDemoResponse(response.reply);
      appendHistory({ role: 'eko', text: response.reply });
      setActiveSuggestion(null);
      setGeneratedApprovalCopy('');
      setActiveApproval(null);
      setRevisedRequest('');
      setPendingWriteDraft(emptyPendingWriteDraft);
      setWriteDetailsStep('title');
      setWorkflowSteps((steps) => (steps.length ? [...steps, 'Rejected'].slice(-4) : steps));
    } catch (error) {
      setApprovalStatus('pending');
      failAgent({
        title: 'Rejection could not save',
        message: error instanceof Error ? error.message : 'EKO stopped before saving the rejection.',
        action: 'reject',
      });
    }
  }

  function editAction() {
    if (!activeSuggestion) return;
    cancelDecisionTimer();
    setActionFeedback('edit');
    setAgentError(null);
    setEditError('');
    setApprovalStatus('editing');
    setPhase('approval');
    setEditValue(revisedRequest);
    setDemoResponse('');
    window.setTimeout(() => {
      editTextareaRef.current?.focus();
      const length = editTextareaRef.current?.value.length ?? 0;
      editTextareaRef.current?.setSelectionRange(length, length);
    }, 0);
  }

  function saveEditAction() {
    if (!activeSuggestion) return;
    const revision = editValue.trim();
    if (!revision) {
      setEditError('Add a revision before saving.');
      editTextareaRef.current?.focus();
      return;
    }
    if (revision.length > 180) {
      setEditError('Keep the revision under 180 characters for this demo.');
      editTextareaRef.current?.focus();
      return;
    }

    cancelDecisionTimer();
    setActionFeedback('edit');
    setEditError('');
    setRevisedRequest(revision);
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    appendHistory({ role: 'action', text: `Edited request: ${revision}` });
    setWorkflowSteps((steps) => (steps.length ? [...steps, 'Revision saved'].slice(-4) : steps));
    setApprovalStatus('pending');
    setPhase('approval');
    setDemoResponse('');
  }

  function submitWriteDetails() {
    if (!activeSuggestion) return;
    const title = pendingWriteDraft.title.trim();
    if (!title) {
      setEditError('Add a task name before continuing.');
      return;
    }

    const details = [
      `Task name: ${title}`,
      pendingWriteDraft.status.trim() ? `Status: ${pendingWriteDraft.status.trim()}` : null,
      pendingWriteDraft.priority.trim() ? `Priority: ${pendingWriteDraft.priority.trim()}` : null,
      pendingWriteDraft.dueDate.trim() && pendingWriteDraft.dueDate !== 'No date' ? `Due date: ${pendingWriteDraft.dueDate.trim()}` : null,
    ].filter(Boolean).join('. ');

    setEditError('');
    setRevisedRequest(details);
    const approvalCopy = `Create ${title}${pendingWriteDraft.status.trim() ? ` with status ${pendingWriteDraft.status.trim()}` : ''}${pendingWriteDraft.priority.trim() ? ` as ${pendingWriteDraft.priority.trim()} priority` : ''}${pendingWriteDraft.dueDate.trim() && pendingWriteDraft.dueDate !== 'No date' ? ` due ${pendingWriteDraft.dueDate.trim()}` : pendingWriteDraft.dueDate.trim() === 'No date' ? ' with no due date' : ''}.`;
    setGeneratedApprovalCopy(approvalCopy);
    setActiveApproval({
      kind: 'issue.create',
      title: `Create ${title}`,
      copy: approvalCopy,
      draft: {
        title,
        status: pendingWriteDraft.status.trim(),
        priority: pendingWriteDraft.priority.trim(),
        dueDate: pendingWriteDraft.dueDate.trim(),
      },
    });
    appendHistory({ role: 'action', text: `Details added: ${title}` });
    setWorkflowSteps((steps) => [...steps, `Details added: ${title}`].slice(-4));
    setApprovalStatus('pending');
  }

  function advanceWriteDetails() {
    if (!writeDetailsStepMeta.complete) {
      setEditError(
        writeDetailsStep === 'title'
          ? 'Add an issue title before continuing.'
          : `Choose ${writeDetailsStepMeta.title.toLowerCase()} before continuing.`,
      );
      return;
    }

    setEditError('');
    const nextStep = writeDetailsSteps[writeDetailsStepIndex + 1]?.id;
    if (!nextStep || writeDetailsStep === 'review') {
      submitWriteDetails();
      return;
    }
    setWriteDetailsStep(nextStep);
  }

  function selectWriteDetail(field: Exclude<WriteDetailsStep, 'title' | 'review'>, value: string) {
    setEditError('');
    setPendingWriteDraft((draft) => ({ ...draft, [field]: value }));
    const nextStep = writeDetailsSteps[writeDetailsSteps.findIndex((step) => step.id === field) + 1]?.id;
    if (nextStep) {
      window.setTimeout(() => setWriteDetailsStep(nextStep), reduceMotion ? 0 : 110);
    }
  }

  function cancelWriteDetails() {
    cancelDecisionTimer();
    setActionFeedback(null);
    setEditError('');
    setApprovalStatus('answered');
    setPhase('complete');
    setDemoResponse('Cancelled. No approval request was prepared.');
    appendHistory({ role: 'eko', text: 'Cancelled. No approval request was prepared.' });
    setActiveSuggestion(null);
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setRevisedRequest('');
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
    setWorkflowSteps([]);
  }

  function retryFailedAction() {
    if (!agentError) return;
    const action = agentError.action;
    const promptToRetry = lastPrompt;
    setAgentError(null);

    if (action === 'approve') {
      void approveAction();
      return;
    }
    if (action === 'reject') {
      void rejectAction();
      return;
    }
    if (action === 'prompt') {
      void runPrompt(promptToRetry);
      return;
    }
    if (action === 'select' && activeSuggestion) {
      selectSuggestion(activeSuggestion);
      return;
    }

    setPhase(activeSuggestion ? 'approval' : 'idle');
  }

  function dismissError() {
    setAgentError(null);
    setConversationStarted(true);
    setApprovalStatus('answered');
    setPhase(activeSuggestion && approvalStatus === 'pending' ? 'approval' : 'complete');
  }

  async function runPrompt(prompt: string) {
    // /clear is a tray command, never a chat message: chat state lives here in
    // the browser, so sending it to the backend gets a fabricated "Cleared."
    // while every bubble stays. Resets to the same state as a first open.
    if (/^\/(clear|reset)\b/i.test(prompt.trim())) {
      promptRequestRef.current += 1;
      conversationIdRef.current = newConversationId();
      setPendingActionIds([]);
      setChatHistory([]);
      setActiveSuggestion(null);
      setEditValue('');
      setRevisedRequest('');
      setGeneratedApprovalCopy('');
      setActiveApproval(null);
      setPendingWriteDraft(emptyPendingWriteDraft);
      setWriteDetailsStep('title');
      setWorkflowSteps([]);
      setApprovalStatus('pending');
      setActionFeedback(null);
      setAgentError(null);
      setDemoResponse('');
      setLastPrompt('');
      setConversationStarted(false);
      setPhase('idle');
      return;
    }

    if (activeSuggestion && phase === 'approval' && isApprovalConfirmationPrompt(prompt)) {
      if (approvalStatus === 'pending' && !shouldCollectWriteDetails) {
        void approveAction();
        return;
      }
      if (shouldCollectWriteDetails || approvalStatus === 'editing') {
        // Keep the pending approval gated — don't round-trip "yes" to the
        // backend and spawn a duplicate approval.
        appendHistory({
          role: 'eko',
          text: 'Finish the details above, then approve — EKO will not write anything until you do.',
        });
        return;
      }
    }

    if (isAmbiguousStandaloneConfirmation(prompt)) {
      const reply = 'Tell me the specific action you want EKO to prepare. I will keep any write gated for approval.';
      setActiveSuggestion(null);
      setEditValue('');
      setRevisedRequest('');
      setGeneratedApprovalCopy('');
      setActiveApproval(null);
      setPendingWriteDraft(emptyPendingWriteDraft);
      setWriteDetailsStep('title');
      setWorkflowSteps([]);
      setApprovalStatus('answered');
      setActionFeedback(null);
      setAgentError(null);
      setPhase('complete');
      setDemoResponse('');
      appendHistory({ role: 'eko', text: reply });
      return;
    }

    setActiveSuggestion(null);
    setEditValue('');
    setRevisedRequest('');
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
    setWorkflowSteps([]);

    if (shouldDemoFail(prompt)) {
      failAgent({
        title: 'EKO could not answer',
        message: 'The request failed before EKO changed anything. Try again or revise the prompt.',
        action: 'prompt',
      });
      return;
    }

    setApprovalStatus('answered');
    setActionFeedback(null);
    setAgentError(null);
    setPhase('thinking');
    setDemoResponse('');
    const requestId = promptRequestRef.current + 1;
    promptRequestRef.current = requestId;

    try {
      const response = await requestEko(
        buildApiRequest(prompt, {
          mode: 'chat',
          suggestion: undefined,
        }),
      );
      if (requestId !== promptRequestRef.current) return;
      if (shouldOpenApprovalFromResponse(response) && !isAmbiguousStandaloneConfirmation(prompt)) {
        const generatedSuggestion = createGeneratedApprovalSuggestionFromResponse(prompt, response);
        const inferredDraft = draftFromResponse(response, prompt);
        setActiveSuggestion(generatedSuggestion);
        setPendingActionIds(response.pendingActions?.map((p) => p.id) ?? []);
        setGeneratedApprovalCopy(response.approval?.copy || response.reply);
        setActiveApproval(response.approval ?? null);
        const staged = response.pendingActions ?? [];
        if (staged.length) {
          // One line per staged write; the card renders this as its body.
          setGeneratedApprovalCopy(staged.map((p) => `• ${p.summary}`).join('\n'));
        }
        setPendingWriteDraft(inferredDraft);
        setWriteDetailsStep(getInitialWriteDetailsStep(inferredDraft));
        setApprovalStatus(responseNeedsWriteDetails(response) ? 'editing' : 'pending');
        setPhase('approval');
        setDemoResponse('');
        setWorkflowSteps([`Approval requested: ${generatedSuggestion.title}`]);
        appendHistory({ role: 'action', text: `Approval requested: ${generatedSuggestion.title}` });
      } else {
        setPhase('complete');
        setDemoResponse('');
        appendHistory({ role: 'eko', text: response.reply });
      }
    } catch (error) {
      if (requestId !== promptRequestRef.current) return;
      failAgent({
        title: 'EKO could not answer',
        message: error instanceof Error ? error.message : 'The request failed before EKO changed anything.',
        action: 'prompt',
      });
    }
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = composerValue.trim();
    if (!prompt) return;
    if (isThinking || isCommitting) return;
    cancelDecisionTimer();
    setConversationStarted(true);
    setLastPrompt(prompt);
    appendHistory({ role: 'user', text: prompt });

    void runPrompt(prompt);
    setComposerValue('');
  }

  return (
    <LayoutGroup id="studio-companion">
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex flex-col items-end sm:bottom-5 sm:right-5">
        <motion.div
          layout
          data-open={expanded}
          role={showTray ? 'dialog' : undefined}
          aria-labelledby={showTray ? titleId : undefined}
          transition={dockTransition}
          className={cn(
            'pointer-events-auto relative isolate origin-bottom-right overflow-hidden text-white backdrop-blur-[28px] backdrop-saturate-[1.35] will-change-[filter,transform]',
            expanded
              ? 'w-[min(318px,calc(100vw-24px))] rounded-[22px] bg-[rgba(29,42,66,0.28)] shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_18px_52px_-34px_rgba(0,0,0,0.72),0_2px_12px_-9px_rgba(11,27,52,0.54)] supports-[backdrop-filter]:bg-[rgba(29,42,66,0.24)]'
              : 'rounded-[22px] bg-[rgba(20,33,59,0.34)] shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_10px_28px_-18px_rgba(0,0,0,0.78)] after:pointer-events-none after:absolute after:inset-px after:z-[1] after:rounded-[21px] after:bg-[rgba(20,33,59,0.4)] after:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.2)]',
          )}
          style={{ transformOrigin: 'calc(100% - 52px) 100%' }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {showTray ? (
              <motion.div
                key="studio-companion-tray"
                layout
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: 'blur(2px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)', transition: morphEnterTransition }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, filter: 'blur(2px)', transition: trayExitTransition }
                }
                transition={dockTransition}
              >
              <div className="relative bg-[radial-gradient(circle_at_15%_0%,rgba(255,255,255,0.12),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(80,150,255,0.07),transparent_38%),linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012)_52%,rgba(0,0,0,0.08))] after:pointer-events-none after:absolute after:inset-px after:rounded-[21px] after:shadow-[inset_0_1px_1px_rgba(255,255,255,0.22),inset_0_-1px_1px_rgba(0,0,0,0.18)]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(5,13,28,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(5,13,28,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(5,13,28,0.22),transparent_44%),radial-gradient(circle_at_bottom_right,rgba(5,13,28,0.24),transparent_44%),radial-gradient(ellipse_at_center,rgba(255,255,255,0.07),transparent_48%)]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-32 rounded-b-[21px] bg-[linear-gradient(180deg,rgba(15,26,44,0)_0%,rgba(15,26,44,0.04)_30%,rgba(15,26,44,0.16)_58%,rgba(15,26,44,0.42)_82%,rgba(15,26,44,0.66)_100%)]"
                />

                {/* The header lives OUTSIDE the scroller: macOS elastic overscroll
                    bounces the scroller's contents at the compositor level (sticky
                    included), so an in-flow header detaches from the tray's top edge
                    on a hard fling. As an overlay it holds while content rubber-bands
                    beneath it; the scroller gets matching padding-top via ResizeObserver. */}
                <div ref={trayHeaderRef} className="absolute inset-x-0 top-0 z-[2] isolate bg-transparent px-4 pb-5 pt-3.5 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-[calc(100%+34px)] before:bg-black/[0.08] before:backdrop-blur-[32px] before:[mask-image:linear-gradient(to_bottom,black_0%,black_64%,rgba(0,0,0,0.48)_84%,transparent_100%)] before:[-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_64%,rgba(0,0,0,0.48)_84%,transparent_100%)] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-z-10 after:h-[78%] after:bg-black/[0.08] after:backdrop-blur-[56px] after:[mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.9)_46%,rgba(0,0,0,0.24)_82%,transparent_100%)] after:[-webkit-mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.9)_46%,rgba(0,0,0,0.24)_82%,transparent_100%)]">
                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <motion.span
                      layoutId="studio-companion-icon"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                      transition={dockTransition}
                    >
                      <DotMatrixAgentLoader state={agentIconState} className="size-5 text-white" />
                    </motion.span>
                    <div className="min-w-0">
                      <h2 id={titleId} className="text-[14px] font-semibold leading-none text-white">
                        EKO
                      </h2>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      aria-label="EKO online"
                      role="status"
                      className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[#b8d8ff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
                    >
                      <span className="relative size-2 rounded-full bg-[#4ea1ff]" />
                    </span>
                    <button
                      type="button"
                      aria-label="Close EKO"
                      onClick={closeCompanion}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/64 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.11)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.96]"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="relative pt-2">
                  <div className="flex items-center justify-between gap-3 border-y border-white/[0.09] py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium leading-4 text-white/66">
                        EKO state
                      </p>
                      <p className="mt-0.5 truncate text-[12px] font-semibold leading-4 text-white/78">
                        {statusLine}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-[14px] text-white/46">
                        {statusDetail}
                      </p>
                    </div>
                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium leading-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]',
                        phase === 'error'
                          ? 'bg-[#d4503e]/16 text-[#ffd2cc] shadow-[inset_0_0_0_1px_rgba(255,178,168,0.24)]'
                        : approvalStatus === 'editing'
                          ? 'bg-[#0d7aff]/18 text-[#c2ddff] shadow-[inset_0_0_0_1px_rgba(13,122,255,0.32)]'
                        : phase === 'approval'
                          ? 'bg-[#ffce52]/16 text-[#ffe6a3] shadow-[inset_0_0_0_1px_rgba(255,206,82,0.28)]'
                        : approvalStatus === 'rejected'
                            ? 'bg-white/[0.06] px-2 text-[#ffd2cc] shadow-[inset_0_0_0_1px_rgba(255,178,168,0.22)]'
                            : 'bg-[#0d7aff]/18 text-[#c2ddff] shadow-[inset_0_0_0_1px_rgba(13,122,255,0.34)]',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          phase === 'error'
                            ? 'bg-[#ff9b8f]'
                          : approvalStatus === 'editing'
                            ? 'bg-[#4ea1ff]'
                          : phase === 'approval'
                            ? 'bg-[#ffce52]'
                            : approvalStatus === 'rejected'
                              ? 'bg-[#ff9b8f]/80'
                              : 'bg-[#4ea1ff]',
                          isThinking ? 'motion-safe:animate-pulse' : '',
                        )}
                      />
                      {statusCta}
                    </div>
                  </div>
                </div>
                </div>

                {/* layoutScroll: layout-animated children (trace rows) measure
                    against this scroller; without it, auto-scroll during a
                    layout pass strands rows at a stale transform offset,
                    overlapping the selected-action card above. */}
                <motion.div
                  layoutScroll
                  ref={trayScrollRef}
                  className="relative z-[1] flex max-h-[min(760px,calc(100vh-32px))] flex-col overflow-y-auto [overflow-anchor:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >

                <AnimatePresence initial={false} mode="popLayout">
                  {showSuggestions ? (
                    <motion.div
                      key="suggestions"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
                      transition={swapExitTransition}
                      className="relative z-[1] order-1 px-3 pb-2"
                    >
                      <div className="flex items-center justify-between px-1 pb-1">
                        <p className="text-[11px] font-semibold uppercase leading-4 text-white/54">
                          Suggestions
                        </p>
                      </div>

                      <div className="flex flex-col">
                        {visibleSuggestions.map((item) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.title}
                              type="button"
                              aria-label={item.title}
                              aria-pressed={false}
                              onClick={() => selectSuggestion(item)}
                              className="group flex min-h-9 w-full items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.11] active:scale-[0.99]"
                            >
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
                                <Icon className="size-3.5" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium leading-[17px] text-white/88">
                                  {item.title}
                                </span>
                                <span className="block truncate text-[12px] font-medium leading-4 text-white/50">
                                  {item.meta}
                                </span>
                              </span>
                              <span className="flex w-[58px] shrink-0 items-center justify-end text-[12px] font-medium leading-4 text-[#b8d8ff] opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100">
                                {item.action}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : hasSelectedAction && SelectedIcon && !selectedCardDuplicatesApproval && !shouldShowWorkflowTrace ? (
                    <motion.div
                      key="selected-task"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
                      transition={swapExitTransition}
                      className="relative z-[1] order-4 px-3 pb-2"
                    >
                      <div className="flex items-center gap-2 rounded-[14px] bg-white/[0.075] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
                          <SelectedIcon className="size-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium leading-[17px] text-white/88">
                            {activeSuggestion.title}
                          </p>
                          <p className="truncate text-[12px] font-medium leading-4 text-white/50">
                            {activeSuggestion.meta}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {!showSuggestions && shouldShowWorkflowTrace ? (
                    <motion.div
                      key="agent-trace"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
                      transition={swapExitTransition}
                      className="relative z-[1] order-5 px-3 pb-3"
                    >
                      <motion.div layout transition={surfaceTransition} className="relative flex flex-col gap-0.5">
                        {currentSteps.map((step, index) => {
                          const active = index === currentSteps.length - 1;
                          const finished = phase === 'complete';
                          const failed = phase === 'error' && active;
                          const stepStatus = active
                            ? failed
                              ? 'Stopped'
                              : isThinking
                              ? 'In progress'
                              : finished
                                ? 'Done'
                                : isCommitting
                                  ? 'Saving'
                                  : 'Ready'
                            : 'Complete';
                          const rowCompact = traceCompact && (!active || finished);
                          const showStepStatus = !rowCompact;

                          return (
                            <motion.div
                              key={step}
                              /* No `layout` here: it would share the transform
                                 channel with the y enter animation, and an
                                 interrupted pass strands the row offset into
                                 the card above. The list only appends at the
                                 tail, so the enter animation covers it. */
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 5, filter: 'blur(2px)' }}
                              animate={{
                                opacity: rowCompact ? 0.62 : active ? 1 : 0.78,
                                y: 0,
                                filter: 'blur(0px)',
                              }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(2px)' }}
                              transition={traceCompact ? approvalTransition : fadeTransition}
                              className={cn(
                                'relative overflow-hidden grid items-center px-1.5 py-1',
                                'grid-cols-[28px_1fr] gap-2',
                                rowCompact ? 'min-h-7' : active ? 'min-h-10' : 'min-h-8',
                              )}
                            >
                              <span className="relative flex h-full items-center justify-center">
                                <span
                                  className={cn(
                                    'relative z-[1] flex shrink-0 items-center justify-center rounded-full transition-[width,height] duration-150 ease-out',
                                    rowCompact ? 'size-[16px]' : 'size-[18px]',
                                    rowCompact
                                      ? 'bg-white/[0.045] text-white/76 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]'
                                      : failed
                                        ? 'bg-transparent text-[#ffd2cc] shadow-none'
                                      : active && !finished
                                        ? 'bg-white/[0.12] text-[#ffe6a3] shadow-[inset_0_0_0_1px_rgba(255,206,82,0.48)]'
                                        : 'bg-white/[0.08] text-white/72 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]',
                                  )}
                                >
                                  {failed ? (
                                    <CircleAlert className="size-4" aria-hidden />
                                  ) : active && !finished ? (
                                    <LoaderCircle
                                      className={cn(
                                        'size-3.5',
                                        'motion-safe:animate-spin',
                                      )}
                                      aria-hidden
                                    />
                                  ) : (
                                    <Check className={cn(rowCompact ? 'size-3 opacity-80' : 'size-3')} aria-hidden />
                                  )}
                                </span>
                              </span>
                              <span className="min-w-0">
                                <span
                                  className={cn(
                                    'relative block truncate font-medium leading-4',
                                    failed
                                      ? 'text-[12.5px] text-[#ffd2cc]'
                                      : rowCompact
                                        ? 'text-[12px] text-white/68'
                                        : active
                                          ? 'text-[12.5px] text-white/92'
                                          : 'text-[12.5px] text-white/78',
                                    active && phase !== 'complete' && phase !== 'error' ? 'eko-shimmer-text' : '',
                                  )}
                                >
                                  {step}
                                </span>
                                {showStepStatus ? (
                                  <span className="block truncate text-[11px] font-medium leading-[14px] text-white/58">
                                    {stepStatus}
                                  </span>
                                ) : null}
                              </span>
                            </motion.div>
                          );
                        })}
                      </motion.div>

                      {/* popLayout releases the pill's space at exit START; an in-flow
                          exit holds the space while the approval card mounts, then the
                          late layout correction springs the card under the composer. */}
                      <AnimatePresence initial={false} mode="popLayout">
                        {isThinking ? (
                          <motion.div
                            key="thinking"
                            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
                            transition={swapExitTransition}
                            aria-live="polite"
                            className="relative mt-2 flex items-center gap-2 overflow-hidden rounded-full bg-white/[0.075] px-3 py-2 text-[12px] font-medium leading-4 text-white/66 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                          >
                            <DotMatrixAgentLoader state="thinking" className="size-5 shrink-0 text-[#b8d8ff]" />
                            <span className="relative eko-shimmer-text">
                              Thinking through permissions and context
                            </span>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {visibleChatRows.length ? (
                    <motion.div
                      key="eko-history"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
                      transition={swapExitTransition}
                      className="relative z-[1] order-2 space-y-1.5 px-3 pb-2 pt-3"
                    >
                      {visibleChatRows.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                          transition={fadeTransition}
                          className={cn(
                            'flex',
                            item.role === 'user' ? 'justify-end' : 'justify-start',
                          )}
                        >
                          <div
                            className={cn(
                              'max-w-[86%] rounded-[13px] px-2.5 py-1.5 text-[11.5px] font-medium leading-[15px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]',
                              item.role === 'user'
                                ? 'bg-white/[0.14] text-white/82'
                                : item.role === 'action'
                                  ? 'bg-[#ffce52]/[0.10] text-[#ffe6a3]/82'
                                  : item.pending
                                    ? 'bg-[rgba(16,28,51,0.25)] text-white/74'
                                    : 'bg-[rgba(16,28,51,0.22)] text-white/68',
                            )}
                          >
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase leading-3 tracking-[0.02em] text-white/38">
                              {item.role === 'user' ? 'You' : item.role === 'action' ? 'Action' : 'EKO'}
                            </span>
                            {item.pending ? (
                              <span className="flex items-center gap-2">
                                <DotMatrixAgentLoader state="thinking" className="size-5 shrink-0 text-[#d7e8ff]" />
                                <span className="eko-shimmer-text">{item.text}</span>
                              </span>
                            ) : (
                              <span className="block text-pretty break-words">{item.text}</span>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {contextualChatSuggestions.length ? (
                    <motion.div
                      key="eko-context-suggestions"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(2px)' }}
                      transition={fadeTransition}
                      className="relative z-[1] order-3 px-3 pb-2"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {contextualChatSuggestions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectSuggestion(item)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 text-[11px] font-medium leading-3 text-white/68 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/[0.12] hover:text-white/82 active:scale-[0.96]"
                          >
                            <item.icon className="size-3" aria-hidden />
                            {item.action} next
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false} mode="popLayout">
                  {(hasApproval || hasError || demoResponse) ? (
                    <motion.div
                      key="eko-event"
                      // No `layout`: mounting alongside the trace compaction makes the
                      // group correction spring the card up from below — straight through
                      // the sticky composer. The inner layoutId surface still morphs.
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }}
                      transition={surfaceTransition}
                      className="relative z-[1] order-6 px-3 pb-2.5"
                    >
                      <motion.div
                        layoutId="eko-event-surface"
                        layout
                        animate={
                          phase === 'error'
                            ? {
                                backgroundColor: 'rgba(45,18,22,0.28)',
                                boxShadow:
                                  '0 0 0 1px rgba(255,178,168,0.25), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(212,80,62,0.16)',
                              }
                          : phase === 'complete' && !reduceMotion
                            ? {
                                backgroundColor:
                                  approvalStatus === 'approved' || approvalStatus === 'answered'
                                    ? [
                                        'rgba(35,31,28,0.26)',
                                        'rgba(13,122,255,0.3)',
                                        'rgba(9,20,39,0.24)',
                                      ]
                                    : [
                                        'rgba(35,31,28,0.26)',
                                        'rgba(212,80,62,0.26)',
                                        'rgba(9,20,39,0.24)',
                                      ],
                                boxShadow:
                                  approvalStatus === 'approved' || approvalStatus === 'answered'
                                    ? [
                                        '0 0 0 1px rgba(255,206,82,0.28), inset 0 1px 0 rgba(255,255,255,0.11)',
                                        '0 0 0 1px rgba(126,188,255,0.44), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 24px rgba(78,161,255,0.18)',
                                        '0 0 0 1px rgba(184,216,255,0.18), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(78,161,255,0.2)',
                                      ]
                                    : [
                                        '0 0 0 1px rgba(255,206,82,0.28), inset 0 1px 0 rgba(255,255,255,0.11)',
                                        '0 0 0 1px rgba(255,178,168,0.38), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 24px rgba(212,80,62,0.14)',
                                        '0 0 0 1px rgba(184,216,255,0.18), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(78,161,255,0.2)',
                                      ],
                              }
                            : {
                                backgroundColor: 'rgba(35,31,28,0.26)',
                                boxShadow:
                                  '0 0 0 1px rgba(255,206,82,0.28), inset 0 1px 0 rgba(255,255,255,0.11)',
                              }
                        }
                        transition={phase === 'complete' ? pulseTransition : surfaceTransition}
                        className="overflow-hidden rounded-[15px] bg-[rgba(35,31,28,0.26)] p-3 backdrop-blur-xl"
                        aria-live="polite"
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                          {hasApproval ? (
                            <motion.div
                              key="approval-content"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }}
                              transition={approvalTransition}
                            >
                              <div className="mb-1.5 flex items-center justify-between gap-3">
                                <p className="text-[12px] font-medium leading-4 text-[#ffe6a3]">
                                  {approvalTitle}
                                </p>
                                <p className="text-[11px] font-medium leading-3 text-[#ffe6a3]/70">
                                  Risky action
                                </p>
                              </div>
                              <p className="whitespace-pre-line text-[13px] font-medium leading-[17px] text-white/88">
                                {approvalCopy}
                              </p>
                              {shouldCollectWriteDetails ? null : approvalStatus === 'editing' ? (
                                <motion.textarea
                                  ref={editTextareaRef}
                                  layout
                                  rows={3}
                                  value={editValue}
                                  onChange={(event) => setEditValue(event.target.value)}
                                  initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                  transition={fadeTransition}
                                  aria-label="Edit EKO request"
                                  placeholder="Describe the revision"
                                  className="mt-2 w-full resize-none rounded-[12px] bg-white/[0.09] px-2.5 py-2 text-[12px] font-medium leading-4 text-white/84 outline-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.11),inset_0_1px_0_rgba(255,255,255,0.08)] placeholder:text-white/42 focus:bg-white/[0.13] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.17),inset_0_1px_0_rgba(255,255,255,0.1)]"
                                />
                              ) : null}
                              {!shouldCollectWriteDetails ? (
                              <div className="mt-2.5 flex items-center gap-2">
                                {approvalStatus === 'editing' && !shouldCollectWriteDetails ? (
                                  <motion.button
                                    type="button"
                                    onClick={saveEditAction}
                                    disabled={isCommitting || !editValue.trim()}
                                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                                    animate={actionFeedback === 'edit' ? { scale: [1, 1.012, 1] } : { scale: 1 }}
                                    transition={pulseTransition}
                                    className="h-8 rounded-full bg-white px-3 text-[12px] font-medium leading-4 text-[#14213b] transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-[#f5f5f5] disabled:pointer-events-none disabled:opacity-42"
                                  >
                                    Save edit
                                  </motion.button>
                                ) : null}
                                <motion.button
                                  type="button"
                                  onClick={approveAction}
                                  disabled={isCommitting}
                                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                                  animate={
                                    actionFeedback === 'approve'
                                      ? { scale: [1, 1.04, 1], filter: ['blur(0px)', 'blur(0px)', 'blur(0px)'] }
                                      : { scale: 1 }
                                  }
                                  transition={pulseTransition}
                                  className={cn(
                                    'h-8 rounded-full bg-white px-3 text-[12px] font-medium leading-4 text-[#14213b] transition-[background-color,box-shadow,opacity] duration-150 ease-out hover:bg-[#f5f5f5] disabled:pointer-events-none',
                                    approvalStatus === 'editing' ? 'hidden' : '',
                                    approvalStatus === 'approved'
                                      ? 'bg-[#dff5eb] text-[#176b42] shadow-[0_0_0_3px_rgba(51,190,120,0.12)]'
                                      : '',
                                    isCommitting && approvalStatus !== 'approved' ? 'opacity-45' : '',
                                  )}
                                >
                                  {approvalStatus === 'approved' ? 'Approved' : 'Approve'}
                                </motion.button>
                                <motion.button
                                  type="button"
                                  onClick={approvalStatus === 'editing' ? () => {
                                    setApprovalStatus('pending');
                                    setEditValue('');
                                  } : editAction}
                                  disabled={isCommitting}
                                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                                  animate={actionFeedback === 'edit' ? { scale: [1, 1.012, 1] } : { scale: 1 }}
                                  transition={pulseTransition}
                                  className={cn(
                                    'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium leading-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] transition-[background-color,box-shadow,opacity] duration-150 ease-out hover:bg-white/[0.14] disabled:pointer-events-none disabled:opacity-45',
                                    approvalStatus === 'editing'
                                      ? 'bg-white/10 text-white/68'
                                      : 'bg-white/10 text-white/75',
                                  )}
                                >
                                  <Pencil className="size-3" aria-hidden />
                                  {approvalStatus === 'editing' ? 'Cancel' : 'Edit'}
                                </motion.button>
                                <motion.button
                                  type="button"
                                  onClick={rejectAction}
                                  disabled={isCommitting}
                                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                                  animate={actionFeedback === 'reject' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                                  transition={pulseTransition}
                                  className={cn(
                                    'h-8 rounded-full px-3 text-[12px] font-medium leading-4 text-[#ffb2a8] transition-[background-color,box-shadow,opacity] duration-150 ease-out hover:bg-[#d4503e]/[0.16] disabled:pointer-events-none',
                                    approvalStatus === 'rejected'
                                      ? 'bg-[#d4503e]/[0.16] shadow-[0_0_0_3px_rgba(212,80,62,0.12)]'
                                      : '',
                                    isCommitting && approvalStatus !== 'rejected' ? 'opacity-45' : '',
                                  )}
                                >
                                  {approvalStatus === 'rejected' ? 'Rejected' : 'Reject'}
                                </motion.button>
                              </div>
                              ) : null}
                            </motion.div>
                          ) : hasError && agentError ? (
                            <motion.div
                              key="error-content"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(2px)' }}
                              transition={approvalTransition}
                              className="flex items-start gap-2"
                            >
                              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-[#ffd2cc]">
                                <CircleAlert className="size-4" aria-hidden />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12.5px] font-semibold leading-4 text-[#ffd2cc]">
                                  {agentError.title}
                                </p>
                                <p className="mt-0.5 text-[12px] font-medium leading-4 text-white/62">
                                  {agentError.message}
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                  <motion.button
                                    type="button"
                                    onClick={retryFailedAction}
                                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-2.5 text-[11.5px] font-medium leading-3 text-[#14213b] transition-[background-color,transform] duration-150 ease-out hover:bg-[#f5f5f5]"
                                  >
                                    <RotateCcw className="size-3" aria-hidden />
                                    Retry
                                  </motion.button>
                                  <button
                                    type="button"
                                    onClick={dismissError}
                                    className="h-7 rounded-full px-2.5 text-[11.5px] font-medium leading-3 text-white/62 transition-[background-color,color] duration-150 ease-out hover:bg-white/10 hover:text-white"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="response-content"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(2px)' }}
                              transition={approvalTransition}
                              className="min-w-0"
                            >
                              <div className="flex items-center gap-2">
                                <DotMatrixAgentLoader
                                  state={responseIconState}
                                  className="size-5 shrink-0 text-[#b8d8ff]"
                                />
                                <p className="min-w-0 text-[12.5px] font-medium leading-4 text-white/76">
                                  {demoResponse}
                                </p>
                              </div>
                              {writeReceipt && writeReceipt.reply === demoResponse ? (
                                <button
                                  type="button"
                                  onClick={viewWriteReceipt}
                                  aria-label={`View ${writeReceipt.target.name} on the board`}
                                  className="group mt-2 flex min-h-9 w-full items-center gap-2 rounded-[12px] bg-white/[0.055] px-2.5 py-1.5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.11] active:scale-[0.99]"
                                >
                                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[#b8d8ff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
                                    <Check className="size-3.5" aria-hidden />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium leading-[17px] text-white/88">
                                      {writeReceipt.target.name}
                                    </span>
                                    <span className="block truncate text-[12px] font-medium leading-4 text-white/50">
                                      {writeReceipt.target.action === 'create'
                                        ? 'Created'
                                        : writeReceipt.target.action === 'status'
                                          ? 'Status updated'
                                          : writeReceipt.target.action === 'assignee'
                                            ? 'Reassigned'
                                            : writeReceipt.target.action === 'priority'
                                              ? 'Priority updated'
                                              : 'Due date updated'}
                                      {writeReceipt.target.taskNumber != null
                                        ? ` · #${writeReceipt.target.taskNumber}`
                                        : ''}
                                    </span>
                                  </span>
                                  <span className="flex w-[58px] shrink-0 items-center justify-end text-[12px] font-medium leading-4 text-[#b8d8ff] opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100">
                                    View
                                  </span>
                                </button>
                              ) : null}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {shouldCollectWriteDetails ? (
                    <motion.form
                      key="write-details-drawer"
                      layout
                      onSubmit={(event) => {
                        event.preventDefault();
                        advanceWriteDetails();
                      }}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 46, scale: 0.985, filter: 'blur(5px)' }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.99, filter: 'blur(3px)' }}
                      transition={drawerTransition}
                      style={{ transformOrigin: '50% 100%' }}
                      aria-label="Issue details drawer"
                      className={cn(
                        'sticky bottom-0 z-30 order-7 mt-auto flex max-h-[min(560px,calc(100dvh-112px))] flex-col overflow-y-auto rounded-t-[26px] bg-[rgba(24,34,52,0.68)] px-4 pb-10 pt-4 shadow-[0_-22px_56px_rgba(8,16,31,0.26),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                        writeDetailsDrawerClass,
                      )}
                    >
                      <div className="mb-2 flex items-center gap-1 rounded-full bg-white/[0.055] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                        {writeDetailsSteps.map((step, index) => {
                          const active = step.id === writeDetailsStep;
                          const complete = index < writeDetailsStepIndex;
                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => {
                                if (index <= writeDetailsStepIndex || complete) {
                                  setEditError('');
                                  setWriteDetailsStep(step.id);
                                }
                              }}
                              className={cn(
                                'relative h-7 min-w-0 flex-1 rounded-full px-1.5 text-[10.5px] font-semibold leading-3 transition-[color,opacity] duration-150 ease-out',
                                active ? 'text-[#14213b]' : complete ? 'text-white/72' : 'text-white/36',
                              )}
                            >
                              {active ? (
                                <motion.span
                                  layoutId="eko-write-details-active-step"
                                  transition={approvalTransition}
                                  className="absolute inset-0 rounded-full bg-white shadow-[0_8px_18px_rgba(8,18,35,0.14)]"
                                />
                              ) : null}
                              <span className="relative z-[1] truncate">{step.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2">
                        <div>
                          <p className="text-[12.5px] font-semibold leading-4 text-white/92">
                            {writeDetailsStepMeta.title}
                          </p>
                          <p className="mt-0.5 text-[11.5px] font-medium leading-4 text-white/58">
                            {writeDetailsStepMeta.detail}
                          </p>
                        </div>
                      </div>

                      <div className={cn('mt-4', writeDetailsBodyClass)}>
                        <AnimatePresence initial={false} mode="popLayout">
                          {writeDetailsStep === 'title' ? (
                            <motion.div
                              key="write-title-step"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 18, filter: 'blur(3px)' }}
                              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, filter: 'blur(3px)' }}
                              transition={approvalTransition}
                            >
                              <label className="sr-only" htmlFor="eko-write-title">
                                Issue title
                              </label>
                              <input
                                id="eko-write-title"
                                value={pendingWriteDraft.title}
                                onChange={(event) => {
                                  setEditError('');
                                  setPendingWriteDraft((draft) => ({ ...draft, title: event.target.value }));
                                }}
                                placeholder="Issue title"
                                className="h-12 w-full rounded-[16px] bg-white/[0.08] px-3 text-[13px] font-medium leading-4 text-white/88 outline-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.11),inset_0_1px_0_rgba(255,255,255,0.08)] placeholder:text-white/42 focus:bg-white/[0.12] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),inset_0_1px_0_rgba(255,255,255,0.1)]"
                              />
                            </motion.div>
                          ) : writeDetailsStep === 'review' ? (
                            <motion.div
                              key="write-review-step"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 18, filter: 'blur(3px)' }}
                              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, filter: 'blur(3px)' }}
                              transition={approvalTransition}
                              className="grid gap-1.5"
                            >
                              {[
                                ['Name', pendingWriteDraft.title || 'Not set'],
                                ['Status', pendingWriteDraft.status || 'Not set'],
                                ['Priority', pendingWriteDraft.priority || 'Not set'],
                                ['Due', pendingWriteDraft.dueDate || 'No date'],
                              ].map(([label, value]) => (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() => setWriteDetailsStep(label === 'Name' ? 'title' : label === 'Due' ? 'dueDate' : label.toLowerCase() as WriteDetailsStep)}
                                  className="grid grid-cols-[74px_1fr] items-center rounded-[13px] bg-white/[0.07] px-2.5 py-1.5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-[background-color] duration-150 ease-out hover:bg-white/[0.1]"
                                >
                                  <span className="text-[10.5px] font-semibold uppercase leading-3 tracking-[0.08em] text-white/38">
                                    {label}
                                  </span>
                                  <span className="truncate text-right text-[12.5px] font-medium leading-4 text-white/84">
                                    {value}
                                  </span>
                                </button>
                              ))}
                            </motion.div>
                          ) : (
                            <motion.div
                              key={`write-${writeDetailsStep}-step`}
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 18, filter: 'blur(3px)' }}
                              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, filter: 'blur(3px)' }}
                              transition={approvalTransition}
                              className="grid grid-cols-2 gap-2.5"
                            >
                              {(writeDetailsStep === 'status'
                                ? writeStatusOptions
                                : writeDetailsStep === 'priority'
                                  ? writePriorityOptions
                                  : writeDueDateOptions
                              ).map((option) => {
                                const selected =
                                  writeDetailsStep === 'status'
                                    ? pendingWriteDraft.status === option
                                    : writeDetailsStep === 'priority'
                                      ? pendingWriteDraft.priority === option
                                      : pendingWriteDraft.dueDate === option;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => selectWriteDetail(writeDetailsStep as Exclude<WriteDetailsStep, 'title' | 'review'>, option)}
                                    className={cn(
                                      'min-h-12 rounded-[15px] px-3 text-[12.5px] font-semibold leading-4 transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96]',
                                      selected
                                        ? cn('bg-white text-[#14213b]', writeDetailsStep === 'priority' ? priorityEdgeClass(option, true) : 'shadow-[0_8px_20px_rgba(8,18,35,0.14)]')
                                        : cn('bg-white/[0.075] text-white/70 hover:bg-white/[0.12] hover:text-white/88', writeDetailsStep === 'priority' ? priorityEdgeClass(option, false) : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]'),
                                    )}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {editError ? (
                        <p className="mt-2 text-[11.5px] font-medium leading-4 text-[#ffd2cc]">
                          {editError}
                        </p>
                      ) : null}
                      <div className="mt-auto flex shrink-0 items-center gap-3 pb-1 pt-8">
                        {writeDetailsStepIndex > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditError('');
                              setWriteDetailsStep(writeDetailsSteps[writeDetailsStepIndex - 1]?.id ?? 'title');
                            }}
                            className="h-9 rounded-full bg-white/[0.08] px-3.5 text-[12.5px] font-medium leading-4 text-white/68 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.13] hover:text-white/84"
                          >
                            Back
                          </button>
                        ) : null}
                        <motion.button
                          type="submit"
                          disabled={!writeDetailsStepMeta.complete}
                          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                          className="h-9 rounded-full bg-white px-3.5 text-[12.5px] font-semibold leading-4 text-[#14213b] transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-[#f5f5f5] disabled:pointer-events-none disabled:opacity-42"
                        >
                          {writeDetailsStep === 'review' ? 'Prepare approval' : 'Continue'}
                        </motion.button>
                        <button
                          type="button"
                          onClick={cancelWriteDetails}
                          className="h-9 rounded-full px-2.5 text-[12.5px] font-medium leading-4 text-white/58 transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.1] hover:text-white/78"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.form>
                  ) : null}
                </AnimatePresence>

                <div ref={trayEndRef} className="order-8 h-px" />

                {!shouldCollectWriteDetails ? (
                <div className="sticky bottom-0 z-20 order-9 px-3 pb-3 pt-3">
                  <form
                    onSubmit={submitPrompt}
                    className="flex h-9 w-full items-center gap-2 rounded-full bg-[rgba(12,25,48,0.28)] px-3.5 text-left text-[12px] font-medium leading-[16px] text-white/58 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-[background-color,box-shadow,transform] duration-150 ease-out focus-within:bg-white/[0.11] focus-within:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),inset_0_1px_0_rgba(255,255,255,0.09)]"
                  >
                    <input
                      aria-label="Ask EKO"
                      value={composerValue}
                      onChange={(event) => setComposerValue(event.target.value)}
                      placeholder="Ask about tasks or investor status"
                      disabled={isThinking || isCommitting}
                      className="min-w-0 flex-1 bg-transparent text-[12px] font-medium leading-[16px] text-white/78 outline-none placeholder:text-white/48 disabled:cursor-not-allowed disabled:text-white/38"
                    />
                    <button
                      type="submit"
                      aria-label="Send message"
                      disabled={isThinking || isCommitting}
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-white/50 transition-[background-color,color,opacity,transform] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.96] disabled:pointer-events-none disabled:opacity-38"
                    >
                      <Send className="size-3.5" aria-hidden />
                    </button>
                  </form>
                </div>
                ) : null}
                </motion.div>
              </div>
              </motion.div>
          ) : !expanded ? (
            <motion.button
              key="studio-companion-dock"
              layout
              type="button"
              aria-expanded="false"
              aria-label="Open EKO"
              onClick={openCompanion}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: 'blur(1px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)', transition: morphEnterTransition }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, filter: 'blur(1px)', transition: morphExitTransition }
              }
              transition={dockTransition}
              className="relative z-[2] flex h-11 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium leading-[17px] text-white"
            >
              <motion.span
                layoutId="studio-companion-icon"
                className="relative z-[2] flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                transition={dockTransition}
              >
                <DotMatrixAgentLoader state="idle" className="size-5 text-white" />
              </motion.span>
              <span className="relative z-[2] hidden sm:inline">Ask EKO</span>
            </motion.button>
          ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </LayoutGroup>
  );
}

function DotMatrixAgentLoader({
  className,
  state = 'thinking',
}: {
  className?: string;
  state?: AgentIconState;
}) {
  const baseId = useId().replace(/:/g, '');
  const dimId = `${baseId}-dim`;
  const litId = `${baseId}-lit`;
  const stateClass = `agent-dotmatrix-${state}`;
  const stateTitle =
    state === 'error'
      ? 'Error'
    : state === 'permission'
      ? 'Permission required'
      : state === 'finished'
        ? 'Finished'
        : state === 'working'
          ? 'Working'
          : state === 'idle'
            ? 'Idle'
            : 'Thinking';
  const activeDotsByState: Record<AgentIconState, Array<[number, number, number]>> = {
    idle: [
      [17, 17, 0],
      [28, 17, 90],
      [39, 17, 180],
      [17, 28, 270],
      [28, 28, 360],
      [39, 28, 450],
      [17, 39, 540],
      [28, 39, 630],
      [39, 39, 720],
    ],
    thinking: [
      [28, 6, 0],
      [17, 17, 90],
      [28, 17, 180],
      [39, 17, 270],
      [6, 28, 360],
      [17, 28, 450],
      [28, 28, 540],
      [39, 28, 630],
      [50, 28, 720],
      [17, 39, 810],
      [28, 39, 900],
      [39, 39, 990],
      [28, 50, 1080],
    ],
    working: [
      [6, 17, 0],
      [17, 17, 80],
      [28, 17, 160],
      [39, 17, 240],
      [50, 17, 320],
      [17, 28, 400],
      [28, 28, 480],
      [39, 28, 560],
      [6, 39, 640],
      [17, 39, 720],
      [28, 39, 800],
      [39, 39, 880],
      [50, 39, 960],
    ],
    finished: [
      [6, 28, 0],
      [17, 39, 80],
      [28, 50, 160],
      [28, 39, 240],
      [39, 28, 320],
      [50, 17, 400],
    ],
    permission: [
      [28, 6, 0],
      [17, 17, 80],
      [28, 17, 160],
      [39, 17, 240],
      [17, 28, 320],
      [28, 28, 400],
      [39, 28, 480],
      [17, 39, 560],
      [39, 39, 640],
      [28, 50, 720],
    ],
    error: [
      [17, 17, 0],
      [39, 17, 90],
      [28, 28, 180],
      [17, 39, 270],
      [39, 39, 360],
    ],
  };
  const activeDots = activeDotsByState[state];

  return (
    <svg
      className={cn('agent-dotmatrix', stateClass, className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 56 56"
      role="img"
      aria-label={stateTitle}
    >
      <title>{stateTitle}</title>
      <desc>Dot matrix status indicator for EKO.</desc>
      <defs>
        <circle id={dimId} r="2.4" fill="currentColor" opacity="0.11" />
        <circle id={litId} r="3.1" fill="currentColor" />
      </defs>
      <style>
        {`
          .agent-dotmatrix .agent-dotmatrix-lit {
            opacity: 0.32;
            transform-box: fill-box;
            transform-origin: center;
            animation: agent-dotmatrix-idle 2200ms cubic-bezier(0.65, 0, 0.35, 1) infinite both;
          }
          .agent-dotmatrix-thinking .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-thinking;
            animation-duration: 980ms;
          }
          .agent-dotmatrix-working .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-working;
            animation-duration: 1100ms;
          }
          .agent-dotmatrix-finished .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-finished;
            animation-duration: 1650ms;
          }
          .agent-dotmatrix-permission .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-permission;
            animation-duration: 1450ms;
          }
          .eko-shimmer-text {
            color: rgba(255,255,255,0.82);
            text-shadow:
              0 1px 0 rgba(255,255,255,0.08),
              0 0 0 rgba(255,255,255,0);
            animation: eko-shimmer-text 2600ms ease-in-out infinite;
          }
          @keyframes agent-dotmatrix-idle {
            0%, 100% { opacity: 0.22; transform: scale(0.82); }
            48% { opacity: 0.58; transform: scale(1); }
          }
          @keyframes agent-dotmatrix-thinking {
            0% { opacity: 0.12; transform: scale(0.76); }
            35% { opacity: 1; transform: scale(1.04); }
            64% { opacity: 0.22; transform: scale(0.86); }
            100% { opacity: 0.12; transform: scale(0.76); }
          }
          @keyframes agent-dotmatrix-working {
            0%, 100% { opacity: 0.2; transform: translateY(0) scale(0.82); }
            42% { opacity: 0.95; transform: translateY(-1px) scale(1); }
            68% { opacity: 0.38; transform: translateY(0) scale(0.9); }
          }
          @keyframes agent-dotmatrix-finished {
            0%, 100% { opacity: 0.34; transform: scale(0.88); }
            45% { opacity: 0.88; transform: scale(1.04); }
          }
          @keyframes agent-dotmatrix-permission {
            0%, 100% { opacity: 0.28; transform: scale(0.84); }
            35% { opacity: 0.92; transform: scale(1); }
            70% { opacity: 0.42; transform: scale(0.9); }
          }
          @keyframes eko-shimmer-text {
            0%, 100% {
              color: rgba(255,255,255,0.76);
              text-shadow:
                0 1px 0 rgba(255,255,255,0.06),
                0 0 0 rgba(255,255,255,0);
            }
            42% {
              color: rgba(255,255,255,0.96);
              text-shadow:
                0 1px 0 rgba(255,255,255,0.16),
                0 0 16px rgba(216,235,255,0.24);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .agent-dotmatrix .agent-dotmatrix-lit {
              animation: none;
              opacity: 0.45;
            }
            .eko-shimmer-text {
              animation: none;
            }
            .eko-shimmer-text {
              color: rgba(255,255,255,0.84);
              background: none;
              text-shadow: 0 1px 0 rgba(255,255,255,0.08);
            }
          }
        `}
      </style>
      {[6, 17, 28, 39, 50].map((y) =>
        [6, 17, 28, 39, 50].map((x) => <use key={`${x}-${y}`} href={`#${dimId}`} x={x} y={y} />),
      )}
      {activeDots.map(([x, y, delay]) => (
        <use
          key={`${x}-${y}-${delay}`}
          className="agent-dotmatrix-lit"
          href={`#${litId}`}
          x={x}
          y={y}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </svg>
  );
}
