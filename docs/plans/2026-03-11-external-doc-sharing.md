# External Document Sharing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to share specific docs/decks with external people via email-verified links with single-session protection.

**Architecture:** Reuse `external_signing_invites` table with `purpose: 'doc_share'`. Same verification flow (send code → verify → view). Session token in httpOnly cookie ensures single-device access. Doc content fetched server-side only after session validation.

**Tech Stack:** Next.js 16 App Router, Supabase, bcryptjs, Resend email, motion/react

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260311100000_external_doc_sharing.sql`

**Step 1: Write the migration**

```sql
-- Add doc sharing columns to external_signing_invites
ALTER TABLE external_signing_invites
  ADD COLUMN IF NOT EXISTS shared_doc_id uuid REFERENCES docs(id),
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS session_ip text,
  ADD COLUMN IF NOT EXISTS session_user_agent text,
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;
```

**Step 2: Apply the migration**

Run via Supabase MCP or dashboard SQL editor.

**Step 3: Update schema docs**

Add the new columns to `docs/supabase-schema.sql` under the `external_signing_invites` table section.

**Step 4: Commit**

```bash
git add supabase/migrations/20260311100000_external_doc_sharing.sql docs/supabase-schema.sql
git commit -m "feat: add doc sharing columns to external_signing_invites"
```

---

### Task 2: Email Template

**Files:**
- Modify: `src/lib/email.ts`

**Step 1: Add the email function**

Add after the existing `sendInvoiceRequestEmail` function:

```typescript
export interface SendDocShareEmailParams {
  recipientEmail: string;
  token: string;
  docTitle: string;
  personalNote?: string | null;
  expiresAt: Date;
}

