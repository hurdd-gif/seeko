# Payment Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add payment tracking to SEEKO Studio so admins can create payments, generate PayPal links, and mark payments complete; investors get a read-only spend overview.

**Architecture:** New `payments` and `payment_items` Supabase tables. A `/payments` route inside the `(dashboard)` route group renders either an admin view (password-gated CRUD) or redirects investors to their view. API routes handle password verification (bcrypt + JWT), payment CRUD, and stats. PayPal integration is link-based (`paypal.me` URLs), not API-based.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), bcrypt (`bcryptjs`), `jose` (JWT), `motion/react`, shadcn/ui components, Tailwind v4

**Design doc:** `docs/plans/2026-03-07-payment-tracker-design.md`

---

## Task 1: Database Migration — Tables, Enum, Columns

**Files:**
- Create: `supabase/migrations/20260307000001_payment_tracker.sql`
- Modify: `docs/supabase-schema.sql` (append new tables)
- Modify: `src/lib/types.ts` (add Payment, PaymentItem types; add paypal_email to Profile, bounty to Task)

**Step 1: Write the migration SQL**

Create `supabase/migrations/20260307000001_payment_tracker.sql`:

```sql
-- Payment status enum
create type public.payment_status as enum ('pending', 'paid', 'cancelled');

-- Payments table
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  amount      decimal not null,
  currency    text not null default 'USD',
  description text,
  status      public.payment_status not null default 'pending',
  paid_at     timestamptz,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz default now()
);

create index payments_recipient_id_idx on public.payments(recipient_id);
create index payments_status_idx on public.payments(status);

alter table public.payments enable row level security;

-- Admins can do everything; investors can read paid payments only
create policy "Admins can manage payments"
  on public.payments for all
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

create policy "Investors can read paid payments"
  on public.payments for select
  to authenticated
  using (
    (select is_investor from public.profiles where id = auth.uid()) = true
    and status = 'paid'
  );

-- Payment line items
create table public.payment_items (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  label      text not null,
  amount     decimal not null
);

create index payment_items_payment_id_idx on public.payment_items(payment_id);

alter table public.payment_items enable row level security;

create policy "Admins can manage payment items"
  on public.payment_items for all
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true)
  with check ((select is_admin from public.profiles where id = auth.uid()) = true);

-- New columns on existing tables
alter table public.profiles add column if not exists paypal_email text;
alter table public.tasks add column if not exists bounty decimal;
```

**Step 2: Run the migration in Supabase**

Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → paste → Run).

**Step 3: Update `docs/supabase-schema.sql`**

Append the new tables section after `-- ─── Pending Invites ──`:

```sql
-- ─── Payments ───────────────────────────────────────────────────────────────
-- See migration 20260307000001_payment_tracker.sql for full schema.

create type public.payment_status as enum ('pending', 'paid', 'cancelled');

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  amount       decimal not null,
  currency     text not null default 'USD',
  description  text,
  status       public.payment_status not null default 'pending',
  paid_at      timestamptz,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz default now()
);

create table public.payment_items (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  label      text not null,
  amount     decimal not null
);

-- profiles.paypal_email text (nullable)
-- tasks.bounty decimal (nullable)
```

**Step 4: Update TypeScript types in `src/lib/types.ts`**

Add after the `TaskHandoff` type:

```ts
export type PaymentStatus = 'pending' | 'paid' | 'cancelled';

export type Payment = {
  id: string;
  recipient_id: string;
  amount: number;
  currency: string;
  description?: string;
  status: PaymentStatus;
  paid_at?: string;
  created_by: string;
  created_at: string;
  // Joined fields
  recipient?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'department'>;
  items?: PaymentItem[];
};

export type PaymentItem = {
  id: string;
  payment_id: string;
  task_id?: string;
  label: string;
  amount: number;
};
```

Add `paypal_email?: string;` to the `Profile` type (after `timezone`).

Add `bounty?: number;` to the `Task` type (after `description`).

**Step 5: Commit**

```bash
git add supabase/migrations/20260307000001_payment_tracker.sql docs/supabase-schema.sql src/lib/types.ts
git commit -m "feat(payments): add database schema — payments, payment_items tables, new columns"
```

---

