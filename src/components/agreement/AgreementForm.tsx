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
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowRight, FileText, Check, ArrowDown } from 'lucide-react';
import { AddressAutocomplete } from '@/components/agreement/AddressAutocomplete';
import { SignatureDrawing } from '@/components/agreement/SignatureDrawing';
import { useHaptics } from '@/components/HapticsProvider';
import DOMPurify from 'dompurify';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };
const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 400, damping: 30 };

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
}: AgreementFormProps) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Phase: 'read' → 'sign' → 'success'
  const [phase, setPhase] = useState<'read' | 'sign' | 'success'>('read');
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

  const canSubmit = fullName.trim().length > 0 && address.trim().length > 0 && (!isGuardianSigning || minorName.trim().length > 0);

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
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={SPRING}
              className="mx-0 sm:mx-4 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card p-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:pb-8 shadow-2xl"
            >
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...SPRING_SNAPPY, delay: 0.15 }}
                >
                  <div className="flex size-14 items-center justify-center rounded-full bg-seeko-accent/15 ring-1 ring-seeko-accent/30">
                    <Check className="size-7 text-seeko-accent" strokeWidth={2.5} />
                  </div>
                </motion.div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">Agreement Signed</p>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {successRedirect === null
                      ? 'A signed copy has been sent to your email. You may close this page.'
                      : 'A signed copy has been sent to your email. Redirecting you now...'}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main form ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key="form"
          exit={{ opacity: 0, y: -12 }}
          transition={SPRING}
        >
          <Card className="overflow-visible">
            <CardContent className="pt-6">
              {/* Personal note from sender */}
              {personalNote && (
                <div className="mb-4 rounded-lg border border-seeko-accent/20 bg-seeko-accent/5 px-4 py-3">
                  <p className="text-xs font-medium text-seeko-accent mb-1">Note from sender</p>
                  <p className="text-sm text-muted-foreground">{personalNote}</p>
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

              <AnimatePresence mode="wait">
                {phase === 'read' ? (
                  <motion.div
                    key="read-phase"
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    {/* Agreement header + progress */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <FileText className="size-4 text-muted-foreground" />
                        {title}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(scrollProgress * 100)}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-0.5 w-full rounded-full bg-border mb-3 overflow-hidden">
                      <motion.div
                        className="h-full bg-seeko-accent rounded-full"
                        style={{ width: `${scrollProgress * 100}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>

                    {/* Scrollable agreement text */}
                    <div
                      ref={scrollRef}
                      onScroll={handleScroll}
                      className="max-h-[min(32rem,60dvh)] overflow-y-auto rounded-md bg-muted/20 p-4 sm:p-5 prose prose-sm prose-invert max-w-none
                        [scrollbar-width:thin]
                        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2
                        [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-3
                        [&_ul]:text-sm [&_ul]:text-muted-foreground [&_ul]:ml-4 [&_ul]:mb-3 [&_li]:mb-1"
                    >
                      {sections.map((section) => (
                        <div key={section.number}>
                          <h3>
                            <span className="inline-flex size-6 items-center justify-center rounded bg-muted text-xs font-mono text-muted-foreground mr-2 align-middle">
                              {section.number}
                            </span>
                            {section.title}
                          </h3>
                          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(section.content) }} />
                        </div>
                      ))}
                      <div className="mt-8 pt-4 border-t border-border">
                        <p className="text-xs text-muted-foreground italic">
                          End of agreement — {sections.length} sections. Please continue below to sign.
                        </p>
                      </div>
                    </div>

                    {/* Scroll hint / Continue button */}
                    <div className="mt-4">
                      <AnimatePresence mode="wait">
                        {hasScrolledToBottom ? (
                          <motion.div
                            key="continue"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={SPRING}
                          >
                            <Button
                              type="button"
                              className="w-full gap-2"
                              onClick={() => setPhase('sign')}
                            >
                              Continue to Sign
                              <ArrowRight className="size-4" />
                            </Button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="scroll-hint"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-center gap-2 text-xs text-muted-foreground"
                          >
                            <motion.div
                              animate={{ y: [0, 4, 0] }}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                            >
                              <ArrowDown className="size-3.5" />
                            </motion.div>
                            Scroll to read the full agreement
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form
                    key="sign-phase"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ ...SPRING, delay: 0.15 }}
                    onSubmit={handleSubmit}
                    className="space-y-5"
                  >
                    {/* Collapsed agreement reference */}
                    <button
                      type="button"
                      onClick={() => setPhase('read')}
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <FileText className="size-4 text-seeko-accent shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground">{sections.length} sections — read in full</p>
                      </div>
                      <Check className="size-4 text-seeko-accent shrink-0" />
                    </button>

                    <Separator />

                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        {isGuardianSigning ? 'Sign as Guardian' : 'Sign the Agreement'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isGuardianSigning
                          ? 'By signing below, you agree as the legal guardian of the named minor to all terms outlined above.'
                          : 'By signing below, you agree to all terms outlined above.'}
                        {' '}A signed PDF will be emailed to you for your records.
                      </p>
                    </div>

                    {/* Engagement type */}
                    {showEngagementType && (
                      <motion.fieldset
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.2 }}
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
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING, delay: 0.3 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="full-name">Legal Full Name</Label>
                      <Input
                        id="full-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="As it appears on official documents"
                        autoFocus
                        required
                      />
                    </motion.div>

                    {/* Address */}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING, delay: 0.4 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="address">Address</Label>
                      <AddressAutocomplete
                        id="address"
                        value={address}
                        onChange={setAddress}
                        placeholder="Start typing your address..."
                        required
                      />
                    </motion.div>

                    {/* Minor's name (guardian signing only) */}
                    {isGuardianSigning && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.45 }}
                        className="space-y-2"
                      >
                        <Label htmlFor="minor-name">Minor&apos;s Full Legal Name</Label>
                        <Input
                          id="minor-name"
                          value={minorName}
                          onChange={(e) => setMinorName(e.target.value)}
                          placeholder="Full legal name of the minor"
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          The person under 18 you are signing on behalf of
                        </p>
                      </motion.div>
                    )}

                    {/* Signature preview — SVG path drawing animation */}
                    {fullName.trim() && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={SPRING}
                      >
                        <div className="rounded-lg border border-border bg-muted/20 px-4 sm:px-6 py-5 text-center">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Digital Signature</p>
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
                    )}

                    {error && (
                      <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                        {error}
                      </p>
                    )}

                    {/* Submit */}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING, delay: 0.5 }}
                    >
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
                  </motion.form>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
