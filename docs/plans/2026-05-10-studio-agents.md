# Studio Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build two Claude Console managed agents (`seeko-weekly-digest` and `seeko-studio-bot`) plus the new in-app surfaces they read from / write to (`/inbox` for notes, `/digest` for weekly snapshots).

**Architecture:** App-side delivers two Supabase tables (`notes`, `digests`) and two routes (`/inbox`, `/digest`) so the agents have read/write targets and the dashboard has UI to render their output. Agents themselves live in Claude Console (managed runtime) with Supabase MCP wired in — they read/write to the same Supabase project the app uses, via service role. Telegram bot uses webhook trigger + memory store; digest uses cron trigger.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), Tailwind v4 + shadcn/ui, Vitest, Claude Console managed agents, Telegram Bot API, @simplewebauthn — wait, no passkey work here. Just the above.

**Branch:** `feat/studio-agents` (already created off `origin/main`, design doc committed at `179cb41`).

**Design source of truth:** `docs/plans/2026-05-10-studio-agents-design.md`

---

## Task ordering

Phase 1 (notes) → Phase 2 (digests) → Phase 3 (digest agent) → Phase 4 (bot agent).

The app surfaces ship before the agents so we can manually seed test rows and validate `/inbox` and `/digest` render correctly before any Console agent runs against the real tables.

---

## Phase 1 — Notes feature

### Task 1.1: Add `notes` table + `note_status` enum migration

**Files:**
- Create: `supabase/migrations/20260511000001_notes_table.sql`
- Modify: `docs/supabase-schema.sql` (append the new table definition)
- Modify: `docs/personas/ia.md` (document table)

**Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260511000001_notes_table.sql

create type note_status as enum ('open', 'archived');

create table notes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  status note_status not null default 'open',
  source text not null default 'web',
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  converted_to_task_id uuid references tasks(id) on delete set null
);

create index notes_status_created_at_idx on notes (status, created_at desc);
create index notes_created_by_idx on notes (created_by);

alter table notes enable row level security;

create policy "notes_admin_select"
  on notes for select
  using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true)
  );

create policy "notes_admin_insert"
  on notes for insert
  with check (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true)
  );

create policy "notes_admin_update"
  on notes for update
  using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true)
  );
```

**Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `name: 'notes_table'` and the SQL above. Confirm with the user before applying (writes to remote db).

**Step 3: Verify**

```bash
# In Supabase MCP, query:
select column_name, data_type from information_schema.columns where table_name = 'notes';
```

Expected: 7 columns matching the migration.

**Step 4: Update docs**

Append a row to `docs/supabase-schema.sql` mirroring the table, and add section `### 9. notes` in `docs/personas/ia.md` (under section 8).

**Step 5: Commit**

```bash
git add supabase/migrations/20260511000001_notes_table.sql docs/supabase-schema.sql docs/personas/ia.md
git commit -m "feat(db): add notes table + note_status enum"
```

---

### Task 1.2: Add Note types

**Files:**
- Modify: `src/lib/types.ts`
- Regenerate: `src/lib/supabase/database.types.ts` (via `mcp__claude_ai_Supabase__generate_typescript_types`)

**Step 1: Add hand-rolled types**

```ts
// src/lib/types.ts (append)

export type NoteStatus = 'open' | 'archived';
export type NoteSource = 'web' | 'telegram';

export type Note = {
  id: string;
  body: string;
  status: NoteStatus;
  source: NoteSource | string;
  created_by: string;
  created_at: string;
  converted_to_task_id?: string;
};
```

**Step 2: Regenerate database.types.ts**

Run `mcp__claude_ai_Supabase__generate_typescript_types` and overwrite `src/lib/supabase/database.types.ts`.

**Step 3: Verify tsc**

```bash
npm run typecheck
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/supabase/database.types.ts
git commit -m "feat(types): add Note + NoteStatus types"
```

---

