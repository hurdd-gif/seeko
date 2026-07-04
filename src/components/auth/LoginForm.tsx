'use client';

/* ──────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Login page entrance
 *
 * Read top-to-bottom. Each value is ms after page mount.
 *
 *    0ms   page mounts — card hidden (opacity 0, y +20)
 *  150ms   card fades in, slides up to rest
 *  300ms   badge + heading fade in from y +8
 *  420ms   subtitle fades in
 *  540ms   provider pills (Google / passkey) fade in
 *  660ms   divider fades in
 *  740ms   email field slides in
 *  820ms   password field slides in (staggered 80ms)
 *  900ms   submit button + invite link fade in
 *
 * Layout follows the Paper reference (SK_DB frame 27P-0): centered 420px white
 * card — 64px #525252 circular badge with the white S-mark, 22px/600 −0.02em
 * heading, muted subtitle, stacked #f1f1f1 provider pills, "or" divider, then
 * the email/password pair with the black-pill CTA. The old Sign in / Invite
 * code tab pill is gone; the invite path survives as a footer link that swaps
 * the card body to the ORIGINAL <InviteCodeForm> (logic untouched). Geometry
 * and inks follow the reference exactly: 8px card radius + #E8E8E8BF hairline
 * + 0 10px 20px #D1D1D126 shadow, #515151 heading, #B4B4B4 subcopy, 16px-radius
 * 48px pills with 24px icons. (The 16px-inside-8px radius inversion is the
 * reference's own call — fidelity beats the concentric rule here.)
 * ────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion, AnimatePresence } from 'motion/react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { InviteCodeForm } from '@/components/auth/InviteCodeForm';
import { useHaptics } from '@/components/HapticsProvider';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LIGHT_INPUT, BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

/* ─── Timing (ms after mount) ───────────────────────────── */
const TIMING = {
  card:      150,   // outer card slides up
  identity:  300,   // badge + heading fade in
  subtitle:  420,   // tagline fades in
  providers: 540,   // Google / passkey pills
  divider:   660,   // "or" rule
  field1:    740,   // email field
  field2:    820,   // password field (staggered)
  button:    900,   // submit + invite link
};

/* ─── Element configs ────────────────────────────────────── */
const CARD = {
  offsetY:  20,    // px card starts below resting position
  spring:   springs.smooth,
};

const IDENTITY = {
  offsetY:  8,     // px badge/heading start below resting position
  spring:   springs.firm,
};

const FIELD = {
  offsetY:  10,    // px each field slides up from
  spring:   springs.smooth,
};

const FADE = {
  spring: springs.smooth,
};

const FIELD_LABEL = 'block text-xs font-medium text-[#808080] mb-1.5';
const FIELD_INPUT = cn(
  'h-11 w-full px-3 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:outline-none',
  LIGHT_INPUT,
);

/* Provider pill — reference geometry verbatim: 48px tall, #F1F1F1, 16px radius,
 * 24px icon + 16px/600 #3A3A3A label. */
const PILL = cn(
  'flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#f1f1f1]',
  'text-base font-semibold text-[#3a3a3a]',
  'transition-[background-color,transform] duration-150 ease-out hover:bg-[#eaeaea] active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
  LIGHT_FOCUS_RING,
);

const SUBTLE_LINK =
  'text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]';

/* Official Google "G" (standard brand colors), from the reference frame. */
function GoogleGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M21.6 12.227c0-.709-.064-1.391-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.509h3.232c1.891-1.741 2.982-4.304 2.982-7.35Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.963-.895 6.618-2.422l-3.232-2.509c-.895.6-2.041.954-3.386.954-2.605 0-4.809-1.759-5.596-4.123H3.063v2.591C4.709 19.759 8.091 22 12 22Z" />
      <path fill="#FBBC05" d="M6.405 13.901A5.99 5.99 0 0 1 6.091 12c0-.659.114-1.3.314-1.9V7.51H3.064A9.99 9.99 0 0 0 2 12c0 1.613.386 3.141 1.064 4.491l3.341-2.59Z" />
      <path fill="#EA4335" d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.959 2.991 14.695 2 12 2 8.091 2 4.709 4.241 3.063 7.509L6.404 10.1C7.191 7.736 9.395 5.977 12 5.977Z" />
    </svg>
  );
}

