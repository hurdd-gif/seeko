'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RotateCw, Ban, Download, Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { ExternalSigningInvite } from '@/lib/types';

interface InviteTableProps {
  refreshKey: number;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  verified: 'secondary',
  signed: 'default',
  expired: 'secondary',
  revoked: 'destructive',
};

export function InviteTable({ refreshKey }: InviteTableProps) {
  const [invites, setInvites] = useState<ExternalSigningInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('external_signing_invites')
      .select('*')
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
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success(action === 'revoke' ? 'Invite revoked' : 'Invite resent');
      fetchInvites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownload(inviteId: string) {
    setActionLoading(inviteId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from('agreements')
        .download(`external/${inviteId}/agreement.pdf`);
      if (error || !data) throw new Error('Failed to download');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agreement-${inviteId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invites.length === 0) {
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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Sent Invites
          <span className="ml-2 text-xs text-muted-foreground/60">({invites.length})</span>
        </h2>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Recipient</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Document</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Sent</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Expires</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id} className="border-b border-border/50 transition-colors hover:bg-muted/20">
                <td className="px-4 py-3 text-foreground font-mono text-xs">{invite.recipient_email}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {invite.template_type === 'preset' ? invite.template_id : invite.custom_title || 'Custom'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[invite.status] || 'secondary'}>
                    {invite.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(invite.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
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
                          className="rounded p-1.5 hover:bg-muted transition-colors group"
                        >
                          <RotateCw className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </button>
                        <button
                          onClick={() => handleAction(invite.id, 'revoke')}
                          disabled={actionLoading === invite.id}
                          title="Revoke invite"
                          className="rounded p-1.5 hover:bg-destructive/10 transition-colors group"
                        >
                          <Ban className="size-3.5 text-muted-foreground group-hover:text-destructive transition-colors" />
                        </button>
                      </>
                    )}
                    {invite.status === 'signed' && (
                      <button
                        onClick={() => handleDownload(invite.id)}
                        disabled={actionLoading === invite.id}
                        title="Download signed PDF"
                        className="rounded p-1.5 hover:bg-seeko-accent/10 transition-colors group"
                      >
                        <Download className="size-3.5 text-muted-foreground group-hover:text-seeko-accent transition-colors" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
