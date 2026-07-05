import { describe, expect, it } from 'vitest';
import {
  EKO_CAPABILITIES,
  buildAgentDashboardContext,
  composeAgentContext,
  formatActivitySection,
  formatAreasSection,
  formatIssuesSection,
  formatNotesSection,
  formatTeamSection,
  type AgentContextData,
  type AgentNotesSnapshot,
  type AgentRosterEntry,
} from '../context';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { DocsIndexData } from '@/lib/docs-index';
import type { PaymentsIndexData } from '@/lib/payments-index';
import type { Area, Milestone, TaskActivity, TaskWithAssignee } from '@/lib/types';

const NOW = new Date('2026-07-04T12:00:00.000Z');

function makeTask(overrides: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  return {
    id: 'task-1',
    task_number: 12,
    name: 'UI Extension',
    department: 'Coding',
    status: 'In Progress',
    priority: 'High',
    ...overrides,
  } as TaskWithAssignee;
}

function makeBoard(overrides: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [],
    team: [],
    areas: [],
    projectMilestones: [],
    projectActivity: [],
    isAdmin: true,
    currentUserId: 'user-1',
    account: {
      email: 'admin@example.invalid',
      initials: 'A',
      isAdmin: true,
      unreadCount: 0,
      notifications: [],
      team: [],
      areas: [],
    },
    ...overrides,
  } as TasksBoardData;
}

function makeRoster(): AgentRosterEntry[] {
  return [
    {
      id: 'p-1',
      displayName: 'Karti',
      department: 'Coding',
      role: 'Founder',
      isAdmin: true,
      isInvestor: false,
      isContractor: false,
    },
    {
      id: 'p-2',
      displayName: 'Mel',
      department: 'Visual Art',
      role: 'Artist',
      isAdmin: false,
      isInvestor: false,
      isContractor: true,
    },
    {
      id: 'p-3',
      displayName: 'Iris Vale',
      department: null,
      role: null,
      isAdmin: false,
      isInvestor: true,
      isContractor: false,
    },
  ];
}

function makeDocs(): DocsIndexData {
  return {
    currentUser: { id: 'user-1' },
    profile: { id: 'user-1', displayName: 'Karti', department: 'Coding', avatarUrl: null, isAdmin: true },
    docs: [
      {
        id: 'doc-1',
        title: 'Game Design Doc',
        type: 'doc',
        restrictedDepartments: [],
        locked: false,
        preview: '',
        slideCount: 0,
        thumbnailUrl: null,
        updatedAt: null,
        createdAt: null,
        recentlyUpdated: false,
      },
      {
        id: 'doc-2',
        title: 'Investor Deck',
        type: 'deck',
        restrictedDepartments: ['Coding'],
        locked: true,
        preview: '',
        slideCount: 0,
        thumbnailUrl: null,
        updatedAt: null,
        createdAt: null,
        recentlyUpdated: false,
      },
    ],
    docCount: 1,
    deckCount: 1,
    lockedCount: 1,
  };
}

function makePayments(): PaymentsIndexData {
  return {
    currentUser: { id: 'user-1' },
    stats: { pendingTotal: 450, paidThisMonth: 200, peopleOwed: 2, paymentsThisMonth: 1 },
    monthlyPaid: [
      { month: '2026-07', paidCount: 1, paidTotal: 200 },
      { month: '2026-06', paidCount: 3, paidTotal: 1200 },
    ],
    people: [
      {
        id: 'p-2',
        displayName: 'Mel',
        department: 'Visual Art',
        avatarUrl: null,
        paypalEmail: null,
        pendingAmount: 450,
        hasPaid: true,
      },
    ],
    pendingRequests: [],
    recentPaid: [],
  };
}

describe('formatTeamSection', () => {
  it('grounds the roster with departments, roles, and flags, listing investors separately', () => {
    const section = formatTeamSection(makeRoster());

    expect(section).toContain('Team context: 2 staff, 1 investors.');
    expect(section).toContain('Staff: Karti (Coding, Founder, admin); Mel (Visual Art, Artist, contractor).');
    expect(section).toContain('Investors: Iris Vale.');
  });

  it('keeps the load-bearing Staff: line prefix for the local write planner', () => {
    const lines = formatTeamSection(makeRoster()).split('\n');
    expect(lines.some((line) => /^Staff:/.test(line))).toBe(true);
  });
});

