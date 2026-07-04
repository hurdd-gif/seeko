'use client';

import { useState } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { SegmentedCodeInput } from './SegmentedCodeInput';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LIGHT_INPUT, BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

// Light Paper port: fields + CTA migrated dark→light onto the canonical lightKit
// (azure-ring white input, #808080 labels, light segmented OTP cells, black-pill
// CTA) so the invite tab matches the rest of the light auth flow. The error
// AnimatePresence + the verifyOtp/profile-init/redirect logic are untouched.
const SPRING = springs.smooth;
const FIELD_LABEL = 'block text-xs font-medium text-[#808080] mb-1.5';

export function InviteCodeForm() {
  const router = useRouter();
  const { trigger } = useHaptics();
  const reduceMotion = useReducedMotion();
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
        <label htmlFor="invite-email" className={FIELD_LABEL}>
          Email
        </label>
        {/* layoutId pairs this input with the login card's email pill face —
            on the sign-in ↔ invite swap the pill morphs into this field
            (shared-element travel). Standalone mounts (no pill on screen)
            render with no morph, so other hosts are unaffected. */}
        <motion.input
          layoutId="auth-email-morph"
          style={{ borderRadius: 8 }}
          transition={{ layout: reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
          id="invite-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className={cn(
            'w-full px-3 py-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:outline-none',
            LIGHT_INPUT,
          )}
        />
      </div>

      <div className="mb-[18px]">
        <label className="block text-xs font-medium text-[#808080] mb-3 text-center">
          Enter the 8-digit code from your invite email
        </label>
        <SegmentedCodeInput
          value={token}
          onChange={setToken}
          disabled={loading}
          light
        />
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg bg-[#d4503e]/10 px-4 py-2 text-sm text-[#d4503e]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={loading || token.length < 8}
        className={cn(
          BTN_PRIMARY,
          LIGHT_FOCUS_RING,
          'flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40',
        )}
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
