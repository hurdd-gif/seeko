import { beforeEach, describe, expect, it, vi } from 'vitest';

// loadPaymentsView is served by GET /api/payments-view and is shared by admins
// (full control surface) and investors (viewer mode). Investors must not read
// any team member's paypal_email. The service client is mocked; its .select()
// projects a canonical roster row down to only the requested columns so the
// returned shape reflects the real select string, and the roster select is
// captured for a direct assertion.
const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  getServiceClientAs: mocks.getServiceClient,
}));

import { loadPaymentsView } from '../dashboard-views';

const PROFILE_LOOKUP_SELECT = 'id, is_admin, is_investor';

const FULL_MEMBER: Record<string, unknown> = {
  id: 'm1',
  display_name: 'Alice',
  department: 'Coding',
  role: 'Developer',
  avatar_url: null,
  is_admin: false,
  is_contractor: true,
  is_investor: false,
  onboarded: true,
  tour_completed: true,
  paypal_email: 'alice@paypal.invalid',
  created_at: '2026-01-01T00:00:00Z',
};

function projectMember(sel: string) {
  const cols = sel.split(',').map((s) => s.trim());
  const row: Record<string, unknown> = {};
  for (const c of cols) if (c in FULL_MEMBER) row[c] = FULL_MEMBER[c];
  return row;
}

function makeService(profileRow: Record<string, unknown>, captured: { rosterSelect?: string }) {
  return {
    from: () => ({
      select: (sel: string) => {
        const isProfileLookup = sel === PROFILE_LOOKUP_SELECT;
        if (!isProfileLookup) captured.rosterSelect = sel;
        const chain: Record<string, unknown> = {
          eq: () => chain,
          maybeSingle: async () => ({ data: profileRow, error: null }),
          order: async () => ({
            data: isProfileLookup ? [] : [projectMember(sel)],
            error: null,
          }),
        };
        return chain;
      },
    }),
  };
}

beforeEach(() => {
  mocks.getServiceClient.mockReset();
});

describe('loadPaymentsView — investor payout PII lockdown', () => {
  it('narrows the roster for an investor (no paypal_email)', async () => {
    const captured: { rosterSelect?: string } = {};
    mocks.getServiceClient.mockReturnValue(
      makeService({ id: 'inv-1', is_admin: false, is_investor: true }, captured),
    );

    const result = await loadPaymentsView({ id: 'inv-1' });

    expect(result.isInvestor).toBe(true);
    expect(result.isAdmin).toBe(false);
    // The roster is still returned — just without payout PII.
    expect(result.team).toHaveLength(1);
    expect(result.team[0].id).toBe('m1');
    expect(result.team[0]).not.toHaveProperty('paypal_email');
    // The select string itself must not name paypal_email.
    expect(captured.rosterSelect).not.toContain('paypal_email');
  });

  it('keeps paypal_email in the roster for an admin', async () => {
    const captured: { rosterSelect?: string } = {};
    mocks.getServiceClient.mockReturnValue(
      makeService({ id: 'admin-1', is_admin: true, is_investor: false }, captured),
    );

    const result = await loadPaymentsView({ id: 'admin-1' });

    expect(result.isAdmin).toBe(true);
    expect(captured.rosterSelect).toContain('paypal_email');
    expect(result.team[0].paypal_email).toBe('alice@paypal.invalid');
  });
});