export async function sendDocShareEmail({
  recipientEmail,
  token,
  docTitle,
  personalNote,
  expiresAt,
}: SendDocShareEmailParams): Promise<void> {
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/shared/${token}`;
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
    subject: `Shared Document — ${docTitle}`,
    html: shell(`
      ${brandHeader()}
      ${divider()}
      <tr><td style="padding:32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111;">Document Shared With You</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">You've been given access to <strong>${esc(docTitle)}</strong>. Click below to verify your identity and view the document.</p>
        ${noteBlock}
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td align="center">
            <a href="${shareUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View Document</a>
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
git commit -m "feat: add sendDocShareEmail template"
```

---

### Task 3: API Routes — invite, send-code, verify, view

**Files:**
- Create: `src/app/api/doc-share/invite/route.ts`
- Create: `src/app/api/doc-share/send-code/route.ts`
- Create: `src/app/api/doc-share/verify/route.ts`
- Create: `src/app/api/doc-share/view/route.ts`
- Create: `src/app/api/doc-share/[token]/route.ts`

**Step 1: Create invite route**

`src/app/api/doc-share/invite/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { sendDocShareEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  // 1. Auth — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. Validate body
  const body = await request.json();
  const { recipientEmail, docId, personalNote, expiresAt } = body;

  if (!recipientEmail || typeof recipientEmail !== 'string' || recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  if (!docId || typeof docId !== 'string') {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  }

  if (personalNote && typeof personalNote === 'string' && personalNote.length > 1000) {
    return NextResponse.json({ error: 'Personal note must be under 1000 characters' }, { status: 400 });
  }

  // 3. Verify doc exists
  const service = getServiceClient();
  const { data: doc } = await service.from('docs').select('id, title').eq('id', docId).single();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // 4. Expiry — default 30 days, set to end of day
  let expiresDate: Date;
  if (expiresAt) {
    expiresDate = new Date(expiresAt);
  } else {
    expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + 30);
  }
  if (expiresDate.getHours() === 0 && expiresDate.getMinutes() === 0) {
    expiresDate.setHours(23, 59, 59, 999);
  }
  if (expiresDate <= new Date()) {
    return NextResponse.json({ error: 'Expiry must be in the future' }, { status: 400 });
  }

  // 5. Generate token and verification code
  const token = randomBytes(32).toString('base64url');
  const verificationCode = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(verificationCode, 10);

  // 6. Insert invite
  const { error: insertError } = await service
    .from('external_signing_invites')
    .insert({
      token,
      recipient_email: recipientEmail,
      template_type: 'custom',
      purpose: 'doc_share',
      shared_doc_id: docId,
      personal_note: personalNote || null,
      expires_at: expiresDate.toISOString(),
      verification_code: hashedCode,
      status: 'pending',
      created_by: user.id,
    } as never);

  if (insertError) {
    console.error('Failed to create doc share invite:', insertError);
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
  }

  // 7. Send email (non-blocking)
  sendDocShareEmail({
    recipientEmail,
    token,
    docTitle: doc.title,
    personalNote: personalNote || null,
    expiresAt: expiresDate,
  }).catch((err) => console.error('[doc-share/invite] Failed to send email:', err));

  return NextResponse.json({ success: true });
}
```

**Step 2: Create token lookup route**

`src/app/api/doc-share/[token]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const service = getServiceClient();

  const { data: invite } = await (service
    .from('external_signing_invites') as any)
    .select('id, recipient_email, status, expires_at, shared_doc_id')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await (service.from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return NextResponse.json({ status: 'expired' });
  }

  if (invite.status === 'expired' || invite.status === 'revoked') {
    return NextResponse.json({ status: invite.status });
  }

  // Get doc title
  const { data: doc } = await service.from('docs').select('title, type').eq('id', invite.shared_doc_id).single();

  // Mask email
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  return NextResponse.json({
    status: invite.status,
    maskedEmail,
    docTitle: doc?.title || 'Document',
    docType: doc?.type || 'doc',
    expiresAt: invite.expires_at,
  });
}
```

**Step 3: Create send-code route**

`src/app/api/doc-share/send-code/route.ts` — same pattern as `/api/external-signing/send-code/route.ts` but filtering by `purpose: 'doc_share'`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendVerificationCodeEmail } from '@/lib/email';
import type { ExternalSigningInvite } from '@/lib/types';

const RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
const tokenHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(token: string): boolean {
  const now = Date.now();
  if (tokenHits.size > 100) {
    for (const [key, entry] of tokenHits) { if (now > entry.resetAt) tokenHits.delete(key); }
  }
  const entry = tokenHits.get(token);
  if (!entry || now > entry.resetAt) {
    tokenHits.set(token, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  if (isRateLimited(token)) {
    return NextResponse.json({ error: 'Too many code requests. Try again later.' }, { status: 429 });
  }

  const service = getServiceClient();
  const { data: invite } = await (service
    .from('external_signing_invites') as any)
    .select('id, recipient_email, status, expires_at')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single() as { data: ExternalSigningInvite | null };

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: 'Not available' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Link has expired' }, { status: 400 });
  }

  const { randomInt } = await import('crypto');
  const code = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(code, 10);

  await (service.from('external_signing_invites') as any)
    .update({ verification_code: hashedCode, verification_attempts: 0 })
    .eq('id', invite.id);

  await sendVerificationCodeEmail({ recipientEmail: invite.recipient_email, code });

  return NextResponse.json({ success: true });
}
```

**Step 4: Create verify route (with session token)**

