'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Lock, Fingerprint, KeyRound, Loader2 } from 'lucide-react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { springs } from '@/lib/motion';

type Mode = 'loading' | 'register' | 'unlock' | 'unsupported' | 'recovery';

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
          setMode('register');
          return;
        }
        const opts = await res.json();
        setMode((opts.allowCredentials?.length ?? 0) > 0 ? 'unlock' : 'register');
      } catch {
        setMode('register');
      }
    })();
  }, []);

  const doRegister = useCallback(async () => {
    setBusy(true);
    setError('');
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
      onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not register device');
    } finally {
      setBusy(false);
    }
  }, [onAuthenticated]);

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
    mode === 'recovery' ? <KeyRound className="size-5 text-seeko-accent" />
    : mode === 'register' ? <Fingerprint className="size-5 text-seeko-accent" />
    : <Lock className="size-5 text-seeko-accent" />;

  const title =
    mode === 'recovery' ? 'Recovery access'
    : mode === 'register' ? 'Register this device'
    : mode === 'unsupported' ? 'Passkeys unavailable'
    : 'Payments access';

  const description =
    mode === 'recovery' ? 'Use your recovery password.'
    : mode === 'register' ? 'Use Touch ID, Face ID, or a security key to enroll this device. Unlocks payments for 1 hour.'
    : mode === 'unsupported' ? 'Your browser does not support passkeys. Use recovery instead.'
    : mode === 'loading' ? ''
    : 'Approve with Touch ID, Face ID, or a security key. Unlocks payments for 1 hour.';

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springs.snappy}
      >
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-seeko-accent/10">
              {icon}
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mode === 'loading' && (
              <div className="flex justify-center py-4 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {mode === 'register' && (
              <Button onClick={doRegister} disabled={busy} className="w-full">
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Awaiting browser…
                  </span>
                ) : (
                  'Register this device'
                )}
              </Button>
            )}
            {mode === 'unlock' && (
              <Button onClick={doUnlock} disabled={busy} className="w-full">
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
                />
                <Button type="submit" disabled={busy || !recoveryPw} className="w-full">
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            {mode !== 'recovery' && mode !== 'loading' && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('recovery');
                }}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Lost your devices? Use recovery
              </button>
            )}
            {mode === 'recovery' && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('unlock');
                }}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to passkey
              </button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
