# Task Notes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to leave private, timestamped notes on tasks that only the assignee and admins can see.

**Architecture:** New `task_notes` table with append-only rows. One API route for creation + notification. Notes loaded via direct Supabase query in TaskDetail and rendered in the Details tab between description and handoff history.

**Tech Stack:** Supabase (migration + RLS), Next.js API route, React (TaskDetail component)

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260310000001_task_notes.sql`

**Step 1: Write the migration SQL**

```sql
-- Task notes: private lead-to-assignee instructions
CREATE TABLE IF NOT EXISTS task_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by task
CREATE INDEX idx_task_notes_task_id ON task_notes(task_id);

-- RLS
ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to task_notes"
  ON task_notes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Assignees can read notes on their tasks
CREATE POLICY "Assignees can read task notes"
  ON task_notes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_notes.task_id AND tasks.assignee_id = auth.uid())
  );
```

**Step 2: Apply the migration**

Run via Supabase MCP: `mcp__supabase__apply_migration` with the SQL above, name `task_notes`.

**Step 3: Verify the table exists**

Run: `mcp__supabase__list_tables` and confirm `task_notes` appears.

**Step 4: Commit**

```bash
git add supabase/migrations/20260310000001_task_notes.sql
git commit -m "feat: add task_notes table with RLS policies"
```

---

### Task 2: TypeScript Type + Notification Kind

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add TaskNote type**

After the `TaskHandoff` type (around line 125), add:

```typescript
export type TaskNote = {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
};
```

**Step 2: Add notification kind**

In the `NotificationKind` union type (around line 166), add:

```typescript
  | 'task_note';
```

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add TaskNote type and task_note notification kind"
```

---

### Task 3: API Route — POST /api/tasks/[id]/notes

**Files:**
- Create: `src/app/api/tasks/[id]/notes/route.ts`

**Step 1: Write the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const MAX_CONTENT_LENGTH = 5000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admin only
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: { content: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { content } = body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `Content too long (max ${MAX_CONTENT_LENGTH} chars)` }, { status: 400 });
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify task exists and get assignee + name for notification
  const { data: task } = await service
    .from('tasks')
    .select('id, name, assignee_id')
    .eq('id', taskId)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Insert note
  const { data: note, error: insertErr } = await service
    .from('task_notes')
    .insert({
      task_id: taskId,
      author_id: user.id,
      content: content.trim(),
    })
    .select('id, content, created_at, author_id')
    .single();

  if (insertErr) {
    console.error('Task note insert error:', insertErr);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }

  // Notify assignee (if task has one and it's not the admin themselves)
  if (task.assignee_id && task.assignee_id !== user.id) {
    const snippet = content.trim().slice(0, 100) + (content.trim().length > 100 ? '...' : '');
    await service.from('notifications').insert({
      user_id: task.assignee_id,
      kind: 'task_note',
      title: `New note on ${task.name}`,
      body: snippet,
      link: `/tasks?task=${taskId}`,
      read: false,
    });
  }

  return NextResponse.json(note, { status: 201 });
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/app/api/tasks/[id]/notes/route.ts
git commit -m "feat: add POST /api/tasks/[id]/notes API route"
```

---

### Task 4: Boot Member Cleanup

**Files:**
- Modify: `src/app/api/admin/boot-member/route.ts`

**Step 1: Add task_notes deletion**

After the line that deletes task comments (line ~106: `await service.from('task_comments').delete().eq('user_id', userId);`), add:

```typescript
  // 3b. Delete task notes by this user
  await service.from('task_notes').delete().eq('author_id', userId);
