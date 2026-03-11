# External Invoice Requests — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to send invoice request links to external people (non-onboarded), who fill in line items and PayPal email via a token-based page. Submitted invoices feed into the existing payments system as pending requests.

**Architecture:** Extend `external_signing_invites` with `purpose`, `prefilled_items`, `submitted_payment_id`, and `paypal_email` columns. Add `recipient_email` to `payments` and make `recipient_id` nullable. New `/invoice/[token]` page mirrors the external signing flow (verify email → fill form → submit). On submission, creates a `payments` record that appears in PaymentsAdmin. The token URL doubles as a status page.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, TypeScript, Tailwind v4, shadcn/ui, Resend email, bcryptjs

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260310100000_external_invoice.sql`

**Step 1: Write the migration**

```sql
-- Extend external_signing_invites for invoice support
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'signing';
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS prefilled_items jsonb;
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS submitted_payment_id uuid REFERENCES payments(id);
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS paypal_email text;

-- Extend payments for external invoices (no profile)
ALTER TABLE payments ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recipient_email text;

-- Index for looking up invoice invites
CREATE INDEX IF NOT EXISTS idx_external_signing_purpose ON external_signing_invites(purpose) WHERE purpose = 'invoice';
```

**Step 2: Apply migration via Supabase dashboard SQL editor**

**Step 3: Update TypeScript types**

In `src/lib/types.ts`, update the `Payment` type:

```typescript
export type Payment = {
  id: string;
  recipient_id: string | null;  // null for external invoices
  amount: number;
  currency: string;
  description?: string;
  status: PaymentStatus;
  paid_at?: string;
  created_by: string;
  created_at: string;
  recipient_email?: string;  // for external invoices
  recipient?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'department' | 'paypal_email'>;
  items?: PaymentItem[];
};
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260310100000_external_invoice.sql src/lib/types.ts
git commit -m "feat: add external invoice migration and update Payment type"
```

---

### Task 2: Invoice Invite API Route

**Files:**
- Create: `src/app/api/invoice-request/invite/route.ts`

**Context:** Admin-only endpoint to create an invoice request and send the link to the recipient. Mirrors the external signing invite creation but with `purpose: 'invoice'`.

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { sendInvoiceRequestEmail } from '@/lib/email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  let body: {
    recipientEmail: string;
    items?: { label: string; amount: number }[];
    personalNote?: string;
    expiresAt?: string;
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { recipientEmail, items, personalNote, expiresAt } = body;

  if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail.trim())) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  if (items) {
    if (!Array.isArray(items) || items.length > 20) {
      return NextResponse.json({ error: 'Items must be an array (max 20)' }, { status: 400 });
    }
    for (const item of items) {
      if (!item.label?.trim() || typeof item.amount !== 'number' || item.amount <= 0) {
        return NextResponse.json({ error: 'Each item needs a label and positive amount' }, { status: 400 });
      }
    }
  }

  if (personalNote && personalNote.length > 1000) {
    return NextResponse.json({ error: 'Note too long (max 1000 chars)' }, { status: 400 });
  }

  // Default expiry: 30 days
  let expires: Date;
  if (expiresAt) {
    expires = new Date(expiresAt);
    if (isNaN(expires.getTime()) || expires <= new Date()) {
      return NextResponse.json({ error: 'Expiry must be a future date' }, { status: 400 });
    }
  } else {
    expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  // Set to end of day
  expires.setHours(23, 59, 59, 999);

  const token = randomBytes(32).toString('base64url');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hashedCode = await hash(code, 10);

  const admin = getServiceClient();

  const { error: insertError } = await admin.from('external_signing_invites').insert({
    token,
    recipient_email: recipientEmail.trim().toLowerCase(),
    template_type: 'preset',
    template_id: null,
    purpose: 'invoice',
    prefilled_items: items ?? null,
    personal_note: personalNote?.trim() || null,
    expires_at: expires.toISOString(),
    verification_code: hashedCode,
    status: 'pending',
    created_by: user.id,
  } as never);

  if (insertError) {
    console.error('[invoice-request/invite] insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  // Send email (non-blocking)
  sendInvoiceRequestEmail({
    recipientEmail: recipientEmail.trim().toLowerCase(),
    token,
    personalNote: personalNote?.trim() || null,
    expiresAt: expires,
  }).catch(err => console.error('[invoice-request/invite] email error:', err));

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/invoice-request/invite/route.ts
git commit -m "feat: add invoice request invite API route"
```