### Task 1.3: Data layer — `fetchInboxNotes`, `archiveNote`, `createNote`, `convertNoteToTask`

**Files:**
- Modify: `src/lib/supabase/data.ts`
- Create: `src/lib/supabase/__tests__/notes.test.ts`

**Step 1: Write failing tests**

```ts
// src/lib/supabase/__tests__/notes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchInboxNotes, archiveNote, createNote, convertNoteToTask } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(),
}));

describe('notes data layer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetchInboxNotes returns open notes ordered desc by created_at', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'n1', status: 'open' }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from });

    const notes = await fetchInboxNotes();
    expect(from).toHaveBeenCalledWith('notes');
    expect(eq).toHaveBeenCalledWith('status', 'open');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(notes).toEqual([{ id: 'n1', status: 'open' }]);
  });

  it('archiveNote updates status to archived', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const { createClient } = await import('../server');
    (createClient as any).mockResolvedValue({ from });

    await archiveNote('n1');
    expect(update).toHaveBeenCalledWith({ status: 'archived' });
    expect(eq).toHaveBeenCalledWith('id', 'n1');
  });

  // Add tests for createNote and convertNoteToTask similarly
});
```

**Step 2: Run tests — expect FAIL**

```bash
npm test -- src/lib/supabase/__tests__/notes.test.ts
```

Expected: fails on missing exports.

**Step 3: Implement**

```ts
// src/lib/supabase/data.ts (append)

export async function fetchInboxNotes(): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchArchivedNotes(limit = 50): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function archiveNote(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('notes').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

export async function createNote(body: string, source: NoteSource = 'web'): Promise<Note> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data, error } = await supabase
    .from('notes')
    .insert({ body, source, created_by: user.id })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function convertNoteToTask(
  noteId: string,
  task: { name: string; department: string; description?: string; assignee_id?: string; deadline?: string; priority?: Priority }
): Promise<Task> {
  const supabase = await createClient();
  const { data: created, error: insertErr } = await supabase
    .from('tasks')
    .insert({ ...task, status: 'In Progress', priority: task.priority ?? 'Medium' })
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  const { error: updateErr } = await supabase
    .from('notes')
    .update({ status: 'archived', converted_to_task_id: created.id })
    .eq('id', noteId);
  if (updateErr) throw updateErr;
  return created;
}
```

**Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/supabase/__tests__/notes.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/supabase/data.ts src/lib/supabase/__tests__/notes.test.ts
git commit -m "feat(data): add notes fetch/archive/create/convert helpers"
```

---

### Task 1.4: Add `/inbox` sidebar entry with badge

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/lib/supabase/data.ts` (add `fetchOpenNoteCount`)

**Step 1: Write helper test**

```ts
// in src/lib/supabase/__tests__/notes.test.ts — append
it('fetchOpenNoteCount returns count via Supabase head=true select', async () => {
  // ... mock head/count return
});
```

**Step 2: Implement count helper**

```ts
export async function fetchOpenNoteCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) throw error;
  return count ?? 0;
}
```

**Step 3: Add to sidebar**

```tsx
// Sidebar.tsx — admin-only section
{isAdmin && (
  <SidebarItem
    href="/inbox"
    icon={<Inbox className="size-4" />}
    label="Inbox"
    badge={openNotesCount > 0 ? openNotesCount : undefined}
  />
)}
```

The count is fetched in the parent layout server component and passed as a prop.

**Step 4: Verify visually**

```bash
npm run dev
```

Insert one test note via Supabase SQL editor, visit `/`, confirm sidebar shows "Inbox" with badge.

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/lib/supabase/data.ts src/lib/supabase/__tests__/notes.test.ts
git commit -m "feat(ui): add Inbox sidebar entry with open-count badge"
```

---

### Task 1.5: Build `/inbox` route (server component shell)

**Files:**
- Create: `src/app/(dashboard)/inbox/page.tsx`
- Create: `src/components/dashboard/InboxList.tsx`

**Step 1: Write page**

```tsx
// src/app/(dashboard)/inbox/page.tsx
import { fetchInboxNotes, fetchArchivedNotes } from '@/lib/supabase/data';
import { InboxList } from '@/components/dashboard/InboxList';
import { QuickNoteComposer } from '@/components/dashboard/QuickNoteComposer';

