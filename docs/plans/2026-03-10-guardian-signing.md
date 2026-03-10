# Guardian Signing for Minors — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow under-18 team members to join the platform by having their parent/guardian sign the NDA on their behalf, using the existing external signing infrastructure.

**Architecture:** Add `is_minor` to `profiles` and `on_behalf_of`/`guardian_relationship` to `external_signing_invites`. Admin can flag minors during invite (sends guardian link immediately) or the minor can self-declare during onboarding. The minor is blocked at `/agreement` with a waiting screen until the guardian completes signing via the existing `/sign/[token]` flow. When the guardian signs, the external signing sign API also populates the minor's NDA profile fields.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, TypeScript, Tailwind v4, shadcn/ui, Resend email

---

### Task 1: Database Migration — Add Guardian Columns

**Files:**
- Create: `supabase/migrations/20260310000000_guardian_signing.sql`

**Step 1: Write the migration**

```sql
-- Add is_minor flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_minor boolean NOT NULL DEFAULT false;

-- Add guardian fields to external_signing_invites
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS on_behalf_of uuid REFERENCES profiles(id);
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS guardian_relationship text;

-- Index for looking up invites by minor's profile
CREATE INDEX IF NOT EXISTS idx_external_signing_on_behalf_of ON external_signing_invites(on_behalf_of) WHERE on_behalf_of IS NOT NULL;
```

**Step 2: Apply migration**

Run via Supabase dashboard SQL editor or:
```bash
# If using supabase CLI:
npx supabase db push
```

**Step 3: Add `is_minor` to pending_invites table**

Also need to propagate `is_minor` through the invite flow. Add to `pending_invites`:

```sql
ALTER TABLE pending_invites ADD COLUMN IF NOT EXISTS is_minor boolean NOT NULL DEFAULT false;
-- Guardian info stored temporarily until the signing invite is created
ALTER TABLE pending_invites ADD COLUMN IF NOT EXISTS guardian_email text;
ALTER TABLE pending_invites ADD COLUMN IF NOT EXISTS guardian_name text;
ALTER TABLE pending_invites ADD COLUMN IF NOT EXISTS guardian_relationship text;
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260310000000_guardian_signing.sql
git commit -m "feat: add guardian signing migration (is_minor, on_behalf_of, guardian fields)"
```

---

### Task 2: Update Invite API — Accept Minor/Guardian Fields

**Files:**
- Modify: `src/app/api/invite/route.ts`
- Modify: `src/app/api/profile/init/route.ts`

**Context:** The invite API (`POST /api/invite`) currently accepts `{ email, department, isContractor, isInvestor }`. We need to also accept `{ isMinor, guardianEmail, guardianName, guardianRelationship }`. The `pending_invites` record stores these. When the minor's profile is initialized (`profile/init`), it sets `is_minor` on the profile and creates the guardian signing invite.

**Step 1: Update the invite API to accept guardian fields**

In `src/app/api/invite/route.ts`, update the body type and upsert:

```typescript
// Update body type (line ~73)
let body: {
  email: string;
  department: string;
  isContractor: boolean;
  isInvestor?: boolean;
  isMinor?: boolean;
  guardianEmail?: string;
  guardianName?: string;
  guardianRelationship?: string;
};

// After destructuring (line ~79), add:
const { email: rawEmail, department, isContractor, isInvestor, isMinor, guardianEmail, guardianName, guardianRelationship } = body;

// Validate guardian fields if isMinor
if (isMinor) {
  if (!guardianEmail || !EMAIL_REGEX.test(guardianEmail.trim())) {
    return NextResponse.json({ error: 'Valid guardian email is required for minors' }, { status: 400 });
  }
  if (!guardianName?.trim()) {
    return NextResponse.json({ error: 'Guardian name is required for minors' }, { status: 400 });
  }
  if (!guardianRelationship || !['Mother', 'Father', 'Legal Guardian'].includes(guardianRelationship)) {
    return NextResponse.json({ error: 'Valid guardian relationship is required' }, { status: 400 });
  }
}

// Update the upsert to include guardian fields (line ~93-103)
const { error: insertError } = await admin
  .from('pending_invites')
  .upsert(
    {
      email: emailLower,
      department: departmentVal,
      is_contractor: isContractor ?? false,
      is_investor: isInvestor ?? false,
      is_minor: isMinor ?? false,
      guardian_email: isMinor ? guardianEmail!.trim().toLowerCase() : null,
      guardian_name: isMinor ? guardianName!.trim() : null,
      guardian_relationship: isMinor ? guardianRelationship : null,
    } as never,
    { onConflict: 'email' }
  );
```

