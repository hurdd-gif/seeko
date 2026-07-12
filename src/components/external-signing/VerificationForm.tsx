'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Mail, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LIGHT_OTP_CELL, LIGHT_RECIPIENT_CTA, LIGHT_RECIPIENT_MUTED, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

interface VerificationFormProps {
  token: string;
  maskedEmail: string;
  onVerified: (data: Record<string, unknown>) => void;
  sendCodeEndpoint?: string;
  verifyEndpoint?: string;
  /** Opt into the light signer-ceremony theme. Default false → dark. */
  light?: boolean;
}

const SPRING = springs.smooth;
const CODE_LENGTH = 6;
const COOLDOWN_SECONDS = 60;

function getCooldownKey(token: string) { return `sign-cooldown-${token}`; }
function getSentKey(token: string) { return `sign-code-sent-${token}`; }

function getStoredCooldown(token: string): number {
  try {
    const expiry = Number(localStorage.getItem(getCooldownKey(token)) || 0);
    const remaining = Math.ceil((expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch { return 0; }
}

function storeCooldown(token: string) {
  try {
    localStorage.setItem(getCooldownKey(token), String(Date.now() + COOLDOWN_SECONDS * 1000));
    localStorage.setItem(getSentKey(token), '1');
  } catch { /* noop */ }
}

export function VerificationForm({
  token,
  maskedEmail,
  onVerified,
  sendCodeEndpoint = '/api/external-signing/send-code',
  verifyEndpoint = '/api/external-signing/verify',
  light = false,
}: VerificationFormProps) {
  const [codeSent, setCodeSent] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const reduce = useReducedMotion();

  // Restore persisted state after hydration (avoids SSR mismatch)
  useEffect(() => {
    const stored = getStoredCooldown(token);
    if (stored > 0) setResendCooldown(stored);
    try {
      if (localStorage.getItem(getSentKey(token)) === '1') {
        setCodeSent(true);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      }
    } catch { /* noop */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSendCode() {
    setSending(true);
    setError('');
    try {
      const res = await fetch(sendCodeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send code');
      }
      setCodeSent(true);
      startCooldown();
      // Focus first digit after transition
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setSending(false);
    }
  }

  const startCooldown = useCallback(() => {
    storeCooldown(token);
    setResendCooldown(COOLDOWN_SECONDS);
  }, [token]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function handleResendCode() {
    setSending(true);
    setError('');
    try {
      const res = await fetch(sendCodeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resend code');
      }
      setDigits(Array(CODE_LENGTH).fill(''));
      startCooldown();
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(codeStr: string) {
    setVerifying(true);
    setError('');
    try {
      const res = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code: codeStr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      onVerified(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    const code = next.join('');
    if (code.length === CODE_LENGTH) {
      handleVerify(code);
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    pasted.split('').forEach((d, i) => { next[i] = d; });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
    if (pasted.length === CODE_LENGTH) {
      handleVerify(pasted);
    }
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <AnimatePresence mode="wait">
        {!codeSent ? (
          /* ── Send code phase ─────────────────────────── */
          <motion.div
            key="send"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={reduce ? { duration: 0.12 } : SPRING}
            className="flex flex-col items-center gap-4"
          >
            <p className={cn('text-sm', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}>
              We&apos;ll send a code to{' '}
              <span className={cn('font-mono text-xs', light ? 'text-ink-title' : 'text-foreground/60')}>{maskedEmail}</span>
            </p>
            <Button
              type="button"
              onClick={handleSendCode}
              disabled={sending}
              className={cn('w-full gap-2', light && LIGHT_RECIPIENT_CTA)}
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {sending ? 'Sending...' : 'Send Code'}
            </Button>
          </motion.div>
        ) : (
          /* ── Enter code phase ────────────────────────── */
          <motion.div
            key="verify"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0.12 } : SPRING}
            className="flex flex-col items-center gap-5"
          >
            <p className={cn('text-sm', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}>
              Enter the code sent to your email
            </p>

            {/* Hero digit inputs */}
            <div className="flex gap-1.5 sm:gap-2.5" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <motion.input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                  disabled={verifying}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0.12 } : { ...SPRING, delay: i * 0.04 }}
                  className={cn(
                    'size-12 sm:size-14 rounded-xl text-center text-xl sm:text-2xl font-semibold font-mono transition-colors disabled:opacity-50',
                    light
                      ? LIGHT_OTP_CELL
                      : 'border border-border bg-muted text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40',
                  )}
                />
              ))}
            </div>

            {/* Auto-submits, but show loader when verifying */}
            {verifying && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn('flex items-center gap-2 text-sm', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}
              >
                <Loader2 className="size-4 animate-spin" />
                Verifying...
              </motion.div>
            )}

            {/* Resend */}
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || sending}
              className={cn(
                'min-h-[44px] rounded-md px-4 text-xs transition-colors disabled:opacity-40 disabled:cursor-default flex items-center gap-1.5',
                light ? 'text-ink-muted-strong hover:text-ink-title' : 'text-muted-foreground hover:text-foreground',
                light && LIGHT_FOCUS_RING,
              )}
            >
              <RotateCw className="size-3" />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Didn\u2019t receive it? Resend"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              'text-sm px-4 py-2 rounded-lg',
              light ? 'text-danger bg-danger/10' : 'text-destructive bg-destructive/10',
            )}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
