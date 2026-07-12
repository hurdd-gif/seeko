'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Copy, Check, ExternalLink, Plus, Trash2, DollarSign, X, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import type { Profile } from '@/lib/types';
import { uuid } from '@/lib/utils';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { TAB_PILL_SPRING, springs } from '@/lib/motion';
import { LIGHT_INPUT, DIALOG_SAVE, DIALOG_CANCEL } from '@/components/dashboard/lightKit';

type TeamMember = Profile & { paypal_email?: string };

interface LineItem {
  id: string;
  label: string;
  amount: string;
  task_id?: string;
}

interface PaymentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamMember[];
  recipient: TeamMember | null;
  token: string | null; // deprecated — token now sent via httpOnly cookie
  onCreated: () => void;
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type PayeeMode = 'team' | 'external' | 'invoice';
const MODE_ORDER: PayeeMode[] = ['team', 'external', 'invoice'];
const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
] as const;

export function PaymentCreateDialog({
  open,
  onOpenChange,
  team,
  recipient: initialRecipient,
  token,
  onCreated,
}: PaymentCreateDialogProps) {
  const [recipient, setRecipient] = useState<TeamMember | null>(initialRecipient);
  // Who's being paid: a team profile, an external payee (vendor/subscription)
  // identified by name only, or — in invoice mode — an email that receives a
  // secure submission link. Switching modes keeps all values — forgiving, and
  // exactly one identity is sent on submit.
  const [payeeMode, setPayeeMode] = useState<PayeeMode>('team');
  // Which way mode blocks slide: +1 when moving right in MODE_ORDER, -1 left.
  const [slideDir, setSlideDir] = useState(1);
  const [payeeName, setPayeeName] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ id: uuid(), label: '', amount: '' }]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  // Invoice-request mode fields
  const [invEmail, setInvEmail] = useState('');
  const [invEmailError, setInvEmailError] = useState('');
  const [invNote, setInvNote] = useState('');
  const [invExpiry, setInvExpiry] = useState('30');
  const [invoiceSuccess, setInvoiceSuccess] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const reduce = useReducedMotion();

  function switchMode(next: PayeeMode) {
    setSlideDir(MODE_ORDER.indexOf(next) > MODE_ORDER.indexOf(payeeMode) ? 1 : -1);
    setPayeeMode(next);
  }

  // Payee-region morph: the surface animates height (measured via ResizeObserver)
  // while team/external contents cross-fade with a horizontal slide, so the form
  // below never jumps. Callback ref because the form subtree unmounts behind the
  // success view.
  const [payeeRegionEl, setPayeeRegionEl] = useState<HTMLDivElement | null>(null);
  const [payeeRegionHeight, setPayeeRegionHeight] = useState<number | 'auto'>('auto');
  useLayoutEffect(() => {
    if (!payeeRegionEl) {
      setPayeeRegionHeight('auto');
      return;
    }
    setPayeeRegionHeight(payeeRegionEl.offsetHeight);
    const ro = new ResizeObserver(() => setPayeeRegionHeight(payeeRegionEl.offsetHeight));
    ro.observe(payeeRegionEl);
    return () => ro.disconnect();
  }, [payeeRegionEl]);

  useEffect(() => {
    setRecipient(initialRecipient);
    if (initialRecipient) setPayeeMode('team');
  }, [initialRecipient]);

  useEffect(() => {
    if (open) {
      acquireScrollLock();
      setPayeeMode('team');
      setSlideDir(1);
      setPayeeName('');
      setItems([{ id: uuid(), label: '', amount: '' }]);
      setSaving(false);
      setSuccess(false);
      setCopied(false);
      setInvEmail('');
      setInvEmailError('');
      setInvNote('');
      setInvExpiry('30');
      setInvoiceSuccess(false);
      setSentEmail('');
    }
    return () => { if (open) releaseScrollLock(); };
  }, [open]);

  const total = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  function addItem() {
    setItems(prev => [...prev, { id: uuid(), label: '', amount: '' }]);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: 'label' | 'amount', value: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  async function copyPaypalEmail() {
    if (!recipient?.paypal_email) return;
    await navigator.clipboard.writeText(recipient.paypal_email);
    setCopied(true);
    toast.success('PayPal email copied');
    setTimeout(() => setCopied(false), 2000);
  }

  function openPaypal() {
    if (!recipient?.paypal_email || total <= 0) return;
    window.open(`https://paypal.me/${recipient.paypal_email}/${total.toFixed(2)}`, '_blank');
  }

  function handleClose() {
    setRecipient(initialRecipient);
    setPayeeMode('team');
    setSlideDir(1);
    setPayeeName('');
    setItems([{ id: uuid(), label: '', amount: '' }]);
    setSaving(false);
    setSuccess(false);
    setCopied(false);
    setInvEmail('');
    setInvEmailError('');
    setInvNote('');
    setInvExpiry('30');
    setInvoiceSuccess(false);
    setSentEmail('');
    onOpenChange(false);
  }

  // "Add another" — clear the transaction details and drop back to the form
  // without closing, so a run of payments doesn't mean reopening the dialog
  // each time. The payee lane (mode + selected team member) is kept so paying
  // the same person again is one tap; the amount/items always start fresh.
  // onCreated() refreshes the list behind the dialog so the recorded payment
  // shows up immediately.
  function startAnother() {
    setPayeeName('');
    setItems([{ id: uuid(), label: '', amount: '' }]);
    setSaving(false);
    setSuccess(false);
    setCopied(false);
    setInvEmail('');
    setInvEmailError('');
    setInvNote('');
    setInvExpiry('30');
    setInvoiceSuccess(false);
    setSentEmail('');
    onCreated();
  }

  const isExternal = payeeMode === 'external';
  const isInvoice = payeeMode === 'invoice';
  const externalName = payeeName.trim();
  const payeeLabel = isExternal ? externalName : recipient?.display_name;
  const hasPayee = isExternal ? externalName.length > 0 : recipient !== null;

  async function handleMarkPaid() {
    if (!hasPayee || total <= 0) return;

    const validItems = items.filter(i => i.label.trim() && parseFloat(i.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one item with a label and amount.');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(isExternal ? { payee_name: externalName } : { recipient_id: recipient!.id }),
          amount: total,
          description: validItems.map(i => i.label.trim()).join(', '),
          status: 'paid',
          items: validItems.map(i => ({
            task_id: i.task_id || undefined,
            label: i.label.trim(),
            amount: parseFloat(i.amount),
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to create payment.');
        setSaving(false);
        return;
      }

      setSuccess(true);
      toast.success('Payment recorded!');
    } catch {
      toast.error('Network error. Please try again.');
      setSaving(false);
    }
  }

  function validateInvoiceEmail(): boolean {
    const email = invEmail.trim();
    if (!email) {
      setInvEmailError('Enter the recipient’s email address.');
      return false;
    }
    if (!EMAIL_RE.test(email)) {
      setInvEmailError('That doesn’t look like a valid email address.');
      return false;
    }
    setInvEmailError('');
    return true;
  }

  async function handleSendInvoice() {
    if (!validateInvoiceEmail()) return;

    setSaving(true);

    try {
      // Line items are optional here — the recipient can add or edit their own.
      const validItems = items.filter(i => i.label.trim() && parseFloat(i.amount) > 0);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(invExpiry, 10));

      const res = await fetch('/api/invoice-request/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: invEmail.trim(),
          items: validItems.length > 0
            ? validItems.map(i => ({ label: i.label.trim(), amount: parseFloat(i.amount) }))
            : undefined,
          personalNote: invNote.trim() || undefined,
          expiresAt: expiresAt.toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to send invoice request.');
        setSaving(false);
        return;
      }

      setSentEmail(invEmail.trim());
      setInvoiceSuccess(true);
      toast.success('Invoice request sent!');
    } catch {
      toast.error('Network error. Please try again.');
      setSaving(false);
    }
  }

  const nonInvestorTeam = team.filter(m => !m.is_investor);

  if (typeof document === 'undefined') return null;

  const overlayTransition = reduce
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
  const panelTransition = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 340, damping: 32, mass: 0.9 };
  const contentTransition = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.75 };
  // Copy→Check swap: crossfade through blur instead of a hard cut.
  const iconSwap = {
    initial: reduce ? { opacity: 1 } : { opacity: 0, scale: 0.7, filter: 'blur(2px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, filter: 'blur(2px)' },
    transition: reduce
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 500, damping: 30 },
  };
  const labelSwap = {
    initial: reduce ? { opacity: 1 } : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, y: -4 },
    transition: reduce ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' as const },
  };
  // Mode swap: contents slide horizontally (matching the toggle's left/right
  // order in MODE_ORDER) through scale + blur while the region morphs height —
  // never a vertical jump. `custom` is the slide direction (+1 moving right,
  // -1 moving left), so the exiting block slides away from the incoming one.
  const payeeSwap = {
    enter: (dir: number) =>
      reduce
        ? { opacity: 1 }
        : { opacity: 0, x: 24 * dir, scale: 0.97, filter: 'blur(2px)' },
    center: reduce
      ? { opacity: 1 }
      : { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
    exit: (dir: number) =>
      reduce
        ? { opacity: 0 }
        : { opacity: 0, x: -24 * dir, scale: 0.97, filter: 'blur(2px)' },
  };
  // Grow-in for the invoice-only note/expiry section — the top padding lives
  // inside the clipped wrapper so the section's gap collapses with it.
  const sectionGrow = {
    initial: reduce ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: reduce ? { opacity: 0, height: 'auto' } : { opacity: 0, height: 0 },
    transition: reduce ? { duration: 0 } : springs.firm,
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="new-payment-overlay"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:px-4 touch-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlayTransition}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-payment-title"
            className="w-full max-w-md origin-bottom rounded-t-2xl border-0 bg-surface-1 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-seeko max-h-[90dvh] overflow-y-auto touch-auto sm:origin-center sm:rounded-2xl sm:pb-6"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 28, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
            transition={panelTransition}
          >
            <AnimatePresence mode="wait" initial={false}>
              {success ? (
                <motion.div
                  key="payment-success"
                  className="flex flex-col items-center gap-4 py-8"
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.98 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                  transition={contentTransition}
                >
                  <motion.div
                    className="flex size-14 items-center justify-center rounded-full bg-seeko-accent-ink/10"
                    initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.82 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                    transition={reduce ? { duration: 0 } : { ...contentTransition, delay: 0.08 }}
                  >
                    <CheckCircle2 className="size-7 text-seeko-accent-ink" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-ink-title">Payment Recorded</p>
                    <p className="text-sm text-ink-muted mt-1">
                      <span className="font-medium text-ink-title tabular-nums">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
                      </span>{' '}
                      paid to{' '}
                      <span className="font-medium text-ink-title">{payeeLabel}</span>.
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={startAnother}
                      className={`border-wash-8 bg-transparent transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ${DIALOG_CANCEL}`}
                    >
                      Add another
                    </Button>
                    <Button
                      onClick={() => { handleClose(); onCreated(); }}
                      className={`transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] ${DIALOG_SAVE}`}
                    >
                      Done
                    </Button>
                  </div>
                </motion.div>
              ) : invoiceSuccess ? (
                <motion.div
                  key="invoice-success"
                  className="flex flex-col items-center gap-4 py-8"
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.98 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                  transition={contentTransition}
                >
                  <motion.div
                    className="flex size-14 items-center justify-center rounded-full bg-seeko-accent-ink/10"
                    initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.82 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                    transition={reduce ? { duration: 0 } : { ...contentTransition, delay: 0.08 }}
                  >
                    <CheckCircle2 className="size-7 text-seeko-accent-ink" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-ink-title">Invoice Request Sent</p>
                    <p className="text-sm text-ink-muted mt-1">
                      <span className="font-medium text-ink-title">{sentEmail}</span>{' '}
                      will receive an email with a secure link to submit their invoice.
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={startAnother}
                      className={`border-wash-8 bg-transparent transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ${DIALOG_CANCEL}`}
                    >
                      Add another
                    </Button>
                    <Button
                      onClick={() => { handleClose(); onCreated(); }}
                      className={`transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] ${DIALOG_SAVE}`}
                    >
                      Done
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="payment-form"
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={contentTransition}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      {/* Title tracks intent (Mercury/Wise retitle request surfaces);
                          the h2 + id stay static so aria-labelledby never breaks. */}
                      <h2 id="new-payment-title" className="text-lg font-semibold text-ink-title">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={isInvoice ? 'title-invoice' : 'title-payment'}
                            className="inline-block"
                            {...labelSwap}
                          >
                            {isInvoice ? 'Request Invoice' : 'New Payment'}
                          </motion.span>
                        </AnimatePresence>
                      </h2>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={isInvoice ? 'desc-invoice' : 'desc-record'}
                          className="text-xs text-ink-muted"
                          {...labelSwap}
                        >
                          {isInvoice
                            ? 'They’ll receive a secure link to submit their invoice.'
                            : 'Record a payment to a team member or external payee.'}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <button
                      onClick={handleClose}
                      aria-label="Close"
                      className="-m-1.5 flex size-8 items-center justify-center rounded-lg text-ink-faint transition-[background-color,color,transform] duration-150 ease-out hover:bg-wash-4 hover:text-ink active:scale-[0.94]"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <motion.div
                    className="flex flex-col space-y-5"
                    initial={reduce ? false : 'hidden'}
                    animate={reduce ? undefined : 'visible'}
                    variants={{
                      hidden: {},
                      visible: {
                        transition: {
                          delayChildren: 0.04,
                          staggerChildren: 0.035,
                        },
                      },
                    }}
                  >
              {/* Recipient */}
              <motion.div
                className="space-y-2"
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: contentTransition },
                }}
              >
                <div className="flex items-center justify-between">
                  <Label className="text-ink-muted">Recipient</Label>
                  {/* Mode toggle — sliding pill (shared TAB_PILL_SPRING pattern) */}
                  <div className="flex rounded-full bg-wash-4 p-0.5">
                    {([['team', 'Team member'], ['external', 'External'], ['invoice', 'Invoice']] as const).map(([value, label]) => {
                      const active = payeeMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => switchMode(value)}
                          className={`relative rounded-full px-2.5 py-1 text-[11px] font-medium transition-[color,transform] duration-150 ease-out active:scale-[0.97] ${
                            active ? 'text-ink-title' : 'text-ink-muted hover:text-ink-title'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="paymentPayeeModePill"
                              initial={false}
                              transition={reduce ? { duration: 0 } : TAB_PILL_SPRING}
                              className="absolute inset-0 rounded-full bg-surface-1 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)]"
                            />
                          )}
                          <span className="relative z-10">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Morph surface: height follows the measured contents (transitions.dev
                    plus→menu pattern) while the mode blocks slide past each other. */}
                <motion.div
                  className="overflow-hidden"
                  animate={{ height: payeeRegionHeight }}
                  transition={reduce ? { duration: 0 } : springs.firm}
                >
                <div ref={setPayeeRegionEl}>
                <AnimatePresence mode="popLayout" initial={false} custom={slideDir}>
                  {isExternal ? (
                    <motion.div
                      key="payee-external"
                      className="space-y-1.5"
                      custom={slideDir}
                      variants={payeeSwap}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={contentTransition}
                    >
                      <Input
                        value={payeeName}
                        onChange={e => setPayeeName(e.target.value)}
                        placeholder="Payee — e.g. Anthropic"
                        className={LIGHT_INPUT}
                      />
                      <p className="text-[11px] text-ink-faint">
                        For subscriptions and vendors without a team profile.
                      </p>
                    </motion.div>
                  ) : isInvoice ? (
                    <motion.div
                      key="payee-invoice"
                      className="space-y-1.5"
                      custom={slideDir}
                      variants={payeeSwap}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={contentTransition}
                    >
                      <Input
                        type="email"
                        value={invEmail}
                        onChange={e => {
                          setInvEmail(e.target.value);
                          if (invEmailError) setInvEmailError('');
                        }}
                        onBlur={() => { if (invEmail.trim()) validateInvoiceEmail(); }}
                        placeholder="name@example.com"
                        className={`${LIGHT_INPUT} ${invEmailError ? 'border-danger focus-visible:border-danger' : ''}`}
                      />
                      <AnimatePresence initial={false}>
                        {invEmailError ? (
                          <motion.p
                            key="inv-email-error"
                            className="overflow-hidden text-[11px] text-danger"
                            initial={reduce ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                            transition={reduce ? { duration: 0 } : springs.firm}
                          >
                            {invEmailError}
                          </motion.p>
                        ) : (
                          <motion.p key="inv-email-hint" className="text-[11px] text-ink-faint" {...labelSwap}>
                            For contractors and vendors who invoice you directly.
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="payee-team"
                      custom={slideDir}
                      variants={payeeSwap}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={contentTransition}
                    >
                      {recipient ? (
                        <div className="flex items-center gap-3 rounded-lg bg-surface-3 p-3">
                          <Avatar className="size-9 outline outline-1 -outline-offset-1 outline-wash-6">
                            <AvatarImage src={recipient.avatar_url ?? undefined} />
                            <AvatarFallback className="bg-surface-4 text-ink-body text-[10px]">
                              {getInitials(recipient.display_name ?? '?')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink-title">{recipient.display_name}</p>
                            <p className="text-xs text-ink-faint font-mono">{recipient.department ?? 'Unassigned'}</p>
                          </div>
                          <button
                            onClick={() => setRecipient(null)}
                            className="text-xs text-ink-faint transition-[color,transform] duration-150 ease-out hover:text-ink active:scale-[0.96]"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <Select
                          light
                          value=""
                          onChange={e => {
                            const member = nonInvestorTeam.find(m => m.id === e.target.value);
                            if (member) setRecipient(member);
                          }}
                        >
                          <option value="">Select team member...</option>
                          {nonInvestorTeam.map(m => (
                            <option key={m.id} value={m.id}>{m.display_name}</option>
                          ))}
                        </Select>
                      )}
                      {/* PayPal email — inside the morph region so its appearance
                          grows the surface instead of shoving the form down. */}
                      {recipient?.paypal_email && (
                        <div className="mt-5 flex items-center gap-2 rounded-lg bg-surface-3 p-3">
                          <span className="text-xs text-ink-muted">PayPal:</span>
                          <span className="text-sm font-mono text-ink-title flex-1 truncate">{recipient.paypal_email}</span>
                          <button
                            onClick={copyPaypalEmail}
                            aria-label="Copy PayPal email"
                            className="-m-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-[background-color,color,transform] duration-150 ease-out hover:bg-wash-5 hover:text-ink active:scale-[0.92]"
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              {copied ? (
                                <motion.span key="check" className="flex" {...iconSwap}>
                                  <Check className="size-4 text-seeko-accent-ink" />
                                </motion.span>
                              ) : (
                                <motion.span key="copy" className="flex" {...iconSwap}>
                                  <Copy className="size-4" />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
                </motion.div>
              </motion.div>

              {/* Line Items */}
              <motion.div
                className="space-y-3"
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: contentTransition },
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <Label className="text-ink-muted">Line Items</Label>
                    <AnimatePresence initial={false}>
                      {isInvoice && (
                        <motion.p
                          key="items-optional-hint"
                          className="overflow-hidden text-[11px] text-ink-faint"
                          initial={reduce ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                          transition={reduce ? { duration: 0 } : springs.firm}
                        >
                          Optional — the recipient can add or edit items.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs text-seeko-accent-ink transition-[color,transform] duration-150 ease-out hover:text-seeko-accent-ink/80 active:scale-[0.96]"
                  >
                    <Plus className="size-3" />
                    Add item
                  </button>
                </div>
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      value={item.label}
                      onChange={e => updateItem(item.id, 'label', e.target.value)}
                      placeholder="Item description"
                      className={`flex-1 ${LIGHT_INPUT}`}
                    />
                    <div className="relative w-28">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint pointer-events-none">
                        <DollarSign className="size-3.5" />
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.amount}
                        onChange={e => updateItem(item.id, 'amount', e.target.value)}
                        placeholder="0.00"
                        className={`pl-7 tabular-nums ${LIGHT_INPUT}`}
                      />
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(item.id)}
                        aria-label="Remove item"
                        className="-m-2 flex size-8 shrink-0 items-center justify-center rounded-md text-ink-faint transition-[background-color,color,transform] duration-150 ease-out hover:bg-danger/10 hover:text-danger active:scale-[0.92]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </motion.div>

              {/* Total (+ invoice-only note & expiry, growing out of the same section) */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: contentTransition },
                }}
              >
                <div className="flex items-center justify-between pt-2 border-t border-wash-6">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={isInvoice ? 'total-prefilled' : 'total'}
                      className="text-sm font-medium text-ink-muted"
                      {...labelSwap}
                    >
                      {isInvoice ? 'Pre-filled total' : 'Total'}
                    </motion.span>
                  </AnimatePresence>
                  {/* An empty $0.00 shouldn't carry the row's maximum weight — mute it
                      until a real amount exists (Wise greys its zero amount the same way). */}
                  <span
                    className={`text-lg font-semibold tabular-nums transition-[color] duration-150 ease-out ${total > 0 ? 'text-seeko-accent-ink' : 'text-ink-faintest'}`}
                  >
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
                  </span>
                </div>
                <AnimatePresence initial={false}>
                  {isInvoice && (
                    <motion.div key="invoice-extras" className="overflow-hidden" {...sectionGrow}>
                      <div className="space-y-5 pt-5">
                        <div className="space-y-2">
                          <Label className="text-ink-muted" htmlFor="invoice-note">Personal Note</Label>
                          <textarea
                            id="invoice-note"
                            rows={2}
                            value={invNote}
                            onChange={e => setInvNote(e.target.value)}
                            placeholder="Optional message included in the email"
                            className={`w-full resize-none px-3 py-2 text-sm outline-none ${LIGHT_INPUT}`}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-ink-muted">Link Expiry</Label>
                          <div className="flex rounded-full bg-wash-4 p-0.5">
                            {EXPIRY_OPTIONS.map(opt => {
                              const active = invExpiry === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setInvExpiry(opt.value)}
                                  className={`relative rounded-full px-2.5 py-1 text-[11px] font-medium transition-[color,transform] duration-150 ease-out active:scale-[0.97] ${
                                    active ? 'text-ink-title' : 'text-ink-muted hover:text-ink-title'
                                  }`}
                                >
                                  {active && (
                                    <motion.span
                                      layoutId="invoiceExpiryPill"
                                      initial={false}
                                      transition={reduce ? { duration: 0 } : TAB_PILL_SPRING}
                                      className="absolute inset-0 rounded-full bg-surface-1 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)]"
                                    />
                                  )}
                                  <span className="relative z-10 tabular-nums">{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Actions */}
              <motion.div
                className="flex gap-2"
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: contentTransition },
                }}
              >
                {payeeMode === 'team' && recipient?.paypal_email && total > 0 && (
                  <Button variant="outline" onClick={openPaypal} className="gap-1.5 pl-3 border-wash-8 bg-transparent text-ink-strong transition-[background-color,transform] duration-150 ease-out hover:bg-wash-4 active:scale-[0.98]">
                    <ExternalLink className="size-3.5" />
                    PayPal
                  </Button>
                )}
                <Button variant="outline" className={`flex-1 border-wash-8 bg-transparent transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ${DIALOG_CANCEL}`} onClick={handleClose} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  className={`flex-1 transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] ${DIALOG_SAVE}`}
                  onClick={isInvoice ? handleSendInvoice : handleMarkPaid}
                  disabled={saving || (isInvoice ? invEmail.trim().length === 0 : !hasPayee || total <= 0)}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {saving ? (
                      <motion.span key="busy" className="inline-flex items-center gap-2" {...labelSwap}>
                        <Loader2 className="size-4 animate-spin" />
                        {isInvoice ? 'Sending…' : 'Saving…'}
                      </motion.span>
                    ) : (
                      <motion.span key={isInvoice ? 'idle-send' : 'idle-pay'} {...labelSwap}>
                        {isInvoice ? 'Send Request' : 'Mark as Paid'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </motion.div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