## Task 2: Install Dependencies — bcryptjs + jose

**Step 1: Install packages**

```bash
npm install bcryptjs jose
npm install -D @types/bcryptjs
```

**Step 2: Add environment variable**

Generate bcrypt hash for the payments password. In a Node REPL:

```bash
node -e "const b = require('bcryptjs'); console.log(b.hashSync('\$&@**}{##*\$:^^%&:&##{an441234635@rbVC4332127##**#%{\$&;&;&/&#.#.%{{**+@##\$@&\$\":@/)', 10));"
```

Add these to `.env.local`:

```
PAYMENTS_ACCESS_HASH=<the bcrypt hash from above>
PAYMENTS_JWT_SECRET=<random 32+ char string>
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bcryptjs and jose for payment auth"
```

---

## Task 3: API Route — Password Verification (`/api/payments/verify`)

**Files:**
- Create: `src/app/api/payments/verify/route.ts`

**Step 1: Create the verify route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

async function getSupabaseAndUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: { password: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { password } = body;
  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  const hash = process.env.PAYMENTS_ACCESS_HASH;
  if (!hash) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 500 });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Issue JWT token (24hr expiry)
  const secret = new TextEncoder().encode(process.env.PAYMENTS_JWT_SECRET ?? 'fallback-secret');
  const token = await new SignJWT({ sub: user.id, scope: 'payments' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .setIssuedAt()
    .sign(secret);

  return NextResponse.json({ token });
}
```

**Step 2: Commit**

```bash
git add src/app/api/payments/verify/route.ts
git commit -m "feat(payments): add password verification API route with JWT"
```

---

## Task 4: API Route — Payments CRUD (`/api/payments`)

**Files:**
- Create: `src/app/api/payments/route.ts`
- Create: `src/app/api/payments/[id]/route.ts`
- Create: `src/app/api/payments/stats/route.ts`
- Create: `src/lib/payments-auth.ts` (shared token verification helper)

**Step 1: Create the shared auth helper**

Create `src/lib/payments-auth.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function getPaymentsAuth(tokenHeader?: string | null) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false, isInvestor: false, tokenValid: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, is_investor')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.is_admin ?? false;
  const isInvestor = profile?.is_investor ?? false;

  // Verify payments token for admin operations
  let tokenValid = false;
  if (isAdmin && tokenHeader) {
    try {
      const secret = new TextEncoder().encode(process.env.PAYMENTS_JWT_SECRET ?? 'fallback-secret');
      const { payload } = await jwtVerify(tokenHeader, secret);
      tokenValid = payload.sub === user.id && payload.scope === 'payments';
    } catch {
      tokenValid = false;
    }
  }

  return { supabase, user, isAdmin, isInvestor, tokenValid };
}
```

**Step 2: Create GET/POST `/api/payments/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getPaymentsAuth } from '@/lib/payments-auth';

/** GET: List payments. Admins see all; investors see only paid. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, isInvestor, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin && !isInvestor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (isAdmin && !tokenValid) return NextResponse.json({ error: 'Payments token required' }, { status: 401 });

  let query = supabase
    .from('payments')
    .select('*, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department), items:payment_items(*)')
    .order('created_at', { ascending: false });

  // Investors only see paid payments (RLS enforces this too, but be explicit)
  if (isInvestor && !isAdmin) {
    query = query.eq('status', 'paid');
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

/** POST: Create a payment with line items. Admin + token required. */
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin || !tokenValid) return NextResponse.json({ error: 'Admin + payments token required' }, { status: 403 });

  let body: {
    recipient_id: string;
    amount: number;
    description?: string;
    status?: 'pending' | 'paid';
    items: { task_id?: string; label: string; amount: number }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.recipient_id || !body.amount || !body.items?.length) {
    return NextResponse.json({ error: 'recipient_id, amount, and items are required' }, { status: 400 });
  }

  const status = body.status ?? 'pending';

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      recipient_id: body.recipient_id,
      amount: body.amount,
      currency: 'USD',
      description: body.description?.trim() || null,
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      created_by: user.id,
    })
    .select()
    .single();

  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });

  // Insert line items
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