**Step 2: Update profile/init to set is_minor and create guardian invite**

In `src/app/api/profile/init/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { sendExternalInviteEmail } from '@/lib/email';
import { AGREEMENT_TITLE } from '@/lib/agreement-text';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();

  const { data: invite } = await admin
    .from('pending_invites')
    .select('department, is_contractor, is_investor, is_minor, guardian_email, guardian_name, guardian_relationship')
    .eq('email', user.email.toLowerCase())
    .single();

  if (invite) {
    const row = invite as {
      department: string | null;
      is_contractor: boolean;
      is_investor: boolean;
      is_minor: boolean;
      guardian_email: string | null;
      guardian_name: string | null;
      guardian_relationship: string | null;
    };

    await admin
      .from('profiles')
      .update({
        department: row.department,
        is_contractor: row.is_contractor,
        is_investor: row.is_investor ?? false,
        is_minor: row.is_minor ?? false,
        must_set_password: true,
      } as never)
      .eq('id', user.id);

    // If minor with guardian info, create the external signing invite for the guardian
    if (row.is_minor && row.guardian_email) {
      const token = randomBytes(32).toString('base64url');
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const hashedCode = await hash(code, 10);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

      const { data: profile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      await admin.from('external_signing_invites').insert({
        token,
        recipient_email: row.guardian_email,
        template_type: 'preset',
        template_id: 'onboarding_nda',
        personal_note: `Signing on behalf of ${profile?.display_name || user.email}`,
        expires_at: expiresAt,
        verification_code: hashedCode,
        status: 'pending',
        on_behalf_of: user.id,
        guardian_relationship: row.guardian_relationship,
        created_by: user.id,
      } as never);

      // Send invite email to guardian (non-blocking)
      const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://seeko-studio.onrender.com';
      sendExternalInviteEmail({
        recipientEmail: row.guardian_email,
        token,
        templateName: AGREEMENT_TITLE,
        personalNote: `You are being asked to sign this agreement on behalf of ${profile?.display_name || user.email}.`,
        expiresAt,
      }).catch(err => console.error('[profile/init] guardian invite email error:', err));
    }

    await admin
      .from('pending_invites')
      .delete()
      .eq('email', user.email.toLowerCase());
  }

  return NextResponse.json({ success: true });
}
```

**Step 3: Add 'onboarding_nda' to external templates**

In `src/lib/external-agreement-templates.ts`, add the internal NDA as an available template:

```typescript
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from './agreement-text';

// Add to the EXTERNAL_TEMPLATES object:
{
  id: 'onboarding_nda',
  name: AGREEMENT_TITLE,
  sections: AGREEMENT_SECTIONS,
}
```

**Step 4: Commit**

```bash
git add src/app/api/invite/route.ts src/app/api/profile/init/route.ts src/lib/external-agreement-templates.ts
git commit -m "feat: invite API accepts minor/guardian fields, profile/init creates guardian signing invite"
```

---

### Task 3: Update InviteForm UI — Add Minor Toggle + Guardian Fields

**Files:**
- Modify: `src/components/dashboard/InviteForm.tsx`

**Context:** The InviteForm currently has email, department, and role fields. Add an "Under 18" toggle that reveals guardian email, name, and relationship fields.