`src/app/api/doc-share/verify/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const { token, code } = await request.json();
  if (!token || !code) return NextResponse.json({ error: 'Token and code required' }, { status: 400 });

  const service = getServiceClient();

  // Atomic increment via RPC (with fallback)
  let invite: any = null;
  try {
    const { data, error } = await (service as any).rpc('increment_verification_attempt', {
      p_token: token,
      p_purpose: 'doc_share',
      p_max_attempts: MAX_ATTEMPTS,
    });
    if (!error && data?.length) invite = data[0];
  } catch { /* fallback below */ }

  // Non-atomic fallback
  if (!invite) {
    const { data } = await (service.from('external_signing_invites') as any)
      .select('*')
      .eq('token', token)
      .eq('purpose', 'doc_share')
      .eq('status', 'pending')
      .single();

    if (!data) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 400 });
    if (data.verification_attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
    }

    await (service.from('external_signing_invites') as any)
      .update({ verification_attempts: data.verification_attempts + 1 })
      .eq('id', data.id);

    invite = { ...data, verification_attempts: data.verification_attempts + 1 };
  }

  if (!invite) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 400 });

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Link has expired' }, { status: 400 });
  }

  // Verify code
  const match = await bcrypt.compare(code, invite.verification_code);
  if (!match) {
    const remaining = MAX_ATTEMPTS - invite.verification_attempts;
    return NextResponse.json({ error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` }, { status: 400 });
  }

  // Generate session token
  const sessionToken = randomBytes(32).toString('base64url');
  const clientIp = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  await (service.from('external_signing_invites') as any)
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
      session_token: sessionToken,
      session_ip: clientIp,
      session_user_agent: userAgent,
      session_started_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  // Set session cookie
  const response = NextResponse.json({ success: true });
  const expiresAt = new Date(invite.expires_at);
  response.cookies.set('doc_share_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });

  return response;
}
```

**Step 5: Create view route (session-protected content delivery)**

`src/app/api/doc-share/view/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const sessionCookie = request.cookies.get('doc_share_session')?.value;
  if (!sessionCookie) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const service = getServiceClient();

  const { data: invite } = await (service.from('external_signing_invites') as any)
    .select('id, status, expires_at, shared_doc_id, session_token')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single();

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Validate session
  if (invite.session_token !== sessionCookie) {
    return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  }

  if (invite.status !== 'verified') {
    return NextResponse.json({ error: 'Not verified' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Expired' }, { status: 400 });
  }

  // Fetch doc content
  const { data: doc } = await service
    .from('docs')
    .select('id, title, content, type, slides')
    .eq('id', invite.shared_doc_id)
    .single();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // Increment view count
  await (service.from('external_signing_invites') as any)
    .update({ view_count: (invite.view_count || 0) + 1 })
    .eq('id', invite.id);

  return NextResponse.json({
    title: doc.title,
    content: doc.content,
    type: doc.type || 'doc',
    slides: doc.slides || null,
  });
}
```

**Step 6: Commit**

```bash
git add src/app/api/doc-share/
git commit -m "feat: add doc-share API routes — invite, send-code, verify, view, token lookup"
```

---

### Task 4: API Routes — list, revoke, resend

**Files:**
- Create: `src/app/api/doc-share/list/route.ts`
- Create: `src/app/api/doc-share/revoke/route.ts`
- Create: `src/app/api/doc-share/resend/route.ts`

**Step 1: Create list route**

`src/app/api/doc-share/list/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = getServiceClient();
  const { data, error } = await (service.from('external_signing_invites') as any)
    .select('id, recipient_email, status, shared_doc_id, view_count, expires_at, created_at')
    .eq('purpose', 'doc_share')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[doc-share/list] query failed:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }

  // Enrich with doc titles
  const docIds = [...new Set((data ?? []).map((d: any) => d.shared_doc_id).filter(Boolean))];
  let docTitleMap: Record<string, { title: string; type: string }> = {};
  if (docIds.length > 0) {
    const { data: docs } = await service.from('docs').select('id, title, type').in('id', docIds);
    if (docs) {
      docTitleMap = Object.fromEntries(docs.map((d: any) => [d.id, { title: d.title, type: d.type }]));
    }
  }

  const enriched = (data ?? []).map((inv: any) => ({
    ...inv,
    doc_title: docTitleMap[inv.shared_doc_id]?.title || 'Unknown',
    doc_type: docTitleMap[inv.shared_doc_id]?.type || 'doc',
  }));

  return NextResponse.json(enriched);
}
```

**Step 2: Create revoke route**

`src/app/api/doc-share/revoke/route.ts` — same pattern as `/api/invoice-request/revoke/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { invite_id } = await request.json();
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });

  const service = getServiceClient();
  await (service.from('external_signing_invites') as any)
    .update({ status: 'revoked', session_token: null })
    .eq('id', invite_id)
    .eq('purpose', 'doc_share');

  return NextResponse.json({ success: true });
}
```

**Step 3: Create resend route**

`src/app/api/doc-share/resend/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendDocShareEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { invite_id } = await request.json();
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });

  const service = getServiceClient();
  const { data: invite } = await (service.from('external_signing_invites') as any)
    .select('id, token, status, expires_at, recipient_email, shared_doc_id, personal_note')
    .eq('id', invite_id)
    .eq('purpose', 'doc_share')
    .single();

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.status === 'revoked') return NextResponse.json({ error: 'Revoked' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Expired — create a new share' }, { status: 400 });

  // Generate new code, reset status
  const { randomInt } = await import('crypto');
  const code = String(randomInt(100000, 1000000));
  const hashedCode = await bcrypt.hash(code, 10);

  await (service.from('external_signing_invites') as any)
    .update({ verification_code: hashedCode, verification_attempts: 0, status: 'pending', verified_at: null, session_token: null })
    .eq('id', invite_id);

  // Get doc title
  const { data: doc } = await service.from('docs').select('title').eq('id', invite.shared_doc_id).single();

  await sendDocShareEmail({
    recipientEmail: invite.recipient_email,
    token: invite.token,
    docTitle: doc?.title || 'Document',
    personalNote: invite.personal_note,
    expiresAt: new Date(invite.expires_at),
  });

  return NextResponse.json({ success: true });
}
```

**Step 4: Commit**

```bash
git add src/app/api/doc-share/list/ src/app/api/doc-share/revoke/ src/app/api/doc-share/resend/
git commit -m "feat: add doc-share list, revoke, and resend API routes"
```

---

### Task 5: Proxy — Allow Public Access to Shared Routes

**Files:**
- Modify: `src/proxy.ts`

**Step 1: Add shared routes to public exclusion**

In `src/proxy.ts`, find the line that defines `isExternalSigningRoute` and add `/shared` and `/api/doc-share`:

```typescript
// Before:
const isExternalSigningRoute = pathname.startsWith('/sign') || pathname.startsWith('/api/external-signing') || pathname.startsWith('/api/geocode') || pathname.startsWith('/invoice') || pathname.startsWith('/api/invoice-request');

// After:
const isExternalSigningRoute = pathname.startsWith('/sign') || pathname.startsWith('/api/external-signing') || pathname.startsWith('/api/geocode') || pathname.startsWith('/invoice') || pathname.startsWith('/api/invoice-request') || pathname.startsWith('/shared') || pathname.startsWith('/api/doc-share');
```

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: allow unauthenticated access to /shared and /api/doc-share routes"
```

---

### Task 6: Shared Document Page — Server + Client Components

**Files:**
- Create: `src/app/shared/[token]/page.tsx`
- Create: `src/app/shared/[token]/client.tsx`

**Step 1: Create server component**

`src/app/shared/[token]/page.tsx`:

```typescript
import type { Metadata } from 'next';
import { getServiceClient } from '@/lib/supabase/service';
import { SharedDocClient } from './client';

export const metadata: Metadata = {
  referrer: 'no-referrer',
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharedDocPage({ params }: Props) {
  const { token } = await params;
  const service = getServiceClient();

  const { data: invite } = await (service.from('external_signing_invites') as any)
    .select('id, recipient_email, status, expires_at, shared_doc_id')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single();

  if (!invite) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This document link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await (service.from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return <SharedDocClient token={token} initialData={{ status: 'expired' }} />;
  }

  if (['revoked', 'expired'].includes(invite.status)) {
    return <SharedDocClient token={token} initialData={{ status: invite.status }} />;
  }

  // Get doc title + type
  const { data: doc } = await service.from('docs').select('title, type').eq('id', invite.shared_doc_id).single();

  // Mask email
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  return (
    <SharedDocClient
      token={token}
      initialData={{
        status: invite.status,
        maskedEmail,
        docTitle: doc?.title || 'Document',
        docType: doc?.type || 'doc',
        expiresAt: invite.expires_at,
      }}
    />
  );
}
```

**Step 2: Create client component**

`src/app/shared/[token]/client.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileText, Presentation, Clock, XCircle, AlertTriangle, Shield } from 'lucide-react';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { DocContent } from '@/components/dashboard/DocContent';
import { DeckViewer } from '@/components/dashboard/DeckViewer';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

interface SharedDocClientProps {
  token: string;
  initialData: {
    status: string;
    maskedEmail?: string;
    docTitle?: string;
    docType?: string;
    expiresAt?: string;
  };
}

type Phase = 'verify' | 'viewing' | 'session_expired';

function formatExpiry(expiresAt: string): string {
  const expires = new Date(expiresAt);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Expires today';
  if (diffDays === 1) return 'Expires tomorrow';
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  return `Expires ${expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function SharedDocClient({ token, initialData }: SharedDocClientProps) {
  const alreadyVerified = initialData.status === 'verified';
  const [phase, setPhase] = useState<Phase>(alreadyVerified ? 'viewing' : 'verify');
  const [docData, setDocData] = useState<{ title: string; content?: string; type: string; slides?: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch doc content after verification
  const fetchContent = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/doc-share/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'session_expired') {
          setPhase('session_expired');
          return;
        }
        throw new Error(data.error);
      }
      const data = await res.json();
      setDocData(data);
      setPhase('viewing');
    } catch (err) {
      console.error('Failed to load document:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (alreadyVerified) fetchContent();
  }, []);

  // ── Terminal states ──
  if (initialData.status === 'expired') {
    return <StatusPage icon={<Clock className="size-7 text-yellow-400" />} title="Link Expired" description="This document link has expired." />;
  }
  if (initialData.status === 'revoked') {
    return <StatusPage icon={<XCircle className="size-7 text-destructive" />} title="Link Revoked" description="This document link has been revoked." />;
  }
  if (phase === 'session_expired') {
    return <StatusPage icon={<AlertTriangle className="size-7 text-amber-400" />} title="Session Ended" description="This link was accessed from another device. Only one session is allowed at a time." />;
  }

  // ── Verify phase ──
  if (phase === 'verify') {
    const isDoc = initialData.docType !== 'deck';
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                {isDoc ? <FileText className="size-5 text-muted-foreground" /> : <Presentation className="size-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-tight text-foreground">{initialData.docTitle || 'Shared Document'}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">from SEEKO Studio</p>
              </div>
            </div>

            {initialData.expiresAt && (
              <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <span>{formatExpiry(initialData.expiresAt)}</span>
              </div>
            )}

            <div className="mb-6 h-px bg-border" />

            <VerificationForm
              token={token}
              maskedEmail={initialData.maskedEmail || '***'}
              sendCodeEndpoint="/api/doc-share/send-code"
              verifyEndpoint="/api/doc-share/verify"
              onVerified={() => fetchContent()}
            />
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5">
            <img src="/seeko-s.png" alt="SEEKO" className="size-4 opacity-40" />
            <span className="text-xs text-muted-foreground/50">Powered by SEEKO Studio</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Viewing phase ──
  if (loading || !docData) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="size-5 rounded-full border-2 border-muted-foreground/20 border-t-seeko-accent animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh bg-background select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <img src="/seeko-s.png" alt="SEEKO" className="size-5" />
            <span className="text-sm font-medium text-foreground">{docData.title}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Shield className="size-3" />
            <span>Confidential</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-5 py-8">
        {docData.type === 'deck' && docData.slides ? (
          <DeckViewer slides={docData.slides} title={docData.title} />
        ) : docData.content ? (
          <DocContent html={docData.content} />
        ) : (
          <p className="text-sm text-muted-foreground">No content available.</p>
        )}
      </div>
    </div>
  );
}

function StatusPage({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <img src="/seeko-s.png" alt="SEEKO" className="mx-auto size-10" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted ring-1 ring-border">{icon}</div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </motion.div>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/shared/
git commit -m "feat: add shared document page with verification and session-protected viewing"
```

---

### Task 7: Share Dialog in Doc Viewer

**Files:**
- Create: `src/components/dashboard/DocShareDialog.tsx`
- Modify: `src/components/dashboard/DocList.tsx`

**Step 1: Create DocShareDialog component**

`src/components/dashboard/DocShareDialog.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';

interface DocShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
  docTitle: string;
}

export function DocShareDialog({ open, onOpenChange, docId, docTitle }: DocShareDialogProps) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/doc-share/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email,
          docId,
          personalNote: note || undefined,
          expiresAt: expiresAt?.toISOString() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to share');
      }

      toast.success(`Share link sent to ${email}`);
      setEmail('');
      setNote('');
      setExpiresAt(null);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Share &ldquo;{docTitle}&rdquo;</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 px-1 pt-4 pb-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Recipient email</label>
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Note <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            placeholder="Add a message..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Expires <span className="text-muted-foreground font-normal">(default 30 days)</span></label>
          <DatePicker value={expiresAt} onChange={setExpiresAt} />
        </div>

        <Button onClick={handleSubmit} disabled={sending} className="w-full gap-2 bg-seeko-accent text-black hover:bg-seeko-accent/90">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {sending ? 'Sending...' : 'Send Share Link'}
        </Button>
      </div>
    </Dialog>
  );
}
```

**Step 2: Add Share button to DocList viewer dialog**

In `src/components/dashboard/DocList.tsx`, add a "Share" button to the doc viewer dialog header (next to the fullscreen/close buttons). When clicked, opens `DocShareDialog`:

- Import `DocShareDialog` and `Share2` icon from lucide
- Add state: `const [shareDoc, setShareDoc] = useState<Doc | null>(null);`
- Add Share button in the dialog header (only for admins)
- Render `<DocShareDialog>` with `shareDoc` state

**Step 3: Commit**

```bash
git add src/components/dashboard/DocShareDialog.tsx src/components/dashboard/DocList.tsx
git commit -m "feat: add Share button to doc viewer + DocShareDialog"
```

---

### Task 8: Shared Tab in Documents Page

**Files:**
- Modify: `src/components/dashboard/DocList.tsx`

**Step 1: Extend viewMode type**

Change `useState<'docs' | 'decks'>` to `useState<'docs' | 'decks' | 'shared'>`.

**Step 2: Add Shared tab button**

Add a third tab button after "Decks" in the tab bar:

```typescript
{isAdmin && (
  <button
    type="button"
    onClick={() => setViewMode('shared')}
    className={cn(
      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
      viewMode === 'shared'
        ? 'bg-card text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
    )}
  >
    Shared{sharedCount > 0 && <span className="ml-1 text-muted-foreground/60">{sharedCount}</span>}
  </button>
)}
```

**Step 3: Fetch shared links when tab is active**

Add state and fetch for shared links:

```typescript
const [sharedLinks, setSharedLinks] = useState<any[]>([]);
const [sharedLoading, setSharedLoading] = useState(false);

