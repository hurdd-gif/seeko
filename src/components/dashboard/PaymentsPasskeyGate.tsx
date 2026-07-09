'use client';

import { useState, useEffect, useCallback } from 'react';
import { Link } from '@/lib/react-router-adapters';
import { motion } from 'motion/react';
import { Lock, KeyRound, Loader2, ChevronLeft } from 'lucide-react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LightShell } from '@/components/dashboard/LightShell';
import { DIALOG_SAVE, LIGHT_INPUT } from '@/components/dashboard/lightKit';
import { springs } from '@/lib/motion';

type Mode = 'loading' | 'first-time-setup' | 'unlock' | 'unsupported' | 'recovery';

interface PaymentsPasskeyGateProps {
  onAuthenticated: () => void;
}

export function PaymentsPasskeyGate({ onAuthenticated }: PaymentsPasskeyGateProps) {
  const [mode, setMode] = useState<Mode>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryPw, setRecoveryPw] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.PublicKeyCredential) {
      setMode('unsupported');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/payments/passkey/auth-options', { method: 'POST' });
        if (!res.ok) {
          setMode('first-time-setup');
          return;
        }
        const opts = await res.json();
        setMode((opts.allowCredentials?.length ?? 0) > 0 ? 'unlock' : 'first-time-setup');
      } catch {
        setMode('first-time-setup');
      }
    })();
  }, []);

  const doFirstTimeSetup = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError('');
      try {
        const verifyRes = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: recoveryPw }),
        });
        if (!verifyRes.ok) throw new Error((await verifyRes.json()).error || 'Invalid password');

        const optsRes = await fetch('/api/payments/passkey/register-options', { method: 'POST' });
        if (!optsRes.ok) throw new Error((await optsRes.json()).error || 'Failed to start enrollment');
        const options = await optsRes.json();
        const attestation = await startRegistration({ optionsJSON: options });
        const regRes = await fetch('/api/payments/passkey/register-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attestation }),
        });
        if (!regRes.ok) throw new Error((await regRes.json()).error || 'Registration failed');
        onAuthenticated();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Setup failed');
      } finally {
        setBusy(false);
      }
    },
    [onAuthenticated, recoveryPw]
  );

  const doUnlock = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const optsRes = await fetch('/api/payments/passkey/auth-options', { method: 'POST' });
      if (!optsRes.ok) throw new Error('Failed to start unlock');
      const options = await optsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch('/api/payments/passkey/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}));
        throw new Error(
          body.error === 'untrusted-device'
            ? 'This device is no longer trusted. Use another or recover.'
            : 'Could not unlock'
        );
      }
      onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlock');
    } finally {
      setBusy(false);
    }
  }, [onAuthenticated]);

  const doRecover = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError('');
      try {
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: recoveryPw }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Invalid password');
        onAuthenticated();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Recovery failed');
      } finally {
        setBusy(false);
      }
    },
    [onAuthenticated, recoveryPw]
  );

  const icon =
    mode === 'recovery' || mode === 'first-time-setup'
      ? <KeyRound className="size-5 text-[#0a63cc]" />
      : <Lock className="size-5 text-[#0a63cc]" />;

  const title =
    mode === 'first-time-setup' ? 'Set up payments access'
    : mode === 'recovery' ? 'Recovery access'
    : mode === 'unsupported' ? 'Passkeys unavailable'
    : 'Payments access';

  const description =
    mode === 'first-time-setup' ? 'Enter your recovery password to authorize this device. After verification you’ll be asked to enroll Touch ID, Face ID, or a security key.'
    : mode === 'recovery' ? 'Use your recovery password.'
    : mode === 'unsupported' ? 'Your browser does not support passkeys. Use recovery instead.'
    : mode === 'loading' ? ''
    : 'Approve with Touch ID, Face ID, or a security key. Unlocks payments for 1 hour.';

  const breadcrumb = (
    <Link
      href="/tasks"
      className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
    >
      <ChevronLeft className="size-3.5" />
      <span>Payments</span>
    </Link>
  );

  return (
    <LightShell fill bordered leftSlot={breadcrumb}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-6 py-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.snappy}
            className="w-full max-w-[440px]"
          >
            <Card className="w-full rounded-2xl border-0 bg-white shadow-seeko">
              <CardHeader className="text-center p-8 pb-5">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[#0a63cc]/10">
                  {icon}
                </div>
                <CardTitle className="text-[#111]">{title}</CardTitle>
                <CardDescription className="text-[#808080]">{description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-8 pt-0">
                {mode === 'loading' && (
                  <div className="flex justify-center py-4 text-[#9a9a9a]">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                )}
                {mode === 'first-time-setup' && (
                  <form onSubmit={doFirstTimeSetup} className="space-y-3">
                    <Input
                      type="password"
                      value={recoveryPw}
                      onChange={e => setRecoveryPw(e.target.value)}
                      placeholder="Recovery password"
                      autoFocus
                      className={LIGHT_INPUT}
                    />
                    <Button type="submit" disabled={busy || !recoveryPw} className={`w-full active:scale-[0.98] transition-transform ${DIALOG_SAVE}`}>
                      {busy ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          Setting up…
                        </span>
                      ) : (
                        'Set up device'
                      )}
                    </Button>
                  </form>
                )}
                {mode === 'unlock' && (
                  <Button onClick={doUnlock} disabled={busy} className={`w-full active:scale-[0.98] transition-transform ${DIALOG_SAVE}`}>
                    {busy ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Awaiting browser…
                      </span>
                    ) : (
                      'Unlock with passkey'
                    )}
                  </Button>
                )}
                {mode === 'recovery' && (
                  <form onSubmit={doRecover} className="space-y-3">
                    <Input
                      type="password"
                      value={recoveryPw}
                      onChange={e => setRecoveryPw(e.target.value)}
                      placeholder="Recovery password"
                      autoFocus
                      className={LIGHT_INPUT}
                    />
                    <Button type="submit" disabled={busy || !recoveryPw} className={`w-full active:scale-[0.98] transition-transform ${DIALOG_SAVE}`}>
                      {busy ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          Verifying…
                        </span>
                      ) : (
                        'Recover'
                      )}
                    </Button>
                  </form>
                )}
                {error && <p className="text-sm text-[#d4503e]">{error}</p>}
                {mode !== 'recovery' && mode !== 'loading' && (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('recovery');
                    }}
                    className="block w-full text-center text-xs text-[#9a9a9a] hover:text-[#3a3a3a] transition-colors"
                  >
                    {mode === 'first-time-setup' ? 'Skip enrollment — use recovery only' : 'Lost your devices? Use recovery'}
                  </button>
                )}
                {mode === 'recovery' && (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('unlock');
                    }}
                    className="block w-full text-center text-xs text-[#9a9a9a] hover:text-[#3a3a3a] transition-colors"
                  >
                    Back to passkey
                  </button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
    </LightShell>
  );
}
