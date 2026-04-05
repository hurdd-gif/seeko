import { describe, it, expect } from 'vitest';
import { filterByStatus, filterBySearch, excludeDocShare, groupByRecipient, sortByActivePriority, type FilterStatus } from '../invite-filters';
import type { ExternalSigningInvite } from '../types';

const makeInvite = (overrides: Partial<ExternalSigningInvite>): ExternalSigningInvite => ({
  id: 'x',
  token: 't',
  recipient_email: 'a@b.com',
  status: 'pending',
  template_type: 'preset',
  template_id: 'nda',
  expires_at: '2026-05-01T00:00:00Z',
  created_at: '2026-04-01T00:00:00Z',
  verification_attempts: 0,
  created_by: 'u',
  is_guardian_signing: false,
  ...overrides,
} as ExternalSigningInvite);

describe('filterByStatus', () => {
  const invites = [
    makeInvite({ id: '1', status: 'pending' }),
    makeInvite({ id: '2', status: 'verified' }),
    makeInvite({ id: '3', status: 'signed' }),
    makeInvite({ id: '4', status: 'expired' }),
    makeInvite({ id: '5', status: 'revoked' }),
  ];

  it('all → active statuses only (pending/verified/signed)', () => {
    const result = filterByStatus(invites, 'all');
    expect(result.map(i => i.id)).toEqual(['1', '2', '3']);
  });

  it('pending → only pending', () => {
    expect(filterByStatus(invites, 'pending').map(i => i.id)).toEqual(['1']);
  });

  it('verified → only verified', () => {
    expect(filterByStatus(invites, 'verified').map(i => i.id)).toEqual(['2']);
  });

  it('signed → only signed', () => {
    expect(filterByStatus(invites, 'signed').map(i => i.id)).toEqual(['3']);
  });

  it('archive → expired + revoked', () => {
    expect(filterByStatus(invites, 'archive').map(i => i.id)).toEqual(['4', '5']);
  });
});

describe('filterBySearch', () => {
  const invites = [
    makeInvite({ id: '1', recipient_email: 'alice@example.com' }),
    makeInvite({ id: '2', recipient_email: 'BOB@example.com' }),
    makeInvite({ id: '3', recipient_email: 'carol@other.org' }),
  ];

  it('returns all when query is empty', () => {
    expect(filterBySearch(invites, '').length).toBe(3);
    expect(filterBySearch(invites, '   ').length).toBe(3);
  });

  it('matches case-insensitively on recipient_email', () => {
    expect(filterBySearch(invites, 'BOB').map(i => i.id)).toEqual(['2']);
    expect(filterBySearch(invites, 'alice').map(i => i.id)).toEqual(['1']);
  });

  it('matches partial substring', () => {
    expect(filterBySearch(invites, 'example').map(i => i.id)).toEqual(['1', '2']);
  });
});

describe('excludeDocShare', () => {
  it('removes rows where template_type is doc_share', () => {
    const invites = [
      makeInvite({ id: '1', template_type: 'preset' }),
      makeInvite({ id: '2', template_type: 'custom' }),
      makeInvite({ id: '3', template_type: 'invoice' as ExternalSigningInvite['template_type'] }),
      makeInvite({ id: '4', template_type: 'doc_share' as ExternalSigningInvite['template_type'] }),
    ];
    expect(excludeDocShare(invites).map(i => i.id)).toEqual(['1', '2', '3']);
  });
});

describe('groupByRecipient', () => {
  const invites = [
    makeInvite({ id: '1', recipient_email: 'a@x.com', created_at: '2026-04-03' }),
    makeInvite({ id: '2', recipient_email: 'a@x.com', created_at: '2026-04-01' }),
    makeInvite({ id: '3', recipient_email: 'b@x.com', created_at: '2026-04-02' }),
  ];

  it('groups invites by recipient_email', () => {
    const groups = groupByRecipient(invites);
    expect(groups.length).toBe(2);
    expect(groups[0].email).toBe('a@x.com');
    expect(groups[0].invites.length).toBe(2);
    expect(groups[1].email).toBe('b@x.com');
  });

  it('sorts group members newest-first', () => {
    const groups = groupByRecipient(invites);
    expect(groups[0].invites.map(i => i.id)).toEqual(['1', '2']);
  });

  it('orders groups by most-recent invite', () => {
    const groups = groupByRecipient(invites);
    expect(groups.map(g => g.email)).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('sortByActivePriority', () => {
  it('orders pending → verified → signed, newest-first within each', () => {
    const invites = [
      makeInvite({ id: '1', status: 'signed', created_at: '2026-04-03' }),
      makeInvite({ id: '2', status: 'pending', created_at: '2026-04-01' }),
      makeInvite({ id: '3', status: 'verified', created_at: '2026-04-02' }),
      makeInvite({ id: '4', status: 'pending', created_at: '2026-04-04' }),
    ];
    const sorted = sortByActivePriority(invites);
    expect(sorted.map(i => i.id)).toEqual(['4', '2', '3', '1']);
  });
});