---

### Task 3: Invoice Token Lookup + Verification API Routes

**Files:**
- Create: `src/app/api/invoice-request/[token]/route.ts`
- Create: `src/app/api/invoice-request/send-code/route.ts`
- Create: `src/app/api/invoice-request/verify/route.ts`

**Context:** These mirror the external signing equivalents but scoped to `purpose: 'invoice'`. They handle token status lookup, sending verification codes, and verifying codes.

**Step 1: Create the token lookup route**

`src/app/api/invoice-request/[token]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = getServiceClient();

  const { data: invite } = await admin
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, prefilled_items, personal_note, submitted_payment_id, purpose')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Auto-expire if past due
  if (invite.status === 'pending' && new Date(invite.expires_at) < new Date()) {
    await admin.from('external_signing_invites').update({ status: 'expired' } as never).eq('id', invite.id);
    return NextResponse.json({ status: 'expired' });
  }

  const email = invite.recipient_email;
  const [local, domain] = email.split('@');
  const maskedEmail = local[0] + '***@' + domain;

  if (invite.status === 'pending') {
    return NextResponse.json({
      status: 'pending',
      maskedEmail,
      personalNote: invite.personal_note,
    });
  }

  if (invite.status === 'verified') {
    return NextResponse.json({
      status: 'verified',
      maskedEmail,
      personalNote: invite.personal_note,
      prefilledItems: invite.prefilled_items,
    });
  }

  // signed = submitted, also handle expired/revoked
  if (invite.status === 'signed' && invite.submitted_payment_id) {
    // Fetch the payment status to show on the status page
    const { data: payment } = await admin
      .from('payments')
      .select('status, amount')
      .eq('id', invite.submitted_payment_id)
      .single();

    return NextResponse.json({
      status: 'submitted',
      paymentStatus: payment?.status ?? 'pending',
      paymentAmount: payment?.amount ?? 0,
    });
  }

  return NextResponse.json({ status: invite.status });
}
```

**Step 2: Create the send-code route**

`src/app/api/invoice-request/send-code/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { hash } from 'bcryptjs';
import { sendVerificationCodeEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  let body: { token: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = getServiceClient();
  const { data: invite } = await admin
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, verification_attempts, purpose')
    .eq('token', body.token)
    .eq('purpose', 'invoice')
    .single();

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 400 });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hashedCode = await hash(code, 10);

  await admin.from('external_signing_invites').update({
    verification_code: hashedCode,
    verification_attempts: 0,
  } as never).eq('id', invite.id);

  await sendVerificationCodeEmail({ recipientEmail: invite.recipient_email, code });

  return NextResponse.json({ success: true });
}
```

**Step 3: Create the verify route**

`src/app/api/invoice-request/verify/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { compare } from 'bcryptjs';

export async function POST(request: NextRequest) {
  let body: { token: string; code: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = getServiceClient();
  const { data: invite } = await admin
    .from('external_signing_invites')
    .select('id, status, expires_at, verification_code, verification_attempts, prefilled_items, personal_note, purpose')
    .eq('token', body.token)
    .eq('purpose', 'invoice')
    .single();

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 400 });
  if (invite.verification_attempts >= 3) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });

  // Increment attempts
  await admin.from('external_signing_invites').update({
    verification_attempts: invite.verification_attempts + 1,
  } as never).eq('id', invite.id);

  const valid = await compare(body.code, invite.verification_code);
  if (!valid) {
    const remaining = 2 - invite.verification_attempts;
    return NextResponse.json({
      error: remaining > 0 ? `Invalid code. ${remaining} attempt(s) remaining.` : 'Too many attempts.',
    }, { status: 400 });
  }

  // Mark verified
  await admin.from('external_signing_invites').update({
    status: 'verified',
    verified_at: new Date().toISOString(),
  } as never).eq('id', invite.id);

  return NextResponse.json({
    status: 'verified',
    prefilledItems: invite.prefilled_items,
    personalNote: invite.personal_note,
  });
}
```

**Step 4: Commit**

