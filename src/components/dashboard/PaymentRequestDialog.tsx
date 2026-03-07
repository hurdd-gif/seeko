'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Plus, Trash2, DollarSign, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PaymentConfetti } from '@/components/dashboard/PaymentConfetti';
import type { Task } from '@/lib/types';

interface PaymentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  onSubmitted?: () => void;
  paypalEmail?: string;
  completedTasks?: Pick<Task, 'id' | 'name' | 'bounty'>[];
}

type LineItem = { label: string; amount: string; task_id?: string };

export function PaymentRequestDialog({ open, onOpenChange, onCreated, onSubmitted, paypalEmail, completedTasks }: PaymentRequestDialogProps) {
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ label: '', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const total = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  function addItem() {
    setItems(prev => [...prev, { label: '', amount: '' }]);
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function reset() {
    setDescription('');
    setItems([{ label: '', amount: '' }]);
    setSubmitting(false);
    setSuccess(false);
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmit() {
    const validItems = items.filter(item => item.label.trim() && parseFloat(item.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one item with a label and amount.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/payments/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          description: description.trim() || undefined,
          items: validItems.map(item => ({
            label: item.label.trim(),
            amount: parseFloat(item.amount),
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to submit request.');
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      toast.success('Payment request submitted!');
      onCreated?.();
      onSubmitted?.();
    } catch {
      toast.error('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <PaymentConfetti active={success} />
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        {success ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-7 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Request Submitted</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your payment request for{' '}
                <span className="font-medium text-foreground">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
                </span>{' '}
                has been sent for approval.
              </p>
            </div>
            <Button onClick={handleClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Request Payment</h2>
                <p className="text-xs text-muted-foreground">Submit a payment request for admin approval.</p>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col space-y-6">
              <div className="space-y-2">
                <Label htmlFor="req-description">Description (optional)</Label>
                <Input
                  id="req-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What is this payment for?"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Line Items</Label>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs text-seeko-accent hover:text-seeko-accent/80 transition-colors"
                  >
                    <Plus className="size-3" />
                    Add item
                  </button>
                </div>
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.label}
                      onChange={e => updateItem(i, 'label', e.target.value)}
                      placeholder="Item description"
                      className="flex-1"
                    />
                    <div className="relative w-32">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                        <DollarSign className="size-3.5" />
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.amount}
                        onChange={e => updateItem(i, 'amount', e.target.value)}
                        placeholder="0.00"
                        className="pl-7 pr-6"
                      />
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span
                  className="text-lg font-semibold"
                  style={{ color: total > 0 ? 'var(--color-seeko-accent)' : undefined }}
                >
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
                </span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleSubmit} disabled={submitting || total <= 0}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
