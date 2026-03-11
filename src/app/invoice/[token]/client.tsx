'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react';
import { FileText, CheckCircle2, Clock, XCircle, Plus, Trash2, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { toast } from 'sonner';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   card fades in from y:24
 *  100ms   personal note fades in
 *  150ms   line items stagger in (30ms each)
 *  ---     total animates smoothly on amount change
 * ───────────────────────────────────────────────────────── */

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

interface LineItem {
  label: string;
  amount: string;
  prefilled?: boolean;
}

interface InvoicePageClientProps {
  token: string;
  initialData: {
    status: string;
    maskedEmail?: string;
    personalNote?: string;
    prefilledItems?: { label: string; amount: number }[];
    paymentStatus?: string;
    paymentAmount?: number | null;
    expiresAt?: string;
  };
}

type Phase = 'verify' | 'form' | 'success';

// ── Animated total counter ───────────────────────────────

function AnimatedTotal({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 300, damping: 30 });
  const display = useTransform(spring, (v) => `$${v.toFixed(2)}`);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return (
    <motion.span className="text-lg font-semibold text-seeko-accent">
      {display}
    </motion.span>
  );
}

// ── Expiry helper ────────────────────────────────────────

function formatExpiry(expiresAt: string): string {
  const expires = new Date(expiresAt);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Expires today';
  if (diffDays === 1) return 'Expires tomorrow';
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  return `Expires ${expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function InvoicePageClient({ token, initialData }: InvoicePageClientProps) {
  const alreadyVerified = initialData.status === 'verified' && !!initialData.prefilledItems;
  const prefilledCount = initialData.prefilledItems?.length ?? 0;

  const [phase, setPhase] = useState<Phase>(alreadyVerified ? 'form' : 'verify');
  const [items, setItems] = useState<LineItem[]>(
    initialData.prefilledItems?.map((i) => ({ label: i.label, amount: String(i.amount), prefilled: true })) || [{ label: '', amount: '' }],
  );
  const [paypalEmail, setPaypalEmail] = useState('');
  const [paypalError, setPaypalError] = useState('');
  const [itemsError, setItemsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [personalNote, setPersonalNote] = useState(initialData.personalNote);
  const paypalRef = useRef<HTMLInputElement>(null);

  // ── Terminal states ──────────────────────────────────────

  if (initialData.status === 'expired') {
    return (
      <StatusPage
        icon={<Clock className="size-7 text-yellow-400" />}
        title="Link Expired"
        description="This invoice request link has expired."
      />
    );
  }

  if (initialData.status === 'revoked') {
    return (
      <StatusPage
        icon={<XCircle className="size-7 text-destructive" />}
        title="Link Revoked"
        description="This invoice request has been revoked."
      />
    );
  }

  if (initialData.status === 'submitted') {
    const ps = initialData.paymentStatus;
    const amount = initialData.paymentAmount;
    const formatted = amount != null ? `$${amount.toFixed(2)}` : '';

    if (ps === 'paid') {
      return (
        <StatusPage
          icon={<CheckCircle2 className="size-7 text-emerald-400" />}
          title="Invoice Approved"
          description={formatted ? `Payment of ${formatted} has been approved.` : 'Your invoice has been approved.'}
        />
      );
    }

    if (ps === 'cancelled') {
      return (
        <StatusPage
          icon={<XCircle className="size-7 text-red-400" />}
          title="Invoice Not Approved"
          description={formatted ? `Invoice of ${formatted} was not approved.` : 'Your invoice was not approved.'}
        />
      );
    }

    // pending
    return (
      <StatusPage
        icon={<Clock className="size-7 text-amber-400" />}
        title="Invoice Submitted"
        description="Your invoice is under review."
      />
    );
  }

  // ── Success phase ────────────────────────────────────────

  if (phase === 'success') {
    return (
      <StatusPage
        icon={<CheckCircle2 className="size-7 text-emerald-400" />}
        title="Invoice Submitted"
        description="You can revisit this link to check the status."
      />
    );
  }

  // ── Verify phase ─────────────────────────────────────────

  if (phase === 'verify') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="w-full max-w-md"
        >
          {/* Card */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
            {/* Header */}
            <div className="mb-6 flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-tight text-foreground">Invoice Request</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">from SEEKO Studio</p>
              </div>
            </div>

            {/* Expiry badge */}
            {initialData.expiresAt && (
              <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <span>{formatExpiry(initialData.expiresAt)}</span>
              </div>
            )}

            {/* Personal note */}
            {personalNote && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="mb-6 rounded-lg bg-muted/50 px-4 py-3"
              >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Note from SEEKO</p>
                <p className="text-sm italic leading-relaxed text-foreground/70">
                  &ldquo;{personalNote}&rdquo;
                </p>
              </motion.div>
            )}

            {/* Divider */}
            <div className="mb-6 h-px bg-border" />

            {/* Verification form */}
            <VerificationForm
              token={token}
              maskedEmail={initialData.maskedEmail || '***'}
              sendCodeEndpoint="/api/invoice-request/send-code"
              verifyEndpoint="/api/invoice-request/verify"
              onVerified={(data) => {
                const d = data as { prefilledItems?: { label: string; amount: number }[]; personalNote?: string };
                if (d.prefilledItems?.length) {
                  setItems(d.prefilledItems.map((i) => ({ label: i.label, amount: String(i.amount), prefilled: true })));
                }
                if (d.personalNote) setPersonalNote(d.personalNote);
                setPhase('form');
              }}
            />
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <img src="/seeko-s.png" alt="SEEKO" className="size-4 opacity-40" />
            <span className="text-xs text-muted-foreground/50">Powered by SEEKO Studio</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Form phase ───────────────────────────────────────────

  const total = items.reduce((sum, item) => {
    const n = parseFloat(item.amount);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    if (itemsError) setItemsError('');
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addItem() {
    setItems((prev) => [...prev, { label: '', amount: '' }]);
    if (itemsError) setItemsError('');
  }

  function validatePaypalEmail(email: string): boolean {
    if (!email) {
      setPaypalError('PayPal email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setPaypalError('Enter a valid email address');
      return false;
    }
    setPaypalError('');
    return true;
  }

  async function handleSubmit() {
    // Validate
    const cleanedItems = items
      .map((item) => ({
        label: item.label.trim(),
        amount: parseFloat(item.amount),
      }))
      .filter((item) => item.label && Number.isFinite(item.amount) && item.amount > 0);

    let hasError = false;

    if (cleanedItems.length === 0) {
      setItemsError('Add at least one item with a description and amount');
      hasError = true;
    }

    if (!validatePaypalEmail(paypalEmail)) {
      hasError = true;
    }

    if (hasError) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/invoice-request/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, items: cleanedItems, paypalEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Submission failed');
      }

      setPhase('success');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="w-full max-w-lg"
      >
        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
          {/* Header */}
          <div className="mb-4 flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight text-foreground">Invoice Request</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Review and submit your invoice</p>
            </div>
          </div>

          {/* Expiry badge */}
          {initialData.expiresAt && (
            <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              <span>{formatExpiry(initialData.expiresAt)}</span>
            </div>
          )}

          {/* Personal note */}
          {personalNote && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-6 rounded-lg bg-muted/50 px-4 py-3"
            >
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Note from SEEKO</p>
              <p className="text-sm italic leading-relaxed text-foreground/70">
                &ldquo;{personalNote}&rdquo;
              </p>
            </motion.div>
          )}

          {/* Divider */}
          <div className="mb-6 h-px bg-border" />

          {/* Section: Line Items */}
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Line Items</h2>
            {prefilledCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {prefilledCount} requested
              </span>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ ...SPRING, delay: i * 0.03 }}
                  className="flex items-start gap-2"
                >
                  <div className="flex flex-1 items-center gap-2">
                    {item.prefilled && (
                      <span className="shrink-0 rounded bg-seeko-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-seeko-accent">
                        Requested
                      </span>
                    )}
                    <Input
                      placeholder="Description"
                      value={item.label}
                      onChange={(e) => updateItem(i, 'label', e.target.value)}
                      className={`flex-1 ${item.prefilled ? 'bg-muted/30' : ''}`}
                    />
                  </div>
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => updateItem(i, 'amount', e.target.value)}
                      className={`pl-7 ${item.prefilled ? 'bg-muted/30' : ''}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={items.length <= 1}
                    className="mt-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    title={items.length <= 1 ? 'At least one item required' : 'Remove item'}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Items error */}
          {itemsError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-xs text-red-400"
            >
              {itemsError}
            </motion.p>
          )}

          {/* Add item */}
          <button
            type="button"
            onClick={addItem}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="size-4" />
            Add item
          </button>

          {/* Total */}
          <div className="mt-6 rounded-lg bg-emerald-500/5 px-4 py-3 ring-1 ring-emerald-500/10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <AnimatedTotal value={total} />
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 h-px bg-border" />

          {/* Section: Payment Details */}
          <h2 className="mb-3 text-sm font-medium text-foreground">Payment Details</h2>

          {/* PayPal email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">PayPal Email</label>
            <Input
              ref={paypalRef}
              type="email"
              placeholder="your@paypal.email"
              value={paypalEmail}
              onChange={(e) => {
                setPaypalEmail(e.target.value);
                if (paypalError) validatePaypalEmail(e.target.value);
              }}
              onBlur={() => { if (paypalEmail) validatePaypalEmail(paypalEmail); }}
              className={paypalError ? 'border-red-400 focus-visible:ring-red-400/30' : ''}
            />
            {paypalError ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400"
              >
                {paypalError}
              </motion.p>
            ) : (
              <p className="text-xs text-muted-foreground/60">
                The email address linked to your PayPal account
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-6 w-full gap-2 bg-seeko-accent text-background hover:bg-seeko-accent/90"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? 'Submitting...' : 'Submit Invoice'}
          </Button>

          {/* Trust signal */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <Shield className="size-3 text-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground/40">
              Your information is only used to process this payment
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          <img src="/seeko-s.png" alt="SEEKO" className="size-4 opacity-40" />
          <span className="text-xs text-muted-foreground/50">Powered by SEEKO Studio</span>
        </div>
      </motion.div>
    </div>
  );
}

function StatusPage({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div>
          <img src="/seeko-s.png" alt="SEEKO" className="mx-auto size-10" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-muted ring-1 ring-border">
            {icon}
          </div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </motion.div>
      </div>
    </div>
  );
}