**Step 1: Add state variables**

After existing state declarations (line ~22):

```typescript
const [isMinor, setIsMinor] = useState(false);
const [guardianEmail, setGuardianEmail] = useState('');
const [guardianName, setGuardianName] = useState('');
const [guardianRelationship, setGuardianRelationship] = useState<'Mother' | 'Father' | 'Legal Guardian'>('Mother');
```

**Step 2: Update the fetch body**

In `handleInvite` (line ~35), add guardian fields to the body:

```typescript
body: JSON.stringify({
  email,
  department,
  isContractor: role === 'contractor',
  isInvestor: role === 'investor',
  isMinor,
  ...(isMinor && {
    guardianEmail,
    guardianName,
    guardianRelationship,
  }),
}),
```

**Step 3: Reset guardian fields on success**

After `setRole('member')` (line ~48):

```typescript
setIsMinor(false);
setGuardianEmail('');
setGuardianName('');
setGuardianRelationship('Mother');
```

**Step 4: Add UI — minor toggle and guardian fields**

After the Role select (after line ~121), add:

```tsx
{/* Under 18 toggle */}
<div className="flex items-center gap-2 pt-1">
  <input
    type="checkbox"
    id="is-minor"
    checked={isMinor}
    onChange={e => setIsMinor(e.target.checked)}
    className="size-4 rounded border-border bg-muted accent-seeko-accent"
  />
  <Label htmlFor="is-minor" className="text-xs text-muted-foreground cursor-pointer">
    Under 18 (requires guardian signature)
  </Label>
</div>
```

After the existing form row (after the closing `</div>` of the flex row, before the submit Button), add the guardian fields:

```tsx
<AnimatePresence>
  {isMinor && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={COLLAPSE_SPRING}
      className="overflow-hidden"
    >
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Guardian will receive a signing link for the NDA
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="guardian-name" className="text-xs">Guardian Name</Label>
            <Input
              id="guardian-name"
              placeholder="Full legal name"
              value={guardianName}
              onChange={e => setGuardianName(e.target.value)}
              required={isMinor}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="guardian-email" className="text-xs">Guardian Email</Label>
            <Input
              id="guardian-email"
              placeholder="guardian@example.com"
              type="email"
              value={guardianEmail}
              onChange={e => setGuardianEmail(e.target.value)}
              required={isMinor}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <Label className="text-xs">Relationship</Label>
            <Select
              value={guardianRelationship}
              onChange={e => setGuardianRelationship(e.target.value as 'Mother' | 'Father' | 'Legal Guardian')}
            >
              <option value="Mother">Mother</option>
              <option value="Father">Father</option>
              <option value="Legal Guardian">Legal Guardian</option>
            </Select>
          </div>
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

**Step 5: Commit**

```bash
git add src/components/dashboard/InviteForm.tsx
git commit -m "feat: add under-18 toggle and guardian fields to invite form"
```

---

### Task 4: Update Agreement Page — Age Gate + Waiting Screen

**Files:**
- Modify: `src/app/agreement/page.tsx`
- Create: `src/components/agreement/GuardianWaitingScreen.tsx`
- Create: `src/components/agreement/AgeGate.tsx`
- Create: `src/app/api/agreement/guardian-request/route.ts`

**Context:** The agreement page currently shows the AgreementForm to all non-admin users who haven't signed. Now it needs three states:
1. If `is_minor=true` and `nda_accepted_at` is null → show GuardianWaitingScreen
2. If `is_minor=false` and `nda_accepted_at` is null → show AgeGate first, then AgreementForm or guardian request form
3. If `nda_accepted_at` is set → redirect (existing behavior)

**Step 1: Create the AgeGate component**

`src/components/agreement/AgeGate.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

interface AgeGateProps {
  onAdult: () => void;
  onMinor: () => void;
}

