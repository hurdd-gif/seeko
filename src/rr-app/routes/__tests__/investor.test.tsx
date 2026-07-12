import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { InvestorDocsData, InvestorOverviewData, InvestorPaymentsData } from '@/lib/investor-index';
import { InvestorDocsRouteContent } from '../investor-docs';
import { InvestorPaymentsRouteContent } from '../investor-payments';
import { InvestorRouteContent } from '../investor';
import { InvestorSettingsRouteContent } from '../investor-settings';

const profile = {
  id: 'investor-1',
  displayName: 'Investor Example',
  email: 'investor@example.invalid',
  avatarUrl: null,
  timezone: 'America/New_York',
  paypalEmail: 'payments@example.invalid',
  isAdmin: false,
  isInvestor: true,
};

const overview: InvestorOverviewData = {
  profile,
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
  milestones: [
    { id: 'ms-1', name: 'ALPHA', targetDate: '2026-05-29', taskCount: 6, doneCount: 6 },
    { id: 'ms-2', name: 'BETA', targetDate: null, taskCount: 9, doneCount: 4 },
    // Zero linked tasks — must NOT earn a bar.
    { id: 'ms-3', name: 'GHOST', targetDate: null, taskCount: 0, doneCount: 0 },
  ],
  healthSummary: '2 tasks completed this week.',
};

const docs: InvestorDocsData = {
  profile,
  docs: [
    {
      id: 'doc-1',
      title: 'Investor Update',
      content: '<p>Monthly update</p>',
      sort_order: 0,
      type: 'doc',
      restricted_department: [],
      granted_user_ids: [],
      created_at: '2026-06-18T12:00:00.000Z',
      updated_at: '2026-06-18T12:00:00.000Z',
    },
  ],
  team: [],
  docCount: 1,
  deckCount: 0,
};

const payments: InvestorPaymentsData = {
  profile,
  stats: {
    thisMonth: 500,
    lastMonth: 250,
    allTime: 1300,
    peoplePaid: 2,
    paymentCount: 3,
    monthCount: 2,
    thisMonthRecipients: 1,
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
      description: 'Milestone payout',
      paidAt: '2026-06-18T12:00:00.000Z',
      createdAt: '2026-06-18T12:00:00.000Z',
      itemCount: 1,
    },
    {
      id: 'payment-2',
      recipientId: 'user-2',
      recipientName: 'Sam Designer',
      recipientAvatarUrl: null,
      recipientDepartment: 'Visual Art',
      amount: 300,
      currency: 'USD',
      description: 'Concept art',
      paidAt: '2026-05-10T12:00:00.000Z',
      createdAt: '2026-05-10T12:00:00.000Z',
      itemCount: 2,
    },
    {
      id: 'payment-3',
      recipientId: 'user-1',
      recipientName: 'Riley Example',
      recipientAvatarUrl: null,
      recipientDepartment: 'Coding',
      amount: 500,
      currency: 'USD',
      description: 'Bug bounty',
      paidAt: '2026-05-12T12:00:00.000Z',
      createdAt: '2026-05-12T12:00:00.000Z',
      itemCount: 1,
    },
  ],
};