**Step 3: Create PATCH `/api/payments/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getPaymentsAuth } from '@/lib/payments-auth';

/** PATCH: Update payment status (mark paid / cancel). Admin + token required. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin || !tokenValid) return NextResponse.json({ error: 'Admin + payments token required' }, { status: 403 });

  const { id } = await params;

  let body: { status: 'paid' | 'cancelled' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!['paid', 'cancelled'].includes(body.status)) {
    return NextResponse.json({ error: 'Status must be "paid" or "cancelled"' }, { status: 400 });
  }

  const update: Record<string, unknown> = { status: body.status };
  if (body.status === 'paid') {
    update.paid_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('payments')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  return NextResponse.json(data);
}
```

**Step 4: Create GET `/api/payments/stats/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getPaymentsAuth } from '@/lib/payments-auth';

/** GET: Aggregated payment stats. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, isInvestor, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin && !isInvestor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (isAdmin && !tokenValid) return NextResponse.json({ error: 'Payments token required' }, { status: 401 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  if (isAdmin) {
    // Admin stats: pending total, paid this month, people owed, payments this month
    const [pendingRes, paidMonthRes, allPaidRes] = await Promise.all([
      supabase.from('payments').select('amount, recipient_id').eq('status', 'pending'),
      supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart),
      supabase.from('payments').select('id').eq('status', 'paid').gte('paid_at', monthStart),
    ]);

    const pendingPayments = pendingRes.data ?? [];
    const pendingTotal = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const peopleOwed = new Set(pendingPayments.map(p => p.recipient_id)).size;
    const paidThisMonth = (paidMonthRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    const paymentsThisMonth = allPaidRes.data?.length ?? 0;

    return NextResponse.json({
      pendingTotal,
      paidThisMonth,
      peopleOwed,
      paymentsThisMonth,
    });
  }

  // Investor stats: this month, all time, people paid
  const [paidMonthRes, allTimeRes] = await Promise.all([
    supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart),
    supabase.from('payments').select('amount, recipient_id').eq('status', 'paid'),
  ]);

  const thisMonth = (paidMonthRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const allTimePayments = allTimeRes.data ?? [];
  const allTime = allTimePayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const peoplePaid = new Set(allTimePayments.map(p => p.recipient_id)).size;

  return NextResponse.json({
    thisMonth,
    allTime,
    peoplePaid,
  });
}
```

**Step 5: Commit**

```bash
git add src/lib/payments-auth.ts src/app/api/payments/
git commit -m "feat(payments): add CRUD API routes with token-gated auth"
```

---

## Task 5: Data Layer — Payment Fetch Functions

**Files:**
- Modify: `src/lib/supabase/data.ts`

**Step 1: Add payment data fetchers**

Add to the end of `src/lib/supabase/data.ts`:

```ts
export async function fetchPaymentsForRecipient(recipientId: string): Promise<import('../types').Payment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*, items:payment_items(*)')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as import('../types').Payment[];
}

export async function fetchTeamWithPaypalEmails(): Promise<(Profile & { paypal_email?: string })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as (Profile & { paypal_email?: string })[];
}
```

**Step 2: Commit**

```bash
git add src/lib/supabase/data.ts
git commit -m "feat(payments): add payment data fetchers"
```

---

## Task 6: Password Gate Component

**Files:**
- Create: `src/components/dashboard/PaymentsPasswordGate.tsx`

**Step 1: Create the password gate component**

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };

interface PaymentsPasswordGateProps {
  onAuthenticated: (token: string) => void;
}