type LoginFormProps = {
  /** Pre-populated error, e.g. a failed OAuth callback redirect. */
  initialError?: string | null;
};

export function LoginForm({ initialError = null }: LoginFormProps) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const [view, setView] = useState<'signin' | 'invite'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [stage, setStage] = useState(0);

  // jsdom and older browsers have no WebAuthn — the pill simply doesn't render.
  const passkeySupported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage(1), TIMING.card));
    timers.push(setTimeout(() => setStage(2), TIMING.identity));
    timers.push(setTimeout(() => setStage(3), TIMING.subtitle));
    timers.push(setTimeout(() => setStage(4), TIMING.providers));
    timers.push(setTimeout(() => setStage(5), TIMING.divider));
    timers.push(setTimeout(() => setStage(6), TIMING.field1));
    timers.push(setTimeout(() => setStage(7), TIMING.field2));
    timers.push(setTimeout(() => setStage(8), TIMING.button));
    return () => timers.forEach(clearTimeout);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      trigger('error');
      return;
    }

    trigger('success');
    router.push('/tasks'); // Issues is the landing page (Overview removed)
    router.refresh();
  }

  async function handleGoogle() {
    setGoogleBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/tasks` },
    });

    // On success the browser navigates away; we only regain control on failure.
    if (error) {
      setError(error.message);
      setGoogleBusy(false);
      trigger('error');
    }
  }

  async function handlePasskey() {
    setPasskeyBusy(true);
    setError(null);

    try {
      const optsRes = await fetch('/api/auth/passkey/options', { method: 'POST' });
      if (!optsRes.ok) throw new Error('Could not start passkey sign-in');
      const options = await optsRes.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}));
        throw new Error(
          body.error === 'untrusted-device'
            ? 'This passkey is no longer trusted. Sign in another way.'
            : 'Passkey sign-in failed. Try another method.'
        );
      }

      trigger('success');
      router.push('/tasks');
      router.refresh();
    } catch (err) {
      // User closed the browser's passkey sheet — a quiet reset, not an error.
      const cancelled =
        err instanceof Error &&
        (err.name === 'NotAllowedError' ||
          (err.cause instanceof Error && err.cause.name === 'NotAllowedError'));
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Passkey sign-in failed');
        trigger('error');
      }
    } finally {
      setPasskeyBusy(false);
    }
  }

  return (
    <div className="relative w-full max-w-[420px]">

      {/* Card */}
      <motion.div
        className="relative rounded-lg border border-[#E8E8E8]/75 bg-white px-6 py-10 shadow-[0_10px_20px_#D1D1D126]"
        initial={{ opacity: 0, y: CARD.offsetY }}
        animate={{ opacity: stage >= 1 ? 1 : 0, y: stage >= 1 ? 0 : CARD.offsetY }}
        transition={CARD.spring}
      >
        {/* Badge + heading */}
        <motion.div
          className="mb-3 flex flex-col items-center gap-5"
          initial={{ opacity: 0, y: IDENTITY.offsetY }}
          animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : IDENTITY.offsetY }}
          transition={IDENTITY.spring}
        >
          {/* White S-mark on the reference's #525252 disc — the dark-canvas
              asset finally has a home on the light card. */}
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#525252]">
            <img src="/seeko-s.png" alt="" width={32} height={32} className="h-8 w-auto object-contain" />
          </div>
          <h1 className="text-balance text-[22px] font-semibold tracking-[-0.02em] text-[#515151]">
            Sign in to SEEKO
          </h1>
        </motion.div>

        {/* Subtitle — crossfade between views */}
        {/* mode="wait" mounts one subtitle at a time, so the container can
            auto-size — no fixed height to overflow when the copy wraps. */}
        <motion.div
          className="mb-10 text-center text-base leading-snug text-[#b4b4b4]"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 3 ? 1 : 0 }}
          transition={FADE.spring}
        >
          <AnimatePresence mode="wait">
            <motion.p
              key={view}
              initial={{ opacity: 0, filter: 'blur(4px)', y: 2 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(4px)', y: -2 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {view === 'signin' ? 'Your hub for tasks, docs, and payments' : 'Join the team!'}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        {/* Shared error slot — covers all three methods */}
        <div aria-live="polite">
          {error && (
            <motion.p
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 rounded-lg bg-[#d4503e]/10 px-3 py-2 text-sm text-[#d4503e]"
            >
              {error}
            </motion.p>
          )}
        </div>

        {/* Views */}
        <AnimatePresence mode="wait">
          {view === 'signin' ? (
            <motion.div
              key="signin"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={springs.smooth}
            >
              {/* Provider pills */}
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: FIELD.offsetY }}
                animate={{ opacity: stage >= 4 ? 1 : 0, y: stage >= 4 ? 0 : FIELD.offsetY }}
                transition={FIELD.spring}
              >
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleBusy || passkeyBusy}
                  className={PILL}
                >
                  {googleBusy ? <Loader2 className="size-6 animate-spin" /> : <GoogleGlyph />}
                  {googleBusy ? 'Redirecting…' : 'Continue with Google'}
                </button>
                {passkeySupported && (
                  <button
                    type="button"
                    onClick={handlePasskey}
                    disabled={googleBusy || passkeyBusy}
                    className={PILL}
                  >
                    {passkeyBusy
                      ? <Loader2 className="size-6 animate-spin" />
                      : <Fingerprint className="size-6" strokeWidth={1.75} />}
                    {passkeyBusy ? 'Waiting for passkey…' : 'Continue with passkey'}
                  </button>
                )}
              </motion.div>

              {/* Divider */}
              <motion.div
                className="my-6 flex items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: stage >= 5 ? 1 : 0 }}
                transition={FADE.spring}
              >
                <span className="h-px flex-1 bg-black/[0.06]" />
                <span className="text-xs text-[#b3b3b3]">or</span>
                <span className="h-px flex-1 bg-black/[0.06]" />
              </motion.div>

              {/* Email + password */}
              <form onSubmit={handleLogin} className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: FIELD.offsetY }}
                  animate={{ opacity: stage >= 6 ? 1 : 0, y: stage >= 6 ? 0 : FIELD.offsetY }}
                  transition={FIELD.spring}
                >
                  <label htmlFor="email" className={FIELD_LABEL}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className={FIELD_INPUT}
                    placeholder="you@seeko.studio"
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: FIELD.offsetY }}
                  animate={{ opacity: stage >= 7 ? 1 : 0, y: stage >= 7 ? 0 : FIELD.offsetY }}
                  transition={FIELD.spring}
                >
                  <label htmlFor="password" className={FIELD_LABEL}>
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className={FIELD_INPUT}
                  />
                </motion.div>

                <motion.button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    BTN_PRIMARY,
                    LIGHT_FOCUS_RING,
                    'h-12 w-full rounded-2xl text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                  initial={{ opacity: 0, y: FIELD.offsetY }}
                  animate={{ opacity: stage >= 8 ? 1 : 0, y: stage >= 8 ? 0 : FIELD.offsetY }}
                  transition={FIELD.spring}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </motion.button>
              </form>

              {/* Invite path — a quiet footer link instead of the old tab */}
              <motion.p
                className="mt-6 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: stage >= 8 ? 1 : 0 }}
                transition={FADE.spring}
              >
                <button
                  type="button"
                  onClick={() => { setView('invite'); setError(null); }}
                  className={SUBTLE_LINK}
                >
                  Have an invite code?
                </button>
              </motion.p>
            </motion.div>
          ) : (
            <motion.div
              key="invite"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={springs.smooth}
            >
              <InviteCodeForm />
              <p className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => { setView('signin'); setError(null); }}
                  className={SUBTLE_LINK}
                >
                  Back to sign in
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
