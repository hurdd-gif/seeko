# Deadline Extension Requests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let team members request deadline extensions on tasks; admins approve/deny from a banner inside TaskDetail.

**Architecture:** New `deadline_extensions` table stores requests with status tracking. Two API routes handle create + decide. TaskDetail renders a request form (assignee) or approval banner (admin). Notifications use the existing `/api/notify/*` infrastructure. Activity log records all extension events.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, TypeScript, Motion (framer-motion)

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260308000000_deadline_extensions.sql`
- Modify: `docs/supabase-schema.sql` (append new table documentation)

**Step 1: Write the migration SQL**

Create `supabase/migrations/20260308000000_deadline_extensions.sql`:

```sql
-- Deadline extension requests
create table public.deadline_extensions (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.tasks(id) on delete cascade,
  requested_by      uuid not null references public.profiles(id) on delete cascade,
  extra_hours       integer not null,
  original_deadline date not null,
  new_deadline      date not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by        uuid references public.profiles(id),
  decided_at        timestamptz,
  denial_reason     text,
  created_at        timestamptz not null default now()
);

alter table public.deadline_extensions enable row level security;

-- Members can read their own requests
create policy "Users can read own extension requests"
  on public.deadline_extensions for select
  using (auth.uid() = requested_by);

-- Admins can read all requests
create policy "Admins can read all extension requests"
  on public.deadline_extensions for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Members can insert requests for tasks they are assigned to
create policy "Assignees can request extensions"
  on public.deadline_extensions for insert
  with check (
    auth.uid() = requested_by
    and exists (
      select 1 from public.tasks
      where id = task_id and assignee_id = auth.uid()
    )
  );

-- Admins can update (approve/deny)
create policy "Admins can decide on extensions"
  on public.deadline_extensions for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Index for fast lookup of pending requests per task
create index idx_deadline_extensions_task_status
  on public.deadline_extensions (task_id, status)
  where status = 'pending';
```

**Step 2: Apply the migration**

Run:
```bash
npx supabase db push
```

If using Supabase MCP, use `apply_migration` tool instead.

**Step 3: Update schema docs**

Append the new table to `docs/supabase-schema.sql` after the activity_log section:

```sql
-- ─── Deadline Extensions ──────────────────────────────────────────────────

create table public.deadline_extensions (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.tasks(id) on delete cascade,
  requested_by      uuid not null references public.profiles(id) on delete cascade,
  extra_hours       integer not null,
  original_deadline date not null,
  new_deadline      date not null,
  status            text not null default 'pending',
  decided_by        uuid references public.profiles(id),
  decided_at        timestamptz,
  denial_reason     text,
  created_at        timestamptz not null default now()
);
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260308000000_deadline_extensions.sql docs/supabase-schema.sql
git commit -m "feat: add deadline_extensions table and migration"
```

---

### Task 2: TypeScript Types & Notification Kinds

**Files:**
- Modify: `src/lib/types.ts` (lines ~151-160 for NotificationKind, add DeadlineExtension type)

**Step 1: Add DeadlineExtension type**

After the `Notification` type (around line 181), add:

```typescript
export type DeadlineExtension = {
  id: string;
  task_id: string;
  requested_by: string;
  extra_hours: number;
  original_deadline: string;
  new_deadline: string;
  status: 'pending' | 'approved' | 'denied';
  decided_by?: string | null;
  decided_at?: string | null;
  denial_reason?: string | null;
  created_at: string;
};
```

**Step 2: Add notification kinds**

Update the `NotificationKind` type (lines 151-160) to add three new values:

```typescript
export type NotificationKind =
  | 'task_assigned'
  | 'mentioned'
  | 'comment_reply'
  | 'task_completed'
  | 'deliverable_uploaded'
  | 'task_handoff'
  | 'payment_request'
  | 'payment_approved'
  | 'payment_denied'
  | 'deadline_extension_requested'
  | 'deadline_extension_approved'
  | 'deadline_extension_denied';
```

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add DeadlineExtension type and notification kinds"
```

---

### Task 3: Notification Kind Enum Migration

**Files:**
- Create: `supabase/migrations/20260308000001_deadline_extension_notification_kinds.sql`

**Step 1: Write the migration**

