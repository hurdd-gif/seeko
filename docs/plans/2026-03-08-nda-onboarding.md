# NDA Onboarding Agreement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate dashboard access behind a signed onboarding agreement (NDA). New users sign during onboarding between password setup and profile. Existing non-admin users sign on next login. Admins are exempt.

**Architecture:** Add `nda_accepted_at` and related columns to `profiles`. Insert a new proxy redirect between `must_set_password` and `onboarded` checks. New `/agreement` page renders the agreement text inline with a signing form. API route handles signing, generates a filled PDF with `pdf-lib`, uploads to Supabase Storage, and emails a copy via Resend.

**Tech Stack:** Next.js 16, Supabase (Auth + Storage + Postgres), `pdf-lib` (already in deps), Resend (new — email delivery)

**Design doc:** `docs/plans/2026-03-08-nda-onboarding-design.md`

---

## Task 1: Database — Add NDA Columns to Profiles

**Files:**
- Modify: `docs/supabase-schema.sql` (append migration)
- Modify: `src/lib/types.ts:34-50` (Profile type)

**Step 1: Write the migration SQL**

Add this to the bottom of `docs/supabase-schema.sql`:

```sql
-- ─── NDA Agreement columns ──────────────────────────────────────────────────
alter table public.profiles
  add column if not exists nda_accepted_at   timestamptz,
  add column if not exists nda_signer_name   text,
  add column if not exists nda_signer_address text,
  add column if not exists nda_ip            text,
  add column if not exists nda_user_agent    text;
```

**Step 2: Run migration in Supabase**

Run the SQL above in the Supabase SQL Editor (dashboard → SQL Editor → New Query → paste → Run).

**Step 3: Update the Profile type**

In `src/lib/types.ts`, add to the `Profile` type:

```ts
export type Profile = {
  id: string;
  display_name?: string;
  department?: string;
  role?: string;
  avatar_url?: string;
  email?: string;
  onboarded: number;
  tour_completed: number;
  is_admin: boolean;
  is_contractor?: boolean;
  is_investor?: boolean;
  must_set_password?: boolean;
  last_seen_at?: string;
  timezone?: string;
  paypal_email?: string;
  // NDA agreement fields
  nda_accepted_at?: string;
  nda_signer_name?: string;
  nda_signer_address?: string;
};
```

**Step 4: Commit**

```bash
git add docs/supabase-schema.sql src/lib/types.ts
git commit -m "feat(nda): add NDA columns to profiles schema and types"
```

---

## Task 2: Proxy — Add NDA Redirect Gate

**Files:**
- Modify: `src/proxy.ts:51-69`

**Step 1: Write the failing test**

Create `src/__tests__/proxy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// Unit test the redirect priority logic
// Since proxy.ts depends on Next.js internals, test the logic as a pure function

type ProfileFlags = {
  must_set_password: boolean;
  nda_accepted_at: string | null;
  is_admin: boolean;
  onboarded: number;
};

function getRedirectPath(
  pathname: string,
  profile: ProfileFlags | null
): string | null {
  if (!profile) return null;
  if (profile.must_set_password) return '/set-password';
  if (!profile.nda_accepted_at && !profile.is_admin) return '/agreement';
  if (profile.onboarded === 0) return '/onboarding';
  return null;
}

describe('NDA redirect logic', () => {
  it('redirects to /set-password first', () => {
    expect(getRedirectPath('/', {
      must_set_password: true,
      nda_accepted_at: null,
      is_admin: false,
      onboarded: 0,
    })).toBe('/set-password');
  });

  it('redirects to /agreement when NDA not signed and not admin', () => {
    expect(getRedirectPath('/', {
      must_set_password: false,
      nda_accepted_at: null,
      is_admin: false,
      onboarded: 0,
    })).toBe('/agreement');
  });

  it('skips NDA for admins', () => {
    expect(getRedirectPath('/', {
      must_set_password: false,
      nda_accepted_at: null,
      is_admin: true,
      onboarded: 0,
    })).toBe('/onboarding');
  });

  it('redirects to /onboarding after NDA signed', () => {
    expect(getRedirectPath('/', {
      must_set_password: false,
      nda_accepted_at: '2026-03-08T00:00:00Z',
      is_admin: false,
      onboarded: 0,
    })).toBe('/onboarding');
  });

  it('returns null when fully onboarded', () => {
    expect(getRedirectPath('/', {
      must_set_password: false,
      nda_accepted_at: '2026-03-08T00:00:00Z',
      is_admin: false,
      onboarded: 1,
    })).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/proxy.test.ts
```

