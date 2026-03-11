'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { FileText, CheckCircle2, Clock, XCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { toast } from 'sonner';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

interface LineItem {
  label: string;
  amount: string;
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
  };
}

type Phase = 'verify' | 'form' | 'success';

export function InvoicePageClient({ token, initialData }: InvoicePageClientProps) {
  const alreadyVerified = initialData.status === 'verified' && !!initialData.prefilledItems;

  const [phase, setPhase] = useState<Phase>(alreadyVerified ? 'form' : 'verify');
  const [items, setItems] = useState<LineItem[]>(
    initialData.prefilledItems?.map((i) => ({ label: i.label, amount: String(i.amount) })) || [{ label: '', amount: '' }],
  );
  const [paypalEmail, setPaypalEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [personalNote, setPersonalNote] = useState(initialData.personalNote);

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
                <p className="mt-0.5 text-sm text-muted-foreground">Submit your invoice</p>
              </div>
            </div>

            {/* Personal note */}
            {personalNote && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="mb-6 rounded-lg bg-muted/50 px-4 py-3"
              >
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
                  setItems(d.prefilledItems.map((i) => ({ label: i.label, amount: String(i.amount) })));
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
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addItem() {
    setItems((prev) => [...prev, { label: '', amount: '' }]);
  }

  async function handleSubmit() {
    // Validate
    const cleanedItems = items
      .map((item) => ({
        label: item.label.trim(),
        amount: parseFloat(item.amount),
      }))
      .filter((item) => item.label && Number.isFinite(item.amount) && item.amount > 0);

    if (cleanedItems.length === 0) {
      toast.error('Add at least one item with a description and amount.');
      return;
    }

    if (!paypalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
      toast.error('Enter a valid PayPal email address.');
      return;
    }

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
          <div className="mb-6 flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight text-foreground">Invoice</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Add your line items below</p>
            </div>
          </div>

          {/* Personal note */}
          {personalNote && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-6 rounded-lg bg-muted/50 px-4 py-3"
            >
              <p className="text-sm italic leading-relaxed text-foreground/70">
                &ldquo;{personalNote}&rdquo;
              </p>
            </motion.div>
          )}

          {/* Divider */}
          <div className="mb-6 h-px bg-border" />

          {/* Line items */}
          <div className="space-y-3">
            {items.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: i * 0.03 }}
                className="flex items-center gap-2"
              >
                <Input
                  placeholder="Description"
                  value={item.label}
                  onChange={(e) => updateItem(i, 'label', e.target.value)}
                  className="flex-1"
                />
                <div className="relative w-28 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => updateItem(i, 'amount', e.target.value)}
                    className="pl-7"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={items.length <= 1}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </motion.div>
            ))}
          </div>

          {/* Add item */}
          <button
            type="button"
            onClick={addItem}
            className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-4" />
            Add item
          </button>

          {/* Total */}
          <div className="mt-6 rounded-lg bg-muted/50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className="text-lg font-semibold text-seeko-accent">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 h-px bg-border" />

          {/* PayPal email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">PayPal Email</label>
            <Input
              type="email"
              placeholder="your@paypal.email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
            />
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