The notification bell component (`NotificationBell.tsx`) uses a `KIND_CONFIG` map. The `notifications.kind` column is `text`, not a Postgres enum, so no SQL enum update is needed. But we need to add the new kinds to the bell's config.

Check if there's an existing enum migration pattern. Looking at `20260305000005_notification_kind_enum_values.sql` — if `kind` is a Postgres enum, we need to add values:

```sql
-- Add deadline extension notification kinds
-- (Only needed if kind column uses a Postgres enum — skip if it's text)
alter type notification_kind add value if not exists 'deadline_extension_requested';
alter type notification_kind add value if not exists 'deadline_extension_approved';
alter type notification_kind add value if not exists 'deadline_extension_denied';
```

**Step 2: Apply migration**

```bash
npx supabase db push
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260308000001_deadline_extension_notification_kinds.sql
git commit -m "feat: add deadline extension notification kind enum values"
```

---

### Task 4: API Route — Create Extension Request

**Files:**
- Create: `src/app/api/deadline-extensions/route.ts`

**Step 1: Implement the POST handler**

Create `src/app/api/deadline-extensions/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { taskId, extraHours } = body as { taskId?: string; extraHours?: number };

  if (!taskId || !extraHours || extraHours < 1) {
    return NextResponse.json({ error: 'taskId and extraHours (>= 1) are required' }, { status: 400 });
  }

  // Fetch task to validate assignee + deadline
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, name, assignee_id, deadline')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  if (task.assignee_id !== user.id) {
    return NextResponse.json({ error: 'Only the assignee can request an extension' }, { status: 403 });
  }
  if (!task.deadline) {
    return NextResponse.json({ error: 'Task has no deadline' }, { status: 400 });
  }

  // Check for existing pending request
  const { data: existing } = await supabase
    .from('deadline_extensions')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'A pending request already exists for this task' }, { status: 409 });
  }

  // Compute new deadline
  const originalDate = new Date(task.deadline + 'T00:00:00');
  const newDate = new Date(originalDate.getTime() + extraHours * 3600000);
  const newDeadline = newDate.toISOString().split('T')[0];

  // Insert the request
  const service = createServiceClient();
  const { data: extension, error: insertError } = await service
    .from('deadline_extensions')
    .insert({
      task_id: taskId,
      requested_by: user.id,
      extra_hours: extraHours,
      original_deadline: task.deadline,
      new_deadline: newDeadline,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Log activity
  await service.from('activity_log').insert({
    user_id: user.id,
    action: 'Requested extension',
    target: `task: ${task.name}`,
    task_id: taskId,
  });

  // Notify admins
  const daysOrHours = extraHours >= 24
    ? `${Math.round(extraHours / 24)} day${Math.round(extraHours / 24) !== 1 ? 's' : ''}`
    : `${extraHours} hour${extraHours !== 1 ? 's' : ''}`;

  await fetch(new URL('/api/notify/admins', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      kind: 'deadline_extension_requested',
      title: `Extension requested on "${task.name}"`,
      body: `+${daysOrHours} — new deadline would be ${newDeadline}`,
      link: `/tasks?task=${taskId}`,
    }),
  });

  return NextResponse.json({ success: true, extension });
}
```

**Step 2: Verify the service client import exists**

Check that `src/lib/supabase/service.ts` exports `createServiceClient`. If it doesn't exist, look for how other API routes (e.g., `/api/notify/admins/route.ts`) create a service role client and use the same pattern.

**Step 3: Test manually**

Start dev server (`npm run dev`), log in as an assignee, and POST via browser console:
```javascript
fetch('/api/deadline-extensions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ taskId: '<some-task-id>', extraHours: 48 }),
}).then(r => r.json()).then(console.log)
```

Expected: `{ success: true, extension: { ... } }`

**Step 4: Commit**

```bash
git add src/app/api/deadline-extensions/route.ts
git commit -m "feat: add POST /api/deadline-extensions for requesting extensions"
```

---

### Task 5: API Route — Approve/Deny Extension

**Files:**
- Create: `src/app/api/deadline-extensions/[id]/route.ts`

**Step 1: Implement the PATCH handler**