useEffect(() => {
  if (viewMode === 'shared' && isAdmin) {
    setSharedLoading(true);
    fetch('/api/doc-share/list')
      .then(r => r.json())
      .then(data => setSharedLinks(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setSharedLoading(false));
  }
}, [viewMode, isAdmin]);
```

**Step 4: Render shared links list**

When `viewMode === 'shared'`, render a list of shared links with:
- Doc title + type icon
- Recipient email
- Status badge (pending / verified / expired / revoked)
- View count
- Created date
- Actions: Revoke, Resend
- Collapsible at 4+ items (same pattern as invoice requests)

**Step 5: Commit**

```bash
git add src/components/dashboard/DocList.tsx
git commit -m "feat: add Shared tab to Documents page with link management"
```

---

### Task 9: Build Verification + Final Polish

**Step 1: Run build**

```bash
npm run build
```

Fix any TypeScript errors.

**Step 2: Test manually**

1. Open Documents, view a doc → click Share → enter email → send
2. Open the shared link → verify with code → view doc
3. Open same link on different device → verify → original session should expire
4. Check Shared tab → verify list shows correctly
5. Revoke a link → verify it shows revoked status
6. Test with a deck → verify DeckViewer works in shared view

**Step 3: Commit any fixes**

```bash
git commit -m "fix: resolve build errors and polish shared doc feature"
```