describe('formatAreasSection', () => {
  it('formats areas with status/phase/progress and milestones with overdue deltas', () => {
    const areas: Area[] = [
      { id: 'a-1', name: 'Main Game', status: 'Active', progress: 40, phase: 'Alpha' },
      { id: 'a-2', name: 'Fighting Club', status: 'Planned', progress: 10 },
    ];
    const milestones: Milestone[] = [
      { id: 'm-1', name: 'Vertical Slice', target_date: '2026-07-01', sort_order: 0, created_at: '2026-06-01' },
      { id: 'm-2', name: 'Beta Cut', target_date: '2026-08-01', sort_order: 1, health: 'at_risk', created_at: '2026-06-01' },
    ];

    const section = formatAreasSection(areas, milestones, NOW);

    expect(section).toContain('Areas: Main Game (Active, Alpha, 40%); Fighting Club (Planned, 10%).');
    expect(section).toContain('Vertical Slice (due 2026-07-01, overdue by 3d)');
    expect(section).toContain('Beta Cut (at_risk, due 2026-08-01)');
  });
});

describe('formatIssuesSection', () => {
  it('includes per-status counts, task-number identifiers, overdue and unassigned high-priority lists', () => {
    const board = makeBoard({
      tasks: [
        makeTask({
          id: 't-1',
          task_number: 12,
          name: 'UI Extension',
          status: 'In Progress',
          deadline: '2026-07-01',
          assignee: { id: 'p-1', display_name: 'Karti' },
        }),
        makeTask({ id: 't-2', task_number: 13, name: 'Gem Vector', status: 'Todo', priority: 'High' }),
        makeTask({ id: 't-3', task_number: 14, name: 'Old Cleanup', status: 'Done', deadline: '2026-06-01' }),
      ],
    });

    const section = formatIssuesSection(board, NOW);

    expect(section).toContain('Task counts by status: In Progress: 1, Todo: 1, Done: 1.');
    expect(section).toContain('In progress: UI Extension (In Progress, #12, High priority, overdue, due 2026-07-01, assigned to Karti).');
    expect(section).toContain('Overdue: UI Extension (In Progress, #12, High priority, overdue, due 2026-07-01, assigned to Karti).');
    expect(section).toContain('Unassigned high priority: Gem Vector (Todo, #13, High priority).');
    // Done tasks never count as overdue.
    expect(section).toContain('1 overdue');
  });

  it('keeps the load-bearing line prefixes the local write planner parses', () => {
    const board = makeBoard({
      tasks: [
        makeTask({ id: 't-1', status: 'In Progress' }),
        makeTask({ id: 't-2', name: 'Review Pass', status: 'In Review', task_number: 15 }),
      ],
    });

    const lines = formatIssuesSection(board, NOW).split('\n');
    expect(lines.some((line) => /^In progress:/.test(line))).toBe(true);
    expect(lines.some((line) => /^Risk queue:/.test(line))).toBe(true);
    expect(lines.some((line) => /^In review:/.test(line))).toBe(true);
  });

  it('truncates long lists with an "…and N more" marker', () => {
    const tasks = Array.from({ length: 20 }, (_, index) =>
      makeTask({ id: `t-${index}`, task_number: index + 1, name: `Task ${index + 1}`, status: 'In Progress', priority: 'Low' }),
    );
    const section = formatIssuesSection(makeBoard({ tasks }), NOW);

    expect(section).toContain('…and 12 more');
    expect(section).not.toContain('Task 20 (In Progress, #20');
  });
});

describe('formatActivitySection', () => {
  it('summarizes recent activity with kind, target, and relative time', () => {
    const board = makeBoard({
      tasks: [makeTask({ id: 't-1', name: 'UI Extension', deadline: '2026-07-10' })],
      projectActivity: [
        {
          id: 'act-1',
          action: 'Status changed',
          target: 'UI Extension',
          kind: 'status_changed',
          created_at: '2026-07-04T10:00:00.000Z',
        },
        {
          id: 'act-2',
          action: 'Created task',
          target: 'Gem Vector',
          kind: 'created',
          created_at: '2026-07-03T12:00:00.000Z',
        },
      ] as TaskActivity[],
    });

    const section = formatActivitySection(board, NOW);

    expect(section).toContain('Recent activity: status_changed: UI Extension (2h ago); created: Gem Vector (1d ago).');
    expect(section).toContain('Recent activity task details: UI Extension (In Progress, #12, High priority, due 2026-07-10).');
  });

  it('caps the activity feed at 10 entries', () => {
    const board = makeBoard({
      projectActivity: Array.from({ length: 15 }, (_, index) => ({
        id: `act-${index}`,
        action: 'Status changed',
        target: `Task ${index}`,
        kind: 'status_changed',
        created_at: '2026-07-04T10:00:00.000Z',
      })) as TaskActivity[],
    });

    const section = formatActivitySection(board, NOW);
    expect(section).toContain('Task 9');
    expect(section).not.toContain('Task 10');
  });
});

