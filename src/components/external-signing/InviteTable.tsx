'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import { RotateCw, Ban, Download, Loader2, Plus, Send, Search, Users, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { ExternalSigningInvite } from '@/lib/types';
import {
  BTN_PRIMARY,
  CARD_TITLE,
  SIGNING_STATUS_LABEL,
} from '@/components/dashboard/lightKit';
import { TAB_PILL_SPRING } from '@/lib/motion';
import {
  filterByStatus,
  filterBySearch,
  filterSigningInvites,
  sortByActivePriority,
  groupByRecipient,
  type FilterStatus,
  type InviteGroup,
} from '@/lib/invite-filters';

interface InviteTableProps {
  refreshKey: number;
  /** Opens the New Invite dialog — surfaces a CTA inside the empty state. */
  onNewInvite?: () => void;
}

// Loudness ladder on white, carried by a dot instead of a tinted chip (Gusto
// Documents pattern): in a table where most rows share a terminal state, a wall
// of tinted badges shouts; a colored dot + plain label keeps pending amber
// findable while letting the signed majority recede.
const STATUS_DOT: Record<string, string> = {
  pending: 'bg-dept-wash-animation',
  verified: 'bg-seeko-accent-ink',
  signed: 'bg-success',
  expired: 'bg-ink-faintest',
  revoked: 'bg-danger',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-dept-wash-animation/10 text-dept-ink-animation ring-dept-wash-animation/20',
  verified: 'bg-seeko-accent-ink/10 text-seeko-accent-ink ring-seeko-accent-ink/20',
  signed: 'bg-success/10 text-success ring-success/20',
  expired: 'bg-wash-4 text-ink-muted-strong ring-wash-6',
  revoked: 'bg-danger/10 text-danger ring-danger/20',
};

const STATUS_CHIPS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'signed', label: 'Signed' },
  { value: 'archive', label: 'Archive' },
];

// Humanize DB-style template ids like "vendor_agreement" → "Vendor Agreement".
function humanizeDoc(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bNda\b/g, 'NDA')
    .replace(/\bPdf\b/g, 'PDF');
}

// filterSigningInvites() guarantees only preset/custom rows reach this table
// (every row is a signing type), so the document name is the only per-row
// distinction worth a cell: preset → humanized template id, custom → its title.
function getDocName(invite: ExternalSigningInvite): string {
  if (invite.template_type === 'preset') return humanizeDoc(invite.template_id || 'Preset');
  return invite.custom_title || 'Custom';
}

// "Jun 19, 2026" — toLocaleDateString()'s bare "6/19/2026" reads like a raw DB
// value next to the rest of the light chrome.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Chain-of-custody status cell: colored dot + humanized custody phase.
function StatusBadge({ status }: { status: ExternalSigningInvite['status'] }) {
  const label = SIGNING_STATUS_LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[status] || 'bg-wash-4 text-ink-muted-strong ring-wash-6'}`}
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[status] || 'bg-ink-faintest'}`} />
      {label}
    </span>
  );
}

function getRecipientInitial(email: string): string {
  return (email.trim()[0] || '?').toUpperCase();
}