Expected: FAIL (function not yet extracted)

**Step 3: Implement — modify `src/proxy.ts`**

Update the profile select and add the NDA redirect between password and onboarding checks:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/api/auth/callback');
  const isOnboardingRoute = pathname.startsWith('/onboarding');
  const isSetPasswordRoute = pathname.startsWith('/set-password');
  const isAgreementRoute = pathname.startsWith('/agreement');
  const isPublicAsset =
    pathname.startsWith('/_next') || pathname.startsWith('/favicon');

  if (!user && !isAuthRoute && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (user && !isSetPasswordRoute && !isAgreementRoute && !isPublicAsset) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarded, must_set_password, nda_accepted_at, is_admin')
      .eq('id', user.id)
      .single();

    if (profile?.must_set_password === true) {
      const url = request.nextUrl.clone();
      url.pathname = '/set-password';
      return NextResponse.redirect(url);
    }

    // NDA gate: non-admin users without a signed NDA get redirected
    if (!isOnboardingRoute && !isAuthRoute && profile && !profile.nda_accepted_at && !profile.is_admin) {
      const url = request.nextUrl.clone();
      url.pathname = '/agreement';
      return NextResponse.redirect(url);
    }

    if (!isOnboardingRoute && !isAuthRoute && profile && profile.onboarded === 0) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

Key changes from existing `proxy.ts`:
1. Added `isAgreementRoute` check (line with `pathname.startsWith('/agreement')`)
2. Added `isAgreementRoute` to the guard condition on the profile-check block (so `/agreement` page is accessible)
3. Added `nda_accepted_at, is_admin` to the `.select()` query
4. Inserted NDA redirect between `must_set_password` and `onboarded` checks

**Step 4: Update test to use extracted logic and run**

```bash
npm test -- src/__tests__/proxy.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/proxy.ts src/__tests__/proxy.test.ts
git commit -m "feat(nda): add NDA redirect gate in proxy"
```

---

## Task 3: Agreement Page — Server Component Shell

**Files:**
- Create: `src/app/agreement/page.tsx`

**Step 1: Create the page**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AgreementForm } from '@/components/agreement/AgreementForm';
import { FadeScale, FadeRise } from '@/components/motion';

