'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus, Trash2, Send, CheckCircle2, DollarSign } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function InvoiceRequestForm({ open, onOpenChange }: InvoiceRequestFormProps) {
  const [email, setEmail] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [note, setNote] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  useEffect(() => {
    if (open) {
      setEmail('');
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

  async function handleSubmit() {
    if (!email.trim()) {
      toast.error('Recipient email is required.');
      return;
    }

    setSending(true);

    try {
      const validItems = items.filter(i => i.description.trim() && parseFloat(i.amount) > 0);
      const res = await fetch('/api/invoice-request/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_email: email.trim(),
          items: validItems.length > 0 ? validItems.map(i => ({
            description: i.description.trim(),
            amount: parseFloat(i.amount),
          })) : undefined,
          personal_note: note.trim() || undefined,
          expires_in_days: parseInt(expiry, 10),
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
      toast.success('Invoice request sent!');
    } catch {
      toast.error('Network error. Please try again.');
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-md">
      {success ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="size-7 text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">Invoice request sent!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sent to <span className="font-medium text-foreground">{sentEmail}</span>
            </p>
          </div>
          <Button onClick={() => onOpenChange(false)} className="mt-2">Done</Button>
        </div>
      ) : (
        <>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-seeko-accent/15">
                <FileText className="size-4.5 text-seeko-accent" />
              </div>
              <DialogTitle>Request Invoice</DialogTitle>
            </div>
          </DialogHeader>
          <DialogClose onClose={() => onOpenChange(false)} />

          <div className="flex flex-col space-y-5">
            {/* Recipient email */}
            <div className="space-y-2">
              <Label htmlFor="invoice-email">Recipient Email</Label>
              <Input
                id="invoice-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            {/* Pre-filled line items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Pre-filled Items</Label>
                <button
                  onClick={addItem}
                  className="flex items-center gap-1 text-xs text-seeko-accent hover:text-seeko-accent/80 transition-colors"
                >
                  <Plus className="size-3" />
                  Add item
                </button>
              </div>
              <AnimatePresence mode="popLayout">
                {items.map(item => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.description}
                        onChange={e => updateItem(item.id, 'description', e.target.value)}
                        placeholder="Item description"
                        className="flex-1"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
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
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground/50">
                  No pre-filled items. The recipient will add their own.
                </p>
              )}
            </div>

            {/* Pre-filled total */}
            {items.length > 0 && total > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-medium text-muted-foreground">Pre-filled Total</span>
                <span className="text-lg font-semibold text-seeko-accent">{fmt(total)}</span>
              </div>
            )}

            {/* Personal note */}
            <div className="space-y-2">
              <Label htmlFor="invoice-note">Personal Note (optional)</Label>
              <textarea
                id="invoice-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note for the recipient..."
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[box-shadow_var(--focus-ring-duration)_ease-out] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <Label>Link Expiry</Label>
              <Select
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </Select>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={sending || !email.trim()}
              className="gap-1.5 bg-seeko-accent text-black hover:bg-seeko-accent/90 w-full"
            >
              {sending ? (
                'Sending...'
              ) : (
                <>
                  <Send className="size-3.5" />
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
