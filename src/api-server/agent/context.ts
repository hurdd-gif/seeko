/**
 * EKO dashboard context builder — the orchestrator's read layer
 * (docs/plans/2026-07-03-agent-companion-design.md).
 *
 * Composes a compact, token-conscious text context from the same loaders the
 * dashboard pages use (loadTasksBoard / loadDocsIndex / loadPaymentsIndex),
 * plus two small direct reads (full profiles roster, notes inbox), and appends
 * the EKO_CAPABILITIES manifest so the model knows exactly which typed gated
 * tools exist.
 *
 * COMPATIBILITY: routes/agent.ts parses this text with line-prefix regexes
 * (parseDashboardTaskIndex, parseStaffIndex, parseContextTasks). The following
 * line shapes are load-bearing and must not change:
 *   - `Staff: Name (…); Name2 (…).`
 *   - `In progress: …` / `Risk queue: …` / `In review: …` /
 *     `Recent activity task details: …` where each entry is
 *     `Task Name (Status, …, due YYYY-MM-DD, assigned to X)` joined by `; `.
 *
 * Every section is individually guarded: one failed loader degrades to a
 * `<Section> context: unavailable (…).` line instead of throwing.
 */

import { loadTasksBoard, type TasksBoardData } from '@/lib/tasks-board';
import { loadDocsIndex, type DocsIndexData } from '@/lib/docs-index';
import { loadPaymentsIndex, type PaymentsIndexData } from '@/lib/payments-index';
import { getServiceClient } from '@/lib/supabase/service';
import type { Area, Milestone, TaskWithAssignee } from '@/lib/types';

export type AgentContextUser = {
  id: string;
  email?: string | null;
};

export type AgentRosterEntry = {
  id: string;
  displayName: string | null;
  department: string | null;
  role: string | null;
  isAdmin: boolean;
  isInvestor: boolean;
  isContractor: boolean;
};

export type AgentNotesSnapshot = {
  openCount: number;
  recent: {
    body: string;
    source: string | null;
    createdAt: string | null;
  }[];
};

type SectionKey = 'roster' | 'board' | 'notes' | 'docs' | 'payments';

export type AgentContextData = {
  roster: AgentRosterEntry[] | null;
  board: TasksBoardData | null;
  notes: AgentNotesSnapshot | null;
  docs: DocsIndexData | null;
  payments: PaymentsIndexData | null;
  /** Optional per-section failure reasons, surfaced in the unavailable lines. */
  reasons?: Partial<Record<SectionKey, string>>;
};

export type AgentContextLoaders = {
  loadBoard: (user: AgentContextUser) => Promise<TasksBoardData>;
  loadRoster: (user: AgentContextUser) => Promise<AgentRosterEntry[]>;
  loadNotes: (user: AgentContextUser) => Promise<AgentNotesSnapshot>;
  loadDocs: (user: AgentContextUser) => Promise<DocsIndexData>;
  loadPayments: (user: AgentContextUser) => Promise<PaymentsIndexData>;
};

/**
 * Single source of truth for what EKO can actually do. Injected at the end of
 * every dashboard context so the model stops proposing actions it can't
 * execute. Keep in sync with the typed tools in routes/agent.ts.
 */
export const EKO_CAPABILITIES = [
  'EKO capabilities (never promise beyond this list):',
  'Typed write tools, ALL gated behind explicit user approval and admin permissions:',
  '- issue.create: create an issue (requires title, status, priority, due date).',
  '- issue.update (status): move an existing issue to another status.',
  '- issue.update (assign): assign an existing issue to a roster member.',
  '- issue.update (priority): change an existing issue priority.',
  '- issue.update (due date): set or clear an existing issue due date.',
  '- issue.delete: delete an existing issue (destructive; always requires approval).',
  '- doc.create: create doc/deck.',
  '- doc.update: replace text doc content.',
  '- doc.delete: delete doc/deck.',
  '- note.create: add inbox note',
  '- note.archive: archive one open inbox note.',
  'Read-only knowledge: team roster, areas, milestones, issues, activity, notes, docs index, payments (admins only).',
  'Not supported yet (do not improvise or imply): editing deck slides, emails/invites, creating or marking payments, editing milestones or areas, changing issue descriptions, publishing.',
  'If asked for an unsupported write: say EKO cannot do that yet, then offer the closest supported action or point to the dashboard UI. Never claim a write happened unless an approved action was executed.',
].join('\n');

