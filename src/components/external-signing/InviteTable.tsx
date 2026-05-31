'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import { RotateCw, Ban, Download, Loader2, Send, Search, Users, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { ExternalSigningInvite } from '@/lib/types';
import { LIGHT_SIGNING_STATUS } from '@/components/dashboard/lightKit';
import {
  filterByStatus,
  filterBySearch,
  excludeDocShare,
  sortByActivePriority,
  groupByRecipient,
  type FilterStatus,
  type InviteGroup,
} from '@/lib/invite-filters';

interface InviteTableProps { refreshKey: number; }

// Loudness ladder on white (AA): pending loud (amber, blocks an external party),
// verified azure (mid-flow), signed/expired quiet neutral (done), revoked destructive.
// Defined in lightKit as LIGHT_SIGNING_STATUS so the palette stays single-sourced.
const STATUS_CLASSES = LIGHT_SIGNING_STATUS;
const STATUS_FALLBACK = 'border-black/[0.08] text-[#808080]';

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

type TypeTag = { label: 'Signing' | 'Invoice'; doc: string; tone: 'signing' | 'invoice' };

function getTypeTag(invite: ExternalSigningInvite): TypeTag {
  if (invite.template_type === 'invoice') {
    // Custom titles carry signal; the default "Invoice request" label repeats the Type tag — elide it.
    const custom = invite.custom_title?.trim();
    return { label: 'Invoice', doc: custom || '—', tone: 'invoice' };
  }
  if (invite.template_type === 'preset') return { label: 'Signing', doc: humanizeDoc(invite.template_id || 'Preset'), tone: 'signing' };
  return { label: 'Signing', doc: invite.custom_title || 'Custom', tone: 'signing' };
}

const TYPE_TAG_CLASSES: Record<'signing' | 'invoice', string> = {
  signing: 'bg-[#f4f4f4] text-[#808080]',
  invoice: 'bg-[#b8801a]/10 text-[#946a00]',
};

