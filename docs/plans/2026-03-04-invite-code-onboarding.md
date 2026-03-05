# Invite Code Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Supabase magic-link invite flow with an OTP (6-digit code) flow, adding an "Invite code" tab to the login page so new users can activate their account by entering their email + code.

**Architecture:** Admin triggers `signInWithOtp` via service role — Supabase emails the user a 6-digit code. Invite metadata (department, is_contractor) is stored in a `pending_invites` table. After OTP verification the profile is updated via `/api/profile/init`. Everything from `/set-password` onward is unchanged.

**Tech Stack:** Next.js 16 App Router · Supabase Auth (OTP) · Supabase Postgres · shadcn/ui · Tailwind v4 · Vitest

---

## Task 1: Create `pending_invites` table in Supabase

**Files:**
- Modify: `docs/supabase-schema.sql` (append migration)

**Step 1: Run SQL in Supabase dashboard**

Open the Supabase project → SQL Editor → run:

```sql
create table public.pending_invites (
  email        text primary key,
  department   text,
  is_contractor boolean not null default false,
  created_at   timestamptz default now()
);

alter table public.pending_invites enable row level security;
-- No user-facing RLS policies — only service role accesses this table
```

**Step 2: Append to schema file**

Append to `docs/supabase-schema.sql`:

```sql
-- ─── Pending Invites ──────────────────────────────────────────────────────────

create table public.pending_invites (
  email        text primary key,
  department   text,
  is_contractor boolean not null default false,
  created_at   timestamptz default now()
);

alter table public.pending_invites enable row level security;
-- Service role only — no authenticated user policies needed
```

**Step 3: Commit**

```bash
git add docs/supabase-schema.sql
git commit -m "chore: add pending_invites table to schema"
```

---

## Task 2: Update `/api/invite/route.ts` to use OTP

**Files:**
- Modify: `src/app/api/invite/route.ts`
- Test: `src/app/api/invite/__tests__/route.test.ts`

**Step 1: Write the failing test**

Create `src/app/api/invite/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/server
vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

// Mock supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// Mock supabase service client
const mockSignInWithOtp = vi.fn();
const mockServiceFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithOtp: mockSignInWithOtp },
    from: mockServiceFrom,
  })),
}));

describe('POST /api/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import('../route');
    const req = { json: async () => ({ email: 'a@b.com' }), nextUrl: { origin: 'http://localhost' } };
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: false } }) }) }) });
    const { POST } = await import('../route');
    const req = { json: async () => ({ email: 'a@b.com' }), nextUrl: { origin: 'http://localhost' } };
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it('returns 400 when email is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    const { POST } = await import('../route');
    const req = { json: async () => ({}), nextUrl: { origin: 'http://localhost' } };
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('calls signInWithOtp and upserts pending_invites on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: true } }) }) }) });
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ upsert: mockUpsert });

    const { POST } = await import('../route');
    const req = {
      json: async () => ({ email: 'new@seeko.studio', department: 'Coding', isContractor: false }),
      nextUrl: { origin: 'http://localhost' },
    };
    const res = await POST(req as any);
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'new@seeko.studio',
      options: { shouldCreateUser: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      { email: 'new@seeko.studio', department: 'Coding', is_contractor: false },
      { onConflict: 'email' }
    );
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm test src/app/api/invite/__tests__/route.test.ts
```

Expected: FAIL — test imports old implementation that uses `inviteUserByEmail`.

**Step 3: Rewrite `src/app/api/invite/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json();
  const { email, department, isContractor } = body as {
    email: string;
    department: string;
    isContractor: boolean;
  };

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: otpError } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (otpError) {
    return NextResponse.json({ error: otpError.message }, { status: 400 });
  }

  const { error: insertError } = await admin
    .from('pending_invites')
    .upsert(
      { email, department: department || null, is_contractor: isContractor ?? false },
      { onConflict: 'email' }
    );

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
```

**Step 4: Run test to verify it passes**

```bash
npm test src/app/api/invite/__tests__/route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/invite/route.ts src/app/api/invite/__tests__/route.test.ts
git commit -m "feat: replace inviteUserByEmail with OTP + pending_invites"
```

---

## Task 3: Create `/api/profile/init` route

**Files:**
- Create: `src/app/api/profile/init/route.ts`
- Test: `src/app/api/profile/init/__tests__/route.test.ts`

**Step 1: Write the failing test**

Create `src/app/api/profile/init/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const mockServiceFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

describe('POST /api/profile/init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import('../route');
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('updates profile and deletes pending_invite on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'new@seeko.studio' } } });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { department: 'Coding', is_contractor: false },
          error: null,
        }),
      }),
    });
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'pending_invites') return { select: mockSelect, delete: mockDelete };
      if (table === 'profiles') return { update: mockUpdate };
      return {};
    });

    const { POST } = await import('../route');
    const res = await POST();
    expect(mockUpdate).toHaveBeenCalledWith({
      department: 'Coding',
      is_contractor: false,
      must_set_password: true,
    });
    expect(res.status).toBe(200);
  });

  it('returns 200 with no-op when no pending invite exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'new@seeko.studio' } } });
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    });
    mockServiceFrom.mockReturnValue({ select: mockSelect });
    const { POST } = await import('../route');
    const res = await POST();
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test src/app/api/profile/init/__tests__/route.test.ts
```

Expected: FAIL — file doesn't exist.