export function AgeGate({ onAdult, onMinor }: AgeGateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex flex-col items-center justify-center gap-6 px-4 py-12 text-center"
    >
      <ShieldCheck className="size-10 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-semibold text-foreground">Before we continue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Please confirm your age to proceed with the agreement.
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button
          onClick={onAdult}
          className="w-full bg-seeko-accent text-background hover:bg-seeko-accent/90 font-semibold"
        >
          I am 18 or older
        </Button>
        <Button
          onClick={onMinor}
          variant="outline"
          className="w-full"
        >
          <UserRound className="size-4 mr-2" />
          I am under 18
        </Button>
      </div>
    </motion.div>
  );
}
```

**Step 2: Create the GuardianRequestForm component (minor self-declare)**

Add to `src/components/agreement/AgeGate.tsx` (same file, exported separately):

```tsx
interface GuardianRequestFormProps {
  userId: string;
  onSubmitted: () => void;
}

export function GuardianRequestForm({ userId, onSubmitted }: GuardianRequestFormProps) {
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState<string>('Mother');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guardianEmail.trim() || !guardianName.trim()) return;
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/agreement/guardian-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianEmail: guardianEmail.trim(),
          guardianName: guardianName.trim(),
          guardianRelationship,
        }),
      });

      if (res.ok) {
        onSubmitted();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to send request');
      }
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex flex-col items-center gap-6 px-4 py-8 max-w-md mx-auto"
    >
      <UserRound className="size-10 text-muted-foreground" />
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Parent/Guardian Required</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Since you&apos;re under 18, a parent or legal guardian needs to sign the agreement on your behalf.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Guardian&apos;s Full Name</label>
          <input
            value={guardianName}
            onChange={e => setGuardianName(e.target.value)}
            placeholder="Full legal name"
            required
            className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Guardian&apos;s Email</label>
          <input
            type="email"
            value={guardianEmail}
            onChange={e => setGuardianEmail(e.target.value)}
            placeholder="guardian@example.com"
            required
            className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Relationship</label>
          <select
            value={guardianRelationship}
            onChange={e => setGuardianRelationship(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="Mother">Mother</option>
            <option value="Father">Father</option>
            <option value="Legal Guardian">Legal Guardian</option>
          </select>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={sending || !guardianEmail.trim() || !guardianName.trim()}
          className="w-full bg-seeko-accent text-background hover:bg-seeko-accent/90 font-semibold"
        >
          {sending ? 'Sending...' : 'Send Signing Link to Guardian'}
        </Button>
      </form>
    </motion.div>
  );
}
```

**Step 3: Create the GuardianWaitingScreen component**

`src/components/agreement/GuardianWaitingScreen.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Clock, Mail, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

interface GuardianWaitingScreenProps {
  maskedEmail: string;
  inviteId: string;
  inviteStatus: string;
}

