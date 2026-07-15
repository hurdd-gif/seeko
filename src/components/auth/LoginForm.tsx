'use client';

/* ──────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Login page entrance
 *
 * Read top-to-bottom. Each value is ms after page mount.
 *
 *    0ms   page mounts — card starts rising immediately (opacity 0, y +20)
 *   50ms   badge + heading fade in from y +8
 *   90ms   subtitle fades in
 *  130ms   provider pills (Google / passkey / email) fade in
 *  170ms   invite link fades in
 *
 * The whole stagger clears in <200ms: login is the most transactional
 * screen in the app, so the entrance is flavor, never a gate (Apple:
 * anything on the input path that isn't essential is a regression).
 * Return visitors within a session skip the storyboard entirely
 * (sessionStorage), same as prefers-reduced-motion.
 *
 * METHOD MEMORY — the pill that signed you in last time (Linear pattern)
 * floats to the top with a quiet "last time" caption (auth-method-memory.ts),
 * so a returning user re-scans one pill, not three.
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

import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Eye, EyeOff, Fingerprint, Loader2, Mail, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  orderAuthMethods,
  recallAuthMethod,
  rememberAuthMethod,
  type AuthMethod,
} from '@/lib/auth-method-memory';
import { InviteCodeForm } from '@/components/auth/InviteCodeForm';
import { useHaptics } from '@/components/HapticsProvider';
import { ENTRANCE_KEYS, hasPlayedEntrance, markEntrancePlayed } from '@/lib/entrance-once';
import { springs } from '@/lib/motion';
import { resolvePostLoginDestination, type MinimalSupabase } from '@/lib/post-login-destination';
import { cn } from '@/lib/utils';
import { LIGHT_INPUT, BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { useIsDark } from '@/lib/theme';

/* ─── Timing (ms after mount) ─────────────────────────────
 * Compressed stagger: everything interactive inside 200ms. The 40-50ms
 * steps keep the cascade legible without ever gating the pills. */
const TIMING = {
  card:      0,     // outer card starts rising immediately
  identity:  50,    // badge + heading fade in
  subtitle:  90,    // tagline fades in
  providers: 130,   // Google / passkey / email pills
  footer:    170,   // invite link
};

/* One storyboard per browser session: replaying the entrance on every
 * bounce back to /login makes the page feel slower than it is. The card can't
 * use the useEntranceOnce hook — it deliberately does NOT flag the session when
 * it arrives under a view transition (see the effect below) — so it drives the
 * same storage with the raw helpers. */
const ENTRANCE_PLAYED_KEY = ENTRANCE_KEYS.loginCard;

/* Deliberately loose — this only decides whether a field is DONE enough to skip
 * the caret past it. Real verification is the server's job; a stricter pattern
 * here would just strand people with unusual addresses. */
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/* ─── One ease-out, JS layer and CSS layer alike ──────────
 * Motion's string `'easeOut'` is cubic-bezier(0, 0, 0.58, 1) — the weak
 * built-in Emil warns against, and a DIFFERENT curve from the one this same
 * page already decelerates on in CSS: the public view-transition entrances
 * (globals.css → `seeko-vt-*-in`) run cubic-bezier(0.2, 0, 0, 1). During a
 * /login ⇄ /legal transition those CSS pseudos and these JS crossfades are on
 * screen together, so two ease-outs on one surface read as drift. Every
 * sub-200ms opacity/scale/blur crossfade below borrows the VT curve — one
 * vocabulary, snappier settle. (PAGE.t keeps its own [0.22,1,0.36,1]: that is
 * the page-level slide curve, not a micro-crossfade, and it is already custom.) */
const EASE_OUT: [number, number, number, number] = [0.2, 0, 0, 1];

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
  out:  { duration: 0.15, ease: EASE_OUT },
  // Card reshape runs on WAAPI, not Motion: Motion's height animation keeps
  // its own 'auto' unit state, and its auto→px conversion re-measures AFTER
  // the new page is in flow — so it always sprang new→new and the resize
  // landed as a hard cut. WAAPI animates over the pinned inline height.
  height: { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' } as const,
};