export default async function InboxPage() {
  const [open, archived] = await Promise.all([fetchInboxNotes(), fetchArchivedNotes()]);
  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-medium">Inbox</h1>
        <p className="text-sm text-muted-foreground">Captured thoughts waiting to be triaged into tasks.</p>
      </header>
      <QuickNoteComposer />
      <InboxList open={open} archived={archived} />
    </div>
  );
}
```

**Step 2: Verify access — admin-only**

The `(dashboard)` route group is already protected by `proxy.ts`. Add an extra admin-check at the top of the page that redirects non-admins to `/`. Use the same pattern as `/payments`.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/inbox/page.tsx
git commit -m "feat(ui): scaffold /inbox route (admin-only)"
```

---

### Task 1.6: Build `InboxList` + `NoteRow` with archive action

**Files:**
- Create: `src/components/dashboard/InboxList.tsx`
- Create: `src/components/dashboard/NoteRow.tsx`
- Create: `src/app/actions/notes.ts` (server actions)

**Step 1: Server actions**

```ts
// src/app/actions/notes.ts
'use server';
import { archiveNote, createNote, convertNoteToTask } from '@/lib/supabase/data';
import { revalidatePath } from 'next/cache';

export async function archiveNoteAction(id: string) {
  await archiveNote(id);
  revalidatePath('/inbox');
}

export async function createNoteAction(body: string) {
  if (!body.trim()) return;
  await createNote(body.trim(), 'web');
  revalidatePath('/inbox');
}

export async function convertNoteToTaskAction(
  noteId: string,
  task: { name: string; department: string; description?: string; assignee_id?: string; deadline?: string }
) {
  await convertNoteToTask(noteId, task);
  revalidatePath('/inbox');
}
```

**Step 2: NoteRow component**

```tsx
// src/components/dashboard/NoteRow.tsx
'use client';
import { useState, useTransition } from 'react';
import { Archive, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { archiveNoteAction } from '@/app/actions/notes';
import { ConvertToTaskModal } from './ConvertToTaskModal';
import type { Note } from '@/lib/types';

export function NoteRow({ note }: { note: Note }) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-sm">{note.body}</p>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{note.source}</Badge>
          <span>{new Date(note.created_at).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => archiveNoteAction(note.id))}
          >
            <Archive className="size-3.5" /> Archive
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConvertOpen(true)}>
            <ArrowRight className="size-3.5" /> Convert to task
          </Button>
        </div>
      </div>
      <ConvertToTaskModal note={note} open={convertOpen} onClose={() => setConvertOpen(false)} />
    </div>
  );
}
```

**Step 3: InboxList shell with open/archived tabs**

```tsx
// src/components/dashboard/InboxList.tsx
'use client';
import { useState } from 'react';
import { NoteRow } from './NoteRow';
import type { Note } from '@/lib/types';

export function InboxList({ open, archived }: { open: Note[]; archived: Note[] }) {
  const [tab, setTab] = useState<'open' | 'archived'>('open');
  const list = tab === 'open' ? open : archived;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 border-b border-border">
        {(['open', 'archived'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize border-b-2 transition-colors ${
              tab === t ? 'border-seeko-accent text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            {t} {t === 'open' && open.length > 0 && `(${open.length})`}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No {tab} notes.</p>
      ) : (
        list.map(n => <NoteRow key={n.id} note={n} />)
      )}
    </div>
  );
}
```

**Step 4: Verify**

Visit `/inbox`. Insert a test note, see it appear in Open. Click Archive, see it move to Archived.