describe('investor routes', () => {
  it('renders the stripped-back investor dashboard overview', () => {
    render(
      <MemoryRouter>
        <InvestorRouteContent data={{ status: 'ready', data: { index: overview, payments } }} />
      </MemoryRouter>
    );

    // No visual hero (user call 2026-07-11) — only a screen-reader h1 remains.
    expect(screen.getByRole('heading', { name: 'Investor dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('SEEKO needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText(/2 tasks completed this week\./)).not.toBeInTheDocument();

    // Quick-nav pills open the page.
    expect(screen.getByRole('link', { name: /Documents & decks/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Payment history/ })).toBeInTheDocument();

    // Frameless stat row — three cells; "burn" renamed to the capital card's
    // "deployed" vocabulary and the At-risk cell removed (user calls 2026-07-11).
    expect(screen.getByText('Overall progress')).toBeInTheDocument();
    expect(screen.getByText('Tasks shipped')).toBeInTheDocument();
    expect(screen.getByText('Deployed this month')).toBeInTheDocument();
    expect(screen.queryByText('Burn this month')).not.toBeInTheDocument();
    expect(screen.queryByText('At risk')).not.toBeInTheDocument();
    expect(screen.getByText('4 of 10')).toBeInTheDocument();

    // The one elevated surface: the capital chart card with recent payments inside.
    expect(screen.getByText('Capital deployed')).toBeInTheDocument();
    expect(screen.getByText('Recent payments')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View all/ })).toBeInTheDocument();

    // Frameless progress ledger (one row per area, azure bar + tabular percent).
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getAllByText('Gameplay').length).toBeGreaterThan(0);
    expect(screen.getByText('2 of 5 tasks')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();

    // Shipping ledger: only dated areas earn a row; this area has no target date.
    expect(screen.getByRole('heading', { name: "What's shipping" })).toBeInTheDocument();
    expect(screen.getByText('No ship dates set yet.')).toBeInTheDocument();

    // Milestones dither chart: header + summary; the canvas itself can't render
    // in jsdom (zero-size measure), but the sr-only completion read must — and
    // only milestones with linked tasks appear in it.
    expect(screen.getByRole('heading', { name: 'Milestones' })).toBeInTheDocument();
    expect(screen.getByText('10 of 15 tasks shipped')).toBeInTheDocument();
    expect(screen.getByText(/ALPHA: 6 of 6 tasks shipped/)).toBeInTheDocument();
    expect(screen.queryByText(/GHOST/)).not.toBeInTheDocument();

    // Latest ledger fed by recentActivity.
    expect(screen.getByRole('heading', { name: 'Latest' })).toBeInTheDocument();
    expect(screen.getByText('Prototype')).toBeInTheDocument();

    // The old card-heavy sections are gone.
    expect(screen.queryByText('Where we are')).not.toBeInTheDocument();
    expect(screen.queryByText('Ship forecast')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick access')).not.toBeInTheDocument();
    expect(screen.queryByText('Spend snapshot')).not.toBeInTheDocument();
  });

  it('renders the faithful investor docs (real DocList read-only view)', () => {
    render(
      <MemoryRouter>
        <InvestorDocsRouteContent data={{ status: 'ready', data: docs }} />
      </MemoryRouter>
    );

    // The original investor docs page rendered the SHARED <DocList isInvestor>
    // component (the same one the team /docs page uses), NOT a bespoke card grid.
    // Heading + subtitle are verbatim from the original page.
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(
      screen.getByText('Documents, decks, and shared resources.')
    ).toBeInTheDocument();

    // DocList-specific chrome proves the real component is mounted, not a scaffold:
    // the segmented Documents/Decks tab toggle + its search field. Investors are
    // not admins, so the admin-only "Shared" tab and "New" button do NOT appear.
    expect(screen.getByPlaceholderText('Search documents...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decks/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Shared/ })).not.toBeInTheDocument();

    // The doc itself renders as a row in the list.
    expect(screen.getByText('Investor Update')).toBeInTheDocument();
  });

  it('renders the faithful investor payments page', () => {
    render(<InvestorPaymentsRouteContent data={{ status: 'ready', data: payments }} />);

    // The original page is an h1 "Payments" + a smart summary line, NOT the
    // scaffold's "Disbursement history" eyebrow. summaryLine uses this-month
    // recipients (1), not peoplePaid (2).
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument();
    expect(
      screen.getByText('$500.00 disbursed this month to 1 team member.')
    ).toBeInTheDocument();

    // PaymentsInvestor stat cards (the real labels: This Month / Avg / Month /
    // People Paid — the scaffold used This Month / All Time / People Paid).
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('Avg / Month')).toBeInTheDocument();
    expect(screen.getByText('People Paid')).toBeInTheDocument();

    // The four analysis cards the scaffold dropped entirely, aggregated client-side
    // from the flat payments list.
    expect(screen.getByRole('heading', { name: 'Monthly Breakdown' })).toBeInTheDocument();

    // Month labels must reflect the actual paid month regardless of the viewer's
    // timezone. payment-1 is paid 2026-06-18 → the breakdown row must read
    // "June 2026" (not "May 2026" from a UTC-parsed `new Date('2026-06-01')`
    // shifting back a day in negative-UTC timezones).
    expect(screen.getByText('June 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'By Department' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top Recipients' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Payments' })).toBeInTheDocument();

    // Department breakdown legend + top recipients reflect the aggregation.
    expect(screen.getAllByText('Coding').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Riley Example').length).toBeGreaterThan(0);
  });

  it('renders the faithful investor settings (real SettingsPanel, no payments section)', () => {
    render(
      <MemoryRouter>
        <InvestorSettingsRouteContent data={{ status: 'ready', data: { profile } }} />
      </MemoryRouter>
    );

    // The original investor settings page rendered the shared <SettingsPanel>
    // (full-bleed light shell), NOT a bespoke "Profile and preferences" form.
    // Asserting the "Settings" heading + Account "Profile" card proves the real
    // component is mounted.
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toHaveValue('Investor Example');

    // Investors do NOT see the team-only Payments section (PayPal Email field):
    // SettingsPanel hides it when profile.is_investor is true.
    expect(screen.queryByLabelText('PayPal Email')).not.toBeInTheDocument();
  });
});
