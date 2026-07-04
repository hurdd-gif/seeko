'use client';

import { useRef, useState } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { SegmentedCodeInput } from './SegmentedCodeInput';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LIGHT_INPUT, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

// Light Paper port: fields + CTA migrated dark→light onto the canonical lightKit
// (azure-ring white input, #808080 labels, light segmented OTP cells, black-pill
// CTA) so the invite tab matches the rest of the light auth flow. The error
// AnimatePresence + the verifyOtp/profile-init/redirect logic are untouched.
const SPRING = springs.smooth;
const FIELD_LABEL = 'block text-xs font-medium text-[#808080] mb-1.5';

/* Error grammar — matches the login card's swap curves: entrances land on
 * the 250ms [0.22,1,0.36,1] ease with a height glide + 2px blur bridge,
 * exits clear faster (150ms) and subtler. The offending control also gets
 * a short WAAPI shake for point-of-error continuity. */
const ERR = {
  in: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  out: { duration: 0.15, ease: 'easeOut' as const },
  shake: {
    keyframes: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(0)' },
    ],
    options: { duration: 300, easing: 'ease-out' } as KeyframeAnimationOptions,
  },
};

function shake(el: HTMLElement | null, reduceMotion: boolean | null) {
  if (!el || reduceMotion || typeof el.animate !== 'function') return;
  el.animate(ERR.shake.keyframes, ERR.shake.options);
}

export function InviteCodeForm() {
  const router = useRouter();
  const { trigger } = useHaptics();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Which control caused the error — drives the red highlight (field vs cells).
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const cellsRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // In-design validation (form is noValidate): the native browser bubble +
    // blue focus ring clashed with the card — errors render red, in place.
    const trimmed = email.trim();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      setEmailInvalid(true);
      setError(
        trimmed
          ? "That doesn't look like an email address."
          : 'Enter the email your invite was sent to.',
      );
      const field = document.getElementById('invite-email');
      field?.focus();
      shake(field, reduceMotion);
      trigger('error');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (otpError) {
      setCodeInvalid(true);
      setError('Invalid or expired invite code. Please check your email and try again.');
      setLoading(false);
      shake(cellsRef.current, reduceMotion);
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
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
          onChange={e => {
            setEmail(e.target.value);
            if (emailInvalid) {
              setEmailInvalid(false);
              setError(null);
            }
          }}
          required
          aria-invalid={emailInvalid || undefined}
          placeholder="you@example.com"
          className={cn(
            'w-full px-3 py-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:outline-none',
            LIGHT_INPUT,
            // Error state overrides the azure focus ring — red, not blue.
            emailInvalid &&
              'border-[#d4503e]/60 focus-visible:border-[#d4503e] focus-visible:ring-2 focus-visible:ring-[#d4503e]/15',
          )}
          aria-describedby={emailInvalid ? 'invite-email-error' : undefined}
        />
        {/* Email errors live WITH the email field (not down by the code) —
            the message glides open under the input on the same curve the
            border turns red, so cause and callout read as one event. */}
        <AnimatePresence initial={false}>
          {emailInvalid && error && (
            <motion.p
              id="invite-email-error"
              initial={{ height: 0, opacity: 0, filter: 'blur(2px)' }}
              animate={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
              exit={{ height: 0, opacity: 0, filter: 'blur(2px)', transition: reduceMotion ? { duration: 0 } : ERR.out }}
              transition={reduceMotion ? { duration: 0 } : ERR.in}
              className="overflow-hidden text-[13px] leading-snug text-[#d4503e]"
            >
              <span className="block pt-1.5">{error}</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div ref={cellsRef} className="mb-[18px]">
        <label className="block text-xs font-medium text-[#808080] mb-3 text-center">
          Enter the 8-digit code from your invite email
        </label>
        <SegmentedCodeInput
          value={token}
          onChange={next => {
            setToken(next);
            if (codeInvalid) {
              setCodeInvalid(false);
              setError(null);
            }
          }}
          disabled={loading}
          light
          invalid={codeInvalid}
        />
        {/* Code errors stay with the code cells; the pill glides open (height,
            not a pop) so the layout shift rides the same curve as the cells
            turning red. Lives INSIDE this block — mounting a sibling into the
            form's space-y-5 would snap a 20px gap in before the glide starts.
            Email errors render inline under the email field, never here. */}
        <AnimatePresence initial={false}>
          {codeInvalid && error && (
            <motion.div
              initial={{ height: 0, opacity: 0, filter: 'blur(2px)' }}
              animate={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
              exit={{ height: 0, opacity: 0, filter: 'blur(2px)', transition: reduceMotion ? { duration: 0 } : ERR.out }}
              transition={reduceMotion ? { duration: 0 } : ERR.in}
              className="overflow-hidden"
            >
              <p className="mt-4 rounded-lg bg-[#d4503e]/10 px-4 py-2 text-sm text-[#d4503e]">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CTA springs into black the moment the 8th digit lands. A pure color
          crossfade read "the same" at any pace, so completion is now a
          compound event: the pill rests at 98% scale and springs up to full
          size (firm, 400/30) as bg + label flip to black — arrival you can
          see, not just a tint change. Removing a digit springs it back.
          Hover darkening keeps its own quick 150ms; press keeps a 150ms CSS
          transform (Tailwind `scale` composes with motion's transform). */}
      <motion.button
        type="submit"
        disabled={loading || token.length < 8}
        initial={false}
        animate={{
          backgroundColor: token.length === 8 ? '#111111' : '#f1f1f1',
          color: token.length === 8 ? '#ffffff' : '#9a9a9a',
          scale: token.length === 8 ? 1 : 0.98,
        }}
        // Reduced motion drops the scale movement but KEEPS the color fade —
        // a crossfade isn't vestibular, and it's the affordance asked for.
        transition={
          reduceMotion
            ? { scale: { duration: 0 }, backgroundColor: { duration: 0.15, ease: 'easeOut' }, color: { duration: 0.15, ease: 'easeOut' } }
            : springs.firm
        }
        {...(token.length === 8
          ? { whileHover: { backgroundColor: '#2a2a2a', transition: { duration: 0.15, ease: 'easeOut' as const } } }
          : {})}
        className={cn(
          LIGHT_FOCUS_RING,
          'flex h-10 w-full items-center justify-center gap-2 rounded-[14px] text-sm font-semibold active:scale-[0.98]',
          '[transition:transform_150ms_ease-out]',
          token.length < 8 && 'cursor-not-allowed',
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
      </motion.button>
    </form>
  );
}
