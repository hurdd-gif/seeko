'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { SegmentedCodeInput } from './SegmentedCodeInput';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };

export function InviteCodeForm() {
  const router = useRouter();
  const { trigger } = useHaptics();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (otpError) {
      setError('Invalid or expired invite code. Please check your email and try again.');
      setLoading(false);
      trigger('error');
      return;
    }

    // Initialise profile with pending invite metadata
    await fetch('/api/profile/init', { method: 'POST' });

    trigger('success');
    router.push('/set-password');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="invite-email" className="block text-xs font-medium text-muted-foreground mb-1.5">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/40 transition-all"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-3 text-center">
          Enter the 8-digit code from your invite email
        </label>
        <SegmentedCodeInput
          value={token}
          onChange={setToken}
          disabled={loading}
        />
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={loading || token.length < 8}
        className="w-full py-2.5 px-4 rounded-xl bg-foreground text-background font-semibold text-sm hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Verifying...
          </>
        ) : (
          'Continue'
        )}
      </button>
    </form>
  );
}