```bash
git add src/app/api/invoice-request/[token]/route.ts src/app/api/invoice-request/send-code/route.ts src/app/api/invoice-request/verify/route.ts
git commit -m "feat: add invoice token lookup, send-code, and verify API routes"
```

---

### Task 4: Invoice Submit API Route

**Files:**
- Create: `src/app/api/invoice-request/submit/route.ts`

**Context:** Called when the recipient submits their invoice. Creates a `payments` record with `status: 'pending'` and links it to the invite.

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limit: 5 submits per IP per hour
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // Prune expired
  for (const [key, entry] of ipHits.entries()) {
    if (now > entry.resetAt) ipHits.delete(key);
  }
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: {
    token: string;
    items: { label: string; amount: number }[];
    paypalEmail: string;
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token, items, paypalEmail } = body;

  // Validate items
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return NextResponse.json({ error: 'Between 1 and 20 items required' }, { status: 400 });
  }

  let total = 0;
  for (const item of items) {
    if (!item.label?.trim() || typeof item.amount !== 'number' || item.amount <= 0) {
      return NextResponse.json({ error: 'Each item needs a label and positive amount' }, { status: 400 });
    }
    total += item.amount;
  }

  if (total < 0.01 || total > 50000) {
    return NextResponse.json({ error: 'Total must be between $0.01 and $50,000' }, { status: 400 });
  }

  if (!paypalEmail || !EMAIL_REGEX.test(paypalEmail.trim())) {
    return NextResponse.json({ error: 'Valid PayPal email required' }, { status: 400 });
  }

  const admin = getServiceClient();

  // Fetch invite
  const { data: invite } = await admin
    .from('external_signing_invites')
    .select('id, status, expires_at, recipient_email, created_by, purpose')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single();

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.status === 'signed') return NextResponse.json({ error: 'Already submitted' }, { status: 409 });
  if (invite.status !== 'verified') return NextResponse.json({ error: 'Not verified' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 400 });

  // Create payment record
  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      recipient_id: null,
      recipient_email: invite.recipient_email,
      amount: total,
      currency: 'USD',
      description: `External invoice from ${invite.recipient_email}`,
      status: 'pending',
      created_by: invite.created_by,
    } as never)
    .select('id')
    .single();

  if (paymentError || !payment) {
    console.error('[invoice-request/submit] payment insert error:', paymentError);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }

  // Create payment items
  const paymentItems = items.map(item => ({
    payment_id: payment.id,
    label: item.label.trim(),
    amount: item.amount,
  }));

  const { error: itemsError } = await admin
    .from('payment_items')
    .insert(paymentItems as never[]);

  if (itemsError) {
    console.error('[invoice-request/submit] items insert error:', itemsError);
    // Clean up payment
    await admin.from('payments').delete().eq('id', payment.id);
    return NextResponse.json({ error: 'Failed to create line items' }, { status: 500 });
  }

  // Update invite
  await admin.from('external_signing_invites').update({
    status: 'signed',
    paypal_email: paypalEmail.trim().toLowerCase(),
    submitted_payment_id: payment.id,
    signed_at: new Date().toISOString(),
  } as never).eq('id', invite.id);

  // Notify admins
  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('is_admin', true);

  if (admins && admins.length > 0) {
    const notifications = admins.map(a => ({
      user_id: a.id,
      kind: 'payment_request',
      title: 'External invoice submitted',
      body: `${invite.recipient_email} submitted an invoice for $${total.toFixed(2)}`,
      data: { payment_id: payment.id },
    }));

    await admin.from('notifications').insert(notifications as never[]).catch(err =>
      console.error('[invoice-request/submit] notification error:', err)
    );
  }

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/invoice-request/submit/route.ts
git commit -m "feat: add invoice submit API route — creates payment record"
```

---

### Task 5: Invoice Email Template

**Files:**
- Modify: `src/lib/email.ts`

**Context:** Add `sendInvoiceRequestEmail` function that sends the invoice request link to the recipient. Follows the same pattern as `sendExternalInviteEmail` but with invoice-specific copy.

**Step 1: Add the email function**

After the existing `sendExternalInviteEmail` function, add:

```typescript
interface SendInvoiceRequestEmailParams {
  recipientEmail: string;
  token: string;
  personalNote: string | null;
  expiresAt: Date;
}