// ---------------------------------------------------------------------------
// Section formatters (pure — unit-testable without Supabase)
// ---------------------------------------------------------------------------

const LIST_JOIN = '; ';

function truncateList(items: string[], max: number): string[] {
  if (items.length <= max) return items;
  return [...items.slice(0, max), `…and ${items.length - max} more`];
}

function truncateText(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function formatAgo(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = now.getTime() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function daysOverdue(dateIso: string, now: Date): number {
  const target = Date.parse(dateIso);
  if (Number.isNaN(target)) return 0;
  // UTC day buckets — deterministic regardless of server timezone (dates in
  // the DB are date-only strings that parse as UTC midnight).
  return Math.floor(now.getTime() / 86_400_000) - Math.floor(target / 86_400_000);
}

export function isTaskOverdue(
  deadline: string | undefined | null,
  status: string | null | undefined,
  now: Date,
): boolean {
  if (!deadline || status === 'Done' || status === 'Canceled' || status === 'Duplicate') return false;
  return daysOverdue(deadline, now) > 0;
}

function taskRef(task: TaskWithAssignee): string | null {
  // The board renders bare task numbers (TaskCard.tsx) — no DIH- prefix exists
  // in the product, so EKO must not invent one.
  return typeof task.task_number === 'number' ? `#${task.task_number}` : null;
}

/**
 * Task entry formatter. Meta order matters: status must stay first so
 * routes/agent.ts's parseDashboardTaskIndex keeps reading it as the status.
 */
function formatTask(task: TaskWithAssignee, now: Date): string {
  const flags = [
    task.status,
    taskRef(task),
    task.priority ? `${task.priority} priority` : null,
    isTaskOverdue(task.deadline, task.status, now) ? 'overdue' : null,
    task.deadline ? `due ${task.deadline}` : null,
    task.assignee?.display_name ? `assigned to ${task.assignee.display_name}` : null,
  ].filter(Boolean);
  return `${task.name}${flags.length ? ` (${flags.join(', ')})` : ''}`;
}

export function formatTeamSection(roster: AgentRosterEntry[]): string {
  const staff = roster.filter((member) => !member.isInvestor);
  const investors = roster.filter((member) => member.isInvestor);

  const formatMember = (member: AgentRosterEntry) => {
    const meta = [
      member.department,
      member.role,
      member.isAdmin ? 'admin' : null,
      member.isContractor ? 'contractor' : null,
    ].filter(Boolean);
    return `${member.displayName ?? 'Unnamed'}${meta.length ? ` (${meta.join(', ')})` : ''}`;
  };

  return [
    `Team context: ${staff.length} staff, ${investors.length} investors.`,
    staff.length
      ? `Staff: ${truncateList(staff.map(formatMember), 12).join(LIST_JOIN)}.`
      : 'Staff: no roster entries visible.',
    investors.length
      ? `Investors: ${truncateList(investors.map((member) => member.displayName ?? 'Unnamed'), 6).join(LIST_JOIN)}.`
      : null,
  ].filter(Boolean).join('\n');
}

export function formatAreasSection(areas: Area[], milestones: Milestone[], now: Date): string {
  const formatArea = (area: Area) => {
    const meta = [
      area.status,
      area.phase,
      typeof area.progress === 'number' ? `${area.progress}%` : null,
    ].filter(Boolean);
    return `${area.name}${meta.length ? ` (${meta.join(', ')})` : ''}`;
  };
  const formatMilestone = (milestone: Milestone) => {
    const overdueBy = milestone.target_date ? daysOverdue(milestone.target_date, now) : 0;
    const meta = [
      milestone.health ?? null,
      milestone.target_date ? `due ${milestone.target_date}` : null,
      milestone.target_date && overdueBy > 0 ? `overdue by ${overdueBy}d` : null,
    ].filter(Boolean);
    return `${milestone.name}${meta.length ? ` (${meta.join(', ')})` : ''}`;
  };

  return [
    areas.length
      ? `Areas: ${truncateList(areas.map(formatArea), 10).join(LIST_JOIN)}.`
      : 'Areas: no areas visible.',
    milestones.length
      ? `Milestones: ${truncateList(milestones.map(formatMilestone), 8).join(LIST_JOIN)}.`
      : 'Milestones: no milestones visible.',
  ].join('\n');
}

export function formatIssuesSection(data: TasksBoardData, now: Date): string {
  const statusCounts = new Map<string, number>();
  for (const task of data.tasks) {
    statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
  }
  const counts = [...statusCounts.entries()]
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');

  const overdueTasks = data.tasks.filter((task) => isTaskOverdue(task.deadline, task.status, now));
  const unassignedHighPriority = data.tasks.filter(
    (task) =>
      !task.assignee_id &&
      !task.assignee &&
      (task.priority === 'Urgent' || task.priority === 'High') &&
      task.status !== 'Done' &&
      task.status !== 'Canceled' &&
      task.status !== 'Duplicate',
  );

  const format = (task: TaskWithAssignee) => formatTask(task, now);
  const inProgressTasks = data.tasks.filter((task) => task.status === 'In Progress').map(format);
  const riskTasks = data.tasks
    .filter(
      (task) =>
        isTaskOverdue(task.deadline, task.status, now) ||
        task.priority === 'Urgent' ||
        task.priority === 'High' ||
        task.status === 'Backlog',
    )
    .map(format);
  const reviewTasks = data.tasks.filter((task) => task.status === 'In Review').map(format);

  // Full compact index — the ONLY line guaranteed to name every open task.
  // The queue lines below are filtered views (a plain Todo task appears in
  // none of them), and routes/agent.ts resolves delete/update targets by
  // scanning these lines, so without this index those tasks are untargetable.
  const allIssues = data.tasks.map(
    (task) =>
      `${typeof task.task_number === 'number' ? `#${task.task_number} ` : ''}${task.name} (${task.status})`,
  );

  return [
    `Issues context: ${data.tasks.length} tasks, ${overdueTasks.length} overdue, ${data.team.length} staff, ${data.areas.length} areas, ${data.projectMilestones.length} milestones. Task identifiers like #12 refer to the issue's task number; the dashboard shows the bare number.`,
    counts ? `Task counts by status: ${counts}.` : 'Task counts by status: none.',
    allIssues.length
      ? `All issues: ${truncateList(allIssues, 60).join(LIST_JOIN)}.`
      : 'All issues: none.',
    inProgressTasks.length
      ? `In progress: ${truncateList(inProgressTasks, 8).join(LIST_JOIN)}.`
      : 'In progress: no tasks currently visible.',
    riskTasks.length
      ? `Risk queue: ${truncateList(riskTasks, 6).join(LIST_JOIN)}.`
      : 'Risk queue: no urgent, high-priority, backlog, or overdue tasks visible.',
    reviewTasks.length
      ? `In review: ${truncateList(reviewTasks, 4).join(LIST_JOIN)}.`
      : 'In review: no tasks currently visible.',
    overdueTasks.length
      ? `Overdue: ${truncateList(overdueTasks.map(format), 6).join(LIST_JOIN)}.`
      : 'Overdue: none.',
    unassignedHighPriority.length
      ? `Unassigned high priority: ${truncateList(unassignedHighPriority.map(format), 5).join(LIST_JOIN)}.`
      : null,
    data.account.notifications.length
      ? `Notifications: ${data.account.unreadCount} unread; ${truncateList(data.account.notifications.map((notification) => notification.title), 5).join(LIST_JOIN)}.`
      : 'Notifications: none visible.',
  ].filter(Boolean).join('\n');
}

export function formatActivitySection(data: TasksBoardData, now: Date): string {
  const entries = data.projectActivity.slice(0, 10).map((activity) => {
    const label = activity.kind ?? activity.action;
    const ago = formatAgo(activity.created_at, now);
    return `${label}: ${activity.target}${ago ? ` (${ago})` : ''}`;
  });

  // Compat line consumed by routes/agent.ts's context parsers — full task
  // metadata for tasks referenced in recent activity.
  const activityTaskDetails = data.projectActivity
    .slice(0, 8)
    .map((activity) => data.tasks.find((task) => task.name.toLowerCase() === activity.target.toLowerCase()))
    .filter((task, index, tasks): task is TaskWithAssignee => {
      if (!task) return false;
      return tasks.findIndex((item) => item?.id === task.id) === index;
    })
    .slice(0, 5)
    .map((task) => formatTask(task, now));

  return [
    entries.length
      ? `Recent activity: ${entries.join(LIST_JOIN)}.`
      : 'Recent activity: no recent activity visible.',
    activityTaskDetails.length
      ? `Recent activity task details: ${activityTaskDetails.join(LIST_JOIN)}.`
      : null,
  ].filter(Boolean).join('\n');
}

export function formatNotesSection(notes: AgentNotesSnapshot, now: Date): string {
  const recent = notes.recent.slice(0, 3).map((note) => {
    const meta = [note.source, formatAgo(note.createdAt, now)].filter(Boolean);
    return `"${truncateText(note.body, 80)}"${meta.length ? ` (${meta.join(', ')})` : ''}`;
  });

  return notes.openCount
    ? `Notes inbox: ${notes.openCount} open. Newest: ${recent.join(LIST_JOIN)}.`
    : 'Notes inbox: empty.';
}

export function formatDocsSection(data: DocsIndexData): string {
  const visibleDocs = data.docs.filter((doc) => !doc.locked);
  const lockedDocs = data.docs.filter((doc) => doc.locked);

  return [
    `Docs context: ${data.docCount} docs, ${data.deckCount} decks, ${data.lockedCount} locked.`,
    visibleDocs.length
      ? `Accessible docs: ${truncateList(visibleDocs.map((doc) => `${doc.title}${doc.type === 'deck' ? ' (deck)' : ''}`), 10).join(LIST_JOIN)}.`
      : 'Accessible docs: none visible.',
    lockedDocs.length
      ? `Locked docs: ${truncateList(lockedDocs.map((doc) => doc.title), 6).join(LIST_JOIN)}.`
      : 'Locked docs: none visible.',
  ].join('\n');
}

export function formatPaymentsSection(data: PaymentsIndexData): string {
  const monthly = (data.monthlyPaid ?? [])
    .slice(0, 3)
    .map((entry) => `${entry.month}: ${entry.paidCount} paid totaling ${entry.paidTotal}`);

  return [
    `Payments context: ${data.stats.peopleOwed} people owed, ${data.stats.paymentsThisMonth} payments this month, pending total ${data.stats.pendingTotal} ${data.recentPaid[0]?.currency ?? 'USD'}, paid this month ${data.stats.paidThisMonth}.`,
    monthly.length ? `Paid by month: ${monthly.join(LIST_JOIN)}.` : null,
    data.people.length
      ? `Payment roster: ${truncateList(data.people.slice(0, 8).map((person) => `${person.displayName ?? 'Unnamed'}${person.pendingAmount ? ` pending ${person.pendingAmount}` : ''}`), 8).join(LIST_JOIN)}.`
      : 'Payment roster: none visible.',
    data.pendingRequests.length
      ? `Pending payment requests: ${truncateList(data.pendingRequests.slice(0, 5).map((payment) => `${payment.recipientEmail ?? payment.description ?? payment.id} ${payment.amount}`), 5).join(LIST_JOIN)}.`
      : 'Pending payment requests: none visible.',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function unavailableLine(section: string, reason?: string): string {
  return reason ? `${section} context: unavailable (${reason}).` : `${section} context: unavailable.`;
}

function guardSection(section: string, reason: string | undefined, format: () => string | null): string {
  try {
    return format() ?? unavailableLine(section, reason);
  } catch (error) {
    return unavailableLine(section, error instanceof Error ? error.message : 'formatting failed');
  }
}

/**
 * Pure composition step: turns already-loaded (or failed) section data into
 * the final context text, capabilities manifest included. `now` is injectable
 * for deterministic tests.
 */
export function composeAgentContext(data: AgentContextData, now: Date = new Date()): string {
  const reasons = data.reasons ?? {};

  const sections = [
    // Grounds relative-time reasoning ("last month", "overdue since…").
    `Current date: ${now.toISOString().slice(0, 10)}.`,
    guardSection('Team', reasons.roster, () => (data.roster ? formatTeamSection(data.roster) : null)),
    guardSection('Issues', reasons.board, () => (data.board ? formatIssuesSection(data.board, now) : null)),
    guardSection('Areas', reasons.board, () =>
      data.board ? formatAreasSection(data.board.areas, data.board.projectMilestones, now) : null,
    ),
    guardSection('Activity', reasons.board, () => (data.board ? formatActivitySection(data.board, now) : null)),
    guardSection('Notes', reasons.notes, () => (data.notes ? formatNotesSection(data.notes, now) : null)),
    guardSection('Docs', reasons.docs, () => (data.docs ? formatDocsSection(data.docs) : null)),
    guardSection('Payments', reasons.payments, () => (data.payments ? formatPaymentsSection(data.payments) : null)),
    EKO_CAPABILITIES,
  ];

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Default loaders (live Supabase reads — not exercised by unit tests)
// ---------------------------------------------------------------------------

async function loadRosterFromSupabase(): Promise<AgentRosterEntry[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select('id, display_name, department, role, is_admin, is_investor, is_contractor')
    .order('display_name', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name ?? null,
    department: row.department ?? null,
    role: row.role ?? null,
    isAdmin: Boolean(row.is_admin),
    isInvestor: Boolean(row.is_investor),
    isContractor: Boolean(row.is_contractor),
  }));
}

async function loadNotesFromSupabase(): Promise<AgentNotesSnapshot> {
  const service = getServiceClient();
  const [countResult, recentResult] = await Promise.all([
    service.from('notes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    service
      .from('notes')
      .select('id, body, source, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(3),
  ]);
  if (countResult.error) throw countResult.error;
  if (recentResult.error) throw recentResult.error;

  return {
    openCount: countResult.count ?? 0,
    recent: (recentResult.data ?? []).map((row) => ({
      body: row.body ?? '',
      source: row.source ?? null,
      createdAt: row.created_at ?? null,
    })),
  };
}

const defaultLoaders: AgentContextLoaders = {
  loadBoard: (user) => loadTasksBoard(user),
  loadRoster: () => loadRosterFromSupabase(),
  loadNotes: () => loadNotesFromSupabase(),
  loadDocs: (user) => loadDocsIndex(user),
  loadPayments: (user) => loadPaymentsIndex(user),
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

type Settled<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Runs a loader, converting sync throws and rejections into a settled result. */
async function settle<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Loads every context section (gracefully — a failed section never throws) and
 * returns the composed context text with the capabilities manifest appended.
 * Signature-compatible with routes/agent.ts's loadAgentDashboardContext.
 */
export async function buildAgentDashboardContext(
  user: AgentContextUser,
  overrides: Partial<AgentContextLoaders> = {},
  now: Date = new Date(),
): Promise<string> {
  const loaders: AgentContextLoaders = { ...defaultLoaders, ...overrides };
  const data: AgentContextData = {
    roster: null,
    board: null,
    notes: null,
    docs: null,
    payments: null,
    reasons: {},
  };
  const reasons = data.reasons as NonNullable<AgentContextData['reasons']>;

  const [boardResult, rosterResult, docsResult] = await Promise.all([
    settle(() => loaders.loadBoard(user)),
    settle(() => loaders.loadRoster(user)),
    settle(() => loaders.loadDocs(user)),
  ]);

  if (boardResult.ok) data.board = boardResult.value;
  else reasons.board = boardResult.reason;
  if (rosterResult.ok) data.roster = rosterResult.value;
  else reasons.roster = rosterResult.reason;
  if (docsResult.ok) data.docs = docsResult.value;
  else reasons.docs = docsResult.reason;

  // Payments and the notes inbox are admin-only surfaces; skip the reads
  // entirely for non-admins (mirrors the previous behavior in routes/agent.ts).
  const isAdmin = data.board?.isAdmin ?? false;
  if (isAdmin) {
    const [paymentsResult, notesResult] = await Promise.all([
      settle(() => loaders.loadPayments(user)),
      settle(() => loaders.loadNotes(user)),
    ]);
    if (paymentsResult.ok) data.payments = paymentsResult.value;
    else reasons.payments = paymentsResult.reason;
    if (notesResult.ok) data.notes = notesResult.value;
    else reasons.notes = notesResult.reason;
  } else {
    reasons.payments = 'not visible for this user';
    reasons.notes = 'not visible for this user';
  }

  return composeAgentContext(data, now);
}