export default async function AgreementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('nda_accepted_at, is_admin, is_contractor, department, role, onboarded')
    .eq('id', user.id)
    .single();

  // Admins skip NDA entirely
  if (profile?.is_admin) redirect('/');
  // Already signed
  if (profile?.nda_accepted_at) {
    redirect(profile.onboarded === 0 ? '/onboarding' : '/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <FadeScale className="mx-auto flex size-16 items-center justify-center">
            <img src="/seeko-s.png" alt="SEEKO" className="size-14" />
          </FadeScale>
          <FadeRise delay={0.15}>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Onboarding Agreement
            </h1>
          </FadeRise>
          <FadeRise delay={0.25}>
            <p className="mt-2 text-sm text-muted-foreground">
              Please review and sign the agreement below to continue.
            </p>
          </FadeRise>
        </div>
        <FadeRise delay={0.4} y={24}>
          <AgreementForm
            userId={user.id}
            userEmail={user.email ?? ''}
            department={profile?.department ?? ''}
            role={profile?.role ?? ''}
            isContractor={profile?.is_contractor ?? false}
            onboarded={profile?.onboarded ?? 0}
          />
        </FadeRise>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles (will error on missing AgreementForm — expected)**

```bash
npx next build 2>&1 | head -20
```

Expected: Error about missing `@/components/agreement/AgreementForm`

**Step 3: Commit**

```bash
git add src/app/agreement/page.tsx
git commit -m "feat(nda): add agreement page server component shell"
```

---

## Task 4: Agreement Text Content

**Files:**
- Create: `src/lib/agreement-text.ts`

This file contains the full NDA agreement text as structured data so it can be rendered as HTML on the page and used for PDF generation.

**Step 1: Create the agreement text module**

Create `src/lib/agreement-text.ts` with the 12 sections from the SEEKO Onboarding Agreement. Structure each section as:

```ts
export type AgreementSection = {
  number: number;
  title: string;
  content: string; // HTML string with paragraphs, lists, etc.
};

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    number: 1,
    title: 'Confidentiality & Non-Disclosure',
    content: `<p>The Recipient agrees to hold in strict confidence all Confidential Information...</p>
    <p>"Confidential Information" includes, but is not limited to: game design documents, source code, art assets, business strategies, financial information, user data, marketing plans, and any proprietary materials shared via SEEKO's development dashboard or other communication channels.</p>
    <p>The Recipient shall not disclose, publish, or otherwise reveal any Confidential Information to any third party without the prior written consent of SEEKO.</p>`,
  },
  {
    number: 2,
    title: 'Intellectual Property Ownership',
    content: `<p>All work product, deliverables, code, art, designs, documentation, and any other materials created by the Recipient in connection with SEEKO projects shall be the exclusive property of SEEKO.</p>
    <p>The Recipient hereby assigns all rights, title, and interest (including all intellectual property rights) in any work product to SEEKO.</p>
    <p>The Recipient waives any moral rights to the extent permitted by law.</p>`,
  },
  {
    number: 3,
    title: 'Dashboard & Development Environment Access',
    content: `<p>SEEKO grants the Recipient access to internal development tools, dashboards, and environments solely for the purpose of performing assigned work.</p>
    <p>Access credentials must not be shared with any third party. The Recipient agrees to follow all security protocols and immediately report any unauthorized access or security breaches.</p>`,
  },
  {
    number: 4,
    title: 'Scope of Work & Responsibilities',
    content: `<p>The Recipient's scope of work will be defined and tracked via SEEKO's project management dashboard. Tasks, deadlines, and deliverables will be assigned through the platform.</p>
    <p>The Recipient agrees to complete assigned tasks within the specified timelines and to communicate promptly about any delays or blockers.</p>`,
  },
  {
    number: 5,
    title: 'Compensation',
    content: `<p>Compensation for the Recipient's services will be determined on a per-project or per-task basis as agreed upon through the SEEKO dashboard. Payment terms and methods will be specified for each engagement.</p>
    <p>The Recipient acknowledges that compensation is contingent upon satisfactory completion of assigned work.</p>`,
  },
  {
    number: 6,
    title: 'Non-Compete & Non-Solicitation',
    content: `<p>During the term of engagement and for a period of twelve (12) months thereafter, the Recipient agrees not to:</p>
    <ul><li>Directly or indirectly compete with SEEKO in the development of similar gaming products</li>
    <li>Solicit or recruit any SEEKO team members or contractors</li>
    <li>Use Confidential Information to develop competing products or services</li></ul>`,
  },
  {
    number: 7,
    title: 'Representations & Warranties',
    content: `<p>The Recipient represents and warrants that:</p>
    <ul><li>They have the legal capacity to enter into this agreement</li>
    <li>Their work will be original and will not infringe upon the rights of any third party</li>
    <li>They are not subject to any agreement that would prevent them from fulfilling their obligations under this agreement</li></ul>`,
  },
  {
    number: 8,
    title: 'Term & Termination',
    content: `<p>This agreement remains in effect for the duration of the Recipient's engagement with SEEKO and survives termination with respect to Confidentiality (Section 1) and Intellectual Property (Section 2) obligations.</p>
    <p>Either party may terminate the engagement with written notice. Upon termination, the Recipient must return or destroy all Confidential Information and confirm destruction in writing.</p>`,
  },
  {
    number: 9,
    title: 'Indemnification',
    content: `<p>The Recipient agrees to indemnify, defend, and hold harmless SEEKO, its officers, directors, and affiliates from and against any claims, damages, losses, or expenses arising from the Recipient's breach of this agreement or negligent acts.</p>`,
  },
  {
    number: 10,
    title: 'Limitation of Liability',
    content: `<p>In no event shall SEEKO be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to this agreement, regardless of the cause of action or theory of liability.</p>
    <p>SEEKO's total liability under this agreement shall not exceed the total compensation paid to the Recipient in the twelve (12) months preceding the claim.</p>`,
  },
  {
    number: 11,
    title: 'Dispute Resolution',
    content: `<p>Any disputes arising under this agreement shall first be attempted to be resolved through good-faith negotiation between the parties.</p>
    <p>If negotiation fails, disputes shall be submitted to binding arbitration in accordance with applicable laws. The prevailing party shall be entitled to recover reasonable attorney's fees.</p>`,
  },
  {
    number: 12,
    title: 'General Provisions',
    content: `<p>This agreement constitutes the entire understanding between the parties regarding the subject matter herein. It may only be modified in writing signed by both parties.</p>
    <p>If any provision is found to be unenforceable, the remaining provisions shall continue in full force and effect. This agreement shall be governed by applicable law.</p>
    <p>The Recipient acknowledges that they have read, understood, and agree to be bound by all terms and conditions of this agreement.</p>`,
  },
];

