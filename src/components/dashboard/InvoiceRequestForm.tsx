'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus, Trash2, Send, CheckCircle2, DollarSign, Loader2 } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { uuid } from '@/lib/utils';

interface LineItem {
  id: string;
  description: string;
  amount: string;
}

interface InvoiceRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
] as const;

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function InvoiceRequestForm({ open, onOpenChange }: InvoiceRequestFormProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [note, setNote] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  useEffect(() => {
    if (open) {
      setEmail('');
      setEmailError('');
      setItems([]);
      setNote('');
      setExpiry('30');
      setSending(false);
      setSuccess(false);
      setSentEmail('');
    }
  }, [open]);

  const total = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  function addItem() {
    setItems(prev => [...prev, { id: uuid(), description: '', amount: '' }]);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: 'description' | 'amount', value: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function validateEmail(): boolean {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Email is required');
      return false;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError('Enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  }

  async function handleSubmit() {
    if (!validateEmail()) return;

    setSending(true);

    try {
      const validItems = items.filter(i => i.description.trim() && parseFloat(i.amount) > 0);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiry, 10));
      const res = await fetch('/api/invoice-request/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email.trim(),
          items: validItems.length > 0 ? validItems.map(i => ({
            label: i.description.trim(),
            amount: parseFloat(i.amount),
          })) : undefined,
          personalNote: note.trim() || undefined,
          expiresAt: expiresAt.toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to send invoice request.');
        setSending(false);
        return;
      }

      setSentEmail(email.trim());
      setSuccess(true);
    } catch {
      toast.error('Network error. Please try again.');
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-md">
      {success ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', visualDuration: 0.4, bounce: 0.15 }}
          className="flex flex-col items-center gap-4 py-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.3, delay: 0.1 }}
            className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10"
          >
            <CheckCircle2 className="size-7 text-emerald-400" />
          </motion.div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">Invoice request sent!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sent to <span className="font-medium text-foreground">{sentEmail}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              They&apos;ll receive an email with a secure link to submit their invoice.
            </p>
          </div>
          <Button onClick={() => onOpenChange(false)} className="mt-2">Done</Button>
        </motion.div>
      ) : (
        <>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-seeko-accent/15">
                <FileText className="size-4.5 text-seeko-accent" />
              </div>
              <div>
                <DialogTitle>Request Invoice</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  They&apos;ll receive a secure link to submit their invoice
                </p>
              </div>
            </div>
          </DialogHeader>
          <DialogClose onClose={() => onOpenChange(false)} />

          <div className="flex flex-col gap-6">
            {/* ── Section 1: Who + What ────────────────── */}
            <div className="flex flex-col gap-4">
              {/* Recipient email */}
              <div className="space-y-1.5">
                <Label htmlFor="invoice-email">Recipient Email</Label>
                <Input
                  id="invoice-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  onBlur={() => { if (email.trim()) validateEmail(); }}
                  className={emailError ? 'border-destructive focus-visible:ring-destructive/30' : ''}
                />
                <AnimatePresence>
                  {emailError && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs text-destructive"
                    >
                      {emailError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Pre-filled line items */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Pre-filled Items</Label>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">Optional — the recipient can add or edit items</p>
                  </div>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs text-seeko-accent hover:text-seeko-accent/80 transition-colors"
                  >
                    <Plus className="size-3" />
                    Add item
                  </button>
                </div>
                <AnimatePresence mode="popLayout">
                  {items.map((item, i) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ type: 'spring', visualDuration: 0.25, bounce: 0.1, delay: i === items.length - 1 ? 0 : 0 }}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          value={item.description}
                          onChange={e => updateItem(item.id, 'description', e.target.value)}
                          placeholder="Item description"
                          className="flex-1"
                        />
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                            <DollarSign className="size-3.5" />
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.amount}
                            onChange={e => updateItem(item.id, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="pl-7"
                          />
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {items.length === 0 && (
                  <button
                    onClick={addItem}
                    className="w-full py-3 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground/50 hover:border-border hover:text-muted-foreground transition-colors"
                  >
                    + Add a pre-filled item
                  </button>
                )}
              </div>

              {/* Pre-filled total */}
              <AnimatePresence>
                {items.length > 0 && total > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-seeko-accent/[0.06]">
                      <span className="text-sm font-medium text-muted-foreground">Pre-filled Total</span>
                      <span className="text-xl font-semibold text-seeko-accent tabular-nums">{fmt(total)}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Divider ─────────────────────────────── */}
            <div className="border-t border-border/50" />

            {/* ── Section 2: How ───────────────────────── */}
            <div className="flex flex-col gap-4">
              {/* Personal note */}
              <div className="space-y-1.5">
                <Label htmlFor="invoice-note">Personal Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <textarea
                  id="invoice-note"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note for the recipient..."
                  rows={2}
                  className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[box-shadow_var(--focus-ring-duration)_ease-out] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              {/* Expiry — segmented control */}
              <div className="space-y-1.5">
                <Label>Link Expiry</Label>
                <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border/50">
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setExpiry(opt.value)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                        expiry === opt.value
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={sending || !email.trim()}
              className="gap-2 bg-seeko-accent text-black hover:bg-seeko-accent/90 w-full h-10"
            >
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Send Invoice Request
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
