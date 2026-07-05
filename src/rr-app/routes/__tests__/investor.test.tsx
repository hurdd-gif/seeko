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
  it('renders the investor-focused dashboard overview', () => {
    render(<InvestorRouteContent data={{ status: 'ready', index: overview, payments }} />);

    expect(screen.getByRole('heading', { name: 'Current state of SEEKO' })).toBeInTheDocument();
    expect(screen.getByText(/2 tasks completed this week\./)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Documents Shared updates and decks/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Payments \$500 this month/ })).toBeInTheDocument();

    expect(screen.getByText('Area progress')).toBeInTheDocument();
    expect(screen.getByText('Build completion by area')).toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();
    expect(screen.getByText('Spend')).toBeInTheDocument();

    expect(screen.getByText('Where we are')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current build progress' })).toBeInTheDocument();
    expect(screen.getAllByText('Gameplay').length).toBeGreaterThan(0);

    expect(screen.getByText("Where we're going")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ship forecast' })).toBeInTheDocument();

    expect(screen.getByText('What it cost')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spend snapshot' })).toBeInTheDocument();
    expect(screen.getByText('Paid total')).toBeInTheDocument();

    expect(screen.getByText('Recent updates')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Team movement' })).toBeInTheDocument();

    expect(screen.queryByText('Game Areas')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Areas')).not.toBeInTheDocument();
  });

  it('renders the faithful investor docs (real DocList read-only view)', () => {
    render(
      <MemoryRouter>
        <InvestorDocsRouteContent data={{ status: 'ready', index: docs }} />
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
    render(<InvestorPaymentsRouteContent data={{ status: 'ready', index: payments }} />);

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
        <InvestorSettingsRouteContent data={{ status: 'ready', index: { profile } }} />
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
