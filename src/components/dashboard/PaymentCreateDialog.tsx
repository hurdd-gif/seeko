'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  useDialogFooter,
} from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import type { Profile } from '@/lib/types';

type TeamMember = Profile & { paypal_email?: string };

interface LineItem {
  id: string;
  label: string;
  amount: number;
  task_id?: string;
  included: boolean;
}

interface PaymentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamMember[];
  recipient: TeamMember | null;
  token: string;
  onCreated: () => void;
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function DialogContent({
  team,
  initialRecipient,
  token,
  onCreated,
  onOpenChange,
}: {
  team: TeamMember[];
  initialRecipient: TeamMember | null;
  token: string;
  onCreated: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [recipient, setRecipient] = useState<TeamMember | null>(initialRecipient);
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const setDialogFooter = useDialogFooter();

  useEffect(() => {
    setRecipient(initialRecipient);
  }, [initialRecipient]);

  useEffect(() => {
    setItems([{
      id: crypto.randomUUID(),
      label: '',
      amount: 0,
      included: true,
    }]);
    setError('');
    setCopied(false);
  }, []);

  const total = items
    .filter(i => i.included)
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const addItem = () => {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      label: '',
      amount: 0,
      included: true,
    }]);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: 'label' | 'amount' | 'included', value: string | number | boolean) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const copyPaypalEmail = async () => {
    if (!recipient?.paypal_email) return;
    await navigator.clipboard.writeText(recipient.paypal_email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openPaypal = () => {
    if (!recipient?.paypal_email || total <= 0) return;
    const paypalUrl = `https://paypal.me/${recipient.paypal_email}/${total.toFixed(2)}`;
    window.open(paypalUrl, '_blank');
  };

  const handleMarkPaid = async () => {
    if (!recipient || total <= 0) return;

    setSaving(true);
    setError('');

    const includedItems = items.filter(i => i.included && i.label && i.amount > 0);
    if (includedItems.length === 0) {
      setError('At least one item with a label and amount is required');
      setSaving(false);
      return;
    }

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
          description: includedItems.map(i => i.label).join(', '),
          status: 'paid',
          items: includedItems.map(i => ({
            task_id: i.task_id || undefined,
            label: i.label,
            amount: i.amount,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create payment');
        return;
      }

      onCreated();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const nonInvestorTeam = team.filter(m => !m.is_investor);

  // Sync footer into Dialog via context
  useEffect(() => {
    if (setDialogFooter) {
      setDialogFooter(
        <>
          {recipient?.paypal_email && total > 0 && (
            <Button variant="outline" onClick={openPaypal} className="gap-1.5">
              <ExternalLink className="size-4" />
              Open PayPal
            </Button>
          )}
          <Button
            onClick={handleMarkPaid}
            disabled={saving || !recipient || total <= 0}
          >
            {saving ? 'Saving...' : 'Mark as Paid'}
          </Button>
        </>
      );
      return () => { setDialogFooter(null); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDialogFooter, saving, recipient, total]);

  return (
    <>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>New Payment</DialogTitle>
      </DialogHeader>

      <div className="space-y-5">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRecipient(null)}
                className="text-xs text-muted-foreground"
              >
                Change
              </Button>
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

        <div className="space-y-2">
          <Label>Line Items</Label>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.included}
                  onChange={e => updateItem(item.id, 'included', e.target.checked)}
                  className="shrink-0 accent-[var(--color-seeko-accent)]"
                />
                <Input
                  value={item.label}
                  onChange={e => updateItem(item.id, 'label', e.target.value)}
                  placeholder="Description"
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={item.amount || ''}
                  onChange={e => updateItem(item.id, 'amount', Number(e.target.value) || 0)}
                  placeholder="$0.00"
                  className="w-24"
                  min={0}
                  step={0.01}
                />
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
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="size-3" />
            Add item
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-lg font-semibold" style={{ color: total > 0 ? 'var(--color-seeko-accent)' : undefined }}>
            ${total.toFixed(2)}
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </>
  );
}

export function PaymentCreateDialog({
  open,
  onOpenChange,
  team,
  recipient,
  token,
  onCreated,
}: PaymentCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        team={team}
        initialRecipient={recipient}
        token={token}
        onCreated={onCreated}
        onOpenChange={onOpenChange}
      />
    </Dialog>
  );
}