export async function sendInvoiceRequestEmail({
  recipientEmail,
  token,
  personalNote,
  expiresAt,
}: SendInvoiceRequestEmailParams): Promise<void> {
  const invoiceUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invoice/${token}`;
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const noteBlock = personalNote
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
        <tr>
          <td width="28" valign="top" style="padding-top:2px;font-size:24px;color:#ccc;font-family:Georgia,serif;">&ldquo;</td>
          <td style="padding:0 0 0 4px;">
            <p style="margin:0 0 6px;font-size:15px;color:#333;line-height:1.5;font-style:italic;">${esc(personalNote)}</p>
            <p style="margin:0;font-size:12px;color:#aaa;">&mdash; the sender</p>
          </td>
        </tr>
      </table>`
    : '';

  const r = getResend();
  await r.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: 'Invoice Request — SEEKO Studio',
    html: shell(`
      ${brandHeader()}
      ${divider()}
      <tr><td style="padding:32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111;">Invoice Request</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">You've been asked to submit an invoice. Click below to fill in your line items and payment details.</p>
        ${noteBlock}
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center">
            <a href="${invoiceUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Submit Invoice</a>
          </td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#999;line-height:1.6;text-align:center;">This link expires on ${expiresFormatted}</p>
      </td></tr>
      ${divider()}
      ${footer("If you didn't expect this email, you can safely ignore it.")}
    `),
  });
}
```

**Step 2: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: add sendInvoiceRequestEmail template"
```

---

### Task 6: Invoice Page — Server + Client Components

**Files:**
- Create: `src/app/invoice/[token]/page.tsx`
- Create: `src/app/invoice/[token]/client.tsx`

**Context:** The invoice page follows the same pattern as `/sign/[token]`. Server component fetches initial data, client component handles the state machine: verification → invoice form → success/status.

**Step 1: Create the server component**

`src/app/invoice/[token]/page.tsx`:

```tsx
import { InvoicePageClient } from './client';

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let initialData: Record<string, unknown> | null = null;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/invoice-request/${token}`, { cache: 'no-store' });
    if (res.ok) {
      initialData = await res.json();
    }
  } catch {
    // Will show error state
  }

  if (!initialData) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This invoice link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return <InvoicePageClient token={token} initialData={initialData} />;
}
```

**Step 2: Create the client component**

`src/app/invoice/[token]/client.tsx`:

This is the main client component. It handles:
- Terminal states (submitted/expired/revoked)
- Verification phase (reuses `VerificationForm` from external signing)
- Invoice form phase (line items editor + PayPal email)
- Success screen
- Status page (when revisiting after submission)

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { FileText, CheckCircle2, Clock, XCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { toast } from 'sonner';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface InvoicePageClientProps {
  token: string;
  initialData: Record<string, unknown>;
}

export function InvoicePageClient({ token, initialData }: InvoicePageClientProps) {
  const status = initialData.status as string;

  // Terminal states
  if (status === 'expired') return <StatusPage icon={<Clock className="size-7 text-muted-foreground" />} title="Link Expired" description="This invoice request link has expired." />;
  if (status === 'revoked') return <StatusPage icon={<XCircle className="size-7 text-destructive" />} title="Link Revoked" description="This invoice request has been revoked." />;

  // Already submitted — show status page
  if (status === 'submitted') {
    const paymentStatus = initialData.paymentStatus as string;
    const paymentAmount = initialData.paymentAmount as number;
    if (paymentStatus === 'paid') {
      return <StatusPage icon={<CheckCircle2 className="size-7 text-seeko-accent" />} title="Invoice Approved" description={`Your invoice for ${fmt(paymentAmount)} has been approved.`} />;
    }
    if (paymentStatus === 'cancelled') {
      return <StatusPage icon={<XCircle className="size-7 text-destructive" />} title="Invoice Not Approved" description={`Your invoice for ${fmt(paymentAmount)} was not approved.`} />;
    }
    return <StatusPage icon={<Clock className="size-7 text-amber-400" />} title="Invoice Submitted" description={`Your invoice for ${fmt(paymentAmount)} has been submitted and is under review.`} />;
  }

  // Active states: pending (needs verification) or verified (show form)
  return <InvoiceFlow token={token} initialData={initialData} />;
}

function InvoiceFlow({ token, initialData }: { token: string; initialData: Record<string, unknown> }) {
  const [phase, setPhase] = useState<'verify' | 'form' | 'success'>(
    initialData.status === 'verified' ? 'form' : 'verify'
  );
  const [prefilledItems, setPrefilledItems] = useState<{ label: string; amount: number }[]>(
    (initialData.prefilledItems as { label: string; amount: number }[] | null) ?? []
  );
  const maskedEmail = initialData.maskedEmail as string;
  const personalNote = initialData.personalNote as string | null;

  function handleVerified(data: Record<string, unknown>) {
    if (data.prefilledItems) {
      setPrefilledItems(data.prefilledItems as { label: string; amount: number }[]);
    }
    setPhase('form');
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="w-full max-w-lg"
      >
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex size-10 items-center justify-center rounded-xl bg-seeko-accent/10">
              <FileText className="size-5 text-seeko-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Invoice Request</h1>
              <p className="text-xs text-muted-foreground">Submit your invoice for review</p>
            </div>
          </div>

          {personalNote && phase !== 'success' && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 mb-6 text-sm text-muted-foreground italic">
              &ldquo;{personalNote}&rdquo;
            </div>
          )}

          {phase === 'verify' && (
            <VerificationForm
              token={token}
              maskedEmail={maskedEmail}
              sendCodeEndpoint="/api/invoice-request/send-code"
              verifyEndpoint="/api/invoice-request/verify"
              onVerified={handleVerified}
            />
          )}

          {phase === 'form' && (
            <InvoiceForm
              token={token}
              prefilledItems={prefilledItems}
              onSuccess={() => setPhase('success')}
            />
          )}

          {phase === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING}
              className="flex flex-col items-center gap-4 py-6 text-center"
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-seeko-accent/10">
                <CheckCircle2 className="size-7 text-seeko-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Invoice Submitted</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your invoice has been submitted for review. You can revisit this link to check the status.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function InvoiceForm({
  token,
  prefilledItems,
  onSuccess,
}: {
  token: string;
  prefilledItems: { label: string; amount: number }[];
  onSuccess: () => void;
}) {
  const [items, setItems] = useState<{ label: string; amount: string }[]>(
    prefilledItems.length > 0
      ? prefilledItems.map(i => ({ label: i.label, amount: String(i.amount) }))
      : [{ label: '', amount: '' }]
  );
  const [paypalEmail, setPaypalEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  const canSubmit = items.every(i => i.label.trim() && parseFloat(i.amount) > 0) && paypalEmail.trim() && total > 0;

  function addItem() {
    setItems([...items, { label: '', amount: '' }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: 'label' | 'amount', value: string) {
    setItems(items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/invoice-request/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          items: items.map(i => ({ label: i.label.trim(), amount: parseFloat(i.amount) })),
          paypalEmail: paypalEmail.trim(),
        }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to submit invoice');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.1 }}
      className="space-y-5"
    >
      {/* Line items */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-muted-foreground">Line Items</label>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Description"
              value={item.label}
              onChange={e => updateItem(i, 'label', e.target.value)}
              className="flex-1"
            />
            <div className="relative w-28 shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                placeholder="0.00"
                value={item.amount}
                onChange={e => updateItem(i, 'amount', e.target.value)}
                className="pl-7"
                min="0"
                step="0.01"
              />
            </div>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="shrink-0 p-1.5 text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="size-3.5" />
          Add item
        </button>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Total</span>
        <span className="text-lg font-semibold text-seeko-accent tabular-nums">{fmt(total)}</span>
      </div>

      {/* PayPal email */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">PayPal Email</label>
        <Input
          type="email"
          placeholder="your@paypal.email"
          value={paypalEmail}
          onChange={e => setPaypalEmail(e.target.value)}
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="w-full bg-seeko-accent text-background hover:bg-seeko-accent/90 font-semibold"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Submitting...
          </>
        ) : (
          'Submit Invoice'
        )}
      </Button>
    </motion.div>
  );
}

function StatusPage({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="flex flex-col items-center gap-4 text-center max-w-sm"
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </motion.div>
    </div>
  );
}
```

**Step 3: Check if `VerificationForm` accepts custom endpoints**

