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
 *  540ms   provider pills (Google / passkey / email) fade in
 *  660ms   invite link fades in
 *
 * SURFACE MORPH — "Continue with email" (transitions.dev pattern)
 *
 * The email pill IS the form's closed state. On click the surface
 * animates height 48 → auto, radius 16 → 20, tint #f1f1f1 → #f7f7f7
 * (bouncy open spring, calmer close). The two faces cross-fade with
 * slide ±12px + scale 0.97 + blur 2px. Collapsed form is `inert`;
 * Escape collapses; focus moves in on open, back to the pill on close.
 *
 * PAGE SWAP — sign-in ↔ invite (transitions.dev side-by-side + morph)
 *
 * Both pages animate simultaneously (±8px slide, 3px blur; exits clear in
 * 150ms, entrances land in 250ms, the card reshapes over 400ms (WAAPI) —
 * and the route pins the card's TOP so growth never lurches the frame). The
 * subtitle and the view-toggle link live OUTSIDE the swap and crossfade
 * in place on the same curve, so the frame never dies. Continuity anchor:
 * the email pill's face and the invite form's email input share a
 * layoutId — the pill visually travels and reshapes into the input
 * (and back), stitching the two views into one surface.
 *
 * Layout follows the Paper reference (SK_DB frame 27P-0): centered 420px white
 * card — 64px #525252 circular badge with the white S-mark, 22px/600 −0.02em
 * heading, muted subtitle, and a pills-only stack (Google / passkey / email —
 * the email pill morphs into the email/password form on demand, so the card's
 * default state matches the reference's pills-only layout). The old Sign in /
 * Invite code tab pill is gone; the invite path survives as a footer link that
 * swaps the card body to the ORIGINAL <InviteCodeForm> (logic untouched). Geometry
 * and inks follow the reference exactly: 8px card radius + #E8E8E8BF hairline
 * + 0 10px 20px #D1D1D126 shadow, #515151 heading, #B4B4B4 subcopy, 16px-radius
 * 48px pills with 24px icons. (The 16px-inside-8px radius inversion is the
 * reference's own call — fidelity beats the concentric rule here.)
 * ────────────────────────────────────────────────────────── */

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, Loader2, Mail, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { InviteCodeForm } from '@/components/auth/InviteCodeForm';
import { useHaptics } from '@/components/HapticsProvider';
import { springs } from '@/lib/motion';
import { resolvePostLoginDestination, type MinimalSupabase } from '@/lib/post-login-destination';
import { cn } from '@/lib/utils';
import { LIGHT_INPUT, BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

/* ─── Timing (ms after mount) ───────────────────────────── */
const TIMING = {
  card:      150,   // outer card slides up
  identity:  300,   // badge + heading fade in
  subtitle:  420,   // tagline fades in
  providers: 540,   // Google / passkey / email pills
  footer:    660,   // invite link
};

/* ─── View swap (transitions.dev page side-by-side) ───────
 * Sign-in is page 1 (rests/exits left), invite is page 2 (right).
 * Both pages animate SIMULTANEOUSLY (popLayout, not mode="wait"):
 * ±8px slide + blur 3px + fade, 250ms cubic-bezier(0.22,1,0.36,1). */
const PAGE = {
  slide: 8,
  blur:  3,
  t:    { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  // Exits clear faster than entrances arrive — shrinks the double-exposure
  // window so the two content sets never read as clashing.
  out:  { duration: 0.15, ease: 'easeOut' as const },
  // Card reshape runs on WAAPI, not Motion: Motion's height animation keeps
  // its own 'auto' unit state, and its auto→px conversion re-measures AFTER
  // the new page is in flow — so it always sprang new→new and the resize
  // landed as a hard cut. WAAPI animates over the pinned inline height.
  height: { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' } as const,
};

/* ─── Email surface morph (transitions.dev grammar) ──────── */
const MORPH = {
  open:   { type: 'spring', duration: 0.5, bounce: 0.2 } as const,  // ≈ cubic-bezier(.34,1.25,.64,1)
  close:  { type: 'spring', duration: 0.35, bounce: 0 } as const,   // calmer settle
  fade:   { duration: 0.2, ease: 'easeOut' } as const,              // face cross-fade
  slide:  12,     // px each face travels (vertical morph → vertical slide)
  scale:  0.97,   // form face rests slightly shrunk while hidden
  blur:   2,      // px blur bridging the cross-fade
  radius: { closed: 16, open: 20 },
  height: { closed: 48 },
  tint:   { closed: '#f1f1f1', open: '#f7f7f7' },
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

const FIELD_INPUT = cn(
  'h-11 w-full px-3 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:outline-none',
  LIGHT_INPUT,
);

// Error state overrides the azure focus border — red, not blue (matches the
// invite tab's treatment so both forms speak one error language).
const FIELD_INPUT_INVALID =
  'border-[#d4503e]/60 focus-visible:border-[#d4503e] focus-visible:ring-2 focus-visible:ring-[#d4503e]/15';

/* Point-of-error continuity: the offending field shakes as the message lands
 * (same keyframes as InviteCodeForm — one grammar across the auth card). */
const SHAKE_KEYFRAMES = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(4px)' },
  { transform: 'translateX(-2px)' },
  { transform: 'translateX(0)' },
];

function shakeEl(el: HTMLElement | null, reduceMotion: boolean | null) {
  if (!el || reduceMotion || typeof el.animate !== 'function') return;
  el.animate(SHAKE_KEYFRAMES, { duration: 300, easing: 'ease-out' });
}

/* Provider pill — reference geometry verbatim: 48px tall, #F1F1F1, 16px radius,
 * 8px icon–label gap, 24px icon + 16px/600 #3A3A3A label. */
const PILL = cn(
  'flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#f1f1f1]',
  'text-base font-semibold text-[#3a3a3a]',
  'transition-[background-color,transform] duration-150 ease-out hover:bg-[#eaeaea] active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
  LIGHT_FOCUS_RING,
);

const SUBTLE_LINK =
  'text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a] active:text-[#111]';

/* Busy-state content crossfade (never hard-swap a label/icon): tiny
 * opacity + scale + blur bridge, 150ms ease-out. */
const SWAP = {
  initial: { opacity: 0, scale: 0.95, filter: 'blur(2px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit:    { opacity: 0, scale: 0.95, filter: 'blur(2px)' },
};

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
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<'signin' | 'invite'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [emailOpen, setEmailOpen] = useState(false);
  // Surface clips only while open/closing: at rest the hidden form face is
  // opacity-0 + inert, and an unclipped surface lets the pill face travel
  // during the view-swap layoutId morph.
  const [emailClosing, setEmailClosing] = useState(false);
  const emailPillRef = useRef<HTMLButtonElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  // Which sign-in field failed validation — drives the red border + shake.
  const [fieldInvalid, setFieldInvalid] = useState<'email' | 'password' | null>(null);

  /* Page-swap height: locked to the old page's px at flip so the card
   * doesn't snap, animated to the entering page's height, then released
   * back to auto once settled. */
  const pagesRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // True while the container height is pinned + animating between views;
  // gates overflow-hidden so focus rings aren't clipped at rest.
  const [pagesLocked, setPagesLocked] = useState(false);
  const pagesAnim = useRef<Animation | null>(null);
  const viewMounted = useRef(false);
  // Return-leg morph: layoutId only animates the invite input FROM the pill
  // (fresh mount promotes it as lead); the remounting pill face never gets
  // re-promoted, so the way back is a manual FLIP from this captured rect.
  const inviteEmailRect = useRef<DOMRect | null>(null);

  function switchView(next: 'signin' | 'invite') {
    // Pin the CURRENT height as an inline style *synchronously*, before React
    // swaps the pages — otherwise `auto` reflows to the new page's height the
    // instant the DOM swaps and the resize lands as a hard cut. A re-toggle
    // mid-flight cancels the running animation first so the pin reads the
    // true mid-flight height (interruptible, no restart-from-zero).
    if (pagesRef.current) {
      const h = pagesRef.current.offsetHeight; // read while any animation still applies
      pagesAnim.current?.cancel();
      pagesRef.current.style.height = `${h}px`;
      setPagesLocked(true);
    }
    if (next === 'signin') {
      inviteEmailRect.current =
        document.getElementById('invite-email')?.getBoundingClientRect() ?? null;
    }
    if (emailOpen) setEmailClosing(true);
    setEmailOpen(false); // leaving the page collapses the email panel
    setError(null);
    setView(next);
  }

  useLayoutEffect(() => {
    if (!viewMounted.current) {
      viewMounted.current = true;
      return;
    }
    // Animate the container from the pinned height to the entering page's
    // height (in flow; the exiting one is popped absolute), then release the
    // pin so the card tracks content again (email panel, error rows).
    const container = pagesRef.current;
    const page = pageRef.current;
    if (!container || !page) return;
    const release = () => {
      pagesAnim.current = null;
      container.style.height = '';
      setPagesLocked(false);
    };
    const from = container.offsetHeight;
    const to = page.offsetHeight;
    if (reduceMotion || from === to || typeof container.animate !== 'function') {
      release();
      return;
    }
    const anim = container.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: PAGE.height.duration, easing: PAGE.height.easing },
    );
    pagesAnim.current = anim;
    anim.onfinish = release;
  }, [view, reduceMotion]);

  // Invite → sign-in: fly the pill face home from the invite input's rect
  // (WAAPI FLIP — the mirror of the forward layoutId morph).
  useLayoutEffect(() => {
    if (view !== 'signin' || !inviteEmailRect.current) return;
    const from = inviteEmailRect.current;
    inviteEmailRect.current = null;
    const face = emailPillRef.current;
    if (reduceMotion || !face || typeof face.animate !== 'function') return;
    const to = face.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    face.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})` },
        { transform: 'none' },
      ],
      { duration: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [view, reduceMotion]);

  function openEmail() {
    setEmailOpen(true);
    // Focus once the panel is interactive (inert lifts on the state flip).
    setTimeout(() => emailInputRef.current?.focus({ preventScroll: true }), 60);
  }

  function closeEmail() {
    setEmailClosing(true);
    setEmailOpen(false);
    // A validation callout must not outlive the fields it points at.
    if (fieldInvalid) {
      setFieldInvalid(null);
      setError(null);
    }
    setTimeout(() => emailPillRef.current?.focus({ preventScroll: true }), 60);
  }

  // jsdom and older browsers have no WebAuthn — the pill simply doesn't render.
  const passkeySupported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  // Reduced motion: skip the storyboard — everything rests immediately.
  useEffect(() => {
    if (reduceMotion) {
      setStage(5);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage(1), TIMING.card));
    timers.push(setTimeout(() => setStage(2), TIMING.identity));
    timers.push(setTimeout(() => setStage(3), TIMING.subtitle));
    timers.push(setTimeout(() => setStage(4), TIMING.providers));
    timers.push(setTimeout(() => setStage(5), TIMING.footer));
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion]);

  // Wraps any transition so prefers-reduced-motion collapses it to instant.
  const t = <T,>(transition: T) => (reduceMotion ? { duration: 0 } : transition);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // In-design validation (form is noValidate): the native browser bubble
    // clashed with the card. Errors use the shared slot + red field + shake.
    const trimmed = email.trim();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      setFieldInvalid('email');
      setError(trimmed ? "That doesn't look like an email address." : 'Enter your email address.');
      emailInputRef.current?.focus();
      shakeEl(emailInputRef.current, reduceMotion);
      trigger('error');
      return;
    }
    if (!password) {
      setFieldInvalid('password');
      setError('Enter your password.');
      passwordInputRef.current?.focus();
      shakeEl(passwordInputRef.current, reduceMotion);
      trigger('error');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      trigger('error');
      return;
    }

    trigger('success');
    const dest = await resolvePostLoginDestination(supabase as unknown as MinimalSupabase);
    router.push(dest);
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
      const supabase = createClient();
      const dest = await resolvePostLoginDestination(supabase as unknown as MinimalSupabase);
      router.push(dest);
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
        className="relative rounded-[20px] border border-[#E8E8E8]/75 bg-white px-6 py-10 shadow-[0_10px_20px_#D1D1D126]"
        initial={{ opacity: 0, y: CARD.offsetY }}
        animate={{ opacity: stage >= 1 ? 1 : 0, y: stage >= 1 ? 0 : CARD.offsetY }}
        transition={t(CARD.spring)}
      >
        {/* Badge + heading — reference rhythm: 24px badge→heading, 8px
            heading→subtitle (the subtitle block below owns the 40px drop
            into the pills). */}
        <motion.div
          className="mb-2 flex flex-col items-center gap-6"
          initial={{ opacity: 0, y: IDENTITY.offsetY }}
          animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : IDENTITY.offsetY }}
          transition={t(IDENTITY.spring)}
        >
          {/* White S-mark on the reference's #525252 disc — the dark-canvas
              asset finally has a home on the light card. */}
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#525252]">
            {/* 40px, not 32 — the PNG carries internal whitespace, so the
                glyph needs the larger box to fill the disc like the reference. */}
            <img src="/seeko-s.png" alt="" width={40} height={40} className="h-10 w-auto object-contain" />
          </div>
          {/* #454545 = the reference's #515151 darkened 15% (user-decided
              2026-07-04); ~9.7:1 on white. */}
          <h1 className="text-balance text-[22px] font-semibold tracking-[-0.02em] text-[#454545]">
            Sign in to SEEKO
          </h1>
        </motion.div>

        {/* Subtitle — crossfade between views. Grid-stacked so both taglines
            occupy the same cell and crossfade SIMULTANEOUSLY on the page-swap
            curve (mode="wait" made the swap feel sequential). */}
        <motion.div
          className="mb-10 grid justify-items-center text-balance text-center text-base leading-snug text-[#b4b4b4]"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 3 ? 1 : 0 }}
          transition={t(FADE.spring)}
        >
          <AnimatePresence initial={false}>
            <motion.p
              key={view}
              className="col-start-1 row-start-1"
              initial={{ opacity: 0, filter: 'blur(4px)', y: 2 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(4px)', y: -2 }}
              transition={t(PAGE.t)}
            >
              {/* Public-facing page: never list what's inside the workspace
                  (feature names here leak product surface to visitors). */}
              {view === 'signin' ? (
                // nowrap on the back half pins the wrap after the em dash —
                // text-balance alone broke mid-phrase ("runs / on").
                <>
                  Everything the studio runs on —{' '}
                  <span className="whitespace-nowrap">in one private workspace</span>
                </>
              ) : (
                'Enter the invite code from your email to join the studio'
              )}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        {/* Shared error slot — covers all three methods. Height animates both
            directions so the card reflows smoothly instead of snapping. */}
        <div aria-live="polite">
          <AnimatePresence initial={false}>
            {error && (
              <motion.div
                key="error"
                className="overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={t({ duration: 0.2, ease: 'easeOut' })}
              >
                <p className="mb-4 rounded-lg bg-[#d4503e]/10 px-3 py-2 text-sm text-[#d4503e]">
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Views — side-by-side page swap: both pages animate at once,
            each exiting toward its own side. overflow-hidden only while
            the height is locked, so focus rings aren't clipped at rest. */}
        <div
          ref={pagesRef}
          className={cn('relative', pagesLocked && 'overflow-hidden')}
        >
        <AnimatePresence mode="popLayout" initial={false}>
          {view === 'signin' ? (
            <motion.div
              key="signin"
              ref={pageRef}
              initial={{ opacity: 0, x: -PAGE.slide, filter: `blur(${PAGE.blur}px)` }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)', transition: t(PAGE.t) }}
              exit={{ opacity: 0, x: -PAGE.slide, filter: `blur(${PAGE.blur}px)`, transition: t(PAGE.out) }}
            >
              {/* Provider pills */}
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: FIELD.offsetY }}
                animate={{ opacity: stage >= 4 ? 1 : 0, y: stage >= 4 ? 0 : FIELD.offsetY }}
                transition={t(FIELD.spring)}
              >
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleBusy || passkeyBusy}
                  className={PILL}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={googleBusy ? 'busy' : 'idle'}
                      className="flex items-center gap-3"
                      {...SWAP}
                      transition={t({ duration: 0.15, ease: 'easeOut' })}
                    >
                      {googleBusy ? <Loader2 className="size-6 animate-spin" /> : <GoogleGlyph />}
                      {googleBusy ? 'Redirecting…' : 'Continue with Google'}
                    </motion.span>
                  </AnimatePresence>
                </button>
                {passkeySupported && (
                  <button
                    type="button"
                    onClick={handlePasskey}
                    disabled={googleBusy || passkeyBusy}
                    className={PILL}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={passkeyBusy ? 'busy' : 'idle'}
                        className="flex items-center gap-3"
                        {...SWAP}
                        transition={t({ duration: 0.15, ease: 'easeOut' })}
                      >
                        {passkeyBusy
                          ? <Loader2 className="size-6 animate-spin" />
                          : <Fingerprint className="size-6" strokeWidth={1.75} />}
                        {passkeyBusy ? 'Waiting for passkey…' : 'Continue with passkey'}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                )}

                {/* Email surface morph — the pill IS the form's closed state.
                    The surface animates height/radius/tint; the two faces
                    cross-fade with slide + scale + blur (transitions.dev). */}
                <motion.div
                  className={cn('relative', (emailOpen || emailClosing) && 'overflow-hidden')}
                  initial={false}
                  animate={{
                    height: emailOpen ? 'auto' : MORPH.height.closed,
                    borderRadius: emailOpen ? MORPH.radius.open : MORPH.radius.closed,
                    backgroundColor: emailOpen ? MORPH.tint.open : MORPH.tint.closed,
                  }}
                  transition={reduceMotion ? { duration: 0 } : emailOpen ? MORPH.open : MORPH.close}
                  onAnimationComplete={() => setEmailClosing(false)}
                >
                  {/* Closed face — the pill (transparent; the surface paints the
                      tint). layoutId pairs it with the invite email input: on
                      view swap the face travels/reshapes into the input's slot.
                      Safe anchor: its own layout never changes, so projection
                      can't fight the surface's height morph. */}
                  <motion.button
                    ref={emailPillRef}
                    layoutId="auth-email-morph"
                    style={{ borderRadius: MORPH.radius.closed }}
                    type="button"
                    onClick={openEmail}
                    aria-expanded={emailOpen}
                    aria-controls="email-signin-panel"
                    tabIndex={emailOpen ? -1 : 0}
                    className={cn(
                      PILL,
                      'absolute inset-x-0 top-0 bg-transparent',
                      emailOpen && 'pointer-events-none',
                    )}
                    // No initial={false} here: it suppresses the mount-time
                    // shared-element morph from the invite input, and the closed
                    // `animate` already equals the natural DOM state.
                    animate={
                      emailOpen
                        ? { opacity: 0, y: -MORPH.slide, filter: `blur(${MORPH.blur}px)` }
                        : { opacity: 1, y: 0, filter: 'blur(0px)' }
                    }
                    transition={reduceMotion ? { duration: 0 } : { ...MORPH.fade, layout: PAGE.t }}
                  >
                    <Mail className="size-6" strokeWidth={1.75} />
                    Continue with email
                  </motion.button>

                  {/* Open face — the form. Panel radius 20 − padding 12 = the
                      inputs' 8px radius (concentric). Inert while collapsed. */}
                  <motion.div
                    id="email-signin-panel"
                    inert={!emailOpen}
                    className="p-3"
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        closeEmail();
                      }
                    }}
                    initial={false}
                    animate={
                      emailOpen
                        ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
                        : { opacity: 0, y: MORPH.slide, scale: MORPH.scale, filter: `blur(${MORPH.blur}px)` }
                    }
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : emailOpen
                          ? { ...MORPH.fade, delay: 0.06 } // surface leads, content follows
                          : MORPH.fade
                    }
                  >
                    <div className="mb-2 flex items-center justify-between pl-1">
                      <span className="text-[13px] font-medium text-[#6e6e6e]">Sign in with email</span>
                      <button
                        type="button"
                        onClick={closeEmail}
                        aria-label="Close email sign-in"
                        className={cn(
                          'grid size-7 place-items-center rounded-full text-[#808080]',
                          'transition-[background-color,color,transform] duration-150 ease-out',
                          'hover:bg-black/[0.06] hover:text-[#3a3a3a] active:scale-95',
                          LIGHT_FOCUS_RING,
                        )}
                      >
                        <X className="size-4" strokeWidth={2} />
                      </button>
                    </div>

                    <form onSubmit={handleLogin} noValidate className="space-y-2">
                      <div>
                        <label htmlFor="email" className="sr-only">
                          Email
                        </label>
                        <input
                          ref={emailInputRef}
                          id="email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={e => {
                            setEmail(e.target.value);
                            if (fieldInvalid === 'email') {
                              setFieldInvalid(null);
                              setError(null);
                            }
                          }}
                          required
                          aria-invalid={fieldInvalid === 'email' || undefined}
                          className={cn(FIELD_INPUT, fieldInvalid === 'email' && FIELD_INPUT_INVALID)}
                          placeholder="you@seeko.studio"
                        />
                      </div>

                      <div>
                        <label htmlFor="password" className="sr-only">
                          Password
                        </label>
                        <input
                          ref={passwordInputRef}
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={e => {
                            setPassword(e.target.value);
                            if (fieldInvalid === 'password') {
                              setFieldInvalid(null);
                              setError(null);
                            }
                          }}
                          required
                          aria-invalid={fieldInvalid === 'password' || undefined}
                          className={cn(FIELD_INPUT, fieldInvalid === 'password' && FIELD_INPUT_INVALID)}
                          placeholder="Password"
                        />
                      </div>

                      <motion.button
                        type="submit"
                        disabled={loading}
                        className={cn(
                          BTN_PRIMARY,
                          LIGHT_FOCUS_RING,
                          'flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                        whileTap={{ scale: 0.985 }}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={loading ? 'busy' : 'idle'}
                            className="flex items-center gap-2"
                            {...SWAP}
                            transition={t({ duration: 0.15, ease: 'easeOut' })}
                          >
                            {loading && <Loader2 className="size-4 animate-spin" />}
                            {loading ? 'Signing in…' : 'Sign in'}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>
                    </form>
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="invite"
              ref={pageRef}
              initial={{ opacity: 0, x: PAGE.slide, filter: `blur(${PAGE.blur}px)` }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)', transition: t(PAGE.t) }}
              exit={{ opacity: 0, x: PAGE.slide, filter: `blur(${PAGE.blur}px)`, transition: t(PAGE.out) }}
            >
              <InviteCodeForm />
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* View toggle — one persistent control shared by both views. The
            label crossfades in place (never unmounts), so the card's bottom
            edge stays alive through the swap instead of dying and respawning. */}
        <motion.p
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 5 ? 1 : 0 }}
          transition={t(FADE.spring)}
        >
          <button
            type="button"
            onClick={() => switchView(view === 'signin' ? 'invite' : 'signin')}
            className={cn(SUBTLE_LINK, 'inline-grid justify-items-center')}
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={view}
                className="col-start-1 row-start-1 whitespace-nowrap"
                initial={{ opacity: 0, filter: 'blur(3px)', y: 2 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                exit={{ opacity: 0, filter: 'blur(3px)', y: -2 }}
                transition={t(PAGE.t)}
              >
                {view === 'signin' ? 'Have an invite code?' : 'Back to sign in'}
              </motion.span>
            </AnimatePresence>
          </button>
        </motion.p>
      </motion.div>
    </div>
  );
}