**Step 5: Commit**

```bash
git add src/app/actions/notes.ts src/components/dashboard/InboxList.tsx src/components/dashboard/NoteRow.tsx
git commit -m "feat(ui): InboxList + NoteRow with archive action"
```

---

### Task 1.7: Quick-note composer (web entry)

**Files:**
- Create: `src/components/dashboard/QuickNoteComposer.tsx`

**Step 1: Component**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { createNoteAction } from '@/app/actions/notes';

export function QuickNoteComposer() {
  const [value, setValue] = useState('');
  const [pending, startTransition] = useTransition();
  const submit = () => {
    if (!value.trim()) return;
    startTransition(async () => {
      await createNoteAction(value);
      setValue('');
    });
  };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="rounded-lg border border-border bg-card p-3 flex items-end gap-2"
    >
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Capture a thought..."
        rows={2}
        className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground"
      />
      <Button type="submit" disabled={pending || !value.trim()} size="sm">
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
```

**Step 2: Verify** in `/inbox`.

**Step 3: Commit**

```bash
git add src/components/dashboard/QuickNoteComposer.tsx
git commit -m "feat(ui): add QuickNoteComposer for web note entry"
```

---

### Task 1.8: Convert-to-task modal

**Files:**
- Create: `src/components/dashboard/ConvertToTaskModal.tsx`

**Step 1: Build modal**

Use the existing modal pattern from elsewhere in the app (likely a shadcn Dialog). Form fields: name (defaults to first 60 chars of note body), department (select), assignee_id (select from team), deadline (date), priority (select). Submit calls `convertNoteToTaskAction(note.id, formData)`.

```tsx
// src/components/dashboard/ConvertToTaskModal.tsx
'use client';
import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { convertNoteToTaskAction } from '@/app/actions/notes';
import type { Note } from '@/lib/types';

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];