export function InviteTable({ refreshKey, onNewInvite }: InviteTableProps) {
  const [invites, setInvites] = useState<ExternalSigningInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(t);
  }, [search]);
  const [status, setStatus] = useState<FilterStatus>('all');
  const [grouped, setGrouped] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const syncedDocusignIds = useRef<Set<string>>(new Set());
  const reduce = useReducedMotion();
  const pillTransition = reduce ? { duration: 0 } : TAB_PILL_SPRING;

  // Continuity surface: the card's height follows the measured table contents,
  // so switching filter tabs (or grouping / expanding) morphs the card instead
  // of snapping it — the same measured-height pattern as the dialog's document
  // region. Rows themselves carry `layout`, so survivors glide to their new
  // position while entering/exiting rows quietly fade.
  const [tableBodyEl, setTableBodyEl] = useState<HTMLDivElement | null>(null);
  const [tableHeight, setTableHeight] = useState<number | 'auto'>('auto');
  useLayoutEffect(() => {
    if (!tableBodyEl) { setTableHeight('auto'); return; }
    setTableHeight(tableBodyEl.offsetHeight);
    const ro = new ResizeObserver(() => setTableHeight(tableBodyEl.offsetHeight));
    ro.observe(tableBodyEl);
    return () => ro.disconnect();
  }, [tableBodyEl]);

  // Shared enter/exit for every row (main, grouped, archive): a quiet fade with
  // a 4px settle — no blur, no big travel. The continuity is carried by the
  // card's height morph and the `layout` glide of surviving rows; entering text
  // should just resolve, not perform. Reduce-guarded to plain opacity.
  const rowEnterInitial = reduce ? { opacity: 0 } : { opacity: 0, y: 4 };
  const rowEnterAnimate = reduce ? { opacity: 1 } : { opacity: 1, y: 0 };
  const rowExit = { opacity: 0, transition: { duration: 0.12 } };

  function toggleGroup(email: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('external_signing_invites')
      .select('id, token, recipient_email, status, template_type, template_id, custom_title, personal_note, expires_at, signed_at, created_at, verification_attempts, created_by, signer_name, is_guardian_signing, signing_provider, docusign_envelope_id, docusign_status')
      .order('created_at', { ascending: false });
    const rows = (data as ExternalSigningInvite[]) || [];
    setInvites(rows);

    const needsSync = rows.filter((invite) =>
      invite.signing_provider === 'docusign' &&
      !!invite.docusign_envelope_id &&
      (invite.status === 'pending' || invite.status === 'verified') &&
      !syncedDocusignIds.current.has(invite.id)
    );

    if (needsSync.length > 0) {
      for (const invite of needsSync) syncedDocusignIds.current.add(invite.id);
      const results = await Promise.allSettled(
        needsSync.map((invite) =>
          fetch('/api/external-signing/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invite_id: invite.id }),
          })
        )
      );
      if (results.some((result) => result.status === 'fulfilled' && result.value.ok)) {
        const { data: refreshed } = await supabase
          .from('external_signing_invites')
          .select('id, token, recipient_email, status, template_type, template_id, custom_title, personal_note, expires_at, signed_at, created_at, verification_attempts, created_by, signer_name, is_guardian_signing, signing_provider, docusign_envelope_id, docusign_status')
          .order('created_at', { ascending: false });
        setInvites((refreshed as ExternalSigningInvite[]) || rows);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchInvites(); }, [fetchInvites, refreshKey]);

  async function handleAction(inviteId: string, action: 'revoke' | 'resend') {
    setActionLoading(inviteId);
    try {
      const res = await fetch(`/api/external-signing/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
      toast.success(action === 'revoke' ? 'Invite revoked' : 'Invite resent');
      fetchInvites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally { setActionLoading(null); }
  }

  async function handleDownload(inviteId: string) {
    setActionLoading(inviteId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from('agreements').download(`external/${inviteId}/agreement.pdf`);
      if (error || !data) throw new Error('Failed to download');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `agreement-${inviteId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally { setActionLoading(null); }
  }

  const signingInvites = useMemo(() => filterSigningInvites(invites), [invites]);
  // Live pipeline pulse — each filter chip carries its own count so the chip row
  // doubles as an at-a-glance summary of where everything sits in the chain.
  const counts = useMemo(() => ({
    all: filterByStatus(signingInvites, 'all').length,
    pending: signingInvites.filter((i) => i.status === 'pending').length,
    verified: signingInvites.filter((i) => i.status === 'verified').length,
    signed: signingInvites.filter((i) => i.status === 'signed').length,
    archive: filterByStatus(signingInvites, 'archive').length,
  }), [signingInvites]);
  const filtered = useMemo(() => {
    const byStatus = filterByStatus(signingInvites, status);
    const bySearch = filterBySearch(byStatus, debouncedSearch);
    return status === 'all' ? sortByActivePriority(bySearch) : bySearch;
  }, [signingInvites, status, debouncedSearch]);

  const groupedData = useMemo<InviteGroup[] | null>(
    () => (grouped ? groupByRecipient(filtered) : null),
    [grouped, filtered],
  );

  const [showArchive, setShowArchive] = useState(false);

  const archiveInvites = useMemo(() => {
    const byStatus = filterByStatus(signingInvites, 'archive');
    return filterBySearch(byStatus, debouncedSearch);
  }, [signingInvites, debouncedSearch]);

  const renderInviteRow = (invite: ExternalSigningInvite, index: number, indent: boolean = false) => {
    const doc = getDocName(invite);
    return (
      <motion.tr
        key={invite.id}
        layout
        initial={rowEnterInitial}
        animate={rowEnterAnimate}
        exit={rowExit}
        transition={{ type: 'spring', duration: 0.3, bounce: 0, delay: Math.min(index, 6) * 0.02 }}
        className="group border-b border-wash-6 transition-[background-color] hover:bg-[#f8fbff] dark:hover:bg-seeko-accent/[0.07]"
      >
        {/* Two-line primary cell (Gusto Documents pattern): recipient on top,
            document beneath — kills the zero-information "Signing" type column
            and gives the doc name a home without its own column. */}
        <td className={`px-5 py-4 align-middle ${indent ? 'pl-12' : ''}`}>
          <div className="flex max-w-[360px] items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-4 text-[12px] font-semibold text-ink-muted-strong ring-1 ring-inset ring-wash-5">
              {getRecipientInitial(invite.recipient_email)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-ink-title" title={invite.recipient_email}>{invite.recipient_email}</span>
              {invite.is_guardian_signing && (
                <span
                  title="Guardian signing for a minor"
                  className="shrink-0 inline-flex items-center rounded-full bg-surface-4 px-1.5 py-0.5 text-[9px] font-medium text-ink-muted"
                >
                  Guardian
                </span>
              )}
            </div>
              <span className="block truncate text-[12px] text-ink-muted" title={doc}>{doc}</span>
            </div>
          </div>
        </td>
        <td className="px-5 py-4 align-middle">
          <StatusBadge status={invite.status} />
        </td>
        <td className="px-5 py-4 align-middle text-ink-muted text-xs tabular-nums whitespace-nowrap">
          {formatDate(invite.created_at)}
        </td>
        <td className="px-5 py-4 align-middle text-ink-muted text-xs tabular-nums whitespace-nowrap">
          {formatDate(invite.expires_at)}
        </td>
        <td className="px-5 py-4 align-middle">
          <div className="flex justify-end gap-1.5">
            {(invite.status === 'pending' || invite.status === 'verified') && (
              <>
                <button
                  onClick={() => handleAction(invite.id, 'resend')}
                  disabled={actionLoading === invite.id}
                  title="Resend invite"
                  className="relative flex size-8 items-center justify-center rounded-full border border-wash-6 bg-surface-1 transition-[background-color,transform,border-color] hover:border-black/[0.12] hover:bg-wash-4 active:scale-[0.96] before:absolute before:inset-0 before:-m-2 before:content-['']"
                >
                  <RotateCw className="size-3.5 text-ink-faint transition-[color] group-hover:text-ink-title" />
                </button>
                <button
                  onClick={() => handleAction(invite.id, 'revoke')}
                  disabled={actionLoading === invite.id}
                  title="Revoke invite"
                  className="relative flex size-8 items-center justify-center rounded-full border border-wash-6 bg-surface-1 transition-[background-color,transform,border-color] hover:border-danger/20 hover:bg-danger/10 active:scale-[0.96] before:absolute before:inset-0 before:-m-2 before:content-['']"
                >
                  <Ban className="size-3.5 text-ink-faint transition-[color] group-hover:text-danger" />
                </button>
              </>
            )}
            {invite.status === 'signed' && (
              <button
                onClick={() => handleDownload(invite.id)}
                disabled={actionLoading === invite.id}
                title="Download signed PDF"
                className="relative flex size-8 items-center justify-center rounded-full border border-wash-6 bg-surface-1 transition-[background-color,transform,border-color] hover:border-seeko-accent-ink/20 hover:bg-seeko-accent-ink/10 active:scale-[0.96] before:absolute before:inset-0 before:-m-2 before:content-['']"
              >
                <Download className="size-3.5 text-ink-faint transition-[color] group-hover:text-seeko-accent-ink" />
              </button>
            )}
          </div>
        </td>
      </motion.tr>
    );
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-ink-faint" /></div>;
  }

  if (signingInvites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface-1 px-8 py-12 text-center shadow-seeko">
        <div className="flex size-10 items-center justify-center rounded-full bg-surface-4">
          <Send className="size-4 text-ink-faint" />
        </div>
        <div>
          <p className="text-sm font-medium text-ink-title">No invites sent yet</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Send a document for an external party to sign.
          </p>
        </div>
        {onNewInvite && (
          <button
            type="button"
            onClick={onNewInvite}
            className={`${BTN_PRIMARY} inline-flex min-h-9 items-center gap-1.5 pl-3.5 pr-4 active:scale-[0.96]`}
          >
            <Plus className="size-4" />
            New Invite
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <h2 className={`${CARD_TITLE} text-[17px]`}>
          Sent invites
          <span className="ml-2 text-xs font-normal text-ink-faint tabular-nums">({filtered.length})</span>
        </h2>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-wash-4 p-1">
          {STATUS_CHIPS.map((chip) => {
            const active = status === chip.value;
            const count = counts[chip.value];
            return (
              <button
                key={chip.value}
                onClick={() => setStatus(chip.value)}
                aria-pressed={active}
                className={`relative inline-flex h-8 items-center justify-center rounded-full px-3.5 text-[13px] font-medium transition-[color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/30 ${
                  active ? 'text-ink-title' : 'text-ink-muted hover:text-ink-title'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="signingFilterPill"
                    initial={false}
                    transition={pillTransition}
                    className="absolute inset-0 rounded-full bg-surface-1 shadow-seeko"
                  />
                )}
                <span className="relative z-10 inline-flex items-center">
                  {chip.label}
                  {count > 0 && (
                    <span className="ml-1 tabular-nums text-ink-faint">
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search recipient"
              placeholder="Search recipient..."
              className="h-10 w-full rounded-full border border-wash-8 bg-surface-1 pl-9 pr-4 text-[13px] text-ink-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] placeholder:text-ink-faintest focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/30"
            />
          </div>
          <button
            onClick={() => setGrouped(g => !g)}
            aria-label={grouped ? 'Ungroup recipients' : 'Group by recipient'}
            aria-pressed={grouped}
            title={grouped ? 'Ungroup' : 'Group by recipient'}
            className={`relative flex min-h-10 items-center justify-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-[background-color,color,border-color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/30 before:absolute before:inset-0 before:-m-1 before:content-[''] ${
              grouped
                ? 'border-seeko-accent-ink/40 bg-seeko-accent-ink/10 text-seeko-accent-ink'
                : 'border-wash-8 bg-surface-1 text-ink-muted-strong hover:text-ink-title'
            }`}
          >
            <Users className="size-4" />
            <span className="hidden sm:inline">Group</span>
          </button>
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: tableHeight }}
        transition={reduce ? { duration: 0 } : { type: 'spring', duration: 0.45, bounce: 0 }}
        className="overflow-hidden rounded-[24px] bg-surface-1 shadow-seeko ring-1 ring-wash-4"
      >
        <div ref={setTableBodyEl} className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-wash-6 bg-[#fafafa] dark:bg-surface-2">
              <th className="px-5 py-3 text-xs font-medium text-ink-faint">Recipient</th>
              <th className="px-5 py-3 text-xs font-medium text-ink-faint">Status</th>
              <th className="px-5 py-3 text-xs font-medium text-ink-faint">Sent</th>
              <th className="px-5 py-3 text-xs font-medium text-ink-faint">Expires</th>
              <th className="px-5 py-3 text-xs font-medium text-ink-faint sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
            {(() => {
              if (groupedData) {
                return groupedData.flatMap((group, gIndex) => {
                  const expanded = expandedGroups.has(group.email);
                  const latest = group.invites[0];
                  const rows = [
                    <motion.tr
                      key={`group-${group.email}`}
                      layout
                      initial={rowEnterInitial}
                      animate={rowEnterAnimate}
                      exit={rowExit}
                      transition={{ type: 'spring', duration: 0.3, bounce: 0, delay: Math.min(gIndex, 6) * 0.02 }}
                      className="border-b border-wash-6 transition-[background-color] hover:bg-wash-3"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => toggleGroup(group.email)}
                          className="flex items-start gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:bg-wash-3"
                        >
                          <ChevronRight
                            className={`mt-0.5 size-3.5 shrink-0 text-ink-faint transition-transform ${expanded ? 'rotate-90' : ''}`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] text-ink-title">{group.email}</span>
                            <span className="block text-xs text-ink-muted tabular-nums">
                              {group.invites.length} {group.invites.length === 1 ? 'invite' : 'invites'}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={latest.status} />
                      </td>
                      <td className="px-4 py-3 text-ink-muted text-xs tabular-nums whitespace-nowrap">
                        {formatDate(latest.created_at)}
                      </td>
                      <td className="px-4 py-3 text-ink-muted text-xs tabular-nums whitespace-nowrap">
                        {formatDate(latest.expires_at)}
                      </td>
                      <td className="px-4 py-3" />
                    </motion.tr>,
                  ];
                  if (expanded) {
                    group.invites.forEach((inv, i) => rows.push(renderInviteRow(inv, i, true)));
                  }
                  return rows;
                });
              }
              if (filtered.length === 0) {
                return (
                  <motion.tr
                    key="empty-filter"
                    initial={rowEnterInitial}
                    animate={rowEnterAnimate}
                    exit={rowExit}
                    transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                  >
                    <td colSpan={5} className="px-4 py-10 text-center text-xs text-ink-faint">
                      No invites in this view.
                    </td>
                  </motion.tr>
                );
              }
              return filtered.map((invite, index) => renderInviteRow(invite, index));
            })()}
            </AnimatePresence>
          </tbody>
        </table>
        </div>
      </motion.div>

      {status !== 'archive' && archiveInvites.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowArchive(s => !s)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-ink-muted hover:text-ink-title transition-[color]"
          >
            {showArchive ? 'Hide archived' : `Show archived (${archiveInvites.length})`}
          </button>
          <AnimatePresence initial={false}>
            {showArchive && (
              <motion.div
                key="archive-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                className="overflow-hidden"
              >
                <div className="overflow-x-auto rounded-xl border border-wash-6 opacity-60">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      <AnimatePresence initial={false}>
                        {archiveInvites.map((invite, index) => renderInviteRow(invite, index))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