export function PaymentsPasswordGate({ onAuthenticated }: PaymentsPasswordGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Invalid password');
        return;
      }

      sessionStorage.setItem('payments-token', data.token);
      onAuthenticated(data.token);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING}
      >
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-seeko-accent/10">
              <Lock className="size-5 text-seeko-accent" />
            </div>
            <CardTitle>Payments Access</CardTitle>
            <CardDescription>Enter the payments password to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={loading || !password} className="w-full">
                {loading ? 'Verifying...' : 'Unlock'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/dashboard/PaymentsPasswordGate.tsx
git commit -m "feat(payments): add password gate component"
```

---

## Task 7: Admin Payments Page — Main View

**Files:**
- Create: `src/app/(dashboard)/payments/page.tsx`
- Create: `src/components/dashboard/PaymentsAdmin.tsx`

**Step 1: Create the server page**

Create `src/app/(dashboard)/payments/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchTeamWithPaypalEmails } from '@/lib/supabase/data';
import { redirect } from 'next/navigation';
import { PaymentsAdmin } from '@/components/dashboard/PaymentsAdmin';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);

  // Investors see their view on the investor panel (no separate payments page for them)
  if (!profile?.is_admin) redirect('/');

  // Fetch team with paypal emails for the payment creation dialog
  const team = await fetchTeamWithPaypalEmails();

  return <PaymentsAdmin team={team} />;
}
```

**Step 2: Create the admin client component**

Create `src/components/dashboard/PaymentsAdmin.tsx`:

```tsx
'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Payments page entrance
 *
 *    0ms   hero fades in (title + subtitle)
 *  100ms   stat cards stagger in (80ms between)
 *  300ms   people card fades in
 *          people rows stagger (50ms between, slide from left)
 *  500ms   recent payments card fades in
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign, Users, CheckCircle2, Clock,
  CreditCard, ExternalLink, Copy, Check, Plus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { PaymentsPasswordGate } from '@/components/dashboard/PaymentsPasswordGate';
import { PaymentCreateDialog } from '@/components/dashboard/PaymentCreateDialog';
import type { Profile, Payment } from '@/lib/types';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };

const TIMING = {
  hero: 0,
  stats: 100,
  statsStagger: 80,
  people: 300,
  peopleStagger: 50,
  recent: 500,
};

const delay = (ms: number) => ms / 1000;

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

type TeamMember = Profile & { paypal_email?: string };

interface PaymentsAdminProps {
  team: TeamMember[];
}

