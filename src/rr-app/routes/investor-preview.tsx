import { InvestorRouteContent } from './investor';
import { InvestorDocsRouteContent } from './investor-docs';
import { InvestorPaymentsRouteContent } from './investor-payments';
import { InvestorShell } from './investor-layout';
import type {
  InvestorDocsData,
  InvestorOverviewData,
  InvestorPaymentsData,
} from '@/lib/investor-index';

const previewData: InvestorOverviewData = {
  profile: {
    id: 'preview-investor',
    displayName: 'Investor Preview',
    email: 'preview@example.invalid',
    avatarUrl: null,
    timezone: 'America/New_York',
    paypalEmail: null,
    isAdmin: true,
    isInvestor: true,
  },
  stats: {
    totalTasks: 8,
    completedTasks: 3,
    overallProgress: 38,
    blockedTasks: 1,
    overdueTasks: 1,
    activeAreas: 2,
    completedThisWeek: 2,
  },
  areas: [
    {
      id: 'area-main',
      name: 'Main Game',
      status: 'Active',
      progress: 62,
      description: 'Core loop, combat, traversal, and opening biome.',
      phase: 'Beta',
      targetDate: '2026-09-15',
      taskCount: 5,
      completedTaskCount: 2,
    },
    {
      id: 'area-fighting',
      name: 'Fighting Club',
      status: 'Active',
      progress: 34,
      description: 'Versus-mode prototype and roster tuning.',
      phase: 'Alpha',
      targetDate: '2026-12-01',
      taskCount: 3,
      completedTaskCount: 1,
    },
  ],
  recentActivity: [
    {
      id: 'activity-1',
      action: 'Completed',
      target: 'Combat hit reactions',
      createdAt: '2026-06-18T12:00:00.000Z',
      taskId: 'task-1',
      docId: null,
    },
    {
      id: 'activity-2',
      action: 'Started',
      target: 'Environment lighting',
      createdAt: '2026-06-17T12:00:00.000Z',
      taskId: 'task-2',
      docId: null,
    },
  ],
  healthSummary: '2 tasks completed this week, all areas progressing, 1 blocked, 1 overdue.',
};

export function InvestorPreviewRoute() {
  // This QA preview renders OUTSIDE RootLayout (it is a top-level router child),
  // so it wraps the overview in the real <InvestorShell> chrome (light sidebar,
  // identity, nav) to mirror exactly what the live /investor route renders —
  // letting visual QA see the full faithful page without an authed session.
  return (
    <InvestorShell profile={previewData.profile}>
      <InvestorRouteContent data={{ status: 'ready', index: previewData, payments: paymentsPreviewData }} />
    </InvestorShell>
  );
}

const docsPreviewData: InvestorDocsData = {
  profile: previewData.profile,
  docs: [
    {
      id: 'doc-vision',
      title: 'SEEKO Vision & Pitch',
      content: '<p>The studio thesis, market, and the long game.</p>',
      sort_order: 0,
      type: 'doc',
      restricted_department: [],
      granted_user_ids: [],
      created_at: '2026-05-02T12:00:00.000Z',
      updated_at: '2026-06-18T12:00:00.000Z',
    },
    {
      id: 'doc-gdd',
      title: 'Game Design Document',
      content: '<p>Core loop, systems, and content plan.</p>',
      sort_order: 1,
      type: 'doc',
      restricted_department: [],
      granted_user_ids: [],
      created_at: '2026-04-10T12:00:00.000Z',
      updated_at: '2026-06-12T12:00:00.000Z',
    },
    {
      id: 'doc-financials',
      title: 'Financial Model (Restricted)',
      content: '<p>Runway, burn, and projections.</p>',
      sort_order: 2,
      type: 'doc',
      restricted_department: ['Coding'],
      granted_user_ids: [],
      created_at: '2026-03-21T12:00:00.000Z',
      updated_at: '2026-05-30T12:00:00.000Z',
    },
    {
      id: 'deck-investor',
      title: 'Investor Deck — Q2',
      content: '',
      sort_order: 0,
      type: 'deck',
      deck_orientation: 'horizontal',
      restricted_department: [],
      granted_user_ids: [],
      slides: [
        { url: '/seeko-logo.png', sort_order: 0 },
        { url: '/seeko-logo.png', sort_order: 1 },
      ],
      created_at: '2026-06-01T12:00:00.000Z',
      updated_at: '2026-06-19T12:00:00.000Z',
    },
  ],
  team: [
    { id: 'user-1', display_name: 'Riley Example' },
    { id: 'user-2', display_name: 'Sam Designer' },
  ],
  docCount: 3,
  deckCount: 1,
};

export function InvestorDocsPreviewRoute() {
  return (
    <InvestorShell profile={docsPreviewData.profile}>
      <InvestorDocsRouteContent data={{ status: 'ready', index: docsPreviewData }} />
    </InvestorShell>
  );
}

const paymentsPreviewData: InvestorPaymentsData = {
  profile: previewData.profile,
  stats: {
    thisMonth: 4200,
    lastMonth: 3000,
    allTime: 28500,
    peoplePaid: 5,
    paymentCount: 14,
    monthCount: 7,
    thisMonthRecipients: 3,
  },
  payments: [
    {
      id: 'pay-1',
      recipientId: 'user-1',
      recipientName: 'Riley Example',
      recipientAvatarUrl: null,
      recipientDepartment: 'Coding',
      amount: 1800,
      currency: 'USD',
      description: 'Combat system milestone',
      paidAt: '2026-06-15T12:00:00.000Z',
      createdAt: '2026-06-15T12:00:00.000Z',
      itemCount: 3,
    },
    {
      id: 'pay-2',
      recipientId: 'user-2',
      recipientName: 'Sam Designer',
      recipientAvatarUrl: null,
      recipientDepartment: 'Visual Art',
      amount: 1400,
      currency: 'USD',
      description: 'Biome concept art pack',
      paidAt: '2026-06-10T12:00:00.000Z',
      createdAt: '2026-06-10T12:00:00.000Z',
      itemCount: 2,
    },
    {
      id: 'pay-3',
      recipientId: 'user-3',
      recipientName: 'Avery Motion',
      recipientAvatarUrl: null,
      recipientDepartment: 'Animation',
      amount: 1000,
      currency: 'USD',
      description: 'Traversal animation set',
      paidAt: '2026-06-04T12:00:00.000Z',
      createdAt: '2026-06-04T12:00:00.000Z',
      itemCount: 1,
    },
    {
      id: 'pay-4',
      recipientId: 'user-1',
      recipientName: 'Riley Example',
      recipientAvatarUrl: null,
      recipientDepartment: 'Coding',
      amount: 1500,
      currency: 'USD',
      description: 'Save system + persistence',
      paidAt: '2026-05-20T12:00:00.000Z',
      createdAt: '2026-05-20T12:00:00.000Z',
      itemCount: 2,
    },
    {
      id: 'pay-5',
      recipientId: 'user-4',
      recipientName: 'Jordan UX',
      recipientAvatarUrl: null,
      recipientDepartment: 'UI/UX',
      amount: 900,
      currency: 'USD',
      description: 'HUD redesign',
      paidAt: '2026-05-12T12:00:00.000Z',
      createdAt: '2026-05-12T12:00:00.000Z',
      itemCount: 1,
    },
  ],
};

export function InvestorPaymentsPreviewRoute() {
  return (
    <InvestorShell profile={paymentsPreviewData.profile}>
      <InvestorPaymentsRouteContent data={{ status: 'ready', index: paymentsPreviewData }} />
    </InvestorShell>
  );
}