Create `src/app/api/deadline-extensions/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { action, reason } = body as { action?: 'approve' | 'deny'; reason?: string };

  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json({ error: 'action must be "approve" or "deny"' }, { status: 400 });
  }

  const service = createServiceClient();

  // Fetch the extension request
  const { data: ext, error: fetchError } = await service
    .from('deadline_extensions')
    .select('*, tasks(name, deadline)')
    .eq('id', id)
    .single();

  if (fetchError || !ext) {
    return NextResponse.json({ error: 'Extension request not found' }, { status: 404 });
  }
  if (ext.status !== 'pending') {
    return NextResponse.json({ error: 'Request already resolved' }, { status: 409 });
  }

  const newStatus = action === 'approve' ? 'approved' : 'denied';

  // Update the extension request
  const { error: updateError } = await service
    .from('deadline_extensions')
    .update({
      status: newStatus,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      denial_reason: action === 'deny' ? (reason ?? null) : null,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // If approved, update the task's deadline
  if (action === 'approve') {
    const { error: taskError } = await service
      .from('tasks')
      .update({ deadline: ext.new_deadline })
      .eq('id', ext.task_id);

    if (taskError) {
      return NextResponse.json({ error: 'Extension approved but deadline update failed' }, { status: 500 });
    }
  }

  // Log activity
  const taskName = (ext as any).tasks?.name ?? 'a task';
  await service.from('activity_log').insert({
    user_id: user.id,
    action: action === 'approve' ? 'Approved extension' : 'Denied extension',
    target: `task: ${taskName}`,
    task_id: ext.task_id,
  });

  // Notify the requester
  const notifKind = action === 'approve'
    ? 'deadline_extension_approved'
    : 'deadline_extension_denied';

  const notifBody = action === 'approve'
    ? `New deadline: ${ext.new_deadline}`
    : reason
      ? `Reason: ${reason}`
      : 'No reason provided.';

  await fetch(new URL('/api/notify/user', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      userId: ext.requested_by,
      kind: notifKind,
      title: `Deadline extension ${newStatus} for "${taskName}"`,
      body: notifBody,
      link: `/tasks?task=${ext.task_id}`,
    }),
  });

  return NextResponse.json({ success: true, status: newStatus });
}
```

**Step 2: Commit**

```bash
git add src/app/api/deadline-extensions/
git commit -m "feat: add PATCH /api/deadline-extensions/[id] for approve/deny"
```

---

### Task 6: Data Fetcher — Pending Extension for a Task

**Files:**
- Modify: `src/lib/supabase/data.ts`

**Step 1: Add fetchPendingExtension function**

Add after the `fetchActivity` function:

```typescript
export async function fetchPendingExtension(taskId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('deadline_extensions')
    .select('*, profiles!requested_by(display_name)')
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}
```

**Step 2: Commit**

```bash
git add src/lib/supabase/data.ts
git commit -m "feat: add fetchPendingExtension data fetcher"
```

---

### Task 7: NotificationBell — Add New Kind Icons

**Files:**
- Modify: `src/components/dashboard/NotificationBell.tsx`

**Step 1: Find the KIND_CONFIG map and add three new entries**

Add these to the `KIND_CONFIG` object. Import `Clock` from lucide-react if not already imported:

```typescript
deadline_extension_requested: { icon: Clock,       className: 'text-amber-400',    bg: 'bg-amber-500/10' },
deadline_extension_approved:  { icon: CheckCircle2, className: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
deadline_extension_denied:    { icon: CircleX,      className: 'text-red-400',      bg: 'bg-red-500/10' },
```

**Step 2: Commit**

```bash
git add src/components/dashboard/NotificationBell.tsx
git commit -m "feat: add deadline extension icons to notification bell"
```

---

### Task 8: TaskDetail — Extension Request Form (Assignee)

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

This is the assignee-facing UI. Add it below the deadline callout section (after line ~1123), before the metadata row.

**Step 1: Add state for extension form**

Inside the `TaskDetail` component function, after the existing state declarations, add:

```typescript
const [showExtForm, setShowExtForm] = useState(false);
const [extUnit, setExtUnit] = useState<'hours' | 'days'>('days');
const [extAmount, setExtAmount] = useState(1);
const [extSubmitting, setExtSubmitting] = useState(false);
const [pendingExt, setPendingExt] = useState<{
  id: string;
  extra_hours: number;
  new_deadline: string;
  status: string;
  profiles?: { display_name?: string };
} | null>(null);
```