**Step 3: Create `src/app/api/profile/init/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Read pending invite metadata
  const { data: invite } = await admin
    .from('pending_invites')
    .select('department, is_contractor')
    .eq('email', user.email)
    .single();

  if (invite) {
    // Update profile with invite metadata
    await admin
      .from('profiles')
      .update({
        department: invite.department,
        is_contractor: invite.is_contractor,
        must_set_password: true,
      })
      .eq('id', user.id);

    // Clean up pending invite
    await admin
      .from('pending_invites')
      .delete()
      .eq('email', user.email);
  }

  return NextResponse.json({ success: true });
}
```

**Step 4: Run test to verify it passes**

```bash
npm test src/app/api/profile/init/__tests__/route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/profile/init/route.ts src/app/api/profile/init/__tests__/route.test.ts
git commit -m "feat: add /api/profile/init route for post-OTP profile setup"
```

---

## Task 4: Create `InviteCodeForm` component

**Files:**
- Create: `src/components/auth/InviteCodeForm.tsx`
- Test: `src/components/auth/__tests__/InviteCodeForm.test.tsx`

**Step 1: Write the failing test**

Create `src/components/auth/__tests__/InviteCodeForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteCodeForm } from '../InviteCodeForm';

// Mock next/navigation
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// Mock supabase client
const mockVerifyOtp = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { verifyOtp: mockVerifyOtp },
  })),
}));

// Mock fetch for /api/profile/init
global.fetch = vi.fn();

describe('InviteCodeForm', () => {
  it('renders email and code inputs', () => {
    render(<InviteCodeForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('shows error when code is invalid', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    render(<InviteCodeForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@seeko.studio' } });
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
    });
  });

  it('calls verifyOtp with email and token on submit', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<InviteCodeForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@seeko.studio' } });
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'test@seeko.studio',
        token: '654321',
        type: 'email',
      });
    });
  });
});
```

**Step 2: Install testing library if needed**

Check `package.json` — if `@testing-library/react` is missing:
```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

**Step 3: Run test to verify it fails**

```bash
npm test src/components/auth/__tests__/InviteCodeForm.test.tsx
```

Expected: FAIL — component doesn't exist.

**Step 4: Create `src/components/auth/InviteCodeForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function InviteCodeForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (otpError) {
      setError('Invalid or expired invite code. Please check your email and try again.');
      setLoading(false);
      return;
    }

    // Initialise profile with pending invite metadata
    await fetch('/api/profile/init', { method: 'POST' });

    router.push('/set-password');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="invite-email" className="block text-xs font-medium text-muted-foreground mb-1.5">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@seeko.studio"
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors"
        />
      </div>

      <div>
        <label htmlFor="invite-token" className="block text-xs font-medium text-muted-foreground mb-1.5">
          Invite code
        </label>
        <input
          id="invite-token"
          type="text"
          value={token}
          onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
          placeholder="6-digit code from your email"
          inputMode="numeric"
          maxLength={6}
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors font-mono tracking-widest"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || token.length < 6}
        className="w-full py-2 px-4 rounded-lg bg-seeko-accent text-primary-foreground font-semibold text-sm hover:bg-seeko-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Verifying…' : 'Continue'}
      </button>
    </form>
  );
}
```

**Step 5: Run test to verify it passes**

```bash
npm test src/components/auth/__tests__/InviteCodeForm.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/components/auth/InviteCodeForm.tsx src/components/auth/__tests__/InviteCodeForm.test.tsx
git commit -m "feat: add InviteCodeForm component with OTP verification"
```

---

## Task 5: Update login page with tabs

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

No unit test needed here — this is a page composition with no extractable logic. Manual verification covers it.

**Step 1: Rewrite `src/app/(auth)/login/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { InviteCodeForm } from '@/components/auth/InviteCodeForm';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'signin' | 'invite'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">SEEKO Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg bg-card border border-border p-1 mb-6 gap-1">
        <button
          type="button"
          onClick={() => { setTab('signin'); setError(null); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'signin'
              ? 'bg-seeko-accent text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setTab('invite'); setError(null); }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'invite'
              ? 'bg-seeko-accent text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Invite code
        </button>
      </div>

      {tab === 'signin' ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors"
              placeholder="you@seeko.studio"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:border-seeko-accent transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-seeko-accent text-primary-foreground font-semibold text-sm hover:bg-seeko-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <InviteCodeForm />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat: add invite code tab to login page"
```

---

## Task 6: Delete the old callback/invite route

**Files:**
- Delete: `src/app/api/auth/callback/invite/route.ts`

**Step 1: Delete the file**

```bash
rm /Volumes/CODEUSER/seeko-studio/src/app/api/auth/callback/invite/route.ts
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove unused callback/invite route (replaced by OTP flow)"
```

---

## Task 7: Smoke test the full flow

**Manual verification steps:**

1. Start dev server: `npm run dev`
2. Go to `http://localhost:3000/login`
3. Verify two tabs render: "Sign in" and "Invite code"
4. Sign in tab: confirm existing login still works with valid credentials
5. Invite code tab:
   - As admin, trigger an invite from the team page (or call `POST /api/invite` directly)
   - Check the target email inbox for a 6-digit code from Supabase
   - Enter the email + code on the invite tab
   - Confirm redirect to `/set-password`
   - Set a password → confirm redirect to `/onboarding`
   - Complete onboarding → confirm redirect to dashboard

**Run all tests:**

```bash
npm test
```

Expected: all tests pass.

**Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: post-smoke-test adjustments"
```