export function ConvertToTaskModal({ note, open, onClose }: { note: Note; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(note.body.slice(0, 60));
  const [department, setDepartment] = useState('Coding');
  const [deadline, setDeadline] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      await convertNoteToTaskAction(note.id, { name, department, description: note.body, deadline: deadline || undefined });
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Convert note to task</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Task name" />
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Creating…' : 'Create task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify** end-to-end: note → modal → submit → task created in `/tasks` view, note archived.

**Step 3: Commit**

```bash
git add src/components/dashboard/ConvertToTaskModal.tsx
git commit -m "feat(ui): ConvertToTaskModal for note triage"
```

---

## Phase 2 — Digests feature

### Task 2.1: Add `digests` table migration

**Files:**
- Create: `supabase/migrations/20260511000002_digests_table.sql`
- Modify: `docs/supabase-schema.sql`
- Modify: `docs/personas/ia.md`

**Step 1: Migration**

```sql
create table digests (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  generated_at timestamptz not null default now(),
  data jsonb not null
);

create index digests_week_start_idx on digests (week_start desc);

alter table digests enable row level security;

create policy "digests_admin_or_investor_select"
  on digests for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and (profiles.is_admin = true or profiles.is_investor = true)
    )
  );
```

Inserts only via service role (the digest agent). No client write policies.

**Step 2: Apply + verify** via Supabase MCP.

**Step 3: Commit**

```bash
git add supabase/migrations/20260511000002_digests_table.sql docs/supabase-schema.sql docs/personas/ia.md
git commit -m "feat(db): add digests table (admin/investor read, service-role write)"
```

---

### Task 2.2: Add Digest types + role-based filter

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/digest-filter.ts`
- Create: `src/lib/__tests__/digest-filter.test.ts`

**Step 1: Hand-rolled types**

```ts
// src/lib/types.ts (append)

export type DigestPayments = {
  created_count: number;
  created_total_usd: number;
  paid_count: number;
  paid_total_usd: number;
  pending_total_usd: number;
  top_recipients: Array<{ recipient_id: string; name: string; total_paid: number }>;
};

export type DigestNdaAdmin = {
  signed_count: number;
  unsigned_count: number;
  signed_this_week: Array<{ user_id: string; name: string; signed_at: string }>;
  unsigned_list: Array<{ user_id: string; name: string }>;
};

export type DigestNdaInvestor = {
  signed_count: number;
  unsigned_count: number;
};

export type DigestTeam = {
  new_members: Array<{ id: string; name: string; department: string; role: string; created_at: string }>;
};

export type DigestDataAdmin = {
  payments: DigestPayments;
  nda: DigestNdaAdmin;
  team: DigestTeam;
};

export type DigestDataInvestor = {
  payments: DigestPayments;
  nda: DigestNdaInvestor;
  team: DigestTeam;
};

export type Digest = {
  id: string;
  week_start: string;
  week_end: string;
  generated_at: string;
  data: DigestDataAdmin; // raw row is always admin shape
};
```

**Step 2: Write failing test for filter**

```ts
// src/lib/__tests__/digest-filter.test.ts
import { describe, it, expect } from 'vitest';
import { filterDigestForViewer } from '../digest-filter';

const adminPayload = {
  payments: { created_count: 1, created_total_usd: 100, paid_count: 1, paid_total_usd: 100, pending_total_usd: 0, top_recipients: [] },
  nda: {
    signed_count: 2,
    unsigned_count: 1,
    signed_this_week: [{ user_id: 'u1', name: 'Alice', signed_at: '2026-05-08T10:00:00Z' }],
    unsigned_list: [{ user_id: 'u2', name: 'Bob' }],
  },
  team: { new_members: [] },
};

describe('filterDigestForViewer', () => {
  it('returns full payload for admin', () => {
    expect(filterDigestForViewer(adminPayload, 'admin')).toEqual(adminPayload);
  });

  it('strips nda PII for investor', () => {
    const filtered = filterDigestForViewer(adminPayload, 'investor');
    expect(filtered.nda).toEqual({ signed_count: 2, unsigned_count: 1 });
    expect(filtered.payments).toEqual(adminPayload.payments);
    expect(filtered.team).toEqual(adminPayload.team);
  });
});
```

**Step 3: Run — expect FAIL.**

**Step 4: Implement**

```ts
// src/lib/digest-filter.ts
import type { DigestDataAdmin, DigestDataInvestor } from './types';

export type ViewerRole = 'admin' | 'investor';

export function filterDigestForViewer(
  data: DigestDataAdmin,
  role: ViewerRole
): DigestDataAdmin | DigestDataInvestor {
  if (role === 'admin') return data;
  return {
    payments: data.payments,
    nda: { signed_count: data.nda.signed_count, unsigned_count: data.nda.unsigned_count },
    team: data.team,
  };
}
```

**Step 5: Run — expect PASS. Commit.**

```bash
git add src/lib/digest-filter.ts src/lib/__tests__/digest-filter.test.ts src/lib/types.ts
git commit -m "feat(types): add Digest types + filterDigestForViewer"
```

---

### Task 2.3: Data layer — `fetchLatestDigest`, `fetchDigestByWeek`

**Files:**
- Modify: `src/lib/supabase/data.ts`
- Create: `src/lib/supabase/__tests__/digests.test.ts`

Test, implement, commit — same pattern as Task 1.3. Functions:

```ts
export async function fetchLatestDigest(): Promise<Digest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('digests')
    .select('*')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchDigestByWeek(weekStart: string): Promise<Digest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('digests')
    .select('*')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

**Commit:**
```bash
git commit -m "feat(data): add fetchLatestDigest + fetchDigestByWeek"
```

---

### Task 2.4: Sidebar entry "Digest"

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

Show only when `is_admin || is_investor`. Same visual pattern as other sidebar items. No badge.

```bash
git commit -m "feat(ui): add Digest sidebar entry (admin or investor)"
```

---

### Task 2.5: `/digest` route + `DigestView` component

**Files:**
- Create: `src/app/(dashboard)/digest/page.tsx`
- Create: `src/app/(dashboard)/digest/[isoWeek]/page.tsx`
- Create: `src/components/dashboard/DigestView.tsx`
- Create: `src/components/dashboard/DigestPaymentsSection.tsx`
- Create: `src/components/dashboard/DigestNdaSection.tsx`
- Create: `src/components/dashboard/DigestTeamSection.tsx`

**Step 1: `/digest` (latest)**

```tsx
// src/app/(dashboard)/digest/page.tsx
import { redirect } from 'next/navigation';
import { fetchLatestDigest } from '@/lib/supabase/data';
import { fetchCurrentProfile } from '@/lib/supabase/data';
import { filterDigestForViewer } from '@/lib/digest-filter';
import { DigestView } from '@/components/dashboard/DigestView';

export default async function DigestLatestPage() {
  const profile = await fetchCurrentProfile();
  if (!profile?.is_admin && !profile?.is_investor) redirect('/');
  const digest = await fetchLatestDigest();
  if (!digest) {
    return <div className="p-6">No digest yet. The first one lands Monday.</div>;
  }
  const role = profile.is_admin ? 'admin' : 'investor';
  const data = filterDigestForViewer(digest.data, role);
  return <DigestView digest={digest} data={data} role={role} />;
}
```

**Step 2: `/digest/[isoWeek]`**

Parses URL like `2026-W19` → `week_start` date, calls `fetchDigestByWeek`, renders same `DigestView`.

**Step 3: `DigestView` composition**

Three sections (payments, nda, team), each as its own component. Investor view simply receives the filtered payload — the components render whatever shape they're given.

**Step 4: Verify** with a seeded row (insert one digest by hand via Supabase SQL editor).

**Step 5: Commit**

```bash
git commit -m "feat(ui): /digest + /digest/[isoWeek] routes with role filter"
```

---

## Phase 3 — Digest agent (Console)

### Task 3.1: Write digest assembly system prompt

**Files:**
- Create: `docs/agents/seeko-weekly-digest.md`

**Content:** A markdown doc containing the agent's full instruction set: persona, week-range computation rules, required `data` jsonb shape, idempotency rule (one row per week_start), step-by-step queries to run, and how to handle empty weeks.

This file becomes the System Prompt pasted into the Console agent definition.

**Step 1: Draft prompt** (excerpt):

```markdown
# seeko-weekly-digest — System Prompt

You are SEEKO Studio's weekly digest writer. You run every Monday at 08:00 America/New_York. Your single job: insert one row into the `digests` Supabase table summarizing the prior week (Mon 00:00 → Sun 23:59 ET).

## Tools
- Supabase MCP: read access to payments, payment_items, profiles. Insert access to digests.

## Run procedure

1. Compute `week_start` (last Mon 00:00 ET → UTC date) and `week_end` (Sun 23:59 ET → UTC date).
2. If a row already exists for that week_start: stop. Do not duplicate.
3. Otherwise gather:
   - payments: SELECT counts/sums in the window
   - nda: SELECT profiles where nda_accepted_at IN window, plus unsigned counts/list
   - team: SELECT profiles where created_at IN window
4. Assemble data jsonb per the schema in `docs/plans/2026-05-10-studio-agents.md`.
5. INSERT INTO digests (week_start, week_end, data). UNIQUE constraint makes re-runs noop.
6. Reply with one-line status: "Digest written for week of YYYY-MM-DD" or "Skipped — already exists".
```

Include the exact SQL queries for each section, the JSON schema, and the date math (ISO week calculation).

**Step 2: Commit**

```bash
git add docs/agents/seeko-weekly-digest.md
git commit -m "docs(agents): system prompt for seeko-weekly-digest"
```

---

### Task 3.2: Console setup checklist for digest agent

**Files:**
- Modify: `docs/agents/seeko-weekly-digest.md` (append setup section)

Document the Console UI clicks required: create agent → paste system prompt → wire Supabase MCP → add credential vault entries → set cron trigger `0 8 * * 1` America/New_York → enable.

Mark this as a manual checklist; no code lands.

**Commit:**
```bash
git commit -m "docs(agents): Console setup checklist for digest agent"
```

---

### Task 3.3: First run + verify

**Manual:**

1. Trigger the agent manually from Console UI ("Run now")
2. Verify a row appears in `digests` for the most recent prior week
3. Visit `/digest` as admin → confirm payload renders
4. Visit `/digest` as investor (test account) → confirm PII stripped
5. If first run looks right, leave cron enabled

No commit — this is operational.

---

## Phase 4 — Telegram bot agent (Console)

### Task 4.1: Create Telegram bot via @BotFather

**Manual:**

1. Open Telegram, message `@BotFather`
2. `/newbot` → name `SEEKO Studio Bot`, username `seeko_studio_bot` (or available variant)
3. Save the HTTP API token
4. `/setdescription`: "Texts the SEEKO Studio dashboard. Create tasks, capture notes, read studio context."
5. `/setcommands`:
   ```
   tasks - Show recent tasks
   areas - Show area status
   note - Capture a quick note
   help - What can I do
   ```
6. Get your Telegram user ID from `@userinfobot`. Save it.

Add token + your user ID to Console credential vault as `TELEGRAM_BOT_TOKEN` and `ALLOWED_TELEGRAM_USER_IDS`.

No commit.

---

### Task 4.2: Write bot system prompt

**Files:**
- Create: `docs/agents/seeko-studio-bot.md`

**Step 1: Draft** (excerpt):

```markdown
# seeko-studio-bot — System Prompt

You are SEEKO Studio's personal assistant for Karti. You receive Telegram messages and respond in plain text (no Markdown formatting that Telegram won't render). You act on Karti's behalf in the studio Supabase database.

## Persona
- Direct, terse. Confirmations are one line.
- No filler ("Sure!", "I'll help with that"). Just do the work and report.
- When listing items, use short lines. No emoji.

## Auth (already enforced by webhook layer)
You only ever see messages from allowlisted Telegram users. You don't validate identity — that's done before your invocation. You can assume the operator is Karti.

## Tools
[list of tools — see Task 4.3]

## Behavior rules

- Default to action. If the request is unambiguous, do it. Don't ask "are you sure?".
- For ambiguous task creation (e.g. missing department), pick the most likely value and report it. Karti can correct.
- Never use the word "I" excessively. Lead with what you did.
- Memory: refer to "the last task I made" using your scratch memory key.

## Examples

User: "create a task to redo the boss music, animation dept, high priority"
You: [call create_task] "Created: Redo boss music · Animation · High · In Progress"

User: "note: check uv mapping on dragon"
You: [call create_note] "Noted."

User: "what's blocked"
You: [call read_tasks with filter status=Blocked] "Blocked (2): Boss intro cinematic · Dragon rig"
```

**Step 2: Commit**

```bash
git add docs/agents/seeko-studio-bot.md
git commit -m "docs(agents): system prompt for seeko-studio-bot"
```

---

### Task 4.3: Define bot tool schemas

**Files:**
- Modify: `docs/agents/seeko-studio-bot.md` (append Tools section)

Spell out each tool as JSON-schema-ish:

```markdown
## Tools

### read_tasks
Input: { status?: TaskStatus, assignee_id?: uuid, area_id?: uuid, department?: Department, limit?: int (default 20) }
Backend: Supabase MCP SELECT from tasks with optional filters, ORDER BY deadline ASC NULLS LAST.

### create_task
Input: { name: string, department: Department, status?: TaskStatus (default 'In Progress'), priority?: Priority (default 'Medium'), area_id?: uuid, assignee_id?: uuid, deadline?: date, description?: string }
Backend: Supabase MCP INSERT INTO tasks.

### update_task
Input: { id: uuid, patch: { name?, status?, priority?, area_id?, assignee_id?, deadline?, description? } }
Backend: Supabase MCP UPDATE tasks SET ... WHERE id = $1.

### read_areas
Input: {}
Output: [{ id, name, status, progress, phase }]

### read_team
Input: {}
Output: [{ id, display_name, department, role, is_admin, is_contractor, is_investor }]

### read_recent_tasks
Input: { limit?: int (default 20) }
Backend: SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1.

### create_note
Input: { body: string }
Backend: INSERT INTO notes (body, source, created_by) VALUES ($1, 'telegram', $karti_user_id).
```

**Commit:**
```bash
git commit -m "docs(agents): tool schemas for seeko-studio-bot"
```

---

### Task 4.4: Allowlist + Telegram-ID-to-profile mapping

**Files:**
- Modify: `docs/agents/seeko-studio-bot.md` (append Allowlist section)

Document the env-var format and the lookup table. For v1, single operator:

```
ALLOWED_TELEGRAM_USER_IDS=123456789
TELEGRAM_USER_ID_123456789_PROFILE_ID=<karti's profile uuid>
```

The Console agent webhook layer rejects messages from any other Telegram ID before invoking the model. Document that this check must happen before any tool call — never let the model see an unauthorized message body.

**Commit:**
```bash
git commit -m "docs(agents): allowlist + ID mapping for seeko-studio-bot"
```

---

### Task 4.5: Console setup checklist for bot

**Files:**
- Modify: `docs/agents/seeko-studio-bot.md` (append setup section)

Document Console UI steps:

1. Create agent `seeko-studio-bot`
2. Paste system prompt from above
3. Wire Supabase MCP (service-role)
4. Wire Telegram tool: HTTP POST to `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage`
5. Add credential vault: `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USER_IDS`
6. Set webhook trigger: Telegram will POST updates to `<console-webhook-url>`
7. Configure Telegram webhook: `curl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook -d 'url=<console-webhook-url>'`
8. Enable memory store keyed by `update.message.chat.id`
9. Save + enable

**Commit:**
```bash
git commit -m "docs(agents): Console setup checklist for seeko-studio-bot"
```

---

### Task 4.6: First message test

**Manual:**

1. From Karti's Telegram, message `@seeko_studio_bot`: "hello"
2. Confirm bot replies (proves auth + tool wiring)
3. "create a task to test the bot, coding dept" → confirm task row appears in `/tasks`
4. "note: bot first run" → confirm note row appears in `/inbox`
5. "what's blocked" → confirm reply lists blocked tasks (or "none")

If all four pass, bot is live.

No commit.

---

## Phase 5 — PR + handoff

### Task 5.1: Open PR

**Manual:**

1. Push `feat/studio-agents` to origin
2. Open PR with body summarizing both agents, the new tables, and the new routes
3. Note pre-existing test failures (unchanged from main)
4. Request review

---

## Verification gates

Before considering this complete:

- [ ] `npm run typecheck` clean
- [ ] `npm test` — only pre-existing failures (none introduced by this work)
- [ ] `npm run build` succeeds
- [ ] `/inbox` renders with seeded notes for admins, redirects non-admins
- [ ] `/digest` renders for admin and for investor with correct redaction
- [ ] Digest agent run inserts a row; re-run noops (unique constraint)
- [ ] Bot replies to allowlisted user and ignores everyone else
- [ ] Bot can create task, update task, create note, list blocked tasks

---

## Out of scope (parked for next branch)

- PR sentinel agent
- `profiles_audit` table for role/flag change tracking
- Multi-user Telegram (binding flow)
- Payments creation via bot
- Doc drafting via bot
