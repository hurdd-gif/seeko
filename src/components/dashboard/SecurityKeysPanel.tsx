'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, Trash2, Loader2, KeyRound, Plus } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Credential = {
  id: string;
  device_name: string | null;
  created_at: string | null;
  last_used_at: string | null;
};

function formatLastUsed(iso: string | null): string {
  if (!iso) return 'Never used';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function SecurityKeysPanel() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/passkey/credentials');
      if (!res.ok) throw new Error('Failed to load');
      const body = await res.json();
      setCredentials(body.credentials ?? []);
    } catch {
      toast.error('Could not load security keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const registerNew = useCallback(async () => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      toast.error('Passkeys are not supported in this browser');
      return;
    }
    setRegistering(true);
    try {
      const optsRes = await fetch('/api/payments/passkey/register-options', { method: 'POST' });
      if (!optsRes.ok) throw new Error((await optsRes.json()).error || 'Failed to start');
      const options = await optsRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyRes = await fetch('/api/payments/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error || 'Registration failed');
      toast.success('Device registered');
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      if (!/cancel|abort/i.test(msg)) toast.error(msg);
    } finally {
      setRegistering(false);
    }
  }, [refresh]);

  const revoke = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/payments/passkey/credentials?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to revoke');
      setCredentials(prev => prev.filter(c => c.id !== id));
      toast.success('Device revoked');
    } catch {
      toast.error('Could not revoke device');
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security keys</CardTitle>
        <CardDescription>Devices trusted to unlock the payments page.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-seeko-accent/10">
              <KeyRound className="size-4 text-seeko-accent" />
            </div>
            <p className="text-sm text-muted-foreground">
              No devices registered yet.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {credentials.map(cred => (
                <motion.li
                  key={cred.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Fingerprint className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {cred.device_name || 'Unnamed device'}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatLastUsed(cred.last_used_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(cred.id)}
                    disabled={deletingId === cred.id}
                    aria-label={`Revoke ${cred.device_name || 'device'}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors active:scale-[0.94]"
                  >
                    {deletingId === cred.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {!loading && (
          <Button
            onClick={registerNew}
            disabled={registering}
            variant="outline"
            className="w-full active:scale-[0.98] transition-transform"
          >
            {registering ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Awaiting browser…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Plus className="size-4" />
                Register this device
              </span>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