describe('formatNotesSection', () => {
  it('shows the open count and truncates long note bodies', () => {
    const notes: AgentNotesSnapshot = {
      openCount: 4,
      recent: [
        { body: 'Ping the animator about the new rig '.repeat(6), source: 'telegram', createdAt: '2026-07-04T11:00:00.000Z' },
        { body: 'Short note', source: 'web', createdAt: '2026-07-03T12:00:00.000Z' },
      ],
    };

    const section = formatNotesSection(notes, NOW);

    expect(section).toContain('Notes inbox: 4 open.');
    expect(section).toContain('(telegram, 1h ago)');
    expect(section).toContain('"Short note" (web, 1d ago)');
    expect(section).toMatch(/…"/);
    // Truncated body stays within budget (80 chars + ellipsis + quotes).
    const firstQuote = section.match(/"([^"]+)"/)?.[1] ?? '';
    expect(firstQuote.length).toBeLessThanOrEqual(81);
  });

  it('handles an empty inbox', () => {
    expect(formatNotesSection({ openCount: 0, recent: [] }, NOW)).toBe('Notes inbox: empty.');
  });
});

describe('composeAgentContext', () => {
  function makeData(overrides: Partial<AgentContextData> = {}): AgentContextData {
    return {
      roster: makeRoster(),
      board: makeBoard({ tasks: [makeTask()] }),
      notes: { openCount: 1, recent: [{ body: 'Note', source: 'web', createdAt: null }] },
      docs: makeDocs(),
      payments: makePayments(),
      ...overrides,
    };
  }

  it('composes every section plus the capabilities manifest', () => {
    const context = composeAgentContext(makeData(), NOW);

    expect(context).toContain('Current date: 2026-07-04.');
    expect(context).toContain('Paid by month: 2026-07: 1 paid totaling 200; 2026-06: 3 paid totaling 1200.');
    expect(context).toContain('Team context:');
    expect(context).toContain('Issues context:');
    expect(context).toContain('Areas:');
    expect(context).toContain('Recent activity:');
    expect(context).toContain('Notes inbox:');
    expect(context).toContain('Docs context: 1 docs, 1 decks, 1 locked.');
    expect(context).toContain('Accessible docs: Game Design Doc.');
    expect(context).toContain('Locked docs: Investor Deck.');
    expect(context).toContain('Payments context: 2 people owed, 1 payments this month, pending total 450 USD, paid this month 200.');
    expect(context).toContain('Payment roster: Mel pending 450.');
    expect(context).toContain(EKO_CAPABILITIES);
  });

  it('degrades missing sections to unavailable lines with reasons', () => {
    const context = composeAgentContext(
      makeData({
        board: null,
        payments: null,
        reasons: { board: 'profile_not_found', payments: 'not visible for this user' },
      }),
      NOW,
    );

    expect(context).toContain('Issues context: unavailable (profile_not_found).');
    expect(context).toContain('Areas context: unavailable (profile_not_found).');
    expect(context).toContain('Activity context: unavailable (profile_not_found).');
    expect(context).toContain('Payments context: unavailable (not visible for this user).');
    // Healthy sections still render.
    expect(context).toContain('Team context: 2 staff, 1 investors.');
  });

  it('never lets a throwing formatter escape', () => {
    const poisoned = makeData({
      board: makeBoard({ tasks: null as unknown as TasksBoardData['tasks'] }),
    });

    const context = composeAgentContext(poisoned, NOW);
    expect(context).toContain('Issues context: unavailable (');
    expect(context).toContain(EKO_CAPABILITIES);
  });

  it('stays within a compact byte budget even with many rows', () => {
    const tasks = Array.from({ length: 120 }, (_, index) =>
      makeTask({
        id: `t-${index}`,
        task_number: index + 1,
        name: `A fairly long task name number ${index + 1}`,
        status: index % 3 === 0 ? 'In Progress' : index % 3 === 1 ? 'Backlog' : 'In Review',
        deadline: '2026-06-01',
        assignee: { id: 'p-1', display_name: 'Karti' },
      }),
    );
    const context = composeAgentContext(makeData({ board: makeBoard({ tasks }) }), NOW);

    expect(Buffer.byteLength(context, 'utf8')).toBeLessThan(8_000);
  });
});