export function InviteTable({ refreshKey }: InviteTableProps) {
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
      .select('id, token, recipient_email, status, template_type, template_id, custom_title, personal_note, expires_at, signed_at, created_at, verification_attempts, created_by, signer_name, is_guardian_signing')
      .order('created_at', { ascending: false });
    setInvites((data as ExternalSigningInvite[]) || []);
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

  const signingInvites = useMemo(() => excludeDocShare(invites), [invites]);
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
    const { label: typeLabel, doc, tone } = getTypeTag(invite);
    return (
      <motion.tr
        key={invite.id}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0, delay: Math.min(index, 10) * 0.03 }}
        className="border-b border-black/[0.06] transition-[background-color] hover:bg-black/[0.03]"
      >
        <td className={`px-4 py-3 align-middle text-[#111] font-mono text-xs ${indent ? 'pl-10' : ''}`}>
          <div className="flex items-center gap-2 max-w-[240px]">
            <span className="truncate" title={invite.recipient_email}>{invite.recipient_email}</span>
            {invite.is_guardian_signing && (
              <span
                title="Guardian signing for a minor"
                className="shrink-0 inline-flex items-center rounded-full bg-[#f4f4f4] px-1.5 py-0.5 text-[9px] font-medium text-[#808080]"
              >
                Guardian
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 align-middle">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_TAG_CLASSES[tone]}`}>
            {typeLabel}
          </span>
        </td>
        <td className="px-4 py-3 align-middle text-[#808080] text-xs">
          <span className="block max-w-[160px] truncate" title={doc}>{doc}</span>
        </td>
        <td className="px-4 py-3 align-middle">
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[invite.status] || STATUS_FALLBACK}`}>
            {invite.status}
          </span>
        </td>
        <td className="px-4 py-3 align-middle text-[#808080] text-xs tabular-nums">
          {new Date(invite.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 align-middle text-[#808080] text-xs tabular-nums">
          {new Date(invite.expires_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 align-middle">
          <div className="flex gap-1">
            {(invite.status === 'pending' || invite.status === 'verified') && (
              <>
                <button
                  onClick={() => handleAction(invite.id, 'resend')}
                  disabled={actionLoading === invite.id}
                  title="Resend invite"
                  className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-black/[0.04] active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
                >
                  <RotateCw className="size-3.5 text-[#9a9a9a] group-hover:text-[#111] transition-[color]" />
                </button>
                <button
                  onClick={() => handleAction(invite.id, 'revoke')}
                  disabled={actionLoading === invite.id}
                  title="Revoke invite"
                  className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-[#d4503e]/10 active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
                >
                  <Ban className="size-3.5 text-[#9a9a9a] group-hover:text-[#d4503e] transition-[color]" />
                </button>
              </>
            )}
            {invite.status === 'signed' && (
              <button
                onClick={() => handleDownload(invite.id)}
                disabled={actionLoading === invite.id}
                title="Download signed PDF"
                className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-[#0a63cc]/10 active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
              >
                <Download className="size-3.5 text-[#9a9a9a] group-hover:text-[#0a63cc] transition-[color]" />
              </button>
            )}
          </div>
        </td>
      </motion.tr>
    );
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-[#9a9a9a]" /></div>;
  }

  if (signingInvites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-[#f4f4f4]">
          <Send className="size-4 text-[#9a9a9a]" />
        </div>
        <div>
          <p className="text-sm font-medium text-[#111]">No invites sent yet</p>
          <p className="text-xs text-[#808080]">Send your first invite using the form above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-[#808080]">
          Sent Invites
          <span className="ml-2 text-xs text-[#9a9a9a] tabular-nums">({filtered.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#9a9a9a]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search recipient"
              placeholder="Search recipient…"
              className="h-8 w-full rounded-md border border-black/[0.08] bg-white pl-8 pr-3 text-xs text-[#2a2a2a] placeholder:text-[#b3b3b3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setGrouped(g => !g)}
            aria-label={grouped ? 'Ungroup recipients' : 'Group by recipient'}
            aria-pressed={grouped}
            title={grouped ? 'Ungroup' : 'Group by recipient'}
            className={`relative flex size-8 items-center justify-center rounded-md border transition-[background-color,color,border-color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30 before:absolute before:inset-0 before:-m-1 before:content-[''] ${
              grouped
                ? 'border-[#0a63cc]/40 bg-[#0a63cc]/10 text-[#0a63cc]'
                : 'border-black/[0.08] bg-white text-[#808080] hover:text-[#111]'
            }`}
          >
            <Users className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((chip) => {
          const active = status === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setStatus(chip.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30 ${
                active
                  ? 'bg-[#111] text-white'
                  : 'bg-[#f4f4f4] text-[#808080] hover:text-[#111]'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/[0.06] bg-[#f7f7f7]">
              <th className="px-4 py-2.5 text-xs font-medium text-[#808080]">Recipient</th>
              <th className="px-4 py-2.5 text-xs font-medium text-[#808080]">Type</th>
              <th className="px-4 py-2.5 text-xs font-medium text-[#808080]">Document</th>
              <th className="px-4 py-2.5 text-xs font-medium text-[#808080]">Status</th>
              <th className="px-4 py-2.5 text-xs font-medium text-[#808080]">Sent</th>
              <th className="px-4 py-2.5 text-xs font-medium text-[#808080]">Expires</th>
              <th className="px-4 py-2.5 text-xs font-medium text-[#808080] sr-only">Actions</th>
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
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ type: 'spring', duration: 0.3, bounce: 0, delay: Math.min(gIndex, 10) * 0.03 }}
                      className="border-b border-black/[0.06] transition-[background-color] hover:bg-black/[0.03]"
                    >
                      <td className="px-4 py-3 text-[#111] font-mono text-xs">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => toggleGroup(group.email)}
                          className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:bg-black/[0.03]"
                        >
                          <ChevronRight
                            className={`size-3.5 text-[#9a9a9a] transition-transform ${expanded ? 'rotate-90' : ''}`}
                          />
                          {group.email}
                        </button>
                      </td>
                      <td className="px-4 py-3" colSpan={2}>
                        <span className="text-xs text-[#808080] tabular-nums">
                          {group.invites.length} {group.invites.length === 1 ? 'invite' : 'invites'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[latest.status] || STATUS_FALLBACK}`}>{latest.status}</span>
                      </td>
                      <td className="px-4 py-3 text-[#808080] text-xs tabular-nums">
                        {new Date(latest.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-[#808080] text-xs tabular-nums">
                        {new Date(latest.expires_at).toLocaleDateString()}
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
              return filtered.map((invite, index) => renderInviteRow(invite, index));
            })()}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {status !== 'archive' && archiveInvites.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowArchive(s => !s)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-[#808080] hover:text-[#111] transition-[color]"
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
                <div className="overflow-x-auto rounded-xl border border-black/[0.06] opacity-60">
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