**Step 2: Add effect to fetch pending extension**

After the state declarations, add an effect:

```typescript
useEffect(() => {
  if (!open || !task.id) return;
  const fetchExt = async () => {
    const res = await supabase
      .from('deadline_extensions')
      .select('id, extra_hours, new_deadline, status, profiles!requested_by(display_name)')
      .eq('task_id', task.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    setPendingExt(res.data ?? null);
  };
  fetchExt();
}, [open, task.id, supabase]);
```

**Step 3: Add the submit handler**

```typescript
const handleExtensionRequest = async () => {
  setExtSubmitting(true);
  const totalHours = extUnit === 'days' ? extAmount * 24 : extAmount;
  try {
    const res = await fetch('/api/deadline-extensions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, extraHours: totalHours }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to request extension');
      return;
    }
    toast.success('Extension requested');
    setPendingExt(data.extension);
    setShowExtForm(false);
  } catch {
    toast.error('Network error');
  } finally {
    setExtSubmitting(false);
  }
};
```

**Step 4: Add the UI below the urgent deadline callout**

After the urgent deadline callout block (around line 1123) and before the metadata row, add:

```tsx
{/* Extension request — assignee only */}
{task.deadline && !isAdmin && task.assignee_id === currentUserId && (
  pendingExt ? (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2.5 mb-3 text-sm text-amber-400">
      <Clock className="size-4 shrink-0" />
      <span>Extension requested — waiting for approval</span>
    </div>
  ) : showExtForm ? (
    <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-3 mb-3 space-y-3">
      <p className="text-sm font-medium text-foreground">Request more time</p>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setExtUnit('hours')}
            className={cn(
              'px-3 py-1 text-xs font-medium transition-colors',
              extUnit === 'hours' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Hours
          </button>
          <button
            type="button"
            onClick={() => setExtUnit('days')}
            className={cn(
              'px-3 py-1 text-xs font-medium transition-colors',
              extUnit === 'days' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Days
          </button>
        </div>
        <input
          type="number"
          min={1}
          max={extUnit === 'days' ? 30 : 720}
          value={extAmount}
          onChange={e => setExtAmount(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-foreground text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-xs text-muted-foreground">{extUnit}</span>
      </div>
      {/* Preview */}
      <p className="text-xs text-muted-foreground">
        New deadline:{' '}
        <span className="text-foreground font-medium">
          {new Date(
            new Date(task.deadline + 'T00:00:00').getTime() +
            (extUnit === 'days' ? extAmount * 24 : extAmount) * 3600000
          ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExtensionRequest}
          disabled={extSubmitting}
          className="rounded-md bg-seeko-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-seeko-accent/90 transition-colors disabled:opacity-50"
        >
          {extSubmitting ? 'Requesting…' : 'Submit request'}
        </button>
        <button
          onClick={() => setShowExtForm(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setShowExtForm(true)}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
    >
      <Clock className="size-3" />
      Request more time
    </button>
  )
)}
```

**Step 5: Verify it renders**

Run: `npm run dev`, open a task you're assigned to that has a deadline. Verify:
1. "Request more time" link appears
2. Clicking it shows the inline form with hours/days toggle
3. Preview updates as you change the amount
4. Submit sends POST and shows pending status