export const AGREEMENT_TITLE = 'SEEKO Onboarding Agreement';
export const AGREEMENT_EFFECTIVE_DATE = 'Upon electronic signature';
```

> **Note to implementer:** The agreement text above is placeholder content based on the section headings from the original PDF. Karti should review and replace with the exact legal text from `SEEKO_Onboarding_Agreement.pdf`. The structure supports rich HTML content per section.

**Step 2: Commit**

```bash
git add src/lib/agreement-text.ts
git commit -m "feat(nda): add agreement text content module"
```

---

## Task 5: AgreementForm — Client Component

**Files:**
- Create: `src/components/agreement/AgreementForm.tsx`

This is the main form component. It renders the agreement text in a scrollable container, collects the signer's legal name, address, and engagement type, and submits to the API.

**Step 1: Create the component**

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, FileText } from 'lucide-react';
import { springs } from '@/components/motion';
import { DURATION_STATE_MS } from '@/lib/motion';
import { useHaptics } from '@/components/HapticsProvider';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

interface AgreementFormProps {
  userId: string;
  userEmail: string;
  department: string;
  role: string;
  isContractor: boolean;
  onboarded: number;
}

export function AgreementForm({
  userId,
  userEmail,
  department,
  role,
  isContractor,
  onboarded,
}: AgreementFormProps) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [engagementType, setEngagementType] = useState<'team_member' | 'contractor'>(
    isContractor ? 'contractor' : 'team_member'
  );
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "scrolled to bottom" when within 40px of the end
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setHasScrolledToBottom(true);
  }, []);

  const canSubmit = hasScrolledToBottom && fullName.trim().length > 0 && address.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/agreement/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          address: address.trim(),
          engagement_type: engagementType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to sign agreement.');
        setSaving(false);
        trigger('error');
        return;
      }

      trigger('success');
      router.push(data.redirect || (onboarded === 0 ? '/onboarding' : '/'));
      router.refresh();
    } catch {
      setError('Failed to sign agreement. Please try again.');
      setSaving(false);
      trigger('error');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Read-only info fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-mono text-foreground truncate">{userEmail}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Department / Role</Label>
              <p className="text-sm text-foreground truncate">
                {department || 'Unassigned'}{role ? ` — ${role}` : ''}
              </p>
            </div>
          </div>

          {/* Scrollable agreement text */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="size-4 text-muted-foreground" />
              {AGREEMENT_TITLE}
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-80 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 prose prose-sm prose-invert max-w-none
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2
                [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-3
                [&_ul]:text-sm [&_ul]:text-muted-foreground [&_ul]:ml-4 [&_ul]:mb-3 [&_li]:mb-1"
            >
              {AGREEMENT_SECTIONS.map((section) => (
                <div key={section.number}>
                  <h3>{section.number}. {section.title}</h3>
                  <div dangerouslySetInnerHTML={{ __html: section.content }} />
                </div>
              ))}
              <div className="mt-8 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground italic">
                  End of agreement. Please fill in the fields below and sign.
                </p>
              </div>
            </div>
            {!hasScrolledToBottom && (
              <p className="text-xs text-muted-foreground animate-pulse">
                ↓ Scroll to the bottom to continue
              </p>
            )}
          </div>

          {/* Engagement type */}
          <fieldset className="space-y-2">
            <Label>Engagement Type</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="engagement_type"
                  value="team_member"
                  checked={engagementType === 'team_member'}
                  onChange={() => setEngagementType('team_member')}
                  className="accent-seeko-accent"
                />
                Team Member
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="engagement_type"
                  value="contractor"
                  checked={engagementType === 'contractor'}
                  onChange={() => setEngagementType('contractor')}
                  className="accent-seeko-accent"
                />
                Independent Contractor
              </label>
            </div>
          </fieldset>

          {/* Legal name and address */}
          <div className="space-y-2">
            <Label htmlFor="full-name">Legal Full Name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="As it appears on official documents"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Full mailing address"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground text-sm font-medium h-9 px-4 py-2 transition-colors transition-[box-shadow_var(--focus-ring-duration)_ease-out] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={saving ? 'saving' : 'idle'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION_STATE_MS / 1000 }}
                className="inline-flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    I Agree & Sign
                    <ArrowRight className="size-4 shrink-0" />
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Verify it compiles with the page**

```bash
npx next build 2>&1 | tail -10
```

Expected: Build succeeds (API route doesn't exist yet but the form component itself should compile)

**Step 3: Commit**

```bash
git add src/components/agreement/AgreementForm.tsx
git commit -m "feat(nda): add AgreementForm client component"
```

---

## Task 6: Supabase Storage Bucket

**Step 1: Create the `agreements` bucket**

In Supabase Dashboard → Storage → New Bucket:
- Name: `agreements`
- Public: **No** (private — only admins should download)
- File size limit: 10MB

**Step 2: Add RLS policy for the bucket**

Run in Supabase SQL Editor:

```sql
-- Allow authenticated users to upload their own agreement
create policy "Users upload own agreement"
  on storage.objects for insert
  with check (
    bucket_id = 'agreements'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow admins to read any agreement
create policy "Admins read agreements"
  on storage.objects for select
  using (
    bucket_id = 'agreements'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Allow users to read their own agreement
create policy "Users read own agreement"
  on storage.objects for select
  using (
    bucket_id = 'agreements'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

**Step 3: Commit schema docs update**

Add the storage bucket documentation to `docs/supabase-schema.sql`:

```sql
-- ─── Storage Buckets ────────────────────────────────────────────────────────
-- agreements (private): Signed NDA PDFs stored at agreements/{user_id}.pdf
```

```bash
git add docs/supabase-schema.sql
git commit -m "feat(nda): document agreements storage bucket"
```

---

## Task 7: PDF Generation Utility

**Files:**
- Create: `src/lib/agreement-pdf.ts`

Uses `pdf-lib` (already in `package.json`) to generate a filled PDF from scratch (no template needed — we generate the full document).

**Step 1: Write the test**

Create `src/__tests__/agreement-pdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateAgreementPdf } from '@/lib/agreement-pdf';

describe('generateAgreementPdf', () => {
  it('returns a Uint8Array (valid PDF bytes)', async () => {
    const pdf = await generateAgreementPdf({
      fullName: 'John Doe',
      address: '123 Main St, New York, NY 10001',
      email: 'john@seeko.gg',
      department: 'Coding',
      role: 'Engineer',
      engagementType: 'team_member',
      signedAt: new Date('2026-03-08T12:00:00Z'),
    });

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(100);
    // PDF magic bytes: %PDF
    expect(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3])).toBe('%PDF');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/agreement-pdf.test.ts
```

Expected: FAIL

**Step 3: Implement**

Create `src/lib/agreement-pdf.ts`:

```ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from './agreement-text';

interface PdfInput {
  fullName: string;
  address: string;
  email: string;
  department: string;
  role: string;
  engagementType: 'team_member' | 'contractor';
  signedAt: Date;
}

/** Strip HTML tags for plain-text PDF rendering */
function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|div|br)\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n  • ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function generateAgreementPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612; // US Letter
  const PAGE_H = 792;
  const MARGIN = 60;
  const LINE_H = 14;
  const MAX_W = PAGE_W - 2 * MARGIN;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function drawText(text: string, size: number, useBold = false) {
    const f = useBold ? fontBold : font;
    const words = text.split(' ');
    let line = '';

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > MAX_W) {
        ensureSpace(LINE_H);
        page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
        y -= LINE_H;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(LINE_H);
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
      y -= LINE_H;
    }
  }

  // Title
  drawText(AGREEMENT_TITLE.toUpperCase(), 16, true);
  y -= 10;

  // Signer info block
  drawText(`Name: ${input.fullName}`, 10);
  drawText(`Email: ${input.email}`, 10);
  drawText(`Department: ${input.department || 'N/A'}`, 10);
  drawText(`Role: ${input.role || 'N/A'}`, 10);
  drawText(`Engagement: ${input.engagementType === 'contractor' ? 'Independent Contractor' : 'Team Member'}`, 10);
  drawText(`Address: ${input.address}`, 10);
  y -= 10;

  // Agreement sections
  for (const section of AGREEMENT_SECTIONS) {
    y -= 8;
    drawText(`${section.number}. ${section.title}`, 11, true);
    y -= 4;

    const plainText = stripHtml(section.content);
    for (const paragraph of plainText.split('\n')) {
      if (paragraph.trim()) {
        drawText(paragraph.trim(), 9);
        y -= 4;
      }
    }
  }

  // Signature block
  y -= 20;
  ensureSpace(80);
  drawText('SIGNATURE', 12, true);
  y -= 10;
  drawText(`Printed Name: ${input.fullName}`, 10);
  drawText(`Date: ${input.signedAt.toISOString().split('T')[0]}`, 10);
  drawText(`Signed electronically via SEEKO Studio`, 9);

  return doc.save();
}
```

**Step 4: Run test**

```bash
npm test -- src/__tests__/agreement-pdf.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agreement-pdf.ts src/__tests__/agreement-pdf.test.ts
git commit -m "feat(nda): add PDF generation utility with pdf-lib"
```

---

## Task 8: Install Resend + Email Utility

**Files:**
- Modify: `package.json` (add `resend`)
- Create: `src/lib/email.ts`

**Step 1: Install Resend**

```bash
npm install resend
```

**Step 2: Add env var**

Add `RESEND_API_KEY` to `.env.local`:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
```

Also add to `render.yaml`:

```yaml
- key: RESEND_API_KEY
  sync: false
```

And to `docs/personas/devops.md` env vars table.

**Step 3: Create email utility**

Create `src/lib/email.ts`:

```ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seeko.gg';
const FROM_EMAIL = 'SEEKO Studio <noreply@seeko.gg>';

interface SendAgreementEmailParams {
  recipientEmail: string;
  signerName: string;
  pdfBytes: Uint8Array;
}

export async function sendAgreementEmail({
  recipientEmail,
  signerName,
  pdfBytes,
}: SendAgreementEmailParams) {
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  const fileName = `SEEKO_Agreement_${signerName.replace(/\s+/g, '_')}.pdf`;

  // Send to both the signer and admin
  await Promise.all([
    resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: 'Your SEEKO Onboarding Agreement — Signed Copy',
      text: `Hi ${signerName},\n\nAttached is your signed copy of the SEEKO Onboarding Agreement.\n\nPlease keep this for your records.\n\n— SEEKO Team`,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
    resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `NDA Signed: ${signerName}`,
      text: `${signerName} (${recipientEmail}) has signed the SEEKO Onboarding Agreement.\n\nSigned copy is attached.`,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
  ]);
}
```

**Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/email.ts render.yaml docs/personas/devops.md
git commit -m "feat(nda): add Resend email utility for agreement delivery"
```

---

## Task 9: API Route — POST `/api/agreement/sign`

**Files:**
- Create: `src/app/api/agreement/sign/route.ts`

**Step 1: Write the test**

Create `src/__tests__/api-agreement-sign.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// Test validation logic as a pure function (actual route test requires integration)
function validateSignRequest(body: Record<string, unknown>): string | null {
  if (!body.full_name || typeof body.full_name !== 'string' || body.full_name.trim().length === 0) {
    return 'full_name is required';
  }
  if (!body.address || typeof body.address !== 'string' || body.address.trim().length === 0) {
    return 'address is required';
  }
  if (!['team_member', 'contractor'].includes(body.engagement_type as string)) {
    return 'engagement_type must be team_member or contractor';
  }
  return null;
}

describe('agreement sign validation', () => {
  it('rejects missing full_name', () => {
    expect(validateSignRequest({ address: '123 St', engagement_type: 'team_member' }))
      .toBe('full_name is required');
  });

  it('rejects missing address', () => {
    expect(validateSignRequest({ full_name: 'John', engagement_type: 'team_member' }))
      .toBe('address is required');
  });

  it('rejects invalid engagement_type', () => {
    expect(validateSignRequest({ full_name: 'John', address: '123', engagement_type: 'other' }))
      .toBe('engagement_type must be team_member or contractor');
  });

  it('passes valid input', () => {
    expect(validateSignRequest({
      full_name: 'John Doe',
      address: '123 Main St',
      engagement_type: 'contractor',
    })).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/api-agreement-sign.test.ts
```

Expected: PASS (pure function test — these are just validation tests)

**Step 3: Create the API route**

Create `src/app/api/agreement/sign/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import { sendAgreementEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Check profile — reject admins, reject already-signed
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, nda_accepted_at, department, role, onboarded')
    .eq('id', user.id)
    .single();

  if (profile?.is_admin) {
    return NextResponse.json({ error: 'Admins are exempt from NDA' }, { status: 400 });
  }
  if (profile?.nda_accepted_at) {
    return NextResponse.json({ error: 'Already signed' }, { status: 400 });
  }

  // 3. Parse and validate body
  let body: { full_name?: string; address?: string; engagement_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { full_name, address, engagement_type } = body;

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }
  if (!engagement_type || !['team_member', 'contractor'].includes(engagement_type)) {
    return NextResponse.json({ error: 'engagement_type must be team_member or contractor' }, { status: 400 });
  }

  // 4. Capture IP and user agent
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const now = new Date();

  // 5. Update profile with NDA data (use service client to bypass RLS if needed)
  const service = getServiceClient();
  const { error: updateError } = await service
    .from('profiles')
    .update({
      nda_accepted_at: now.toISOString(),
      nda_signer_name: full_name.trim(),
      nda_signer_address: address.trim(),
      nda_ip: ip,
      nda_user_agent: userAgent,
    })
    .eq('id', user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 6. Generate PDF
  const pdfBytes = await generateAgreementPdf({
    fullName: full_name.trim(),
    address: address.trim(),
    email: user.email ?? '',
    department: profile?.department ?? '',
    role: profile?.role ?? '',
    engagementType: engagement_type as 'team_member' | 'contractor',
    signedAt: now,
  });

  // 7. Upload PDF to Supabase Storage
  const storagePath = `${user.id}/agreement.pdf`;
  const { error: uploadError } = await service.storage
    .from('agreements')
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    // Log but don't fail — profile is already updated
    console.error('Failed to upload agreement PDF:', uploadError.message);
  }

  // 8. Send email (non-blocking — don't fail the request if email fails)
  try {
    await sendAgreementEmail({
      recipientEmail: user.email ?? '',
      signerName: full_name.trim(),
      pdfBytes,
    });
  } catch (emailErr) {
    console.error('Failed to send agreement email:', emailErr);
  }

  // 9. Return redirect path
  const redirect = profile?.onboarded === 0 ? '/onboarding' : '/';
  return NextResponse.json({ success: true, redirect });
}
```

**Step 4: Run all tests**

```bash
npm test
```

Expected: All PASS

**Step 5: Commit**

```bash
git add src/app/api/agreement/sign/route.ts src/__tests__/api-agreement-sign.test.ts
git commit -m "feat(nda): add POST /api/agreement/sign route"
```

---

## Task 10: Admin View — NDA Status on Team Page

**Files:**
- Modify: `src/app/(dashboard)/team/page.tsx`

**Step 1: Read the current team page**

Read `src/app/(dashboard)/team/page.tsx` fully before modifying.

**Step 2: Update the profile select to include NDA fields**

In the team page's data fetching, ensure the profile query includes `nda_accepted_at` and `is_admin`. The `fetchTeam()` function in `src/lib/supabase/data.ts` likely returns profiles — check what it selects.

**Step 3: Add NDA status indicator to each team member row**

For admin viewers, add a column/badge showing NDA status:

```tsx
// Inside the team member row, after existing badges:
{currentUserIsAdmin && (
  <span className="ml-auto">
    {member.is_admin ? (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
        Exempt
      </Badge>
    ) : member.nda_accepted_at ? (
      <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
        NDA ✓
      </Badge>
    ) : (
      <Badge variant="outline" className="text-amber-400 border-amber-400/30">
        NDA Pending
      </Badge>
    )}
  </span>
)}
```

**Step 4: Ensure `fetchTeam()` includes NDA fields**

In `src/lib/supabase/data.ts`, update the `fetchTeam` query to select `nda_accepted_at` if not already selecting `*`.

**Step 5: Commit**

```bash
git add src/app/(dashboard)/team/page.tsx src/lib/supabase/data.ts
git commit -m "feat(nda): show NDA status badges on team page for admins"
```

---

## Task 11: Update Schema Documentation

**Files:**
- Modify: `docs/supabase-schema.sql`
- Modify: `docs/personas/ia.md` (profiles table docs)
- Modify: `docs/personas/devops.md` (env vars)

**Step 1: Update `docs/personas/ia.md`**

Add to the profiles table section:

```
| nda_accepted_at   | timestamptz    | When they signed the NDA (null = not signed)         |
| nda_signer_name   | text           | Legal full name as typed during signing               |
| nda_signer_address| text           | Address as typed during signing                       |
| nda_ip            | text           | IP address at time of signing                         |
| nda_user_agent    | text           | Browser user agent at time of signing                 |
```

**Step 2: Update `docs/personas/devops.md`**

Add to env vars table:

```
| RESEND_API_KEY                 | Render dashboard   | Resend API key for transactional email   |
| ADMIN_EMAIL                    | Render dashboard   | Admin email for NDA notification copies  |
```

**Step 3: Commit**

```bash
git add docs/personas/ia.md docs/personas/devops.md docs/supabase-schema.sql
git commit -m "docs: update schema and persona docs with NDA fields"
```

---

## Task 12: Manual QA

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test new user flow**

1. Create a test user via invite (or directly in Supabase)
2. Set their password → should redirect to `/agreement`
3. Verify the agreement text renders and scrolls
4. Verify "I Agree & Sign" is disabled until scrolled to bottom + fields filled
5. Fill in name, address, select engagement type
6. Submit → should redirect to `/onboarding`
7. Check Supabase: `profiles` row has `nda_accepted_at`, `nda_signer_name`, etc.
8. Check Supabase Storage: `agreements/{user_id}/agreement.pdf` exists
9. Check email: both user and admin received the PDF

**Step 3: Test existing user flow**

1. Find an existing non-admin user without `nda_accepted_at`
2. Log in → should redirect to `/agreement`
3. Sign → should redirect to `/` (dashboard)

**Step 4: Test admin exemption**

1. Log in as admin → should go straight to dashboard (no NDA redirect)

**Step 5: Test already-signed user**

1. Log in as user who already signed → should go straight to dashboard

---

## Summary of All Files

| Action | File |
|--------|------|
| Modify | `docs/supabase-schema.sql` |
| Modify | `src/lib/types.ts` |
| Modify | `src/proxy.ts` |
| Create | `src/app/agreement/page.tsx` |
| Create | `src/lib/agreement-text.ts` |
| Create | `src/components/agreement/AgreementForm.tsx` |
| Create | `src/lib/agreement-pdf.ts` |
| Create | `src/lib/email.ts` |
| Create | `src/app/api/agreement/sign/route.ts` |
| Modify | `src/app/(dashboard)/team/page.tsx` |
| Modify | `src/lib/supabase/data.ts` |
| Modify | `docs/personas/ia.md` |
| Modify | `docs/personas/devops.md` |
| Install | `resend` (npm package) |
| Create | `src/__tests__/proxy.test.ts` |
| Create | `src/__tests__/agreement-pdf.test.ts` |
| Create | `src/__tests__/api-agreement-sign.test.ts` |
