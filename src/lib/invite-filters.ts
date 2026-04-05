import type { ExternalSigningInvite } from './types';

export type FilterStatus = 'all' | 'pending' | 'verified' | 'signed' | 'archive';

const ACTIVE_STATUSES = new Set(['pending', 'verified', 'signed']);
const ARCHIVE_STATUSES = new Set(['expired', 'revoked']);

export function filterByStatus(
  invites: ExternalSigningInvite[],
  status: FilterStatus,
): ExternalSigningInvite[] {
  if (status === 'all') return invites.filter(i => ACTIVE_STATUSES.has(i.status));
  if (status === 'archive') return invites.filter(i => ARCHIVE_STATUSES.has(i.status));
  return invites.filter(i => i.status === status);
}

export function filterBySearch(
  invites: ExternalSigningInvite[],
  query: string,
): ExternalSigningInvite[] {
  const q = query.trim().toLowerCase();
  if (!q) return invites;
  return invites.filter(i => i.recipient_email.toLowerCase().includes(q));
}

export function excludeDocShare(invites: ExternalSigningInvite[]): ExternalSigningInvite[] {
  return invites.filter(i => i.template_type !== 'doc_share');
}

export type InviteGroup = {
  email: string;
  invites: ExternalSigningInvite[];
};

export function groupByRecipient(invites: ExternalSigningInvite[]): InviteGroup[] {
  const map = new Map<string, ExternalSigningInvite[]>();
  for (const inv of invites) {
    const list = map.get(inv.recipient_email) ?? [];
    list.push(inv);
    map.set(inv.recipient_email, list);
  }
  const groups: InviteGroup[] = [];
  for (const [email, list] of map) {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    groups.push({ email, invites: list });
  }
  groups.sort((a, b) => b.invites[0].created_at.localeCompare(a.invites[0].created_at));
  return groups;
}

const STATUS_ORDER: Record<string, number> = { pending: 0, verified: 1, signed: 2, expired: 3, revoked: 4 };

export function sortByActivePriority(invites: ExternalSigningInvite[]): ExternalSigningInvite[] {
  return [...invites].sort((a, b) => {
    const orderDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return b.created_at.localeCompare(a.created_at);
  });
}
