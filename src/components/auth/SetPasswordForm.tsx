'use client';

import { useState } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { DURATION_STATE_MS } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LIGHT_INPUT, BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

// Light Paper port: the field + button surface migrated dark→light onto the
// canonical lightKit (white `shadow-seeko` card, #808080 labels, azure-ring
// inputs, black-pill CTA) so the set-password step matches the light app and
// the signer ceremony. The AnimatePresence button state (idle ⇄ saving with the
// ArrowRight / spinner) is preserved verbatim — only the colors changed.
const FIELD_LABEL = 'block text-xs font-medium text-ink-muted mb-1.5';
const FIELD_INPUT = cn(
  'w-full px-3 py-2 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:outline-none',
  LIGHT_INPUT,
);

export function SetPasswordForm() {
  const router = useRouter();
  const { trigger } = useHaptics();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      trigger('error');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      trigger('error');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      trigger('error');
      return;
    }

    /* The password itself was just set against GoTrue above. This only records
     * that the ceremony happened — and it goes through the API because
     * `must_set_password` is the flag that gates this very screen: a client that
     * can clear it can skip setting a password at all, and keep using the
     * invite's temporary credentials. The route derives the row from the session,
     * so there is no user id to send. */
    await fetch('/api/profile/password-complete', { method: 'POST' });

    trigger('success');
    router.push('/onboarding');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white dark:bg-surface-1 p-6 shadow-seeko">
      <div>
        <label htmlFor="password" className={FIELD_LABEL}>
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="At least 8 characters"
          className={FIELD_INPUT}
        />
      </div>

      <div>
        <label htmlFor="confirm" className={FIELD_LABEL}>
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          placeholder="Re-enter password"
          className={FIELD_INPUT}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          BTN_PRIMARY,
          LIGHT_FOCUS_RING,
          'mt-1 inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={loading ? 'loading' : 'idle'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_STATE_MS / 1000 }}
            className="inline-flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Set password
                <ArrowRight className="size-4 shrink-0" />
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </form>
  );
}
