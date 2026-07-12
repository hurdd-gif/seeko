'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Agreement Form
 *
 *  Phase 1: READ (agreement text focus)
 *    +0ms   Progress bar at 0%, accent color
 *    scroll  Bar fills proportionally as user reads
 *    bottom  "Continue to sign" button fades in
 *
 *  Phase 2: SIGN (form fields + live signature)
 *    +0ms   Agreement collapses, sign form slides up
 *  200ms   Fields stagger in (name, address, engagement)
 *  400ms   Submit button appears
 *  type    Each glyph SVG path draws in via pathLength animation (pen stroke)
 *          Ghost paths (0.08 opacity) show form, stroke draws over
 *
 *  Phase 3: SIGNED (inline animation + popup)
 *    +0ms   Signature box glows accent, all chars replay with stagger
 *  ~800ms  Underline draws across beneath signature
 *  ~1.2s   Confirmation dialog pops up (checkmark + "Agreement Signed")
 *  ~3.7s   Auto-redirect
 * ───────────────────────────────────────────────────────── */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowRight, FileText, Check, ArrowDown, Download } from 'lucide-react';
import { AddressAutocomplete } from '@/components/agreement/AddressAutocomplete';
import { SignatureDrawing } from '@/components/agreement/SignatureDrawing';
import { SignaturePad, type SignatureValue } from '@/components/agreement/SignaturePad';
import { useHaptics } from '@/components/HapticsProvider';
import { sanitizeHtml } from '@/lib/sanitize';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  LIGHT_RECIPIENT_CARD,
  LIGHT_RECIPIENT_MUTED,
  LIGHT_RECIPIENT_HAIRLINE,
  LIGHT_INPUT,
  LIGHT_RECIPIENT_CTA,
  LIGHT_SUCCESS_CHIP,
  LIGHT_SUCCESS_TEXT,
  LIGHT_FOCUS_RING,
  BTN_SECONDARY,
} from '@/components/dashboard/lightKit';

const SPRING = springs.smooth;
const SPRING_SNAPPY = springs.firm;

// Light signer ceremony only: the read → sign swap is a fast, calm crossfade.
// The signing form is a high-cognitive-load surface, so a long staggered entrance
// reads as sluggish (and the height-collapse exit reads as a stall, not a fade).
// One quick fade for the whole form on a strong front-loaded ease-out; reduced
// motion stays opacity-only. Dark onboarding keeps its deliberate staggered
// storyboard untouched (these consts are referenced only behind `light` checks).
const LIGHT_SWAP_EASE = [0.22, 1, 0.36, 1] as const;
const LIGHT_PHASE_OUT = { duration: 0.09, ease: LIGHT_SWAP_EASE };
const LIGHT_PHASE_IN = { duration: 0.15, ease: LIGHT_SWAP_EASE };
// Light signer ceremony: the CTA is ONE persistent button across the read↔sign swap,
// NOT two buttons morphed via `layoutId`. A shared-element morph can't bridge an
// AnimatePresence mode="wait" gap — the source unmounts before the target mounts, so
// it teleports ("falls/jumps"). Instead the single button stays mounted and motion's
// `layout` glides it to its new position as the content above changes height — it
// follows the resizing card (transitions.dev "card resize": 300ms, same ease-out).
const LIGHT_CTA_GLIDE = { duration: 0.3, ease: LIGHT_SWAP_EASE };