describe('EKO_CAPABILITIES', () => {
  it('declares every typed gated tool, the approval gate, and the unsupported-write stance', () => {
    expect(EKO_CAPABILITIES).toContain('issue.create');
    expect(EKO_CAPABILITIES).toContain('issue.update (status)');
    expect(EKO_CAPABILITIES).toContain('issue.update (assign)');
    expect(EKO_CAPABILITIES).toContain('issue.delete');
    expect(EKO_CAPABILITIES).toContain('area.update');
    expect(EKO_CAPABILITIES).toContain('milestone.create');
    expect(EKO_CAPABILITIES).toContain('milestone.update');
    expect(EKO_CAPABILITIES).toContain('milestone.link/unlink');
    expect(EKO_CAPABILITIES).toContain('doc.create');
    expect(EKO_CAPABILITIES).toContain('doc.update');
    expect(EKO_CAPABILITIES).toContain('doc.delete');
    expect(EKO_CAPABILITIES).toContain('note.create');
    expect(EKO_CAPABILITIES).toContain('note.archive');
    expect(EKO_CAPABILITIES).toContain('payment.update');
    expect(EKO_CAPABILITIES).toContain('gated behind explicit user approval');
    expect(EKO_CAPABILITIES).toContain('Not supported yet');
    expect(EKO_CAPABILITIES).not.toContain('creating or editing docs');
    expect(EKO_CAPABILITIES).toContain('Never claim a write happened');
  });
});

describe('buildAgentDashboardContext', () => {
  const user = { id: 'user-1', email: 'admin@example.invalid' };

  it('assembles all sections from injected loaders for an admin', async () => {
    const context = await buildAgentDashboardContext(
      user,
      {
        loadBoard: async () => makeBoard({ tasks: [makeTask()] }),
        loadRoster: async () => makeRoster(),
        loadNotes: async () => ({ openCount: 2, recent: [{ body: 'Hi', source: 'web', createdAt: null }] }),
        loadDocs: async () => makeDocs(),
        loadPayments: async () => makePayments(),
      },
      NOW,
    );

    expect(context).toContain('Team context: 2 staff, 1 investors.');
    expect(context).toContain('In progress: UI Extension (In Progress, #12, High priority).');
    expect(context).toContain('Notes inbox: 2 open.');
    expect(context).toContain('Payments context: 2 people owed');
    expect(context).toContain(EKO_CAPABILITIES);
  });

  it('degrades gracefully when every loader fails, still emitting capabilities', async () => {
    const boom = async () => {
      throw new Error('supabase down');
    };
    const context = await buildAgentDashboardContext(
      user,
      { loadBoard: boom, loadRoster: boom, loadNotes: boom, loadDocs: boom, loadPayments: boom },
      NOW,
    );

    expect(context).toContain('Team context: unavailable (supabase down).');
    expect(context).toContain('Issues context: unavailable (supabase down).');
    expect(context).toContain('Docs context: unavailable (supabase down).');
    // Board failed → not admin → payments/notes skipped, not attempted.
    expect(context).toContain('Payments context: unavailable (not visible for this user).');
    expect(context).toContain('Notes context: unavailable (not visible for this user).');
    expect(context).toContain(EKO_CAPABILITIES);
  });

  it('survives loaders that throw synchronously', async () => {
    const syncBoom = () => {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    };
    const context = await buildAgentDashboardContext(
      user,
      {
        loadBoard: syncBoom as never,
        loadRoster: syncBoom as never,
        loadDocs: syncBoom as never,
      },
      NOW,
    );

    expect(context).toContain('Issues context: unavailable (Missing NEXT_PUBLIC_SUPABASE_URL');
    expect(context).toContain(EKO_CAPABILITIES);
  });

  it('skips payments and notes reads for non-admin users', async () => {
    let paymentsCalled = false;
    let notesCalled = false;
    const context = await buildAgentDashboardContext(
      user,
      {
        loadBoard: async () => makeBoard({ isAdmin: false }),
        loadRoster: async () => makeRoster(),
        loadDocs: async () => makeDocs(),
        loadPayments: async () => {
          paymentsCalled = true;
          return makePayments();
        },
        loadNotes: async () => {
          notesCalled = true;
          return { openCount: 0, recent: [] };
        },
      },
      NOW,
    );

    expect(paymentsCalled).toBe(false);
    expect(notesCalled).toBe(false);
    expect(context).toContain('Payments context: unavailable (not visible for this user).');
    expect(context).toContain('Notes context: unavailable (not visible for this user).');
  });
});
