'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import { RotateCw, Ban, Download, Loader2, Send, Search, Users, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { ExternalSigningInvite } from '@/lib/types';
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

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  verified: 'secondary',
  signed: 'default',
  expired: 'secondary',
  revoked: 'destructive',
};

const STATUS_CHIPS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'signed', label: 'Signed' },
  { value: 'archive', label: 'Archive' },
];

function getTypeTag(invite: ExternalSigningInvite): { label: string; doc: string } {
  const type = invite.template_type as string;
  if (type === 'invoice') return { label: 'Invoice', doc: invite.custom_title || 'Invoice request' };
  if (type === 'preset') return { label: 'Signing', doc: invite.template_id || 'Preset' };
  return { label: 'Signing', doc: invite.custom_title || 'Custom' };
}

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
    const { label: typeLabel, doc } = getTypeTag(invite);
    return (
      <motion.tr
        key={invite.id}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0, delay: Math.min(index, 10) * 0.03 }}
        className="border-b border-border/50 transition-[background-color] hover:bg-muted/20"
      >
        <td className={`px-4 py-3 text-foreground font-mono text-xs ${indent ? 'pl-10' : ''}`}>
          {invite.recipient_email}
          {invite.is_guardian_signing && (
            <Badge variant="outline" className="ml-2 text-[10px]">Guardian</Badge>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {typeLabel}
          </span>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs text-pretty">{doc}</td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_VARIANT[invite.status] || 'secondary'}>{invite.status}</Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
          {new Date(invite.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
          {new Date(invite.expires_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            {(invite.status === 'pending' || invite.status === 'verified') && (
              <>
                <button
                  onClick={() => handleAction(invite.id, 'resend')}
                  disabled={actionLoading === invite.id}
                  title="Resend invite"
                  className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-muted active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
                >
                  <RotateCw className="size-3.5 text-muted-foreground group-hover:text-foreground transition-[color]" />
                </button>
                <button
                  onClick={() => handleAction(invite.id, 'revoke')}
                  disabled={actionLoading === invite.id}
                  title="Revoke invite"
                  className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-destructive/10 active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
                >
                  <Ban className="size-3.5 text-muted-foreground group-hover:text-destructive transition-[color]" />
                </button>
              </>
            )}
            {invite.status === 'signed' && (
              <button
                onClick={() => handleDownload(invite.id)}
                disabled={actionLoading === invite.id}
                title="Download signed PDF"
                className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-seeko-accent/10 active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
              >
                <Download className="size-3.5 text-muted-foreground group-hover:text-seeko-accent transition-[color]" />
              </button>
            )}
          </div>
        </td>
      </motion.tr>
    );
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  if (signingInvites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted ring-1 ring-border">
          <Send className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">No invites sent yet</p>
          <p className="text-xs text-muted-foreground/60">Send your first invite using the form above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Sent Invites
          <span className="ml-2 text-xs text-muted-foreground/60 tabular-nums">({filtered.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient…"
              className="h-8 w-full rounded-md border border-border bg-muted/20 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent/40 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setGrouped(g => !g)}
            title={grouped ? 'Ungroup' : 'Group by recipient'}
            className={`relative flex size-8 items-center justify-center rounded-md border transition-[background-color,color,border-color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent/40 before:absolute before:inset-0 before:-m-1 before:content-[''] ${
              grouped
                ? 'border-seeko-accent/40 bg-seeko-accent/10 text-seeko-accent'
                : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent/40 ${
                active
                  ? 'bg-foreground text-background'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Recipient</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Document</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Sent</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Expires</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground sr-only">Actions</th>
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
                      onClick={() => toggleGroup(group.email)}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expanded}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleGroup(group.email);
                        }
                      }}
                      className="border-b border-border/50 cursor-pointer transition-[background-color] hover:bg-muted/20 focus-visible:outline-none focus-visible:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-foreground font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`size-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
                          />
                          {group.email}
                        </div>
                      </td>
                      <td className="px-4 py-3" colSpan={2}>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {group.invites.length} {group.invites.length === 1 ? 'invite' : 'invites'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[latest.status] || 'secondary'}>{latest.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                        {new Date(latest.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground hover:text-foreground transition-[color]"
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
                <div className="overflow-x-auto rounded-xl border border-border opacity-60">
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
