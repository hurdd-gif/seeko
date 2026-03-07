'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { DURATION_STATE_MS } from '@/lib/motion';

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

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ must_set_password: false }).eq('id', user.id);
    }

    trigger('success');
    router.push('/onboarding');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5">
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
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-xs font-medium text-muted-foreground mb-1.5">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          placeholder="Re-enter password"
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-seeko-accent text-primary-foreground font-semibold text-sm hover:bg-seeko-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[140px] inline-flex items-center justify-center gap-2"
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