**Step 6: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: add deadline extension request form for assignees in TaskDetail"
```

---

### Task 9: TaskDetail — Admin Approval Banner

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Step 1: Add admin state for deny reason**

Add alongside the other extension state:

```typescript
const [denyMode, setDenyMode] = useState(false);
const [denyReason, setDenyReason] = useState('');
const [extDeciding, setExtDeciding] = useState(false);
```

**Step 2: Add the decide handler**

```typescript
const handleExtensionDecision = async (action: 'approve' | 'deny') => {
  if (!pendingExt) return;
  setExtDeciding(true);
  try {
    const res = await fetch(`/api/deadline-extensions/${pendingExt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        reason: action === 'deny' ? denyReason.trim() || undefined : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? `Failed to ${action} extension`);
      return;
    }
    toast.success(action === 'approve' ? 'Extension approved — deadline updated' : 'Extension denied');
    setPendingExt(null);
    setDenyMode(false);
    setDenyReason('');
    // Refresh task data if parent provides a mechanism, otherwise router.refresh()
  } catch {
    toast.error('Network error');
  } finally {
    setExtDeciding(false);
  }
};
```

**Step 3: Add the admin banner UI**

Place this at the very top of the TaskDetail content area (before the urgent deadline callout), so it's the first thing admins see:

```tsx
{/* Admin: pending extension banner */}
{isAdmin && pendingExt && (
  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-3 mb-3 space-y-2.5">
    <div className="flex items-start gap-2">
      <Clock className="size-4 text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <span className="font-medium">
            {(pendingExt as any).profiles?.display_name ?? 'Someone'}
          </span>{' '}
          requested{' '}
          <span className="font-medium">
            {pendingExt.extra_hours >= 24
              ? `${Math.round(pendingExt.extra_hours / 24)} more day${Math.round(pendingExt.extra_hours / 24) !== 1 ? 's' : ''}`
              : `${pendingExt.extra_hours} more hour${pendingExt.extra_hours !== 1 ? 's' : ''}`}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {task.deadline} → {pendingExt.new_deadline}
        </p>
      </div>
    </div>
    {denyMode ? (
      <div className="space-y-2 pl-6">
        <textarea
          value={denyReason}
          onChange={e => setDenyReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={2}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExtensionDecision('deny')}
            disabled={extDeciding}
            className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {extDeciding ? 'Denying…' : 'Confirm deny'}
          </button>
          <button
            onClick={() => { setDenyMode(false); setDenyReason(''); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div className="flex items-center gap-2 pl-6">
        <button
          onClick={() => handleExtensionDecision('approve')}
          disabled={extDeciding}
          className="rounded-md bg-seeko-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-seeko-accent/90 transition-colors disabled:opacity-50"
        >
          {extDeciding ? 'Approving…' : 'Approve'}
        </button>
        <button
          onClick={() => setDenyMode(true)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          Deny
        </button>
      </div>
    )}
  </div>
)}
```

**Step 4: Test the full flow**

1. Log in as assignee → open task with deadline → request +2 days
2. Log in as admin → open same task → see banner with "Approve" / "Deny"
3. Test approve: deadline updates, requester gets notification
4. Test deny: with and without reason, requester gets notification

**Step 5: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: add admin approval banner for deadline extensions in TaskDetail"
```

---

### Task 10: Activity Page — New Action Configs

**Files:**
- Modify: `src/components/dashboard/ActivityFeed.tsx`

**Step 1: Add extension actions to ACTION_CONFIG and actionToSentence**

In `ACTION_CONFIG`, add:

```typescript
'Requested extension':  { icon: Clock,        className: 'text-amber-400' },
'Approved extension':   { icon: CheckCircle2,  className: 'text-emerald-400', significant: true },
'Denied extension':     { icon: AlertCircle,   className: 'text-red-400', significant: true },
```

Import `Clock` from lucide-react if not already imported.

In `actionToSentence`, add:

```typescript
'Requested extension': 'requested an extension on',
'Approved extension': 'approved an extension on',
'Denied extension': 'denied an extension on',
```

**Step 2: Do the same in the dashboard overview page**

In `src/app/(dashboard)/page.tsx`, check if the activity feed there also needs these action mappings. The overview uses `ACTIVITY_ICONS` with lowercase keys. No changes needed since it uses a fallback for unknown actions.

**Step 3: Commit**

```bash
git add src/components/dashboard/ActivityFeed.tsx
git commit -m "feat: add extension action configs to activity feed"
```

---

### Task 11: Final Testing & PR

**Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run dev server and test full flow**

```bash
npm run dev
```

Test:
1. Assignee sees "Request more time" on tasks with deadlines
2. Hours/days toggle and preview work correctly
3. Submit creates request, shows pending status
4. Admin notification appears in bell
5. Admin sees banner on task, can approve or deny
6. Approve updates deadline, notify requester
7. Deny with optional reason, notify requester
8. Activity feed shows extension events
9. After resolution, assignee can request again

**Step 3: Commit any fixes**

**Step 4: Create PR**

```bash
git push -u origin feat/deadline-clarity
gh pr create --title "feat: deadline extension requests" --body "..."
```