/* ─── Email surface morph (transitions.dev grammar) ──────── */
const MORPH = {
  open:   { type: 'spring', duration: 0.5, bounce: 0.2 } as const,  // ≈ cubic-bezier(.34,1.25,.64,1)
  // HEIGHT is the one property that must not bounce. The card is centre-aligned,
  // so its height is the page's layout spine: every pixel the panel overshoots
  // lifts the heading and the tagline above it and drops them back — measured as
  // a 4.1px bob, reversing over ~15 frames. Bounce belongs to motion that
  // carried momentum (a flick, a drag release); a click carries none, and a
  // surface that DRIVES OTHER LAYOUT has no business overshooting at all.
  // Radius and tint keep MORPH.open — they bounce against nothing.
  grow:   { type: 'spring', duration: 0.5, bounce: 0 } as const,
  close:  { type: 'spring', duration: 0.35, bounce: 0 } as const,   // calmer settle
  fade:   { duration: 0.2, ease: EASE_OUT } as const,               // face cross-fade
  slide:  12,     // px each face travels (vertical morph → vertical slide)
  scale:  0.97,   // form face rests slightly shrunk while hidden
  blur:   2,      // px blur bridging the cross-fade
  radius: { closed: 16, open: 20 },
  height: { closed: 48 },
  tint:   { closed: '#f1f1f1', open: '#f7f7f7' },
  // Motion animates backgroundColor as a JS hex, which no `dark:` class can
  // reach — the component picks the map with useIsDark(). Closed matches the
  // dark pills (#262626); open settles toward the #1c1c1c card, the same
  // closer-to-card direction the light pair travels.
  tintDark: { closed: '#262626', open: '#212121' },
};

/* ─── Method-stack collapse ──────────────────────────────────
 * Opening email REPLACES the method list; it doesn't append to it. The panel
 * is 227px tall — grown *underneath* two 48px pills it pushed the footnote
 * 96px down, out of the sparse top of the dot field and into the bloom, where
 * the legal links stopped being readable (measured 6% → 49% depth at 917px).
 *
 * Linear and Clerk both trade the whole stack for the email step and offer one
 * way back (the panel's X here). So the OAuth pills and the "last used"
 * caption collapse out of flow while the panel grows into the room they leave.
 *
 * Timings mirror MORPH.open/close so the card reads as ONE reshape, not two
 * animations racing. Bounce is dropped: a surface may overshoot its target
 * height, but a collapse cannot overshoot below zero — the browser clamps it
 * and the spring's tail lands as a stall. */