```

**Step 2: Commit**

```bash
git add src/app/api/admin/boot-member/route.ts
git commit -m "feat: add task_notes cleanup to boot-member cascade"
```

---

### Task 5: TaskDetail — Load and Render Notes

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Step 1: Add imports and state**

At the top of the file, add `TaskNote` to the types import:

```typescript
import type { ..., TaskNote } from '@/lib/types';
```

Add state inside the component (near the `handoffs` state):

```typescript
const [notes, setNotes] = useState<TaskNote[]>([]);
const [noteInput, setNoteInput] = useState('');
const [noteSending, setNoteSending] = useState(false);
```

**Step 2: Add loadNotes function**

Near the `loadHandoffs` function, add:

```typescript
const loadNotes = useCallback(async () => {
  const { data } = await supabase
    .from('task_notes')
    .select('id, task_id, author_id, content, created_at, profiles(id, display_name, avatar_url)')
    .eq('task_id', task.id)
    .order('created_at', { ascending: true });
  setNotes((data ?? []) as TaskNote[]);
}, [task.id, supabase]);
```

Call `loadNotes()` inside the existing `useEffect` that calls `loadHandoffs()`.

**Step 3: Add handleAddNote function**

```typescript
async function handleAddNote() {
  if (!noteInput.trim() || noteSending) return;
  setNoteSending(true);
  try {
    const res = await fetch(`/api/tasks/${task.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteInput.trim() }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || 'Failed to add note');
      return;
    }
    const newNote = await res.json();
    // Optimistic: add note with current user profile
    setNotes(prev => [...prev, {
      ...newNote,
      profiles: { id: userId, display_name: displayName, avatar_url: avatarUrl },
    }]);
    setNoteInput('');
    toast.success('Note added');
  } catch {
    toast.error('Failed to add note');
  } finally {
    setNoteSending(false);
  }
}
```

Note: `userId`, `displayName`, `avatarUrl` should come from existing props/context already available in TaskDetail.

**Step 4: Add Notes UI section in Details tab**

In the Details tab JSX, **before** the Handoff History button (the `<button>` with `ArrowRightLeft` icon), add:

```tsx
{/* Notes from Lead — visible to assignee + admins only */}
{(isAdmin || task.assignee_id === userId) && (notes.length > 0 || isAdmin) && (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <StickyNote className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">Notes from Lead</span>
      {notes.length > 0 && (
        <span className="text-xs text-muted-foreground">({notes.length})</span>
      )}
    </div>

    {notes.length === 0 && isAdmin && (
      <p className="text-xs text-muted-foreground italic">No notes yet. Add instructions for the assignee.</p>
    )}

    {notes.map((n) => (
      <div key={n.id} className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Avatar className="size-5">
            <AvatarImage src={n.profiles?.avatar_url ?? undefined} />
            <AvatarFallback className="text-[8px] bg-secondary text-foreground">
              {(n.profiles?.display_name ?? '?').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium text-foreground">{n.profiles?.display_name ?? 'Admin'}</span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(n.created_at)}</span>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{n.content}</p>
      </div>
    ))}

    {/* Admin compose */}
    {isAdmin && (
      <div className="flex gap-2">
        <textarea
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="Add a note for the assignee..."
          rows={2}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none resize-none"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAddNote}
          disabled={!noteInput.trim() || noteSending}
          className="shrink-0 self-end"
        >
          {noteSending ? <Loader2 className="size-4 animate-spin" /> : 'Add'}
        </Button>
      </div>
    )}
  </div>
)}
```

Import `StickyNote` from lucide-react at the top of the file.

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: render task notes in Details tab with admin compose"
```

---

### Task 6: Update Schema Documentation

**Files:**
- Modify: `docs/supabase-schema.sql` (if it exists, add task_notes table)
- Modify: `docs/personas/ia.md` (add task_notes to the schema section)

**Step 1: Add task_notes to schema docs**

Add the table documentation to `docs/personas/ia.md` after the `task_handoffs` section:

```markdown
### task_notes

| Column    | Type        | Notes                          |
|-----------|-------------|--------------------------------|
| id        | uuid (PK)   | Auto-generated                 |
| task_id   | uuid (FK)   | → tasks.id (cascade delete)    |
| author_id | uuid (FK)   | → profiles.id (admin only)     |
| content   | text        | Note body, max 5000 chars      |
| created_at| timestamptz |                                |
```

**Step 2: Commit**

```bash
git add docs/personas/ia.md
git commit -m "docs: add task_notes table to schema documentation"
```
