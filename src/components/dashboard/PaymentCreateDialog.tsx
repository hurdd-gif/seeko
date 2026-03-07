'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Plus, Trash2, DollarSign, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import type { Profile } from '@/lib/types';
import { uuid } from '@/lib/utils';

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
  token: string | null;
  onCreated: () => void;
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function PaymentCreateDialog({
  open,
  onOpenChange,
  team,
  recipient: initialRecipient,
  token,
  onCreated,
}: PaymentCreateDialogProps) {
  const [recipient, setRecipient] = useState<TeamMember | null>(initialRecipient);
  const [items, setItems] = useState<LineItem[]>([{ id: uuid(), label: '', amount: '' }]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRecipient(initialRecipient);
  }, [initialRecipient]);

  useEffect(() => {
    if (open) {
      setItems([{ id: uuid(), label: '', amount: '' }]);
      setSaving(false);
      setSuccess(false);
      setCopied(false);
    }
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
    setItems([{ id: uuid(), label: '', amount: '' }]);
    setSaving(false);
    setSuccess(false);
    setCopied(false);
    onOpenChange(false);
  }

  async function handleMarkPaid() {
    if (!recipient || total <= 0 || !token) return;

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
          'x-payments-token': token,
        },
        body: JSON.stringify({
          recipient_id: recipient.id,
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

  if (!open) return null;

  const nonInvestorTeam = team.filter(m => !m.is_investor);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        {success ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-7 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Payment Recorded</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
                </span>{' '}
                paid to{' '}
                <span className="font-medium text-foreground">{recipient?.display_name}</span>.
              </p>
            </div>
            <Button onClick={() => { handleClose(); onCreated(); }} className="mt-2">Done</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">New Payment</h2>
                <p className="text-xs text-muted-foreground">Record a payment to a team member.</p>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col space-y-5">
              {/* Recipient */}
              <div className="space-y-2">
                <Label>Recipient</Label>
                {recipient ? (
                  <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                    <Avatar className="size-9">
                      <AvatarImage src={recipient.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                        {getInitials(recipient.display_name ?? '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{recipient.display_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{recipient.department ?? 'Unassigned'}</p>
                    </div>
                    <button
                      onClick={() => setRecipient(null)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <Select
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
              </div>

              {/* PayPal email */}
              {recipient?.paypal_email && (
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-3">
                  <span className="text-xs text-muted-foreground">PayPal:</span>
                  <span className="text-sm font-mono text-foreground flex-1 truncate">{recipient.paypal_email}</span>
                  <button
                    onClick={copyPaypalEmail}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? <Check className="size-4 text-seeko-accent" /> : <Copy className="size-4" />}
                  </button>
                </div>
              )}

              {/* Line Items */}
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
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      value={item.label}
                      onChange={e => updateItem(item.id, 'label', e.target.value)}
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
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span
                  className="text-lg font-semibold"
                  style={{ color: total > 0 ? 'var(--color-seeko-accent)' : undefined }}
                >
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {recipient?.paypal_email && total > 0 && (
                  <Button variant="outline" onClick={openPaypal} className="gap-1.5">
                    <ExternalLink className="size-3.5" />
                    PayPal
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={handleClose} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleMarkPaid}
                  disabled={saving || !recipient || total <= 0}
                >
                  {saving ? 'Saving...' : 'Mark as Paid'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
