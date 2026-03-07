# Payment Requests from Settings — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let team members and contractors request payment from their settings page, creating pending payments for admin approval/denial.

**Architecture:** Reuses `payments` + `payment_items` tables. New RLS policies let team members insert their own pending payments and read their own payment history. New `requested_at` column distinguishes team requests from admin-created payments. Settings page gets a "Payments" section with request dialog + history. Admin payments page gets a "Pending Requests" section with approve/deny.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, shadcn/ui, motion/react, Tailwind v4

---

### Task 1: Migration — `requested_at` column + RLS policies

**Files:**
- Create: `supabase/migrations/20260307000002_payment_requests.sql`

**Step 1: Write the migration**

```sql
-- Add requested_at to distinguish team-initiated requests from admin-created payments
alter table public.payments add column if not exists requested_at timestamptz;

-- Team members can INSERT their own payment requests (pending only, recipient = self)
create policy "Members can insert own payment requests"
  on public.payments for insert
  to authenticated
  with check (
    recipient_id = auth.uid()
    and created_by = auth.uid()
    and status = 'pending'
  );

-- Team members can read their own payments (any status)
create policy "Members can read own payments"
  on public.payments for select
  to authenticated
  using (recipient_id = auth.uid());

-- Team members can insert payment items for their own payments
create policy "Members can insert own payment items"
  on public.payment_items for insert
  to authenticated
  with check (
    (select recipient_id from public.payments where id = payment_id) = auth.uid()
    and (select status from public.payments where id = payment_id) = 'pending'
  );

-- Team members can read payment items for their own payments
create policy "Members can read own payment items"
  on public.payment_items for select
  to authenticated
  using (
    (select recipient_id from public.payments where id = payment_id) = auth.uid()
  );
```

**Step 2: Run migration against Supabase**

Run in Supabase SQL Editor or via CLI:
```bash
supabase db push
```

**Step 3: Update types**

Modify: `src/lib/types.ts`

Add `requested_at` to the `Payment` type:

```ts
export type Payment = {
  id: string;
  recipient_id: string;
  amount: number;
  currency: string;
  description?: string;
  status: PaymentStatus;
  paid_at?: string;
  requested_at?: string;   // ← add this line
  created_by: string;
  created_at: string;
  recipient?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'department'>;
  items?: PaymentItem[];
};
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260307000002_payment_requests.sql src/lib/types.ts
git commit -m "feat: add payment request migration + RLS policies"
```

---

### Task 2: API — POST `/api/payments/request`

**Files:**
- Create: `src/app/api/payments/request/route.ts`

**Step 1: Create the endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Block investors from requesting payments
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_investor')
    .eq('id', user.id)
    .single();

  if (profile?.is_investor) {
    return NextResponse.json({ error: 'Investors cannot request payments' }, { status: 403 });
  }

  let body: {
    amount: number;
    description?: string;
    items: { label: string; amount: number; task_id?: string }[];
    paypal_email?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.amount || !body.items?.length) {
    return NextResponse.json({ error: 'amount and items are required' }, { status: 400 });
  }

  // Save PayPal email to profile if provided
  if (body.paypal_email?.trim()) {
    await supabase
      .from('profiles')
      .update({ paypal_email: body.paypal_email.trim() })
      .eq('id', user.id);
  }

  // Create pending payment (RLS enforces recipient_id = auth.uid())
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      recipient_id: user.id,
      created_by: user.id,
      amount: body.amount,
      currency: 'USD',
      description: body.description?.trim() || null,
      status: 'pending',
      requested_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });

  // Create line items
  const items = body.items.map(item => ({
    payment_id: payment.id,
    task_id: item.task_id || null,
    label: item.label,
    amount: item.amount,
  }));

  const { error: itemsError } = await supabase
    .from('payment_items')
    .insert(items);

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  return NextResponse.json(payment, { status: 201 });
}
```

**Step 2: Commit**

```bash
git add src/app/api/payments/request/route.ts
git commit -m "feat: add POST /api/payments/request endpoint"
```

---

### Task 3: API — GET `/api/payments/mine`

**Files:**
- Create: `src/app/api/payments/mine/route.ts`

**Step 1: Create the endpoint**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('payments')
    .select('*, items:payment_items(*)')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
```

