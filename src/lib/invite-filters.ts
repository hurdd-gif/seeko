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

/**
 * The signing products (`preset` + `custom`) within the shared
 * `external_signing_invites` table, which serves three sibling products
 * (signing / invoice / doc-share). Used by `isSigningInvite` below — the per-row
 * cross-product isolation guard every signing route runs before acting on a token.
 */
export const SIGNING_TEMPLATE_TYPES = new Set<ExternalSigningInvite['template_type']>(['preset', 'custom']);

/**
 * Single source of truth for the cross-product isolation guard. Every route that
 * fetches a row from the shared `external_signing_invites` table by token/id MUST
 * reject non-signing rows with this helper before acting — otherwise an invoice or
 * doc-share token could be operated on through a signing route. Returns `false` for
 * a missing row so callers can fold the not-found and wrong-product cases into one
 * identical 404 (no enumeration oracle). See `.claude/claude-security-guidance.md`.
 *
 * It is a type guard: a truthy result narrows away `null | undefined`, so callers
 * get the not-found check for free and cannot forget it.
 */
export function isSigningInvite<T extends { template_type: ExternalSigningInvite['template_type'] }>(
  invite: T | null | undefined,
): invite is T {
  return !!invite && SIGNING_TEMPLATE_TYPES.has(invite.template_type);
}

export function filterSigningInvites(invites: ExternalSigningInvite[]): ExternalSigningInvite[] {
  return invites.filter(isSigningInvite);
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
