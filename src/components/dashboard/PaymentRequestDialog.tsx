'use client';

import { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, DollarSign, CheckCircle2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { PaymentConfetti } from '@/components/dashboard/PaymentConfetti';
import type { Task } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  const [items, setItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const total = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  // Tasks already added as line items
  const addedTaskIds = new Set(items.filter(i => i.task_id).map(i => i.task_id));

  // Tasks with bounties that haven't been added yet
  const availableTasks = (completedTasks ?? []).filter(t => t.bounty && t.bounty > 0 && !addedTaskIds.has(t.id));

  function addTaskItem(task: Pick<Task, 'id' | 'name' | 'bounty'>) {
    setItems(prev => [...prev, { label: task.name, amount: String(task.bounty ?? 0), task_id: task.id }]);
  }

  function addManualItem() {
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
    setItems([]);
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
            task_id: item.task_id || undefined,
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

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); else onOpenChange(v); }} contentClassName="max-w-md">
      <DialogClose onClose={handleClose} />
      <PaymentConfetti active={success} />
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
          <DialogHeader>
            <DialogTitle>Request Payment</DialogTitle>
            <p className="text-xs text-muted-foreground">Submit a payment request for admin approval.</p>
          </DialogHeader>

          <div className="flex flex-col space-y-5">
            <div className="space-y-2">
              <Label htmlFor="req-description">Description (optional)</Label>
              <Input
                id="req-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this payment for?"
              />
            </div>

            {/* Completed tasks with bounties */}
            {availableTasks.length > 0 && (
              <div className="space-y-2">
                <Label>Completed Tasks</Label>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                  {availableTasks.map(task => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => addTaskItem(task)}
                      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/[0.06] active:bg-white/[0.08]"
                    >
                      <Plus className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-foreground">{task.name}</span>
                      <span className="shrink-0 text-xs font-mono text-muted-foreground">
                        ${task.bounty}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Line items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <button
                  onClick={addManualItem}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="size-3" />
                  Add custom item
                </button>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Select tasks above or add custom items.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {item.task_id && (
                        <Check className="size-3.5 text-emerald-400 shrink-0" />
                      )}
                      <Input
                        value={item.label}
                        onChange={e => updateItem(i, 'label', e.target.value)}
                        placeholder="Item description"
                        className="flex-1"
                        readOnly={!!item.task_id}
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
                          onChange={e => updateItem(i, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="pl-7"
                        />
                      </div>
                      <button
                        onClick={() => removeItem(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span
                className={cn("text-lg font-semibold", total > 0 ? "text-foreground" : "text-muted-foreground")}
              >
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
              </span>
            </div>

            {/* Actions */}
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
    </Dialog>
  );
}
