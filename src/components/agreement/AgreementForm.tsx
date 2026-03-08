'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Agreement Form
 *
 *  Phase 1: READ (agreement text focus)
 *    +0ms   Progress bar at 0%, accent color
 *    scroll  Bar fills proportionally as user reads
 *    bottom  "Continue to sign" button fades in
 *
 *  Phase 2: SIGN (form fields focus)
 *    +0ms   Agreement collapses, sign form slides up
 *  200ms   Fields stagger in (name, address, engagement)
 *  400ms   Submit button appears
 *
 *  Phase 3: SUCCESS (confirmation)
 *    +0ms   Button → checkmark morph
 *  300ms   "Agreement signed" text fades in
 *  1200ms  Redirect
 * ───────────────────────────────────────────────────────── */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowRight, FileText, Check, ArrowDown } from 'lucide-react';
import { AddressAutocomplete } from '@/components/agreement/AddressAutocomplete';
import { useHaptics } from '@/components/HapticsProvider';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };
const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 400, damping: 30 };

interface AgreementFormProps {
  userId: string;
  userEmail: string;
  department: string;
  role: string;
  isContractor: boolean;
  onboarded: number;
}

export function AgreementForm({
  userId,
  userEmail,
  department,
  role,
  isContractor,
  onboarded,
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

  const canSubmit = fullName.trim().length > 0 && address.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/agreement/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          address: address.trim(),
          engagement_type: engagementType,
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
      setPhase('success');

      // Brief success moment before redirect
      setTimeout(() => {
        router.push(data.redirect || (onboarded === 0 ? '/onboarding' : '/'));
        router.refresh();
      }, 1500);
    } catch {
      setError('Failed to sign agreement. Please try again.');
      setSaving(false);
      trigger('error');
    }
  }

  return (
    <AnimatePresence mode="wait">
      {phase === 'success' ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
          className="flex flex-col items-center gap-4 py-12"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...SPRING_SNAPPY, delay: 0.1 }}
            className="flex size-16 items-center justify-center rounded-full bg-seeko-accent/15 ring-1 ring-seeko-accent/30"
          >
            <Check className="size-8 text-seeko-accent" strokeWidth={2.5} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.25 }}
            className="text-center"
          >
            <p className="text-lg font-semibold text-foreground">Agreement Signed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A copy has been sent to your email. Redirecting...
            </p>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="form"
          exit={{ opacity: 0, y: -12 }}
          transition={SPRING}
        >
          <Card>
            <CardContent className="pt-6">
              {/* Read-only info */}
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
                        {AGREEMENT_TITLE}
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
                      className="h-[28rem] overflow-y-auto rounded-lg border border-border bg-muted/30 p-5 prose prose-sm prose-invert max-w-none
                        [scrollbar-width:thin]
                        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2
                        [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-3
                        [&_ul]:text-sm [&_ul]:text-muted-foreground [&_ul]:ml-4 [&_ul]:mb-3 [&_li]:mb-1"
                    >
                      {AGREEMENT_SECTIONS.map((section) => (
                        <div key={section.number}>
                          <h3>
                            <span className="inline-flex size-6 items-center justify-center rounded bg-muted text-xs font-mono text-muted-foreground mr-2 align-middle">
                              {section.number}
                            </span>
                            {section.title}
                          </h3>
                          <div dangerouslySetInnerHTML={{ __html: section.content }} />
                        </div>
                      ))}
                      <div className="mt-8 pt-4 border-t border-border">
                        <p className="text-xs text-muted-foreground italic">
                          End of agreement — {AGREEMENT_SECTIONS.length} sections. Please continue below to sign.
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
                        <p className="text-sm font-medium text-foreground">{AGREEMENT_TITLE}</p>
                        <p className="text-xs text-muted-foreground">{AGREEMENT_SECTIONS.length} sections — read in full</p>
                      </div>
                      <Check className="size-4 text-seeko-accent shrink-0" />
                    </button>

                    <Separator />

                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Sign the Agreement</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        By signing below, you agree to all terms outlined above.
                        A signed PDF will be emailed to you for your records.
                      </p>
                    </div>

                    {/* Engagement type */}
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
                            onClick={() => setEngagementType(opt.value)}
                            className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                              engagementType === opt.value
                                ? 'border-seeko-accent/50 bg-seeko-accent/10 text-seeko-accent'
                                : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </motion.fieldset>

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

                    {/* Signature preview */}
                    {fullName.trim() && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={SPRING}
                        className="overflow-hidden"
                      >
                        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-center">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Digital Signature</p>
                          <p className="text-lg font-serif italic text-foreground">{fullName.trim()}</p>
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
                        disabled={saving || !canSubmit}
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
      )}
    </AnimatePresence>
  );
}