The existing `VerificationForm` component (at `src/components/external-signing/VerificationForm.tsx`) may have hardcoded endpoints for `/api/external-signing/send-code` and `/api/external-signing/verify`. If so, refactor it to accept `sendCodeEndpoint` and `verifyEndpoint` props. If it already does, no change needed.

Read the component to check. If endpoints are hardcoded, update the props interface to accept optional `sendCodeEndpoint` and `verifyEndpoint`, defaulting to the existing external-signing endpoints.

**Step 4: Commit**

```bash
git add src/app/invoice/[token]/page.tsx src/app/invoice/[token]/client.tsx
# Also add VerificationForm if modified
git commit -m "feat: add invoice page with verification, form, and status views"
```

---

### Task 7: Update Proxy — Allow Invoice Routes

**Files:**
- Modify: `src/proxy.ts`

**Context:** The `/invoice/[token]` page and `/api/invoice-request/*` routes must be accessible without authentication (like external signing).

**Step 1: Update the public route check**

In `src/proxy.ts`, find the `isExternalSigningRoute` line and add invoice routes:

```typescript
const isExternalSigningRoute = pathname.startsWith('/sign') || pathname.startsWith('/api/external-signing') || pathname.startsWith('/api/geocode') || pathname.startsWith('/invoice') || pathname.startsWith('/api/invoice-request');
```

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: allow unauthenticated access to invoice routes in proxy"
```

---

### Task 8: Admin UI — Send Invoice Request Form

**Files:**
- Create: `src/components/dashboard/InvoiceRequestForm.tsx`
- Modify: `src/components/dashboard/PaymentsAdmin.tsx`

**Context:** Add a "Request Invoice" button to PaymentsAdmin that opens a dialog for admins to send invoice request links. The form collects recipient email, optional pre-filled items, personal note, and expiration.

**Step 1: Create the InvoiceRequestForm component**

`src/components/dashboard/InvoiceRequestForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus, Trash2, Loader2, CheckCircle2, Send } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface InvoiceRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceRequestForm({ open, onOpenChange }: InvoiceRequestFormProps) {
  const [email, setEmail] = useState('');
  const [items, setItems] = useState<{ label: string; amount: string }[]>([]);
  const [note, setNote] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const total = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  function reset() {
    setEmail('');
    setItems([]);
    setNote('');
    setExpiry('30');
    setSuccess(false);
  }

  function handleClose(v: boolean) {
    if (!v) {
      onOpenChange(false);
      setTimeout(reset, 200);
    }
  }

  function addItem() {
    setItems([...items, { label: '', amount: '' }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: 'label' | 'amount', value: string) {
    setItems(items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function handleSubmit() {
    if (!email.trim()) return;
    setSending(true);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(expiry));

    try {
      const res = await fetch('/api/invoice-request/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email.trim(),
          items: items.length > 0
            ? items.filter(i => i.label.trim() && parseFloat(i.amount) > 0).map(i => ({
                label: i.label.trim(),
                amount: parseFloat(i.amount),
              }))
            : undefined,
          personalNote: note.trim() || undefined,
          expiresAt: expiresAt.toISOString(),
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to send');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          Request Invoice
        </DialogTitle>
      </DialogHeader>

      {success ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
          className="flex flex-col items-center gap-4 py-6 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-seeko-accent/10">
            <CheckCircle2 className="size-7 text-seeko-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Invoice request sent!</p>
            <p className="mt-1 text-xs text-muted-foreground">A link has been sent to {email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleClose(false)}>Done</Button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground -mt-2">Send a link for someone to submit an invoice.</p>

          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient Email</Label>
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Pre-filled items (optional) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pre-filled Items <span className="text-muted-foreground/50">(optional)</span></Label>
              {items.length === 0 && (
                <button type="button" onClick={addItem} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                  <Plus className="size-3" /> Add
                </button>
              )}
            </div>
            <AnimatePresence>
              {items.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 overflow-hidden"
                >
                  <Input
                    placeholder="Description"
                    value={item.label}
                    onChange={e => updateItem(i, 'label', e.target.value)}
                    className="flex-1"
                  />
                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={item.amount}
                      onChange={e => updateItem(i, 'amount', e.target.value)}
                      className="pl-6"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <button type="button" onClick={() => removeItem(i)} className="shrink-0 p-1 text-muted-foreground/40 hover:text-destructive transition-colors">
                    <Trash2 className="size-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {items.length > 0 && (
              <button type="button" onClick={addItem} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <Plus className="size-3" /> Add item
              </button>
            )}
            {items.length > 0 && total > 0 && (
              <div className="text-right text-xs text-muted-foreground">
                Pre-filled total: <span className="font-medium text-foreground">{fmt(total)}</span>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs">Personal Note <span className="text-muted-foreground/50">(optional)</span></Label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Any context for the recipient..."
              rows={2}
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label className="text-xs">Link Expires</Label>
            <Select value={expiry} onChange={e => setExpiry(e.target.value)}>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </Select>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={sending || !email.trim()}
            className="w-full bg-seeko-accent text-background hover:bg-seeko-accent/90 font-semibold gap-2"
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
      )}
    </Dialog>
  );
}
```

**Step 2: Add the button to PaymentsAdmin**

In `src/components/dashboard/PaymentsAdmin.tsx`:

1. Import the component: `import { InvoiceRequestForm } from './InvoiceRequestForm';`
2. Add state: `const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);`
3. In the hero section (near the existing "New Payment" button), add a second button:

```tsx
<Button
  variant="outline"
  size="sm"
  className="gap-1.5"
  onClick={() => setInvoiceFormOpen(true)}
>
  <FileText className="size-3.5" />
  Request Invoice
</Button>
```

4. Render the dialog at the bottom of the component:

```tsx
<InvoiceRequestForm open={invoiceFormOpen} onOpenChange={setInvoiceFormOpen} />
```

5. Import `FileText` from lucide-react if not already imported.

**Step 3: Update PendingRequestRow to handle external invoices**

The `pendingRequests` filter (line 143) currently checks `p.created_by === p.recipient_id` to identify member-submitted requests. External invoices have `recipient_id: null`. Update the filter:

```typescript
const pendingRequests = payments.filter(p =>
  p.status === 'pending' && (p.created_by === p.recipient_id || p.recipient_id === null)
);
```

In `PendingRequestRow`, update the display to handle missing `recipient`:

```tsx
// Line ~576: replace payment.recipient?.display_name with:
<p className="text-sm font-medium text-foreground truncate">
  {payment.recipient?.display_name ?? payment.recipient_email ?? 'Unknown'}
</p>

// Line ~577-593: for PayPal email, also check the invite's paypal_email
// For now, external invoices won't have recipient.paypal_email — we need to fetch it from the invite
// Simplest: the GET /api/payments endpoint should return recipient_email on the payment object
```

**Step 4: Update the GET /api/payments route to include recipient_email**

In the GET handler, add `recipient_email` to the select query so the admin UI can display it for external invoices.

**Step 5: Commit**

```bash
git add src/components/dashboard/InvoiceRequestForm.tsx src/components/dashboard/PaymentsAdmin.tsx src/app/api/payments/route.ts
git commit -m "feat: add invoice request form to admin UI and update pending requests display"
```

---

### Task 9: Manual Testing Checklist

Test the following scenarios end-to-end:

**Admin sends invoice request with pre-filled items:**
1. Admin opens PaymentsAdmin → clicks "Request Invoice"
2. Enters email, adds 2 pre-filled items, adds note → sends
3. Recipient receives email with "Submit Invoice" link
4. Opens `/invoice/[token]` → sees verification form
5. Sends code → enters 6-digit code → sees invoice form
6. Pre-filled items appear (editable) → adds one more item → enters PayPal email
7. Submits → sees success screen
8. Admin sees new pending request in PaymentsAdmin → Accept/Deny works

**Admin sends invoice request without pre-filled items:**
1. Admin sends with just email (no items, no note)
2. Recipient verifies → sees empty form → adds items → submits

**Recipient revisits link after submission:**
1. Open `/invoice/[token]` → sees "Invoice Submitted" (pending)
2. Admin accepts → revisit → sees "Invoice Approved"
3. Admin denies → revisit → sees "Invoice Not Approved"

**Edge cases:**
- Expired link → shows expired state
- Invalid token → shows "Link not found"
- Rate limit on submit (5/hour/IP)
- Verification code: 3 attempt max