// Light ceremony only: wrap the read↔sign content + the persistent CTA in ONE <form>
// so the lifted-out submit button still submits. Dark onboarding keeps its sign-phase
// <motion.form> (the wrapper is a no-op Fragment there → DOM byte-identical).
function CeremonyShell({
  light,
  onSubmit,
  children,
}: {
  light: boolean;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  // `relative` gives popLayout's absolutely-positioned exiting phase a positioning
  // context so it stays put while it fades (instead of jumping to the page origin).
  return light ? <form onSubmit={onSubmit} className="relative">{children}</form> : <>{children}</>;
}

interface AgreementFormProps {
  userId: string;
  userEmail: string;
  sections: { number: number; title: string; content: string }[];
  title: string;
  // Onboarding-specific (optional)
  department?: string;
  role?: string;
  isContractor?: boolean;
  onboarded?: number;
  showEngagementType?: boolean;
  // API endpoint configuration
  signEndpoint: string;
  // Extra payload to include in sign request (e.g., { token } for external signing)
  signPayloadExtra?: Record<string, string>;
  // Redirect after signing (undefined = use response redirect, null = no redirect/show static success)
  successRedirect?: string | null;
  // Optional personal note to display
  personalNote?: string;
  // Guardian signing for a minor
  isGuardianSigning?: boolean;
  // Opt into the light signer-ceremony theme. Default false → dark (onboarding untouched).
  light?: boolean;
  // Light signer-ceremony only: notify the host sheet when the ceremony leaves the
  // reading step for the signing act, so it can grow drawer → fullscreen. Onboarding
  // omits it → no-op (and the sheet chrome doesn't exist there anyway).
  onExpandedChange?: (expanded: boolean) => void;
}

export function AgreementForm({
  userId,
  userEmail,
  sections,
  title,
  department,
  role,
  isContractor = false,
  onboarded,
  showEngagementType = true,
  signEndpoint,
  signPayloadExtra,
  successRedirect,
  personalNote,
  isGuardianSigning = false,
  light = false,
  onExpandedChange,
}: AgreementFormProps) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Reduced-motion-aware field entrance.
  //   light:  no per-field motion — the whole sign form fades in as ONE fast unit
  //           (see the motion.form below). Staggering a legal form reads as sluggish
  //           on a high-attention surface, which is exactly the "too slow" the signer felt.
  //   dark:   onboarding's deliberate staggered storyboard, untouched (opacity + rise,
  //           cascading delay on SPRING).
  //   reduce: quick opacity-only fade (no translate, no stagger) in either theme.
  const fieldRise = (delay: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } }
      : light
        ? {}
        : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...SPRING, delay } };

  // Phase: 'read' → 'sign' → 'success'
  const [phase, setPhase] = useState<'read' | 'sign' | 'success'>('read');

  // Light lifts the submit button OUT of the sign step (into the persistent CTA), so
  // its sign step is a plain motion.div inside the outer <form>. Dark keeps the sign
  // step AS the <motion.form> (submit lives inside it) — unchanged.
  const SignWrapper = light ? motion.div : motion.form;

  // The signing act (everything past reading) is a full-attention moment: tell the
  // host sheet to grow drawer → fullscreen (mobile) / taller card (desktop). Reading
  // stays a peek-sized drawer. onExpandedChange is stable (a useState setter), so this
  // fires only on phase change; onboarding passes no handler → no-op.
  useEffect(() => {
    onExpandedChange?.(phase !== 'read');
  }, [phase, onExpandedChange]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [engagementType, setEngagementType] = useState<'team_member' | 'contractor'>(
    isContractor ? 'contractor' : 'team_member'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [minorName, setMinorName] = useState('');
  // Light signer-ceremony only: the drawn/typed signature captured by SignaturePad.
  const [signatureValue, setSignatureValue] = useState<SignatureValue | null>(null);
  // External signing only: the short-lived signed-copy URL returned by the sign
  // route, surfaced as a download button on the success dialog. Null when the
  // (best-effort) mint failed — the success copy then falls back to email-only.
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Signature animation: plays inline, then pops up confirmation dialog
  const [signed, setSigned] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    if (!showConfirmation) return;
    acquireScrollLock();
    return () => { releaseScrollLock(); };
  }, [showConfirmation]);

  // Signature animation timing
  const [sigKey, setSigKey] = useState(0);
  const SIG = { charDelay: 0.08, charDuration: 0.18, initialDelay: 0.3, fontSize: 27 };

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    const progress = scrollable > 0 ? el.scrollTop / scrollable : 1;
    setScrollProgress(Math.min(progress, 1));
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      setHasScrolledToBottom(true);
    }
  }, []);

  // Check on mount if content doesn't need scrolling
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 40) {
      setHasScrolledToBottom(true);
      setScrollProgress(1);
    }
  }, []);

  // In the light signer ceremony a captured signature is required; onboarding
  // (dark) derives the signature from the legal name, so it stays ungated.
  const canSubmit =
    fullName.trim().length > 0 &&
    address.trim().length > 0 &&
    (!isGuardianSigning || minorName.trim().length > 0) &&
    (!light || signatureValue !== null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSaving(true);

    try {
      const res = await fetch(signEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          address: address.trim(),
          ...(showEngagementType ? { engagement_type: engagementType } : {}),
          ...(isGuardianSigning ? { minor_name: minorName.trim() } : {}),
          // Light ceremony plumbs the captured signature; `signature_kind`
          // disambiguates a drawn PNG dataURL from a typed name so the Phase-4
          // certificate can validate/render each without sniffing the string.
          ...(light && signatureValue
            ? {
                signature_image:
                  signatureValue.kind === 'drawn' ? signatureValue.dataUrl : signatureValue.text,
                signature_kind: signatureValue.kind,
              }
            : {}),
          ...signPayloadExtra,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to sign agreement.');
        setSaving(false);
        trigger('error');
        return;
      }

      // External signing returns a short-lived signed-copy URL for the success
      // dialog's download button. Onboarding omits it (undefined → null), so the
      // button never renders there.
      setDownloadUrl(typeof data.downloadUrl === 'string' ? data.downloadUrl : null);

      trigger('success');
      setSigKey(k => k + 1);
      setSigned(true);

      // After signature animation completes, show confirmation dialog
      const sigAnimDuration = (SIG.initialDelay + fullName.trim().length * SIG.charDelay + 0.6) * 1000;
      setTimeout(() => {
        setShowConfirmation(true);
        trigger('success');
      }, sigAnimDuration);

      // Redirect after confirmation has been visible
      if (successRedirect === null) {
        // No redirect — external signing shows static success
        return;
      }
      setTimeout(() => {
        router.push(data.redirect || successRedirect || (onboarded === 0 ? '/onboarding' : '/'));
        router.refresh();
      }, sigAnimDuration + 2500);
    } catch {
      setError('Failed to sign agreement. Please try again.');
      setSaving(false);
      trigger('error');
    }
  }

  return (
    <>
      {/* ── Confirmation dialog overlay ── */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            key="confirmation-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              'fixed inset-0 z-[60] flex justify-center',
              // Light signer ceremony: the success state is a bottom DRAWER on mobile
              // (continues the ceremony's drawer language) and a centered modal on
              // desktop. Dark onboarding stays centered + pixel-identical.
              light
                ? 'items-end px-0 sm:items-center sm:px-4 bg-black/30 backdrop-blur-sm'
                : 'items-center px-4 bg-black/80 backdrop-blur-md',
            )}
          >
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
              transition={reduce ? { duration: 0.12 } : SPRING}
              className={cn(
                'w-full border p-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:pb-8',
                light
                  // Mobile: full-bleed drawer, 28px top corners (matches RecipientSheet).
                  // Desktop (sm:): unchanged centered modal — max-w-sm, all corners, gutter.
                  ? 'rounded-t-[28px] border-wash-6 bg-surface-1 shadow-seeko sm:mx-4 sm:max-w-sm sm:rounded-2xl'
                  : 'mx-0 max-w-sm rounded-t-2xl border-border bg-card shadow-2xl sm:mx-4 sm:rounded-2xl',
              )}
            >
              <div className="flex flex-col items-center gap-4">
                {/* Success check: a check may scale UP for impact, but never from 0
                    (nothing in the real world appears from nothing) — start at 0.8 +
                    opacity. Reduced motion gets a plain fade, no spring pop. */}
                <motion.div
                  initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                  transition={reduce ? { duration: 0.12 } : { ...SPRING_SNAPPY, delay: 0.15 }}
                >
                  <div
                    className={cn(
                      'flex size-14 items-center justify-center rounded-full ring-1',
                      light ? `${LIGHT_SUCCESS_CHIP} ring-success/20` : 'bg-seeko-accent/15 ring-seeko-accent/30',
                    )}
                  >
                    <Check className={cn('size-7', light ? LIGHT_SUCCESS_TEXT : 'text-seeko-accent')} strokeWidth={2.5} />
                  </div>
                </motion.div>
                <div className="text-center">
                  <p className={cn('text-lg font-semibold', light ? 'text-ink-title' : 'text-foreground')}>Agreement Signed</p>
                  <p className={cn('mt-1.5 text-sm leading-relaxed', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}>
                    {successRedirect === null
                      ? downloadUrl
                        ? 'A signed copy was emailed to you. You can also download it below.'
                        : 'A signed copy has been sent to your email. You may close this page.'
                      : 'A signed copy has been sent to your email. Redirecting you now...'}
                  </p>
                </div>
                {/* External signing only: download the just-minted signed copy.
                    A real anchor (not a button) so it works without JS and the
                    browser handles the PDF. Opens in a new tab to keep the
                    success screen intact. */}
                {successRedirect === null && downloadUrl && (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(BTN_SECONDARY, 'mt-1 inline-flex w-full items-center justify-center gap-2', LIGHT_FOCUS_RING)}
                  >
                    <Download className="size-4" strokeWidth={2} />
                    Download signed copy
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main form ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key="form"
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={reduce ? { duration: 0.12 } : SPRING}
        >
          {/* In light the RecipientSheet IS the white surface, so the Card chrome
              (bg / border / shadow / padding) is neutralized and only its layout
              remains. Dark onboarding keeps the full card. */}
          <Card className={cn('overflow-visible', light && 'border-0 bg-transparent p-0 shadow-none')}>
            <CardContent className={cn(light ? 'p-0' : 'pt-6')}>
              {/* Personal note from sender */}
              {personalNote && (
                <div
                  className={cn(
                    'mb-4 rounded-lg border px-4 py-3',
                    light ? 'border-wash-6 bg-wash-2' : 'border-seeko-accent/20 bg-seeko-accent/5',
                  )}
                >
                  <p className={cn('text-xs font-medium mb-1', light ? 'text-ink-muted-strong' : 'text-seeko-accent')}>Note from sender</p>
                  <p className={cn('text-sm', light ? 'text-ink-strong' : 'text-muted-foreground')}>{personalNote}</p>
                </div>
              )}

              {/* Read-only info */}
              {(userEmail || department) && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="text-sm font-mono text-foreground truncate">{userEmail}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Department / Role</Label>
                    <p className="text-sm text-foreground truncate">
                      {department || 'Unassigned'}{role ? ` — ${role}` : ''}
                    </p>
                  </div>
                </div>
              )}

              <CeremonyShell light={light} onSubmit={handleSubmit}>
              {/* light: popLayout pulls the EXITING phase out of flow (position:absolute)
                  so the entering phase takes its place in the SAME frame — the content
                  height steps read→sign once, with no empty intermediate. That lets the
                  persistent CTA below glide monotonically to its new spot instead of
                  chasing the collapse up and falling back (the "jump"). dark: keeps
                  mode="wait" (exit-then-enter) so onboarding's height-collapse is untouched. */}
              <AnimatePresence mode={light ? 'popLayout' : 'wait'} initial={false}>
                {phase === 'read' ? (
                  <motion.div
                    key="read-phase"
                    // light: a fast opacity fade-OUT only (read → sign). No enter animation, so the
                    // reverse (sign → read) snaps in instantly — fading it back in while the sheet
                    // shrinks read as choppy. The surface itself resizes (RecipientSheet CARD_RESIZE),
                    // so collapsing height here too is redundant. dark: onboarding's height-collapse, untouched.
                    exit={reduce ? { opacity: 0 } : light ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={light && !reduce ? LIGHT_PHASE_OUT : { duration: reduce ? 0.12 : 0.3 }}
                    className="overflow-hidden"
                  >
                    {light ? (
                      /* Mockup header: doc-icon chip + name + read instruction.
                         The % readout and progress bar are dropped in favor of the
                         bottom-fade cue on the scroll body + the scroll hint below. */
                      <div className="mb-4 flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-wash-4 text-ink-muted-strong">
                          <FileText className="size-[18px]" />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink-title">{title}</h2>
                          <p className={cn('mt-0.5 text-[13px]', LIGHT_RECIPIENT_MUTED)}>Read each section before signing.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Agreement header + progress */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <FileText className="size-4 text-muted-foreground" />
                            {title}
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {Math.round(scrollProgress * 100)}%
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="h-0.5 w-full rounded-full mb-3 overflow-hidden bg-border">
                          <motion.div
                            className="h-full rounded-full bg-seeko-accent"
                            style={{ width: `${scrollProgress * 100}%` }}
                            transition={{ duration: 0.1 }}
                          />
                        </div>
                      </>
                    )}

                    {/* Scrollable agreement text — wrapped so the light theme can
                        lay a bottom fade over it as a "more below" cue. */}
                    <div className="relative">
                    <div
                      ref={scrollRef}
                      onScroll={handleScroll}
                      className={cn(
                        'max-h-[min(32rem,60dvh)] overflow-y-auto rounded-md p-4 sm:p-5 prose prose-sm max-w-none [scrollbar-width:thin]',
                        '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2',
                        '[&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-3',
                        '[&_ul]:text-sm [&_ul]:ml-4 [&_ul]:mb-3 [&_li]:mb-1',
                        light
                          ? 'max-h-[min(20rem,42dvh)] rounded-xl bg-[#fafafa] ring-1 ring-inset ring-wash-5 [scrollbar-color:#d4d4d4_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/15 [&::-webkit-scrollbar-track]:bg-transparent [&_h3]:!mt-0 [&_h3]:!mb-1.5 [&_h3]:tracking-[-0.01em] [&_h3]:text-balance [&_h3]:text-ink-title [&_p]:!mb-0 [&_p]:text-pretty [&_p]:text-[#4a4a4a] [&_p+p]:!mt-3 [&_ul]:text-[#4a4a4a]'
                          : 'bg-muted/20 prose-invert [&_h3]:text-foreground [&_p]:text-muted-foreground [&_ul]:text-muted-foreground',
                      )}
                    >
                      {light ? (
                        <div className="space-y-6">
                          {sections.map((section) => (
                            // Editorial clause numeral: a quiet figure hanging in the left gutter
                            // (not a UI chip), with the body hanging-indented under the title so
                            // each clause reads as a set legal section. Number stays muted ink
                            // (azure is reserved for interactive meaning) and is tabular so digit
                            // widths don't jitter from clause to clause.
                            // items-start (not items-baseline) + matched numeral leading: cap-aligned
                            // by design (numeral shoulder to title cap), deterministically — do NOT
                            // revert to baseline. items-baseline only cap-aligned by luck of
                            // leading-none and silently dropped the numeral ~23px on a 2-line title.
                            <div
                              key={section.number}
                              className="grid grid-cols-[1.5rem_1fr] items-start gap-x-3"
                            >
                              <span className="select-none text-right text-[18px] font-normal leading-[1.5] tabular-nums text-ink-faint">
                                {section.number}
                              </span>
                              <div className="min-w-0">
                                <h3>{section.title}</h3>
                                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.content) }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        sections.map((section) => (
                          <div key={section.number}>
                            <h3>
                              <span
                                className={cn(
                                  'inline-flex size-6 items-center justify-center rounded text-xs font-mono mr-2 align-middle',
                                  'bg-muted text-muted-foreground',
                                )}
                              >
                                {section.number}
                              </span>
                              {section.title}
                            </h3>
                            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.content) }} />
                          </div>
                        ))
                      )}
                      <div className={cn('mt-8 pt-4 border-t', light ? LIGHT_RECIPIENT_HAIRLINE : 'border-border')}>
                        <p className={cn('text-xs italic', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}>
                          End of agreement — {sections.length} sections. Please continue below to sign.
                        </p>
                      </div>
                    </div>
                    {light && !hasScrolledToBottom && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 rounded-b-xl bg-gradient-to-t from-[#fafafa] via-[#fafafa]/80 to-transparent"
                      />
                    )}
                    </div>

                    {/* Scroll hint / Continue button — DARK only. Light lifts BOTH into the
                        persistent CTA below the content swap, so the button can glide
                        read→sign (one element) instead of unmounting and teleporting. */}
                    {!light && (
                    <div className="mt-4">
                      <AnimatePresence mode="wait">
                        {hasScrolledToBottom ? (
                          <motion.div
                            key="continue"
                            // light: shares a layoutId with the sign-phase "Sign agreement" button so
                            // the CTA box resizes/repositions between the two phases (card-resize feel)
                            // instead of fade-popping. dark: no shared morph, onboarding's plain rise.
                            layoutId={light && !reduce ? 'signer-cta' : undefined}
                            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduce ? { duration: 0.12 } : SPRING}
                          >
                            <Button
                              type="button"
                              className={cn('w-full gap-2', light && LIGHT_RECIPIENT_CTA)}
                              onClick={() => setPhase('sign')}
                            >
                              {light ? 'Continue to sign' : 'Continue to Sign'}
                              <ArrowRight className="size-4" />
                            </Button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="scroll-hint"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={cn('flex items-center justify-center gap-2 text-xs', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}
                          >
                            {/* Static under reduced motion — an infinite bob is a
                                WCAG 2.2.2 (pause/stop/hide) concern. */}
                            <motion.div
                              animate={reduce ? { y: 0 } : { y: [0, 4, 0] }}
                              transition={reduce ? undefined : { repeat: Infinity, duration: 1.5 }}
                            >
                              <ArrowDown className="size-3.5" />
                            </motion.div>
                            {light ? 'Scroll to read all' : 'Scroll to read the full agreement'}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    )}
                  </motion.div>
                ) : (
                  <SignWrapper
                    key="sign-phase"
                    {...(light ? {} : { onSubmit: handleSubmit })}
                    // light: the whole form fades in as one fast unit (+ a 6px settle), no
                    // entrance delay and no per-field stagger (fieldRise is inert in light) —
                    // the items appear together, immediately. No exit, so sign → read snaps back
                    // (fading out here while the sheet shrinks read as choppy).
                    // dark: onboarding's gentle opacity ramp + per-field stagger, untouched.
                    initial={reduce ? { opacity: 0 } : light ? { opacity: 0, y: 6 } : { opacity: 0 }}
                    animate={reduce ? { opacity: 1 } : light ? { opacity: 1, y: 0 } : { opacity: 1 }}
                    transition={reduce ? { duration: 0.12 } : light ? LIGHT_PHASE_IN : { ...SPRING, delay: 0.15 }}
                    className={cn('space-y-5', light && 'space-y-4')}
                  >
                    {/* Collapsed agreement reference */}
                    <button
                      type="button"
                      onClick={() => setPhase('read')}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border px-4 py-3 text-left transition-colors',
                        light ? 'border-wash-6 bg-wash-2 hover:bg-wash-4' : 'border-border bg-muted/30 hover:bg-muted/50',
                        light && LIGHT_FOCUS_RING,
                      )}
                    >
                      <FileText className={cn('size-4 shrink-0', light ? 'text-ink-faint' : 'text-seeko-accent')} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', light ? 'text-ink-title' : 'text-foreground')}>{title}</p>
                        <p className={cn('text-xs', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}>{sections.length} sections — read in full</p>
                      </div>
                      <Check className={cn('size-4 shrink-0', light ? LIGHT_SUCCESS_TEXT : 'text-seeko-accent')} />
                    </button>

                    <Separator className={cn(light && 'bg-wash-6')} />

                    <div className="text-center">
                      <p className={cn('text-sm font-medium', light ? 'text-ink-title' : 'text-foreground')}>
                        {isGuardianSigning ? 'Sign as Guardian' : 'Sign the Agreement'}
                      </p>
                      <p className={cn('mt-1 text-xs', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}>
                        {isGuardianSigning
                          ? 'By signing below, you agree as the legal guardian of the named minor to all terms outlined above.'
                          : 'By signing below, you agree to all terms outlined above.'}
                        {!light && ' A signed PDF will be emailed to you for your records.'}
                      </p>
                    </div>

                    {/* Engagement type */}
                    {showEngagementType && (
                      <motion.fieldset
                        {...fieldRise(0.2)}
                        className="space-y-2"
                      >
                        <Label>Engagement Type</Label>
                        <div className="flex gap-3">
                          {[
                            { value: 'team_member' as const, label: 'Team Member' },
                            { value: 'contractor' as const, label: 'Independent Contractor' },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              disabled
                              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium cursor-not-allowed ${
                                engagementType === opt.value
                                  ? 'border-seeko-accent/50 bg-seeko-accent/10 text-seeko-accent'
                                  : 'border-border bg-muted/30 text-muted-foreground opacity-40'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </motion.fieldset>
                    )}

                    {/* Legal name */}
                    <motion.div
                      {...fieldRise(0.3)}
                      className="space-y-2"
                    >
                      <Label htmlFor="full-name" className={cn(light && 'text-ink-strong')}>Legal Full Name</Label>
                      <Input
                        id="full-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="As it appears on official documents"
                        autoFocus
                        required
                        className={cn(light && LIGHT_INPUT)}
                      />
                    </motion.div>

                    {/* Address */}
                    <motion.div
                      {...fieldRise(0.4)}
                      className="space-y-2"
                    >
                      <Label htmlFor="address" className={cn(light && 'text-ink-strong')}>Address</Label>
                      <AddressAutocomplete
                        id="address"
                        value={address}
                        onChange={setAddress}
                        placeholder="Start typing your address..."
                        required
                        light={light}
                      />
                    </motion.div>

                    {/* Minor's name (guardian signing only) */}
                    {isGuardianSigning && (
                      <motion.div
                        {...fieldRise(0.45)}
                        className="space-y-2"
                      >
                        <Label htmlFor="minor-name" className={cn(light && 'text-ink-strong')}>Minor&apos;s Full Legal Name</Label>
                        <Input
                          id="minor-name"
                          value={minorName}
                          onChange={(e) => setMinorName(e.target.value)}
                          placeholder="Full legal name of the minor"
                          required
                          className={cn(light && LIGHT_INPUT)}
                        />
                        <p className={cn('text-xs', light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground')}>
                          The person under 18 you are signing on behalf of
                        </p>
                      </motion.div>
                    )}

                    {/* Signature — light ceremony uses the interactive draw/type pad;
                        dark onboarding keeps the auto-handwriting preview of the name. */}
                    {light ? (
                      <motion.div {...fieldRise(0)} className="space-y-2">
                        <Label className="text-ink-strong">Signature</Label>
                        <SignaturePad light onChange={setSignatureValue} />
                      </motion.div>
                    ) : (
                      fullName.trim() && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={SPRING}
                        >
                          <div className="rounded-lg border border-border bg-muted/20 px-4 sm:px-6 py-5 text-center">
                            <p className="text-xs font-medium text-muted-foreground mb-3">Signature</p>
                            <SignatureDrawing
                              text={fullName.trim()}
                              fontSize={SIG.fontSize}
                              signed={signed}
                              sigKey={sigKey}
                              charDelay={SIG.charDelay}
                              charDuration={SIG.charDuration}
                              initialDelay={SIG.initialDelay}
                              className="mx-auto max-w-sm"
                            />
                            {/* Underline — grows with name while typing, plays draw animation on signed */}
                            {signed ? (
                              <motion.div
                                key={`underline-${sigKey}`}
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{
                                  duration: 0.6,
                                  delay: SIG.initialDelay + fullName.trim().length * SIG.charDelay + 0.1,
                                  ease: [0.22, 0.03, 0.26, 1],
                                }}
                                className="mx-auto mt-2 h-px bg-foreground/30 origin-left"
                                style={{ width: Math.min(fullName.trim().length * 14 + 32, 240) }}
                              />
                            ) : (
                              <motion.div
                                className="mx-auto mt-2 h-px bg-foreground/20"
                                animate={{ width: Math.min(fullName.trim().length * 14 + 32, 240) }}
                                transition={{ duration: 0.3, ease: [0.22, 0.03, 0.26, 1] }}
                              />
                            )}
                          </div>
                        </motion.div>
                      )
                    )}

                    {error && (
                      <p
                        className={cn(
                          'text-sm px-3 py-2 rounded-lg',
                          light ? 'text-danger bg-danger/10' : 'text-destructive bg-destructive/10',
                        )}
                      >
                        {error}
                      </p>
                    )}

                    {/* Submit — DARK onboarding only. Light's submit is the persistent CTA
                        below the content swap, so it glides read→sign as one element. */}
                    {!light && (
                    <motion.div {...fieldRise(0.5)}>
                      <Button
                        type="submit"
                        disabled={saving || signed || !canSubmit}
                        className="w-full gap-2"
                      >
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={saving ? 'saving' : 'idle'}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="inline-flex items-center gap-2"
                          >
                            {saving ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                Signing...
                              </>
                            ) : (
                              <>
                                I Agree &amp; Sign
                                <ArrowRight className="size-4" />
                              </>
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </Button>
                    </motion.div>
                    )}
                  </SignWrapper>
                )}
              </AnimatePresence>

              {/* ── Persistent CTA (light ceremony only) ──
                  ONE button across read↔sign. It never unmounts at the phase boundary, so
                  `layout` glides it to its new position as the content above changes height
                  — it follows the resizing card instead of falling/jumping. The label
                  crossfades in place; reduced motion drops the glide. */}
              {light && (
                <motion.div
                  layout={reduce ? false : 'position'}
                  transition={LIGHT_CTA_GLIDE}
                  className="mt-4"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {phase === 'read' && !hasScrolledToBottom ? (
                      <motion.div
                        key="scroll-hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn('flex items-center justify-center gap-2 text-xs', LIGHT_RECIPIENT_MUTED)}
                      >
                        {/* Static under reduced motion — an infinite bob is a
                            WCAG 2.2.2 (pause/stop/hide) concern. */}
                        <motion.div
                          animate={reduce ? { y: 0 } : { y: [0, 4, 0] }}
                          transition={reduce ? undefined : { repeat: Infinity, duration: 1.5 }}
                        >
                          <ArrowDown className="size-3.5" />
                        </motion.div>
                        Scroll to read all
                      </motion.div>
                    ) : (
                      // Same key in read(scrolled) AND sign → React keeps this exact node
                      // mounted across the swap, so the outer `layout` glides it.
                      <motion.div key="signer-cta">
                        <Button
                          type={phase === 'read' ? 'button' : 'submit'}
                          onClick={phase === 'read' ? () => setPhase('sign') : undefined}
                          disabled={phase === 'sign' && (saving || signed || !canSubmit)}
                          // The visible label crossfades between phases via AnimatePresence,
                          // so pin the accessible name to phase/saving state rather than the
                          // transient label children — screen readers get one stable name
                          // (no mid-animation flicker), and it matches each settled label.
                          aria-label={phase === 'read' ? 'Continue to sign' : saving ? 'Signing' : 'Sign agreement'}
                          className={cn('w-full gap-2', LIGHT_RECIPIENT_CTA)}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={phase === 'read' ? 'continue' : saving ? 'saving' : 'sign'}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="inline-flex items-center gap-2"
                            >
                              {phase === 'read' ? (
                                <>
                                  Continue to sign
                                  <ArrowRight className="size-4" />
                                </>
                              ) : saving ? (
                                <>
                                  <Loader2 className="size-4 animate-spin" />
                                  Signing...
                                </>
                              ) : (
                                <>
                                  <Check className="size-4" strokeWidth={2.5} />
                                  Sign agreement
                                </>
                              )}
                            </motion.span>
                          </AnimatePresence>
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* E-signature consent (ESIGN Act / UETA) — light, sign step only. Sits
                  below the persistent CTA so it never shifts the button's glide target. */}
              {light && phase === 'sign' && (
                <motion.p
                  key="esign-consent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.12 }}
                  className={cn('mt-4 text-center text-[11px] leading-relaxed', LIGHT_RECIPIENT_MUTED)}
                >
                  By selecting &ldquo;Sign agreement,&rdquo; you consent to sign this document
                  electronically under the U.S. ESIGN Act and UETA, and agree your electronic
                  signature is legally binding.
                </motion.p>
              )}
              </CeremonyShell>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
