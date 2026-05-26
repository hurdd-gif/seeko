'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, Trash2, Loader2, KeyRound, Plus } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { CARD_TITLE, CARD_DESC } from '@/components/dashboard/lightKit';

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
    <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-[#808080]" />
          <div className="flex flex-col gap-1.5">
            <h3 className={CARD_TITLE}>Security keys</h3>
            <p className={CARD_DESC}>Devices trusted to unlock the payments page.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-[#9a9a9a]">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#0d7aff]/10">
              <KeyRound className="size-4 text-[#0d7aff]" />
            </div>
            <p className="text-sm text-[#808080]">
              No devices registered yet.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[0.06]">
            <AnimatePresence initial={false}>
              {credentials.map(cred => (
                <motion.li
                  key={cred.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Fingerprint className="size-4 shrink-0 text-[#9a9a9a]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#111] truncate">
                        {cred.device_name || 'Unnamed device'}
                      </p>
                      <p className="text-xs text-[#9a9a9a] tabular-nums">
                        {formatLastUsed(cred.last_used_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(cred.id)}
                    disabled={deletingId === cred.id}
                    aria-label={`Revoke ${cred.device_name || 'device'}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#9a9a9a] hover:text-[#d4503e] hover:bg-[#d4503e]/10 disabled:opacity-50 transition-[color,background-color,transform] duration-150 active:scale-[0.94]"
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
          <button
            type="button"
            onClick={registerNew}
            disabled={registering}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] px-3 py-2.5 text-[13px] font-medium text-[#111] transition-[background-color,transform] duration-150 ease-out hover:bg-black/[0.02] active:scale-[0.99] disabled:opacity-50"
          >
            {registering ? (
              <>
                <Loader2 className="size-4 animate-spin text-[#505050]" />
                Awaiting browser…
              </>
            ) : (
              <>
                <Plus className="size-4 text-[#505050]" />
                Register this device
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