const STACK = {
  out:  { type: 'spring', duration: 0.5, bounce: 0 } as const,   // pills clearing
  in:   { type: 'spring', duration: 0.35, bounce: 0 } as const,  // pills returning
  // Fade well ahead of the collapse: a pill sliding shut at full opacity draws
  // the eye to what's leaving instead of to the panel that's opening.
  fade: { duration: 0.16, ease: EASE_OUT } as const,
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

/* 16px on mobile, 14px from `sm` up. NOT a taste call: iOS Safari zooms the
 * whole viewport whenever a focused input's text is under 16px, so a 14px email
 * field jerks the page on every iPhone sign-in — on the one screen a user cannot
 * skip. SegmentedCodeInput already sized its cells this way (text-base sm:…);
 * the email form never got the same treatment. */
const FIELD_INPUT = cn(
  'h-11 w-full px-3 text-base sm:text-sm transition-[border-color,box-shadow] duration-150 focus-visible:outline-none',
  LIGHT_INPUT,
);

// Error state overrides the azure focus border — red, not blue (matches the
// invite tab's treatment so both forms speak one error language).
const FIELD_INPUT_INVALID =
  'border-danger/60 focus-visible:border-danger focus-visible:ring-2 focus-visible:ring-danger/15';

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
 * 8px icon–label gap, 24px icon + 16px #3A3A3A label. Dark pins the
 * Figma LOGIN/DARK pair (#262626 fill, #b0b0b0 label) over the app's
 * control-fill/ink tokens; hover brightens instead of darkening.
 *
 * No weight utility: the label inherits body 500 (Tailwind's preflight gives form
 * controls `font: inherit`). It used to carry `font-semibold`, which the remapped
 * token rendered at 500 anyway — so the class was decoration on a lie. The h1 is
 * the one element on this page that carries a real weight now, and a control label
 * must not compete with the page's own title. */
const PILL = cn(
  'flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-control-fill dark:bg-[#262626]',
  // No dark: override on the label — `text-ink` already inverts (#3a3a3a light,
  // #d9d9d9 dark). The old dark:text-[#b0b0b0] pinned it two tiers BELOW the ink
  // ramp, so the primary auth labels read dimmer than the muted copy under them.
  'text-base text-ink',
  'transition-[background-color,transform] duration-150 ease-out hover:bg-[#eaeaea] dark:hover:bg-[#2c2c2c] active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
  LIGHT_FOCUS_RING,
);

/* #767676 was picked as "the AA floor on white" (4.54:1) — but it was only ever
 * checked against white. "Forgot password?" renders INSIDE the email panel, whose
 * fill is #f7f7f7, and on that backdrop the same hex measures 4.24:1 — under AA.
 * A contrast target is a property of a PAIR, not of a colour; pinning a hex to one
 * backdrop and then reusing it on another silently voids the target.
 *
 * ink-muted-strong is the tier the light ramp already annotates as its AA floor
 * (#686868). It clears 4.5:1 on BOTH backdrops this link lands on — 5.57:1 on the
 * canvas, 5.20:1 on the panel — so one token is correct everywhere instead of one
 * hex being correct in one place. Dark is untouched (7.36:1 / 6.61:1, both fine). */
const SUBTLE_LINK =
  'text-[13px] text-ink-muted-strong dark:text-ink-muted transition-colors hover:text-ink active:text-ink-title contrast-more:text-ink';

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
  /**
   * Rest the storyboard at its final frame from the very first render — the
   * route sets this when the browser is view-transitioning us in from /legal.
   * It has to land on the FIRST render, not in an effect: a view transition
   * captures the arriving page as a still image the moment the DOM commits, so
   * a stage-0 form would be photographed invisible and the whole transition
   * would play against a blank column.
   */
  skipEntrance?: boolean;
  /**
   * Where to land after a successful sign-in, from the `?next=` param the
   * protected-route loaders attach when they bounce an anonymous visitor here
   * (see load-view.ts). Already sanitized by the route (sanitizeNextPath), so
   * it is a trusted same-origin path or null. When set it overrides the
   * role-based default; when null we fall back to resolvePostLoginDestination.
   */
  nextPath?: string | null;
};

export function LoginForm({ initialError = null, skipEntrance = false, nextPath = null }: LoginFormProps) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const reduceMotion = useReducedMotion();
  // Scheme read for the one surface Motion paints as a JS hex (MORPH tint).
  const isDark = useIsDark();
  const morphTint = isDark ? MORPH.tintDark : MORPH.tint;
  const [view, setView] = useState<'signin' | 'invite'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  // Neutral confirmation (e.g. "reset link sent") — same slot grammar as the
  // error, gray instead of red. Error and notice are mutually exclusive.
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState(skipEntrance ? 5 : 0);
  // The method that last signed in on this browser — read once at mount.
  const [lastMethod] = useState<AuthMethod | null>(() =>
    typeof window === 'undefined' ? null : recallAuthMethod(),
  );
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
    setNotice(null);
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
    // Focus once the panel is interactive (inert lifts on the state flip), and
    // land on the first field that's actually still empty. The email survives a
    // trip through the invite view (and a close/reopen of this panel), so
    // re-focusing it would put the caret in a field the user already filled and
    // make them tab past their own answer.
    setTimeout(() => {
      // Skip ahead only when the address is actually USABLE. A half-typed one
      // is unfinished business, and jumping past it would hide the very field
      // the user still has to fix.
      const done = EMAIL_RE.test(email.trim());
      const target = done ? passwordInputRef.current : emailInputRef.current;
      target?.focus({ preventScroll: true });
    }, 60);
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

  // Pill order: the remembered method floats to the top (Linear pattern).
  const methodOrder = orderAuthMethods(lastMethod, { passkeySupported });
  const promotedMethod = methodOrder[0] === lastMethod ? lastMethod : null;
  const METHOD_LABEL: Record<AuthMethod, string> = {
    google: 'Google',
    passkey: 'a passkey',
    email: 'email',
  };

  // Reduced motion and same-session return visits skip the storyboard —
  // everything rests immediately. First play flags the session.
  useEffect(() => {
    // Arriving under a view transition: the stage already rests at 5 (see the
    // useState initializer — it MUST be right on the first render, an effect is
    // a frame too late for the snapshot). Return without flagging the session,
    // so a later cold load still gets its storyboard: we skipped it, we didn't
    // play it.
    if (skipEntrance) return;

    // Storage blocked: play the entrance, it just won't be remembered.
    if (reduceMotion || hasPlayedEntrance(ENTRANCE_PLAYED_KEY)) {
      setStage(5);
      return;
    }
    markEntrancePlayed(ENTRANCE_PLAYED_KEY);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage(1), TIMING.card));
    timers.push(setTimeout(() => setStage(2), TIMING.identity));
    timers.push(setTimeout(() => setStage(3), TIMING.subtitle));
    timers.push(setTimeout(() => setStage(4), TIMING.providers));
    timers.push(setTimeout(() => setStage(5), TIMING.footer));
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion, skipEntrance]);

  // Wraps any transition so prefers-reduced-motion collapses it to instant.
  const t = <T,>(transition: T) => (reduceMotion ? { duration: 0 } : transition);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    // In-design validation (form is noValidate): the native browser bubble
    // clashed with the card. Errors use the shared slot + red field + shake.
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setFieldInvalid('email');
      setError(trimmed ? 'That doesn’t look like an email address.' : 'Enter your email address.');
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

    rememberAuthMethod('email');
    trigger('success');
    const dest = nextPath ?? (await resolvePostLoginDestination(supabase as unknown as MinimalSupabase));
    router.push(dest);
    router.refresh();
  }

  /* Forgot password — real recovery, not a mailto: Supabase emails a link
   * whose code the existing /api/auth/callback exchanges for a session before
   * landing on /set-password (the same page invites already use). Needs the
   * email field filled first, and says so with the same shake grammar. */
  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setFieldInvalid('email');
      setNotice(null);
      setError('Enter your email above first — the reset link goes there.');
      emailInputRef.current?.focus();
      shakeEl(emailInputRef.current, reduceMotion);
      trigger('error');
      return;
    }

    setResetBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/set-password`,
    });

    setResetBusy(false);
    if (error) {
      setError(error.message);
      trigger('error');
      return;
    }
    setNotice(`Reset link sent to ${trimmed} — check your email.`);
    trigger('success');
  }

  async function handleGoogle() {
    setGoogleBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextPath ?? '/tasks')}`,
      },
    });

    // On success the browser navigates away; we only regain control on failure.
    if (error) {
      setError(error.message);
      setGoogleBusy(false);
      trigger('error');
      return;
    }
    // The redirect is in flight — record the method before the page unloads.
    rememberAuthMethod('google');
  }

  async function handlePasskey() {
    setPasskeyBusy(true);
    setError(null);
    setNotice(null);

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

      rememberAuthMethod('passkey');
      trigger('success');
      const supabase = createClient();
      const dest = nextPath ?? (await resolvePostLoginDestination(supabase as unknown as MinimalSupabase));
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
      {/* Layered elevation (contact + soft + ambient) so the card reads as a
          real surface above the white canvas, not paint on it. Still quiet. */}
      <motion.div
        // Frameless (user call): no border, no fill, no shadow — the form sits
        // directly on the canvas and the dot field reads as one continuous
        // surface behind it. rounded-[20px] and the padding stay so the focus
        // rings and the contrast-more frame still have the card's geometry.
        //
        // contrast-more KEEPS the border: an invisible container is a stylistic
        // choice, and the one group of users who cannot afford it are the ones
        // who asked the OS for more contrast. They get the frame back.
        className="relative rounded-[20px] px-6 py-10 contrast-more:border contrast-more:border-black/30 dark:contrast-more:border-white/40"
        initial={{ opacity: 0, y: CARD.offsetY }}
        animate={{ opacity: stage >= 1 ? 1 : 0, y: stage >= 1 ? 0 : CARD.offsetY }}
        transition={t(CARD.spring)}
      >
        {/* Heading. The S-mark disc that used to sit above it was REMOVED by
            user order (2026-07-12) — the wordmark already sits in the top bar,
            so the badge was the second brand mark on a page with one job. The
            wrapper stays: it owns the heading's entrance beat (stage 2). */}
        <motion.div
          className="mb-2 flex flex-col items-center"
          initial={{ opacity: 0, y: IDENTITY.offsetY }}
          animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : IDENTITY.offsetY }}
          transition={t(IDENTITY.spring)}
        >
          {/* ink-STRONG, not ink-heading. On the ramp, ink-heading (L .390 light /
              .861 dark) sits BELOW plain ink (.348 / .885) — which is what the
              pill labels use. So "Continue with Google" was rendering darker on
              white and brighter on black than "Sign in to SEEKO": a button label
              outranking the page's own title, in both schemes. Size and the 40px
              of air below carry hierarchy too, but colour must not *contradict*
              them. ink-strong (.285 / .920) puts the h1 one clean tier above the
              pills without going near-black, which would over-assert now that the
              card has no frame.

              Same as PILL: no dark: override. text-ink-strong inverts to #e4e4e4
              (10.7:1); the old dark:text-[#b2b2b2] sat at the MUTED tier, so the
              page's H1 was dimmer in dark than its own body copy should be.

              WEIGHT — `font-[600]`, not `font-semibold`. globals.css resolves
              EVERY named weight utility to 500 ("single-weight dashboard
              typography"), so the `font-semibold` that used to sit here rendered
              at exactly the same weight as the body copy under it: a class that
              claimed a hierarchy the CSS then erased. The whole colour argument
              above exists because weight was unavailable to do the ranking.

              That rule is scoped to the DASHBOARD. /login is the public front
              door, and the Paper reference (27P-0) it was built from specified
              600 here — Inter 600 is already in the index.html font request, so
              this costs nothing. The arbitrary value bypasses the remapped token
              deliberately; it is the only real weight on the page, which is the
              point: one element outranks the rest by weight, everything else
              inherits body 500 and stays quiet. */}
          <h1 className="text-balance text-2xl font-[600] tracking-[-0.02em] text-ink-strong">
            Sign in to SEEKO
          </h1>
        </motion.div>

        {/* Subtitle — sign-in only. The invite view's line ("Enter the invite
            code from your email to join the studio") was REMOVED by user order
            (2026-07-12): the field's own label and the button already said it.

            It cannot simply stop rendering, though. This was a grid cell with a
            40px bottom margin, so unmounting it drops everything below by ~62px
            on the frame the exit lands. The SLOT animates shut instead, on the
            same curve as the view swap — one reshape, not a cut. marginBottom
            lives in the animation rather than as `mb-10` on the text, because a
            class cannot collapse. */}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{
            height: view === 'invite' ? 0 : 'auto',
            marginBottom: view === 'invite' ? 0 : 40,
          }}
          transition={t(PAGE.t)}
        >
          <motion.p
            // ink-muted-strong = the ramp's own AA floor (5.57:1 here). The old
            // #b4b4b4 (2.1:1) treated the page's one line of real copy as
            // decoration; the #767676 that replaced it was a hardcoded hex
            // hitting the same tier by hand — the token does it by reference.
            // text-PRETTY, not text-balance. balance equalises line lengths, and
            // with the back half welded into one unbreakable run it could only
            // buy that balance by pushing words off line 1 — it broke "runs / on"
            // and, before the &nbsp; went in, opened line 2 with a naked em dash.
            // Both are worse than a slightly uneven pair of lines. This is a
            // description, not a heading: balance is for headings, pretty is for
            // descriptions, and greedy filling puts the break exactly where the
            // punctuation already says it goes.
            className="text-pretty text-center text-base leading-snug text-ink-muted-strong dark:text-ink-muted contrast-more:text-ink"
            initial={{ opacity: 0 }}
            animate={{ opacity: stage >= 3 ? 1 : 0 }}
            transition={t(FADE.spring)}
          >
            {/* Public-facing page: never list what's inside the workspace
                (feature names here leak product surface to visitors).

                WRAPPING: the em dash is bound to "on" with &nbsp;, and the back
                half is nowrap. Those two together leave exactly ONE break
                opportunity in the line — the space after the dash — which is the
                only place it should ever break.

                The nowrap span alone did NOT do this, despite the comment that
                used to claim it: text-balance was breaking after "runs on" and
                opening the second line with "— in one private workspace". A line
                may not begin with an em dash. nowrap stopped the back half from
                splitting, but it never said anything about where the dash goes,
                and an ordinary space in front of it is a legal break. &nbsp; is
                the thing that actually forbids it. */}
            Everything the studio runs on&nbsp;—{' '}
            <span className="whitespace-nowrap">in one private workspace</span>
          </motion.p>
        </motion.div>

        {/* Shared error slot — covers all methods. Height animates both
            directions so the card reflows smoothly instead of snapping.
            Keyed by the MESSAGE, not a constant: when one error replaces
            another (Sign in empty → Forgot password empty), the old slot
            rolls closed while the new one rolls open on the same curve, so
            the summed height glides. A constant key skipped exit/enter and
            the card jumped a whole frame when the new text wrapped
            differently. */}
        <div aria-live="polite">
          <AnimatePresence initial={false}>
            {error && (
              <motion.div
                key={error}
                className="overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={t({ duration: 0.2, ease: EASE_OUT })}
              >
                <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Neutral notice slot (reset-link confirmations) — same reflow
            grammar as the error, gray instead of red, including the
            message-as-key roll for text swaps. */}
        <div aria-live="polite">
          <AnimatePresence initial={false}>
            {notice && (
              <motion.div
                key={notice}
                className="overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={t({ duration: 0.2, ease: EASE_OUT })}
              >
                <p className="mb-4 rounded-lg bg-wash-5 px-3 py-2 text-sm text-ink">
                  {notice}
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
              {/* Provider pills — rendered in method-memory order: the pill
                  that signed you in last time sits on top with a caption.

                  No `space-y-2` here, deliberately. The 8px gap lives INSIDE
                  each slot instead, because these slots collapse: a margin
                  *between* siblings survives its neighbour's exit and the stack
                  snaps 16px shut on the last frame. Padding inside a clipped
                  box goes down with the box, in the same animation. */}
              <motion.div
                initial={{ opacity: 0, y: FIELD.offsetY }}
                animate={{ opacity: stage >= 4 ? 1 : 0, y: stage >= 4 ? 0 : FIELD.offsetY }}
                transition={t(FIELD.spring)}
              >
                {/* Linear-pattern recall: name the remembered method so the
                    promoted pill reads as deliberate, not reshuffled. It's a
                    caption about *choosing* a method, so it leaves with the
                    choice — including when the promoted method is email
                    itself, where the open panel's own header supersedes it. */}
                {promotedMethod && (
                  <motion.div
                    className={cn((emailOpen || emailClosing) && 'overflow-hidden')}
                    inert={emailOpen}
                    initial={false}
                    animate={{ height: emailOpen ? 0 : 'auto', opacity: emailOpen ? 0 : 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { height: emailOpen ? STACK.out : STACK.in, opacity: STACK.fade }
                    }
                  >
                    {/* pb-2.5 = the caption's own 2px + the stack's 8px gap. */}
                    {/* 13px, not 12: this card was carrying three caption sizes
                        (12/13/13) doing one job, which reads as drift rather than
                        hierarchy. 13px is the project's de-facto caption size
                        (lightKit's BTN_BASE and CARD_DESC both use it), so the
                        odd one out moves onto it, not the other way. It also has
                        the least margin for a thin contrast ratio, not the most. */}
                    <p className="pb-2.5 pl-1 text-[13px] text-ink-muted-strong dark:text-ink-muted contrast-more:text-ink">
                      You used {METHOD_LABEL[promotedMethod]} to sign in last time
                    </p>
                  </motion.div>
                )}
                {methodOrder.map((method, i) => {
                // Email is always first or last in the order (orderAuthMethods
                // promotes one method, never inserts), so "not last" is all the
                // gap logic needs.
                const gapped = i < methodOrder.length - 1;
                return (
                <Fragment key={method}>
                {(method === 'google' || (method === 'passkey' && passkeySupported)) && (
                /* Collapsing slot. Clips only while open/closing so the pill's
                   focus ring isn't cut off at rest. */
                <motion.div
                  className={cn((emailOpen || emailClosing) && 'overflow-hidden')}
                  inert={emailOpen}
                  initial={false}
                  animate={{ height: emailOpen ? 0 : 'auto', opacity: emailOpen ? 0 : 1 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { height: emailOpen ? STACK.out : STACK.in, opacity: STACK.fade }
                  }
                >
                <div className={cn(gapped && 'pb-2')}>
                {method === 'google' && (
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
                      transition={t({ duration: 0.15, ease: EASE_OUT })}
                    >
                      {googleBusy ? <Loader2 className="size-6 animate-spin" /> : <GoogleGlyph />}
                      {googleBusy ? 'Redirecting…' : 'Continue with Google'}
                    </motion.span>
                  </AnimatePresence>
                </button>
                )}
                {method === 'passkey' && (
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
                        transition={t({ duration: 0.15, ease: EASE_OUT })}
                      >
                        {passkeyBusy
                          ? <Loader2 className="size-6 animate-spin" />
                          : <Fingerprint className="size-6" strokeWidth={1.75} />}
                        {passkeyBusy ? 'Waiting for passkey…' : 'Continue with passkey'}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                )}
                </div>
                </motion.div>
                )}

                {/* Email surface morph — the pill IS the form's closed state.
                    The surface animates height/radius/tint; the two faces
                    cross-fade with slide + scale + blur (transitions.dev).

                    The gap is an animated paddingBottom rather than a class:
                    when email is the PROMOTED method it sits first, and once
                    the pills below it collapse its 8px would be left holding
                    open a gap under nothing. */}
                {method === 'email' && (
                <motion.div
                  initial={false}
                  animate={{ paddingBottom: gapped && !emailOpen ? 8 : 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : emailOpen ? STACK.out : STACK.in
                  }
                >
                <motion.div
                  className={cn('relative', (emailOpen || emailClosing) && 'overflow-hidden')}
                  initial={false}
                  animate={{
                    height: emailOpen ? 'auto' : MORPH.height.closed,
                    borderRadius: emailOpen ? MORPH.radius.open : MORPH.radius.closed,
                    backgroundColor: emailOpen ? morphTint.open : morphTint.closed,
                  }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : emailOpen
                        // Per-value override: radius/tint ride MORPH.open's
                        // bounce, height rides the flat spring so the heading
                        // above the card doesn't get bobbed by the overshoot.
                        ? { ...MORPH.open, height: MORPH.grow }
                        : MORPH.close
                  }
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
                      // Both schemes go transparent — the morph surface owns
                      // the paint, so the tint animation is never masked.
                      'absolute inset-x-0 top-0 bg-transparent dark:bg-transparent',
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
                      {/* No font-medium: it resolved to the same 500 as everything
                          else on the page. Colour carries this label's rank. */}
                      <span className="text-[13px] text-ink-muted-strong">Sign in with email</span>
                      {/* The way back. With the other methods collapsed this is
                          the ONLY exit, so it carries more weight than a
                          dismiss X did: the label names the destination, and a
                          pseudo-element takes the 28px disc to a 40px target
                          without changing what's drawn. */}
                      <button
                        type="button"
                        onClick={closeEmail}
                        aria-label="Back to sign-in options"
                        className={cn(
                          // ink-muted put this at 3.69:1 on the #f7f7f7 panel —
                          // scraping WCAG's 3:1 graphic floor, and the weakest
                          // element on the page. It's the ONLY way back out of
                          // the email view. Dark rendered the same token at
                          // 6.61:1, nearly double: the light half was the one
                          // being under-served, not both. ink-muted-strong lands
                          // it on 5.20:1 / 7.94:1 — exactly the panel title's
                          // pair of numbers, which is right: the title and the
                          // exit are this panel's two chrome elements and should
                          // read as a set, not as heading-plus-afterthought.
                          'relative grid size-7 place-items-center rounded-full text-ink-muted-strong',
                          'before:absolute before:-inset-1.5 before:content-[""]',
                          'transition-[background-color,color,transform] duration-150 ease-out',
                          'hover:bg-wash-6 hover:text-ink active:scale-95',
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

                      <div className="relative">
                        <label htmlFor="password" className="sr-only">
                          Password
                        </label>
                        <input
                          ref={passwordInputRef}
                          id="password"
                          type={showPassword ? 'text' : 'password'}
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
                          className={cn(
                            FIELD_INPUT,
                            'pr-11',
                            fieldInvalid === 'password' && FIELD_INPUT_INVALID,
                          )}
                          placeholder="Password"
                        />
                        {/* Reveal toggle — expected affordance on every
                            password field. Icons cross-fade (never hard-swap). */}
                        <button
                          type="button"
                          /* The eye is a detour, not a destination: the user is
                             mid-password and only wants to look at it. Clicking
                             it parked focus on the button and left them to click
                             back into the field to keep typing. Focus returns to
                             the password, caret exactly where they left it —
                             swapping the input's `type` is what drops the
                             selection, so it's restored by hand. */
                          onClick={() => {
                            const field = passwordInputRef.current;
                            const caret = field?.selectionStart ?? null;
                            setShowPassword(v => !v);
                            requestAnimationFrame(() => {
                              if (!field) return;
                              field.focus({ preventScroll: true });
                              const at = caret ?? field.value.length;
                              field.setSelectionRange(at, at);
                            });
                          }}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          aria-pressed={showPassword}
                          className={cn(
                            'absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-ink-muted-strong dark:text-ink-muted',
                            'transition-[background-color,color,transform] duration-150 ease-out',
                            'hover:bg-wash-5 hover:text-ink active:scale-95',
                            LIGHT_FOCUS_RING,
                          )}
                        >
                          {/* Both icons stay mounted, stacked in one cell, and
                              cross-fade simultaneously — one object changing
                              state, not two swapping (and re-taps retarget the
                              spring mid-flight instead of restarting). */}
                          <span className="grid place-items-center">
                            <motion.span
                              className="col-start-1 row-start-1 grid place-items-center"
                              initial={false}
                              animate={
                                showPassword
                                  ? { opacity: 0, scale: 0.5, filter: 'blur(2px)' }
                                  : { opacity: 1, scale: 1, filter: 'blur(0px)' }
                              }
                              transition={t({ type: 'spring', duration: 0.25, bounce: 0 })}
                            >
                              <Eye className="size-4" strokeWidth={1.75} />
                            </motion.span>
                            <motion.span
                              className="col-start-1 row-start-1 grid place-items-center"
                              initial={false}
                              animate={
                                showPassword
                                  ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
                                  : { opacity: 0, scale: 0.5, filter: 'blur(2px)' }
                              }
                              transition={t({ type: 'spring', duration: 0.25, bounce: 0 })}
                            >
                              <EyeOff className="size-4" strokeWidth={1.75} />
                            </motion.span>
                          </span>
                        </button>
                      </div>

                      {/* Recovery wayfinding — every password form must answer
                          "how do I get out?" (ElevenLabs-pattern placement). */}
                      <div className="flex justify-end px-1">
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={resetBusy || loading}
                          className={cn(SUBTLE_LINK, 'py-0.5 disabled:cursor-default disabled:opacity-60')}
                        >
                          {resetBusy ? 'Sending reset link…' : 'Forgot password?'}
                        </button>
                      </div>

                      <motion.button
                        type="submit"
                        disabled={loading}
                        className={cn(
                          BTN_PRIMARY,
                          LIGHT_FOCUS_RING,
                          // No font-semibold — it rendered at 500 like everything
                          // else. The fill/label inversion is what makes this the
                          // primary action, not a weight that never arrived.
                          'flex h-11 w-full items-center justify-center rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                        whileTap={{ scale: 0.985 }}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={loading ? 'busy' : 'idle'}
                            className="flex items-center gap-2"
                            {...SWAP}
                            transition={t({ duration: 0.15, ease: EASE_OUT })}
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
                )}
                </Fragment>
                );
                })}
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
              {/* One email across both views — the same value the pill morphs
                  into (shared layoutId), so the shared-element animation and
                  the data finally agree. */}
              <InviteCodeForm email={email} onEmailChange={setEmail} />
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