export function PaymentsAdmin({ team }: PaymentsAdminProps) {
  const [token, setToken] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<{
    pendingTotal: number;
    paidThisMonth: number;
    peopleOwed: number;
    paymentsThisMonth: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'owed' | 'paid'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<TeamMember | null>(null);

  // Check for existing session token on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('payments-token');
    if (stored) setToken(stored);
  }, []);

  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const headers = { 'x-payments-token': t };
      const [paymentsRes, statsRes] = await Promise.all([
        fetch('/api/payments', { headers }),
        fetch('/api/payments/stats', { headers }),
      ]);

      if (paymentsRes.status === 401 || statsRes.status === 401) {
        // Token expired
        sessionStorage.removeItem('payments-token');
        setToken(null);
        return;
      }

      const [paymentsData, statsData] = await Promise.all([
        paymentsRes.json(),
        statsRes.json(),
      ]);

      setPayments(paymentsData);
      setStats(statsData);
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchData(token);
  }, [token, fetchData]);

  // If no token, show password gate
  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <FadeRise delay={0}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">Track and manage team payments.</p>
        </FadeRise>
        <PaymentsPasswordGate onAuthenticated={setToken} />
      </div>
    );
  }

  // Build people rows from team + payments data
  const peopleWithPending = team
    .filter(m => !m.is_investor)
    .map(member => {
      const memberPayments = payments.filter(p => p.recipient_id === member.id);
      const pendingAmount = memberPayments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const hasPaid = memberPayments.some(p => p.status === 'paid');
      return { ...member, pendingAmount, hasPaid };
    });

  const filteredPeople = peopleWithPending.filter(p => {
    if (filter === 'owed') return p.pendingAmount > 0;
    if (filter === 'paid') return p.pendingAmount === 0 && p.hasPaid;
    return true;
  });

  // Sort: owed first (by amount desc), then paid
  filteredPeople.sort((a, b) => {
    if (a.pendingAmount > 0 && b.pendingAmount === 0) return -1;
    if (a.pendingAmount === 0 && b.pendingAmount > 0) return 1;
    return b.pendingAmount - a.pendingAmount;
  });

  const recentPaid = payments
    .filter(p => p.status === 'paid')
    .slice(0, 10);

  const handlePay = (member: TeamMember) => {
    setSelectedRecipient(member);
    setCreateDialogOpen(true);
  };

  const handlePaymentCreated = () => {
    setCreateDialogOpen(false);
    setSelectedRecipient(null);
    if (token) fetchData(token);
  };

  const statCards = [
    {
      label: 'Pending',
      value: stats?.pendingTotal ?? 0,
      icon: Clock,
      primary: true,
      format: true,
    },
    {
      label: 'Paid This Month',
      value: stats?.paidThisMonth ?? 0,
      icon: CheckCircle2,
      primary: false,
      format: true,
    },
    {
      label: 'People Owed',
      value: stats?.peopleOwed ?? 0,
      icon: Users,
      primary: false,
      format: false,
    },
    {
      label: 'Payments This Month',
      value: stats?.paymentsThisMonth ?? 0,
      icon: CreditCard,
      primary: false,
      format: false,
    },
  ];

  const filterOptions = [
    { label: 'All', value: 'all' as const },
    { label: 'Owed', value: 'owed' as const },
    { label: 'Paid', value: 'paid' as const },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <FadeRise delay={delay(TIMING.hero)}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground">Track and manage team payments.</p>
      </FadeRise>

      {/* Stat Cards */}
      <Stagger
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        delayMs={delay(TIMING.stats)}
        staggerMs={delay(TIMING.statsStagger)}
      >
        {statCards.map(stat => (
          <StaggerItem key={stat.label}>
            <HoverCard>
              <Card className={cn(
                stat.primary && 'border-seeko-accent/20 bg-seeko-accent/[0.04]'
              )}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                  <div className={cn(
                    'flex size-8 items-center justify-center rounded-lg',
                    stat.primary ? 'bg-seeko-accent/10' : 'bg-secondary'
                  )}>
                    <stat.icon className={cn('size-4', stat.primary ? 'text-seeko-accent' : 'text-muted-foreground')} />
                  </div>
                </CardHeader>
                <CardContent>
                  <span className={cn(
                    'font-semibold tracking-tight',
                    stat.primary ? 'text-3xl' : 'text-2xl'
                  )} style={stat.primary ? { color: 'var(--color-seeko-accent)' } : undefined}>
                    {stat.format ? formatCurrency(stat.value) : <AnimatedNumber value={stat.value} />}
                  </span>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>
        ))}
      </Stagger>

      {/* People Card */}
      <FadeRise delay={delay(TIMING.people)}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-foreground">People</CardTitle>
                <CardDescription>Team members and their payment status.</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedRecipient(null); setCreateDialogOpen(true); }}
                className="text-seeko-accent"
              >
                <Plus className="size-4 mr-1" />
                New Payment
              </Button>
            </div>
            {/* Filter pills */}
            <div className="flex gap-2 pt-2">
              {filterOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    filter === opt.value
                      ? 'bg-seeko-accent/10 text-seeko-accent'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : filteredPeople.length === 0 ? (
              <EmptyState
                icon="Users"
                title="No results"
                description="No team members match this filter."
              />
            ) : (
              <Stagger className="flex flex-col" staggerMs={delay(TIMING.peopleStagger)}>
                {filteredPeople.map(person => (
                  <StaggerItem key={person.id}>
                    <div className="flex items-center justify-between rounded-lg px-3 py-3 hover:bg-white/[0.04] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-9">
                          <AvatarImage src={person.avatar_url ?? undefined} alt={person.display_name ?? ''} />
                          <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                            {getInitials(person.display_name ?? '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{person.display_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{person.department ?? 'Unassigned'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {person.pendingAmount > 0 ? (
                          <>
                            <span className="text-sm font-medium" style={{ color: 'var(--color-seeko-accent)' }}>
                              {formatCurrency(person.pendingAmount)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePay(person)}
                              className="text-seeko-accent"
                            >
                              Pay
                            </Button>
                          </>
                        ) : person.hasPaid ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CheckCircle2 className="size-3.5" />
                            Paid
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      {/* Recent Payments */}
      <FadeRise delay={delay(TIMING.recent)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Recent Payments</CardTitle>
            <CardDescription>Completed payments.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPaid.length === 0 ? (
              <EmptyState
                icon="CreditCard"
                title="No completed payments"
                description="Payments will appear here once marked as paid."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {recentPaid.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8">
                        <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                          {getInitials(payment.recipient?.display_name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{payment.recipient?.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.items?.length ?? 0} item{(payment.items?.length ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium text-foreground">{formatCurrency(Number(payment.amount))}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(payment.paid_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      {/* Payment Creation Dialog */}
      <PaymentCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        team={team}
        recipient={selectedRecipient}
        token={token}
        onCreated={handlePaymentCreated}
      />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/payments/page.tsx src/components/dashboard/PaymentsAdmin.tsx
git commit -m "feat(payments): add admin payments page with stat cards and people list"
```

---

## Task 8: Payment Creation Dialog

**Files:**
- Create: `src/components/dashboard/PaymentCreateDialog.tsx`

**Step 1: Create the dialog component**

```tsx
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
  DialogFooter,
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

export function PaymentCreateDialog({
  open,
  onOpenChange,
  team,
  recipient: initialRecipient,
  token,
  onCreated,
}: PaymentCreateDialogProps) {
  const [recipient, setRecipient] = useState<TeamMember | null>(initialRecipient);
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Sync recipient when prop changes
  useEffect(() => {
    setRecipient(initialRecipient);
  }, [initialRecipient]);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setItems([{
        id: crypto.randomUUID(),
        label: '',
        amount: 0,
        included: true,
      }]);
      setError('');
      setCopied(false);
    }
  }, [open]);

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
    // Extract username from email or use email directly
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>New Payment</DialogTitle>
      </DialogHeader>

      <div className="space-y-5">
        {/* Recipient selector */}
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

        {/* Line items */}
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

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-lg font-semibold" style={{ color: total > 0 ? 'var(--color-seeko-accent)' : undefined }}>
            ${total.toFixed(2)}
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
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
      </DialogFooter>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/dashboard/PaymentCreateDialog.tsx
git commit -m "feat(payments): add payment creation dialog with line items and PayPal link"
```

---

## Task 9: Investor Payments View

**Files:**
- Create: `src/components/dashboard/PaymentsInvestor.tsx`
- Modify: `src/app/(investor)/investor/page.tsx` (add payments section)

**Step 1: Create the investor payments component**

Create `src/components/dashboard/PaymentsInvestor.tsx`:

```tsx
'use client';

import { DollarSign, Users, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Payment } from '@/lib/types';

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface PaymentsInvestorProps {
  payments: Payment[];
  stats: {
    thisMonth: number;
    allTime: number;
    peoplePaid: number;
  };
  delay?: number;
}

export function PaymentsInvestor({ payments, stats, delay: baseDelay = 0 }: PaymentsInvestorProps) {
  const d = (ms: number) => (baseDelay + ms) / 1000;

  // Group by month
  const monthlyBreakdown = payments.reduce<Record<string, { total: number; count: number }>>((acc, p) => {
    const date = new Date(p.paid_at!);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = { total: 0, count: 0 };
    acc[key].total += Number(p.amount);
    acc[key].count += 1;
    return acc;
  }, {});

  const months = Object.entries(monthlyBreakdown)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, data]) => ({
      label: new Date(key + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      ...data,
    }));

  const recentPayments = payments.slice(0, 10);

  const statCards = [
    { label: 'This Month', value: stats.thisMonth, icon: Calendar, format: true },
    { label: 'All Time', value: stats.allTime, icon: DollarSign, format: true },
    { label: 'People Paid', value: stats.peoplePaid, icon: Users, format: false },
  ];

  return (
    <>
      {/* Stat Cards */}
      <FadeRise delay={d(0)}>
        <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-4" staggerMs={0.08}>
          {statCards.map(stat => (
            <StaggerItem key={stat.label}>
              <HoverCard>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                      <stat.icon className="size-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">
                      {stat.format ? formatCurrency(stat.value) : <AnimatedNumber value={stat.value} />}
                    </span>
                  </CardContent>
                </Card>
              </HoverCard>
            </StaggerItem>
          ))}
        </Stagger>
      </FadeRise>

      {/* Monthly Breakdown */}
      <FadeRise delay={d(150)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Monthly Breakdown</CardTitle>
            <CardDescription>Spend aggregated by month.</CardDescription>
          </CardHeader>
          <CardContent>
            {months.length === 0 ? (
              <EmptyState
                icon="DollarSign"
                title="No payments yet"
                description="Monthly spend will appear here."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {months.map(month => (
                  <div key={month.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <span className="text-sm text-foreground">{month.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{formatCurrency(month.total)}</span>
                      <span className="text-xs text-muted-foreground">
                        {month.count} payment{month.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      {/* Recent Payments */}
      <FadeRise delay={d(300)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Recent Payments</CardTitle>
            <CardDescription>Last 10 completed payments.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <EmptyState
                icon="CreditCard"
                title="No payments yet"
                description="Completed payments will appear here."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {recentPayments.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8">
                        <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                          {getInitials(payment.recipient?.display_name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium text-foreground truncate">
                        {payment.recipient?.display_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium text-foreground">{formatCurrency(Number(payment.amount))}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(payment.paid_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>
    </>
  );
}
```

**Step 2: Add payments section to investor page**

Modify `src/app/(investor)/investor/page.tsx` to add a payments section. After the overdue tasks callout (before the closing `</div>`), add:

```tsx
{/* ── Payments ──────────────────────────────────────── */}
<FadeRise delay={delay(TIMING.grid + 200)}>
  <div className="flex flex-col gap-6">
    <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
      <DollarSign className="size-5 text-muted-foreground" />
      Payments
    </h2>
    <PaymentsInvestor
      payments={paidPayments}
      stats={paymentStats}
      delay={TIMING.grid + 250}
    />
  </div>
</FadeRise>
```

This requires adding imports and fetching payment data in the server component. Add to the imports:

```tsx
import { PaymentsInvestor } from '@/components/dashboard/PaymentsInvestor';
import { DollarSign } from 'lucide-react';
```

Add to the `Promise.all` data fetch (after `fetchActivity`):

```ts
supabase.from('payments')
  .select('*, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department)')
  .eq('status', 'paid')
  .order('paid_at', { ascending: false }),
```

Destructure the result and compute stats:

```ts
const paidPayments = paymentsRes.data ?? [];
const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
const thisMonthPayments = paidPayments.filter(p => p.paid_at && p.paid_at >= monthStart);
const paymentStats = {
  thisMonth: thisMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0),
  allTime: paidPayments.reduce((sum, p) => sum + Number(p.amount), 0),
  peoplePaid: new Set(paidPayments.map(p => p.recipient_id)).size,
};
```

**Step 3: Commit**

```bash
git add src/components/dashboard/PaymentsInvestor.tsx src/app/\(investor\)/investor/page.tsx
git commit -m "feat(payments): add investor payments view with monthly breakdown"
```

---

## Task 10: Sidebar Integration + Command Palette

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:87-93` (add Payments nav item)
- Modify: `src/components/dashboard/CommandPalette.tsx:56-62` (add Payments to pages)
- Modify: `src/components/layout/InvestorSidebar.tsx` (add Payments nav item for investors)

**Step 1: Add Payments to admin sidebar**

In `src/components/layout/Sidebar.tsx`, add `DollarSign` to the lucide import (line 62). Then in the `NAV_BASE` array (after the Activity entry at line 92), add:

```ts
{ href: '/payments', label: 'Payments', mobileLabel: 'Pay', icon: DollarSign, tourKey: undefined as undefined },
```

Filter it so only admins see it — in the `NAV` computation (around line 147), add the Payments entry conditionally like the investor link:

```ts
const NAV = [
  ...NAV_BASE
    .filter(item => !(isContractor && item.href === '/activity'))
    .map(item =>
      item.label === '__TASKS__'
        ? { ...item, label: isAdmin ? 'All Tasks' : 'My Tasks', mobileLabel: 'Tasks' as const }
        : item
    ),
  ...(isAdmin ? [
    { href: '/payments', label: 'Payments', mobileLabel: 'Pay' as const, icon: DollarSign, tourKey: undefined as undefined },
    NAV_INVESTOR,
  ] : []),
];
```

**Step 2: Add Payments to Command Palette**

In `src/components/dashboard/CommandPalette.tsx`, add `DollarSign` to the lucide import (line 16). In the `pages` array inside `useMemo` (after the Activity entry around line 60), add:

```ts
...(!isContractor ? [{ id: 'p-payments', label: 'Payments', section: 'Pages' as const, icon: DollarSign, action: () => go('/payments') }] : []),
```

**Step 3: Update `SidebarProps` to pass `isAdmin`**

The Sidebar already receives `isAdmin` prop. No change needed — the Payments link will be conditionally rendered just like the Investor Panel link.

**Step 4: Add Payments to InvestorSidebar**

Check `src/components/layout/InvestorSidebar.tsx` and add a "Payments" entry if it has a nav items array. Since investors see payments data on their main page, this may not be needed — but if the investor sidebar has separate nav, add the link.

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/dashboard/CommandPalette.tsx
git commit -m "feat(payments): add Payments to sidebar nav and command palette"
```

---

## Task 11: Add env vars to render.yaml + devops persona

**Files:**
- Modify: `render.yaml` (add `PAYMENTS_ACCESS_HASH` and `PAYMENTS_JWT_SECRET`)
- Modify: `docs/personas/devops.md` (add new env vars)

**Step 1: Add to render.yaml**

Add under `envVars`:

```yaml
      - key: PAYMENTS_ACCESS_HASH
        sync: false
      - key: PAYMENTS_JWT_SECRET
        sync: false
```

**Step 2: Update devops persona**

Add to the env vars table in `docs/personas/devops.md`:

```
| `PAYMENTS_ACCESS_HASH`         | Render dashboard   | bcrypt hash of payments password       |
| `PAYMENTS_JWT_SECRET`          | Render + .env.local | Secret for signing payment session JWTs |
```

**Step 3: Commit**

```bash
git add render.yaml docs/personas/devops.md
git commit -m "chore: add payment env vars to render.yaml and devops persona"
```

---

## Task 12: Update IA Persona + Schema Docs

**Files:**
- Modify: `docs/personas/ia.md` (add payments tables to schema docs)
- Modify: `docs/supabase-schema.sql` (already done in Task 1, verify)

**Step 1: Update IA persona**

Add to the tables section in `docs/personas/ia.md` after the `docs` table:

```markdown
### 5. payments

| Column       | Type             | Notes                                  |
|--------------|------------------|----------------------------------------|
| id           | uuid (PK)        | Auto-generated                         |
| recipient_id | uuid (FK)        | → profiles.id                          |
| amount       | decimal          | Total payment amount                   |
| currency     | text             | Default 'USD'                          |
| description  | text             | Summary of what payment covers         |
| status       | payment_status   | pending, paid, cancelled               |
| paid_at      | timestamptz      | When marked as paid                    |
| created_by   | uuid (FK)        | → profiles.id (admin who created it)   |
| created_at   | timestamptz      |                                        |

### 6. payment_items

| Column     | Type             | Notes                                  |
|------------|------------------|----------------------------------------|
| id         | uuid (PK)        | Auto-generated                         |
| payment_id | uuid (FK)        | → payments.id (cascade delete)         |
| task_id    | uuid (FK, null)  | → tasks.id (null for custom items)     |
| label      | text             | Description                            |
| amount     | decimal          | Line item amount                       |
```

Add `payment_status` to the enum types table:

```
| payment_status | pending, paid, cancelled                                  |
```

Update the Content Hierarchy to include payments:

```
├── payments       ← recipient_id → profiles, created_by → profiles
│   └── payment_items ← task_id → tasks (optional)
```

**Step 2: Commit**

```bash
git add docs/personas/ia.md
git commit -m "docs: add payment tables to IA persona"
```

---

## Task 13: Verify and Test

**Step 1: Run the dev server**

```bash
npm run dev
```

**Step 2: Test admin flow**

1. Navigate to `/payments`
2. Verify password gate appears
3. Enter the payments password
4. Verify stat cards render (all zeros initially)
5. Verify people list shows team members
6. Click "+ New Payment" → verify dialog opens
7. Select recipient, add line items, verify total calculates
8. Click "Mark as Paid" → verify payment appears in Recent Payments
9. Verify stat cards update

**Step 3: Test investor flow**

1. Log in as investor
2. Navigate to investor panel
3. Verify payments section shows at bottom
4. Verify only paid payments visible, no PayPal emails, no line item details

**Step 4: Test command palette**

1. Press ⌘K
2. Type "payments"
3. Verify "Payments" appears in Pages section
4. Press Enter → navigates to /payments

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during payment tracker testing"
```