**Step 2: Commit**

```bash
git add src/app/api/payments/mine/route.ts
git commit -m "feat: add GET /api/payments/mine endpoint"
```

---

### Task 4: `PaymentRequestDialog` component

**Files:**
- Create: `src/components/dashboard/PaymentRequestDialog.tsx`

**Context:** This dialog is opened from the settings page. It collects PayPal email, line items (with optional task attachment), and submits to `/api/payments/request`. Uses the same visual patterns as `PaymentCreateDialog.tsx` — Section stagger, accent-tinted total bar, spring animations.

**Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Plus, Trash2, CheckCircle2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type { Task } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

interface LineItem {
  id: string;
  label: string;
  amount: number;
  task_id?: string;
  included: boolean;
}

interface PaymentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paypalEmail: string;
  completedTasks: Task[];
  onSubmitted: () => void;
}

function Section({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

function DialogContent({
  paypalEmail: initialPaypalEmail,
  completedTasks,
  onSubmitted,
  onOpenChange,
}: {
  paypalEmail: string;
  completedTasks: Task[];
  onSubmitted: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [paypalEmail, setPaypalEmail] = useState(initialPaypalEmail);
  const [items, setItems] = useState<LineItem[]>([{
    id: crypto.randomUUID(),
    label: '',
    amount: 0,
    included: true,
  }]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);

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

  const attachTask = (task: Task) => {
    // Don't add duplicate
    if (items.some(i => i.task_id === task.id)) return;
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      label: task.name,
      amount: task.bounty ?? 0,
      task_id: task.id,
      included: true,
    }]);
    setTaskPickerOpen(false);
  };

  // Filter out tasks already attached
  const availableTasks = completedTasks.filter(
    t => !items.some(i => i.task_id === t.id)
  );

  const handleSubmit = async () => {
    if (!paypalEmail.trim()) {
      setError('PayPal email is required');
      return;
    }
    if (total <= 0) {
      setError('Total must be greater than $0');
      return;
    }

    const includedItems = items.filter(i => i.included && i.label && i.amount > 0);
    if (includedItems.length === 0) {
      setError('Add at least one item with a label and amount');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/payments/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          description: description.trim() || includedItems.map(i => i.label).join(', '),
          items: includedItems.map(i => ({
            label: i.label,
            amount: i.amount,
            task_id: i.task_id || undefined,
          })),
          paypal_email: paypalEmail.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to submit request');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <>
        <DialogClose onClose={() => { onSubmitted(); onOpenChange(false); }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
          className="flex flex-col items-center gap-4 py-8"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-seeko-accent/10">
            <CheckCircle2 className="size-7 text-seeko-accent" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">Request Submitted</p>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCurrency(total)} sent for approval
            </p>
          </div>
          <Button
            onClick={() => { onSubmitted(); onOpenChange(false); }}
            className="bg-seeko-accent text-black hover:bg-seeko-accent/90 mt-2"
          >
            Done
          </Button>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Request Payment</DialogTitle>
      </DialogHeader>

      <div className="space-y-5">
        {/* PayPal Email */}
        <Section delay={0}>
          <div className="space-y-2">
            <Label htmlFor="paypal-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              PayPal Email
            </Label>
            <Input
              id="paypal-email"
              type="email"
              value={paypalEmail}
              onChange={e => setPaypalEmail(e.target.value)}
              placeholder="your@paypal.email"
            />
            <p className="text-xs text-muted-foreground">Saved to your profile for future requests.</p>
          </div>
        </Section>

        {/* Line Items */}
        <Section delay={0.1}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Line Items</p>
              <div className="flex items-center gap-2">
                {availableTasks.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTaskPickerOpen(!taskPickerOpen)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-seeko-accent hover:bg-seeko-accent/[0.06] transition-colors"
                    >
                      <Plus className="size-3" />
                      Attach Task
                    </button>
                    <AnimatePresence>
                      {taskPickerOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-white/[0.08] bg-popover/95 backdrop-blur-xl shadow-lg overflow-hidden"
                        >
                          <div className="max-h-48 overflow-y-auto py-1">
                            {availableTasks.map(task => (
                              <button
                                key={task.id}
                                onClick={() => attachTask(task)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-white/[0.06] transition-colors text-left"
                              >
                                <span className="truncate flex-1">{task.name}</span>
                                {task.bounty != null && task.bounty > 0 && (
                                  <span className="text-xs text-muted-foreground font-mono shrink-0">
                                    {formatCurrency(task.bounty)}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <button
                  onClick={addItem}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-seeko-accent hover:bg-seeko-accent/[0.06] transition-colors"
                >
                  <Plus className="size-3" />
                  Add
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
              <AnimatePresence initial={false}>
                {items.map(item => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ ...SPRING, duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, 'included', !item.included)}
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                          item.included
                            ? 'border-seeko-accent bg-seeko-accent/20 text-seeko-accent'
                            : 'border-white/[0.12] text-transparent hover:border-white/[0.2]'
                        )}
                      >
                        {item.included && <Check className="size-3" />}
                      </button>
                      <Input
                        value={item.label}
                        onChange={e => updateItem(item.id, 'label', e.target.value)}
                        placeholder="What's this for?"
                        className="flex-1 border-0 bg-transparent px-2 h-8 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          value={item.amount || ''}
                          onChange={e => updateItem(item.id, 'amount', Number(e.target.value) || 0)}
                          placeholder="0.00"
                          className="border-0 bg-transparent pl-5 pr-2 h-8 text-sm text-right font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
                          min={0}
                          step={0.01}
                        />
                      </div>
                      {items.length > 1 && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 p-1"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </Section>

        {/* Notes */}
        <Section delay={0.15}>
          <div className="space-y-2">
            <Label htmlFor="request-notes" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notes (optional)
            </Label>
            <Input
              id="request-notes"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any additional context..."
            />
          </div>
        </Section>

        {/* Total */}
        <Section delay={0.2}>
          <div className={cn(
            'rounded-lg border p-4 transition-colors',
            total > 0
              ? 'border-seeko-accent/20 bg-seeko-accent/[0.04]'
              : 'border-white/[0.06] bg-white/[0.02]'
          )}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className={cn(
                'text-xl font-semibold font-mono tracking-tight',
                total > 0 ? 'text-seeko-accent' : 'text-muted-foreground'
              )}>
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </Section>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-destructive"
          >
            {error}
          </motion.p>
        )}

        {/* Footer */}
        <Section delay={0.25}>
          <div className="flex items-center justify-end gap-3 pt-1">
            <Button
              onClick={handleSubmit}
              disabled={saving || total <= 0 || !paypalEmail.trim()}
              className={cn(
                'min-w-[140px]',
                total > 0 && !saving && paypalEmail.trim() && 'bg-seeko-accent text-black hover:bg-seeko-accent/90'
              )}
            >
              {saving ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </Section>
      </div>
    </>
  );
}

export function PaymentRequestDialog({
  open,
  onOpenChange,
  paypalEmail,
  completedTasks,
  onSubmitted,
}: PaymentRequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-lg">
      <DialogContent
        paypalEmail={paypalEmail}
        completedTasks={completedTasks}
        onSubmitted={onSubmitted}
        onOpenChange={onOpenChange}
      />
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/dashboard/PaymentRequestDialog.tsx
git commit -m "feat: add PaymentRequestDialog component"
```

---

### Task 5: Settings page — Payments section

**Files:**
- Modify: `src/components/dashboard/SettingsPanel.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Update settings page to fetch completed tasks and pass to SettingsPanel**

In `src/app/(dashboard)/settings/page.tsx`, add:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchTeam } from '@/lib/supabase/data';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (!profile) redirect('/onboarding');

  const isAdmin = profile.is_admin;
  const team = isAdmin ? await fetchTeam().catch(() => []) : [];

  // Fetch user's completed tasks for payment request dialog
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('id, name, bounty')
    .eq('assignee_id', user.id)
    .eq('status', 'Complete')
    .order('updated_at', { ascending: false });

  return (
    <SettingsPanel
      profile={profile}
      isAdmin={isAdmin}
      team={team}
      completedTasks={completedTasks ?? []}
    />
  );
}
```

**Step 2: Add Payments section to SettingsPanel**

In `src/components/dashboard/SettingsPanel.tsx`, add these imports at the top:

```tsx
import { DollarSign } from 'lucide-react';
import { PaymentRequestDialog } from '@/components/dashboard/PaymentRequestDialog';
import type { Task, Payment, PaymentStatus } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
```

Update the `SettingsPanelProps` interface:

```tsx
interface SettingsPanelProps {
  profile: Profile;
  isAdmin: boolean;
  team: Profile[];
  revalidate?: () => Promise<void>;
  completedTasks?: Pick<Task, 'id' | 'name' | 'bounty'>[];
}
```

Add payment-related state inside `SettingsPanel` function (after existing state declarations):

```tsx
const [requestDialogOpen, setRequestDialogOpen] = useState(false);
const [myPayments, setMyPayments] = useState<Payment[]>([]);
const [loadingPayments, setLoadingPayments] = useState(false);

const loadMyPayments = useCallback(async () => {
  setLoadingPayments(true);
  try {
    const res = await fetch('/api/payments/mine');
    if (res.ok) {
      const data = await res.json();
      setMyPayments(data);
    }
  } catch {
    // ignore
  } finally {
    setLoadingPayments(false);
  }
}, []);

useEffect(() => {
  if (!profile.is_investor) loadMyPayments();
}, [profile.is_investor, loadMyPayments]);
```

Add the Payments section JSX **after** the ReplayTourCard and **before** the admin-only User Activity card. Only render for non-investors:

```tsx
{!profile.is_investor && (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>Payments</CardTitle>
            <CardDescription>Request payment and view your history.</CardDescription>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRequestDialogOpen(true)}
          className="gap-1.5 shrink-0"
        >
          <DollarSign className="size-3.5" />
          Request Payment
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      {profile.paypal_email && (
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          <span>PayPal:</span>
          <span className="font-mono">{profile.paypal_email}</span>
        </div>
      )}
      {loadingPayments ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
      ) : myPayments.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No payment requests yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {myPayments.slice(0, 10).map(payment => (
            <div key={payment.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">
                  {payment.description || `${payment.items?.length ?? 0} items`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(payment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium font-mono text-foreground">
                  {formatCurrency(Number(payment.amount))}
                </span>
                <Badge
                  variant={
                    payment.status === 'paid' ? 'default'
                    : payment.status === 'cancelled' ? 'destructive'
                    : 'outline'
                  }
                  className="text-[10px] py-0 px-1.5"
                >
                  {payment.status === 'paid' ? 'Approved'
                    : payment.status === 'cancelled' ? 'Denied'
                    : 'Pending'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)}

<PaymentRequestDialog
  open={requestDialogOpen}
  onOpenChange={setRequestDialogOpen}
  paypalEmail={profile.paypal_email ?? ''}
  completedTasks={(completedTasks ?? []) as Task[]}
  onSubmitted={() => {
    setRequestDialogOpen(false);
    loadMyPayments();
  }}
/>
```

**Step 3: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx src/components/dashboard/SettingsPanel.tsx
git commit -m "feat: add Payments section to settings page with request dialog + history"
```

---

### Task 6: Admin — Pending Requests section in PaymentsAdmin

**Files:**
- Modify: `src/components/dashboard/PaymentsAdmin.tsx`

**Step 1: Add pending requests section**

Add a `PendingRequestRow` component and a "Pending Requests" card between the secondary stats and the people card. Pending requests are payments where `requested_at` is not null and `status` is `'pending'`.

Filter pending requests from the existing `payments` state:

```tsx
const pendingRequests = payments.filter(
  p => p.status === 'pending' && p.requested_at
);
```

Add the card JSX between the secondary stats `</Stagger>` and the People `<FadeRise>`:

```tsx
{pendingRequests.length > 0 && (
  <FadeRise delay={delay(TIMING.people - 50)}>
    <Card className="border-amber-900/30 bg-amber-950/[0.06]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-amber-400" />
          <CardTitle className="text-xl font-semibold text-foreground">
            Pending Requests
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({pendingRequests.length})
            </span>
          </CardTitle>
        </div>
        <CardDescription>Team members requesting payment — approve or deny.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-0">
          {pendingRequests.map(request => (
            <PendingRequestRow
              key={request.id}
              payment={request}
              token={token}
              onAction={() => fetchData(token)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  </FadeRise>
)}
```

The `PendingRequestRow` component:

```tsx
function PendingRequestRow({
  payment,
  token,
  onAction,
}: {
  payment: Payment;
  token: string;
  onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const hasItems = (payment.items?.length ?? 0) > 0;

  const handleAction = async (status: 'paid' | 'cancelled') => {
    setActing(true);
    try {
      await fetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-payments-token': token,
        },
        body: JSON.stringify({ status }),
      });
      onAction();
    } catch {
      setActing(false);
    }
  };

  return (
    <div className="border-b border-border last:border-0 py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => hasItems && setExpanded(!expanded)}
          className={cn(
            'flex items-center gap-3 min-w-0 text-left',
            hasItems && 'cursor-pointer',
          )}
        >
          <Avatar className="size-8">
            <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary text-foreground text-[10px]">
              {getInitials(payment.recipient?.display_name ?? '?')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {payment.recipient?.display_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {payment.items?.length ?? 0} item{(payment.items?.length ?? 0) !== 1 ? 's' : ''}
              {payment.description && (
                <span className="text-muted-foreground/60"> · {payment.description}</span>
              )}
            </p>
          </div>
          {hasItems && (
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          )}
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold font-mono" style={{ color: 'var(--color-seeko-accent)' }}>
            {formatCurrency(Number(payment.amount))}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={acting}
            onClick={() => handleAction('cancelled')}
            className="text-destructive hover:bg-destructive/10 h-7 px-2 text-xs"
          >
            Deny
          </Button>
          <Button
            size="sm"
            disabled={acting}
            onClick={() => handleAction('paid')}
            className="bg-seeko-accent text-black hover:bg-seeko-accent/90 h-7 px-3 text-xs"
          >
            Approve
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {expanded && hasItems && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...ROW_SPRING, duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pl-11 pr-4">
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] divide-y divide-white/[0.04] overflow-hidden">
                {payment.items!.map(item => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground font-mono">{formatCurrency(Number(item.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Add `requested_at` to the payments API select query**

In `src/app/api/payments/route.ts`, the existing select already uses `*` which includes all columns, so `requested_at` is automatically included. No change needed.

**Step 3: Commit**

```bash
git add src/components/dashboard/PaymentsAdmin.tsx
git commit -m "feat: add Pending Requests section with approve/deny to admin payments"
```

---

### Task 7: Verify end-to-end flow

**Step 1: Run the migration** (if not already applied)

**Step 2: Test as team member**
1. Log in as a non-admin team member
2. Go to Settings
3. See "Payments" section with "Request Payment" button
4. Click "Request Payment" → dialog opens
5. Enter PayPal email, add line items, optionally attach completed tasks
6. Submit → success screen, payment appears in history as "Pending"

**Step 3: Test as admin**
1. Log in as admin, go to Payments page
2. Enter password
3. See "Pending Requests" card with the new request
4. Expand to see line items
5. Click "Approve" → request disappears from pending, appears in recent payments
6. Or click "Deny" → request disappears

**Step 4: Verify team member sees updated status**
1. Switch back to team member settings
2. Payment history shows "Approved" or "Denied" badge

**Step 5: Commit any fixes**

```bash
git commit -m "fix: address issues found during e2e testing"
```