export function GuardianWaitingScreen({ maskedEmail, inviteId, inviteStatus }: GuardianWaitingScreenProps) {
  const [status, setStatus] = useState(inviteStatus);
  const [resending, setResending] = useState(false);

  // Poll for status changes every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/agreement/guardian-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.signed) {
            // Guardian has signed — reload to proceed
            window.location.reload();
          }
          if (data.status) setStatus(data.status);
        }
      } catch { /* ignore polling errors */ }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  async function handleResend() {
    setResending(true);
    try {
      const res = await fetch('/api/agreement/guardian-resend', { method: 'POST' });
      if (res.ok) {
        toast.success('Signing link resent to guardian');
      } else {
        toast.error('Failed to resend');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setResending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex flex-col items-center justify-center gap-6 px-4 py-12 text-center max-w-sm mx-auto"
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Clock className="size-7 text-muted-foreground" />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Waiting for Guardian</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A signing link has been sent to your parent/guardian at{' '}
          <span className="font-medium text-foreground">{maskedEmail}</span>.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          This page will automatically update once they sign.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
        {status === 'verified' ? (
          <>
            <CheckCircle2 className="size-3.5 text-seeko-accent" />
            Guardian has verified their email — signing in progress
          </>
        ) : (
          <>
            <Mail className="size-3.5" />
            Waiting for guardian to open the link
          </>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleResend}
        disabled={resending}
        className="gap-2"
      >
        <RefreshCw className={`size-3.5 ${resending ? 'animate-spin' : ''}`} />
        {resending ? 'Resending...' : 'Resend Link'}
      </Button>
    </motion.div>
  );
}
```

**Step 4: Create the guardian-request API route**

`src/app/api/agreement/guardian-request/route.ts`:

This is called when a minor self-declares during onboarding. It sets `is_minor` on their profile and creates the external signing invite for the guardian.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { sendExternalInviteEmail } from '@/lib/email';
import { AGREEMENT_TITLE } from '@/lib/agreement-text';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_RELATIONSHIPS = ['Mother', 'Father', 'Legal Guardian'];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check not already signed
  const { data: profile } = await supabase
    .from('profiles')
    .select('nda_accepted_at, display_name, is_admin')
    .eq('id', user.id)
    .single();

  if (profile?.is_admin) return NextResponse.json({ error: 'Admins are exempt' }, { status: 400 });
  if (profile?.nda_accepted_at) return NextResponse.json({ error: 'Already signed' }, { status: 400 });

  let body: { guardianEmail: string; guardianName: string; guardianRelationship: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { guardianEmail, guardianName, guardianRelationship } = body;

  if (!guardianEmail || !EMAIL_REGEX.test(guardianEmail.trim())) {
    return NextResponse.json({ error: 'Valid guardian email required' }, { status: 400 });
  }
  if (!guardianName?.trim()) {
    return NextResponse.json({ error: 'Guardian name required' }, { status: 400 });
  }
  if (!VALID_RELATIONSHIPS.includes(guardianRelationship)) {
    return NextResponse.json({ error: 'Valid relationship required' }, { status: 400 });
  }

  const admin = getServiceClient();

  // Mark profile as minor
  await admin.from('profiles').update({ is_minor: true } as never).eq('id', user.id);

  // Check if there's already a pending guardian invite
  const { data: existing } = await admin
    .from('external_signing_invites')
    .select('id')
    .eq('on_behalf_of', user.id)
    .in('status', ['pending', 'verified'])
    .single();

  if (existing) {
    return NextResponse.json({ error: 'A guardian signing request is already pending' }, { status: 409 });
  }

  // Create external signing invite
  const token = randomBytes(32).toString('base64url');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hashedCode = await hash(code, 10);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await admin.from('external_signing_invites').insert({
    token,
    recipient_email: guardianEmail.trim().toLowerCase(),
    template_type: 'preset',
    template_id: 'onboarding_nda',
    personal_note: `Signing on behalf of ${profile?.display_name || user.email}`,
    expires_at: expiresAt,
    verification_code: hashedCode,
    status: 'pending',
    on_behalf_of: user.id,
    guardian_relationship: guardianRelationship,
    created_by: user.id,
  } as never);

  if (insertError) {
    console.error('[guardian-request] insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }

  // Send email to guardian
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://seeko-studio.onrender.com';
  sendExternalInviteEmail({
    recipientEmail: guardianEmail.trim().toLowerCase(),
    token,
    templateName: AGREEMENT_TITLE,
    personalNote: `You are being asked to sign this agreement on behalf of ${profile?.display_name || user.email}.`,
    expiresAt,
  }).catch(err => console.error('[guardian-request] email error:', err));

  return NextResponse.json({ success: true });
}
```

**Step 5: Create guardian-status API route (for polling)**

`src/app/api/agreement/guardian-status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getServiceClient();
  const { data: invite } = await admin
    .from('external_signing_invites')
    .select('status')
    .eq('on_behalf_of', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invite) return NextResponse.json({ status: 'none', signed: false });

  return NextResponse.json({
    status: invite.status,
    signed: invite.status === 'signed',
  });
}
```

**Step 6: Create guardian-resend API route**

`src/app/api/agreement/guardian-resend/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { hash } from 'bcryptjs';
import { sendExternalInviteEmail } from '@/lib/email';
import { AGREEMENT_TITLE } from '@/lib/agreement-text';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getServiceClient();
  const { data: invite } = await admin
    .from('external_signing_invites')
    .select('id, token, recipient_email, expires_at')
    .eq('on_behalf_of', user.id)
    .in('status', ['pending', 'verified'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invite) return NextResponse.json({ error: 'No pending guardian request' }, { status: 404 });

  // Generate new verification code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hashedCode = await hash(code, 10);

  await admin.from('external_signing_invites').update({
    verification_code: hashedCode,
    verification_attempts: 0,
    status: 'pending',
  } as never).eq('id', invite.id);

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://seeko-studio.onrender.com';
  sendExternalInviteEmail({
    recipientEmail: invite.recipient_email,
    token: invite.token,
    templateName: AGREEMENT_TITLE,
    personalNote: `Reminder: You are being asked to sign an agreement on behalf of a SEEKO team member.`,
    expiresAt: invite.expires_at,
  }).catch(err => console.error('[guardian-resend] email error:', err));

  return NextResponse.json({ success: true });
}
```

**Step 7: Update the agreement page server component**

Modify `src/app/agreement/page.tsx` to detect minors and pass guardian invite data:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';
import { AgreementForm } from '@/components/agreement/AgreementForm';
import { AgreementPageClient } from '@/components/agreement/AgreementPageClient';

export default async function AgreementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, nda_accepted_at, department, role, is_contractor, onboarded, is_minor, display_name')
    .eq('id', user.id)
    .single();

  if (profile?.is_admin) redirect('/');
  if (profile?.nda_accepted_at) {
    redirect(profile.onboarded === 0 ? '/onboarding' : '/');
  }

  // If minor, check for existing guardian invite
  let guardianInvite: { id: string; maskedEmail: string; status: string } | null = null;
  if (profile?.is_minor) {
    const admin = getServiceClient();
    const { data: invite } = await admin
      .from('external_signing_invites')
      .select('id, recipient_email, status')
      .eq('on_behalf_of', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (invite && ['pending', 'verified'].includes(invite.status)) {
      const email = invite.recipient_email;
      const [local, domain] = email.split('@');
      const masked = local[0] + '***@' + domain;
      guardianInvite = { id: invite.id, maskedEmail: masked, status: invite.status };
    }
  }

  return (
    <AgreementPageClient
      userId={user.id}
      userEmail={user.email!}
      isMinor={profile?.is_minor ?? false}
      guardianInvite={guardianInvite}
      sections={AGREEMENT_SECTIONS}
      title={AGREEMENT_TITLE}
      department={profile?.department ?? undefined}
      role={profile?.role ?? undefined}
      isContractor={profile?.is_contractor ?? false}
      onboarded={profile?.onboarded ?? 0}
    />
  );
}
```

**Step 8: Create the AgreementPageClient wrapper**

`src/components/agreement/AgreementPageClient.tsx`:

This client component manages the age-gate → guardian-request → waiting → normal-signing state machine.

```tsx
'use client';

import { useState } from 'react';
import { AgreementForm } from './AgreementForm';
import { AgeGate, GuardianRequestForm } from './AgeGate';
import { GuardianWaitingScreen } from './GuardianWaitingScreen';

type Phase = 'age-gate' | 'adult-sign' | 'minor-form' | 'waiting';

interface AgreementPageClientProps {
  userId: string;
  userEmail: string;
  isMinor: boolean;
  guardianInvite: { id: string; maskedEmail: string; status: string } | null;
  sections: { number: number; title: string; content: string }[];
  title: string;
  department?: string;
  role?: string;
  isContractor: boolean;
  onboarded: number;
}

export function AgreementPageClient({
  userId, userEmail, isMinor, guardianInvite,
  sections, title, department, role, isContractor, onboarded,
}: AgreementPageClientProps) {
  // Determine initial phase
  const initialPhase: Phase = isMinor
    ? (guardianInvite ? 'waiting' : 'minor-form')
    : 'age-gate';

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [invite, setInvite] = useState(guardianInvite);

  if (phase === 'age-gate') {
    return (
      <AgeGate
        onAdult={() => setPhase('adult-sign')}
        onMinor={() => setPhase('minor-form')}
      />
    );
  }

  if (phase === 'minor-form') {
    return (
      <GuardianRequestForm
        userId={userId}
        onSubmitted={() => {
          // After submission, reload to get the guardian invite data from server
          window.location.reload();
        }}
      />
    );
  }

  if (phase === 'waiting' && invite) {
    return (
      <GuardianWaitingScreen
        maskedEmail={invite.maskedEmail}
        inviteId={invite.id}
        inviteStatus={invite.status}
      />
    );
  }

  // adult-sign phase — show normal AgreementForm
  return (
    <AgreementForm
      userId={userId}
      userEmail={userEmail}
      sections={sections}
      title={title}
      department={department}
      role={role}
      isContractor={isContractor}
      onboarded={onboarded}
      showEngagementType={true}
      signEndpoint="/api/agreement/sign"
    />
  );
}
```

**Step 9: Commit**

```bash
git add src/app/agreement/page.tsx src/components/agreement/AgeGate.tsx src/components/agreement/GuardianWaitingScreen.tsx src/components/agreement/AgreementPageClient.tsx src/app/api/agreement/guardian-request/route.ts src/app/api/agreement/guardian-status/route.ts src/app/api/agreement/guardian-resend/route.ts
git commit -m "feat: age gate, guardian request form, waiting screen, and guardian API routes"
```

---

### Task 5: Update External Signing Sign API — Populate Minor's Profile

**Files:**
- Modify: `src/app/api/external-signing/sign/route.ts`

**Context:** When a guardian signs an invite that has `on_behalf_of` set, we need to also update the minor's profile with `nda_accepted_at` and the guardian's signer info.

**Step 1: Add the on_behalf_of check after the invite is marked signed**

After the existing invite update (around line ~120 where status is set to 'signed'), add:

```typescript
// If this is a guardian signing on behalf of a minor, update the minor's profile
if (invite.on_behalf_of) {
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      nda_accepted_at: new Date().toISOString(),
      nda_signer_name: full_name,
      nda_signer_address: address,
      nda_ip: clientIp,
      nda_user_agent: userAgent,
    } as never)
    .eq('id', invite.on_behalf_of);

  if (profileError) {
    console.error('[sign] Failed to update minor profile:', profileError);
    // Don't fail the request — the guardian's signature is recorded on the invite
  }
}
```

**Step 2: Update the invite query to include on_behalf_of**

The existing query that fetches the invite by token needs to also select `on_behalf_of`. Find the query (around line ~46-50) and add `on_behalf_of` to the `.select()`:

```typescript
// Existing: .select('id, status, expires_at, template_type, template_id, custom_sections, custom_title, recipient_email')
// Change to:
.select('id, status, expires_at, template_type, template_id, custom_sections, custom_title, recipient_email, on_behalf_of')
```

**Step 3: Commit**

```bash
git add src/app/api/external-signing/sign/route.ts
git commit -m "feat: external signing populates minor's NDA profile when on_behalf_of is set"
```

---

### Task 6: Add "Signing on behalf of" Header to Guardian Signing Page

**Files:**
- Modify: `src/app/api/external-signing/[token]/route.ts`
- Modify: `src/app/sign/[token]/client.tsx`

**Context:** When a guardian opens their signing link, the document should indicate they're signing on behalf of a minor. The GET token endpoint should return this context, and the signing page should display it.

**Step 1: Update the GET token API to return guardian context**

In `src/app/api/external-signing/[token]/route.ts`, when the invite has `on_behalf_of`:

- Add `on_behalf_of` and `guardian_relationship` to the select query
- If `on_behalf_of` is set, fetch the minor's display_name
- Include `onBehalfOf: { name, relationship }` in the response

```typescript
// In the select, add: on_behalf_of, guardian_relationship
// After fetching the invite, if on_behalf_of:
let onBehalfOf: { name: string; relationship: string } | null = null;
if (invite.on_behalf_of) {
  const { data: minorProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', invite.on_behalf_of)
    .single();
  onBehalfOf = {
    name: minorProfile?.display_name || 'a team member',
    relationship: invite.guardian_relationship || 'Guardian',
  };
}

// Include in response:
// { ...existing fields, onBehalfOf }
```

**Step 2: Update the signing page client to show the "on behalf of" banner**

In `src/app/sign/[token]/client.tsx`, when `initialData.onBehalfOf` is present, show a banner at the top of the signing card:

```tsx
{data.onBehalfOf && (
  <div className="rounded-lg bg-seeko-accent/10 border border-seeko-accent/20 px-4 py-3 text-sm">
    <p className="font-medium text-seeko-accent">
      Signing on behalf of {data.onBehalfOf.name}
    </p>
    <p className="text-xs text-muted-foreground mt-0.5">
      As their {data.onBehalfOf.relationship.toLowerCase()}, you are signing this agreement on their behalf.
    </p>
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/app/api/external-signing/[token]/route.ts src/app/sign/[token]/client.tsx
git commit -m "feat: show 'signing on behalf of' context on guardian signing page"
```

---

### Task 7: Update Proxy — Allow Guardian API Routes

**Files:**
- Modify: `src/proxy.ts`

**Context:** The guardian-status and guardian-resend API routes are authenticated (they check Supabase auth internally), so they don't need to be in the public allow-list. However, verify the agreement page itself is not blocked for minors. The existing flow already allows authenticated users to reach `/agreement`, so no proxy changes should be needed. Verify and commit a no-op if confirmed.

**Step 1: Verify proxy allows `/agreement` for authenticated users**

Read `src/proxy.ts`. The agreement route is handled by `isAgreementRoute` which is already in the auth bypass for the NDA gate check. Confirm no changes needed.

**Step 2: Commit (if changes needed)**

```bash
# Only if changes are needed
git add src/proxy.ts
git commit -m "fix: ensure proxy allows guardian signing routes"
```

---

### Task 8: Manual Testing Checklist

Test the following scenarios end-to-end:

**Admin pre-flags minor:**
1. Admin opens InviteForm, enters email, toggles "Under 18"
2. Fills guardian name, email, relationship → sends invite
3. Minor receives account invite email, signs up, sets password
4. Minor is redirected to `/agreement` → sees GuardianWaitingScreen
5. Guardian receives signing link email → opens `/sign/[token]`
6. Guardian sees "Signing on behalf of [minor name]" banner
7. Guardian verifies email → reads NDA → signs
8. Minor's waiting screen auto-updates → redirected to `/onboarding`

**Minor self-declares:**
1. Admin invites member normally (no minor flag)
2. Member signs up, sets password, reaches `/agreement`
3. Sees AgeGate → clicks "I am under 18"
4. Fills guardian form → submits
5. Sees GuardianWaitingScreen
6. Guardian completes signing flow
7. Minor proceeds to onboarding

**Resend:**
1. While on waiting screen, click "Resend Link"
2. Guardian receives new email with fresh verification code

**Edge cases:**
- Guardian link expires → minor sees appropriate state
- Guardian already signed → minor redirected immediately
- Admin marks as minor but no guardian info → minor must self-declare guardian at `/agreement`
