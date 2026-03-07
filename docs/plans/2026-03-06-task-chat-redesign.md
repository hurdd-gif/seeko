# Task Chat Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign task detail into a slide-out panel with Details | Chat tabs, adding reactions, threaded replies, and file attachments to the chat.

**Architecture:** Replace the current `Dialog`-based `TaskDetail` with a slide-out panel (desktop) / dialog (mobile). Split content into two tabs. Add three new DB tables/columns for reactions, attachments, and reply threading. Reuse existing Supabase storage pattern from deliverables for chat attachments.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + Storage), Framer Motion (`motion/react`), Tailwind v4, shadcn/ui components

---

### Task 1: Database Migration + TypeScript Types

**Files:**
- Create: `supabase/migrations/20260306000001_task_chat_redesign.sql`
- Modify: `src/lib/types.ts`
- Modify: `docs/supabase-schema.sql` (append new tables)

**Step 1: Write the migration SQL**

Create `supabase/migrations/20260306000001_task_chat_redesign.sql`:

```sql
-- Add reply threading to task_comments
alter table public.task_comments
  add column reply_to_id uuid references public.task_comments(id) on delete set null;

-- Reactions on comments
create table public.task_comment_reactions (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.task_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz default now(),
  unique (comment_id, user_id, emoji)
);

create index task_comment_reactions_comment_id_idx on public.task_comment_reactions(comment_id);

alter table public.task_comment_reactions enable row level security;

create policy "Authenticated can read comment reactions"
  on public.task_comment_reactions for select
  to authenticated
  using (true);

create policy "Authenticated can insert own reactions"
  on public.task_comment_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own reactions"
  on public.task_comment_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- File attachments on comments
create table public.task_comment_attachments (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references public.task_comments(id) on delete cascade,
  file_url     text not null,
  file_name    text not null,
  file_type    text not null default 'application/octet-stream',
  file_size    int not null default 0,
  storage_path text not null,
  created_at   timestamptz default now()
);

create index task_comment_attachments_comment_id_idx on public.task_comment_attachments(comment_id);

alter table public.task_comment_attachments enable row level security;

create policy "Authenticated can read comment attachments"
  on public.task_comment_attachments for select
  to authenticated
  using (true);

create policy "Authenticated can insert comment attachments"
  on public.task_comment_attachments for insert
  to authenticated
  with check (true);

-- Storage bucket for chat attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

create policy "Authenticated can upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-attachments');

create policy "Authenticated can read chat attachments"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-attachments');
```

**Step 2: Update TypeScript types**

Add to `src/lib/types.ts`:

```ts
// Update TaskComment — add reply_to_id
export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  reply_to_id?: string;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
  reactions?: TaskCommentReaction[];
  attachments?: TaskCommentAttachment[];
};

// New types
export type TaskCommentReaction = {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type TaskCommentAttachment = {
  id: string;
  comment_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
};
```

**Step 3: Append new tables to schema doc**

Add the three new table definitions to `docs/supabase-schema.sql` after the task_deliverables comment section.

**Step 4: Run the migration**

Run in Supabase SQL Editor or via CLI:
```bash
# If using Supabase CLI:
npx supabase db push
# Otherwise: paste the SQL into the Supabase Dashboard SQL Editor
```

**Step 5: Commit**

```bash
git add supabase/migrations/20260306000001_task_chat_redesign.sql src/lib/types.ts docs/supabase-schema.sql
git commit -m "feat: add DB migration for chat reactions, attachments, and reply threading"
```

---

### Task 2: Chat Attachments API Route

**Files:**
- Create: `src/app/api/tasks/[id]/comments/attachments/route.ts`

**Context:** Follow the same pattern as `src/app/api/tasks/[id]/deliverables/route.ts` — use service role client for storage, signed URLs for downloads. The bucket is `chat-attachments`. Max file size 10 MB. Any authenticated user in the task conversation can upload.

**Step 1: Write the API route**

Create `src/app/api/tasks/[id]/comments/attachments/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const BUCKET = 'chat-attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_EXPIRY_SEC = 3600;

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

/** POST: Upload a file attachment for a chat comment. Returns the attachment record with signed URL. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getSupabaseAndUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: taskId } = await params;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const commentId = formData.get('comment_id') as string | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!commentId) return NextResponse.json({ error: 'No comment_id provided' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
  }

  const storagePath = `${taskId}/${commentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: uploadError } = await service.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: signedData } = await service.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);

  const { data: inserted, error: insertError } = await service
    .from('task_comment_attachments')
    .insert({
      comment_id: commentId,
      file_url: signedData?.signedUrl ?? '',
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json(inserted, { status: 201 });
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/tasks/[id]/comments/attachments/route.ts
git commit -m "feat: add chat attachments API route"
```

---

### Task 3: Slide-Out Panel + Mobile Dialog Shell

**Files:**
- Modify: `src/components/dashboard/TaskList.tsx:610-619` (change how TaskDetail is rendered)
- Modify: `src/components/dashboard/TaskDetail.tsx` (replace Dialog wrapper with slide-out panel)
- Modify: `src/lib/motion.ts` (add slide-out spring constants)

**Context:** Currently `TaskDetail` renders inside a `Dialog` component (centered modal). Replace with:
- **Desktop (>=768px):** Right-side slide-out panel, 480px wide, overlay with backdrop
- **Mobile (<768px):** Keep the existing Dialog (full-screen feel)

Use `motion/react` for the slide-in animation. Detect viewport with a `useMediaQuery` hook or `window.matchMedia`.

**Step 1: Add slide-out motion constants to `src/lib/motion.ts`**

```ts
/** Slide-out panel — slides in from right edge. */
export const SLIDEOUT = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
} as const;

export const SLIDEOUT_SPRING = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 34,
};
```

**Step 2: Refactor TaskDetail to use slide-out on desktop**

In `src/components/dashboard/TaskDetail.tsx`:

1. Add a `useMediaQuery` hook (inline, simple):
```ts
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
```

2. Replace the outer `<Dialog>` with conditional rendering:
   - If `isDesktop` (min-width: 768px): render a fixed right-side `motion.div` panel with backdrop
   - If mobile: keep the existing `<Dialog>` component

Desktop slide-out structure:
```tsx
<AnimatePresence>
  {open && (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={() => onOpenChange(false)}
      />
      {/* Panel */}
      <motion.div
        className="absolute right-0 top-0 h-full w-full max-w-[480px] border-l border-border bg-card shadow-xl flex flex-col"
        initial={SLIDEOUT.initial}
        animate={SLIDEOUT.animate}
        exit={SLIDEOUT.exit}
        transition={SLIDEOUT_SPRING}
      >
        {/* Header with close button + task name */}
        {/* Tab bar: Details | Chat */}
        {/* Tab content (scrollable) */}
      </motion.div>
    </div>
  )}
</AnimatePresence>
```

3. Add Escape key handler for the slide-out panel.

**Step 3: Verify in browser**

Run `npm run dev` and open http://localhost:3000/tasks. Click a task row:
- On desktop: should see slide-out from right with backdrop
- On narrow viewport: should see centered dialog

**Step 4: Commit**

```bash
git add src/lib/motion.ts src/components/dashboard/TaskDetail.tsx
git commit -m "feat: replace task detail dialog with slide-out panel on desktop"
```

---

### Task 4: Two-Tab Layout (Details | Chat)

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Context:** No `tabs.tsx` component exists in `src/components/ui/`. Build a simple inline tab bar — two buttons with an active underline indicator. Don't install a new shadcn component.

**Step 1: Add tab state and tab bar**

Inside `TaskDetail`, add:
```ts
const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');
```

Tab bar JSX (placed inside the panel header area, below the task name):
```tsx
<div className="flex border-b border-border px-4">
  <button
    className={cn(
      'px-4 py-2.5 text-sm font-medium transition-colors relative',
      activeTab === 'details' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
    )}
    onClick={() => setActiveTab('details')}
  >
    Details
    {activeTab === 'details' && (
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground"
        layoutId="tab-indicator"
      />
    )}
  </button>
  <button
    className={cn(
      'px-4 py-2.5 text-sm font-medium transition-colors relative',
      activeTab === 'chat' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
    )}
    onClick={() => setActiveTab('chat')}
  >
    Chat
    <span className="ml-1.5 text-xs text-muted-foreground">({comments.length})</span>
    {activeTab === 'chat' && (
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground"
        layoutId="tab-indicator"
      />
    )}
  </button>
</div>
```

**Step 2: Split content into tab panels**

Move the existing content into two conditional sections:

```tsx
{activeTab === 'details' && (
  <div className="flex-1 overflow-y-auto p-4">
    {/* Status badges, department, priority, deadline, assignee */}
    {/* Description */}
    {/* Handoff history */}
    {/* Deliverables (admin) */}
  </div>
)}

{activeTab === 'chat' && (
  <div className="flex flex-1 flex-col overflow-hidden">
    {/* Comments list (scrollable) */}
    {/* Compose area (pinned to bottom) */}
  </div>
)}
```

**Step 3: Ensure the compose area stays pinned at the bottom of the chat tab**

The chat tab layout should be:
```
┌──────────────────┐
│ Messages (scroll) │  ← flex-1 overflow-y-auto
├──────────────────┤
│ Compose input     │  ← shrink-0, pinned at bottom
└──────────────────┘
```

**Step 4: Verify in browser**

Click a task, switch between Details and Chat tabs. Ensure:
- Details tab shows all metadata, handoffs, deliverables
- Chat tab shows comments with compose pinned at bottom
- Tab indicator animates smoothly between tabs

**Step 5: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: add Details | Chat tabs to task slide-out panel"
```

---

### Task 5: Reactions

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Context:** Fixed emoji set: `['👍', '👎', '🎉', '😂', '❓', '🔥', '❤️']`. Reactions appear as small pills below each message. Click to toggle. Show count per emoji.

**Step 1: Update the comment query to include reactions**

In `loadComments`, update the Supabase select:
```ts
.select('*, profiles(id, display_name, avatar_url), task_comment_reactions(id, emoji, user_id)')
```

**Step 2: Add reaction toggle function**

```ts
const handleToggleReaction = useCallback(async (commentId: string, emoji: string) => {
  const existing = comments
    .find(c => c.id === commentId)
    ?.reactions?.find(r => r.emoji === emoji && r.user_id === currentUserId);

  if (existing) {
    // Remove reaction (optimistic)
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, reactions: (c.reactions ?? []).filter(r => r.id !== existing.id) }
        : c
    ));
    await supabase.from('task_comment_reactions').delete().eq('id', existing.id);
  } else {
    // Add reaction (optimistic)
    const optimistic: TaskCommentReaction = {
      id: crypto.randomUUID(),
      comment_id: commentId,
      user_id: currentUserId,
      emoji,
      created_at: new Date().toISOString(),
    };
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, reactions: [...(c.reactions ?? []), optimistic] }
        : c
    ));
    const { data } = await supabase.from('task_comment_reactions').insert({
      comment_id: commentId,
      user_id: currentUserId,
      emoji,
    }).select('id').single();
    if (data) {
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, reactions: (c.reactions ?? []).map(r => r.id === optimistic.id ? { ...r, id: data.id } : r) }
          : c
      ));
    }
  }
}, [comments, currentUserId, supabase]);
```

**Step 3: Add reaction UI to CommentItem**

Pass `onReact` and `currentUserId` props to `CommentItem`. Below the message content, add:

```tsx
const REACTION_EMOJIS = ['👍', '👎', '🎉', '😂', '❓', '🔥', '❤️'];

{/* Reactions row */}
<div className="flex items-center gap-1 mt-1 flex-wrap">
  {/* Grouped existing reactions */}
  {Object.entries(
    (comment.reactions ?? []).reduce<Record<string, { count: number; hasOwn: boolean }>>((acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
      acc[r.emoji].count++;
      if (r.user_id === currentUserId) acc[r.emoji].hasOwn = true;
      return acc;
    }, {})
  ).map(([emoji, { count, hasOwn }]) => (
    <button
      key={emoji}
      onClick={() => onReact(comment.id, emoji)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
        hasOwn
          ? 'border-foreground/20 bg-foreground/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/20'
      )}
    >
      <span>{emoji}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  ))}

  {/* Add reaction button (shown on hover) */}
  <div className="relative group/react">
    <button className="rounded-full border border-transparent p-1 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:border-border hover:text-muted-foreground transition-all">
      <span className="text-xs">+</span>
    </button>
    {/* Emoji picker popover (appears on hover/click of + button) */}
    <div className="absolute bottom-full left-0 mb-1 hidden group-hover/react:flex gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg z-10">
      {REACTION_EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => onReact(comment.id, emoji)}
          className="rounded p-1 text-sm hover:bg-muted transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  </div>
</div>
```

**Step 4: Verify in browser**

- Hover a message, click "+" to see emoji picker
- Click an emoji, see it appear as a pill below the message
- Click it again to remove
- Another user's reaction should show without the active style

**Step 5: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: add emoji reactions to chat comments"
```

---

### Task 6: Threaded Replies

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Context:** Flat list with "replying to [name]" reference. Click a message to set it as reply target. `reply_to_id` saved on comment insert.

**Step 1: Add reply state**

```ts
const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
```

**Step 2: Update the comment query to include reply_to_id**

In `loadComments`, the select already includes `*` which will get `reply_to_id`. No change needed.

**Step 3: Add reply target UI above compose area**

When `replyTo` is set, show a small bar above the compose area:

```tsx
<AnimatePresence>
  {replyTo && (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-2 overflow-hidden"
    >
      <span className="text-xs text-muted-foreground">
        Replying to <span className="font-medium text-foreground">{replyTo.profiles?.display_name ?? 'Unknown'}</span>
      </span>
      <button
        onClick={() => setReplyTo(null)}
        className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="size-3" />
      </button>
    </motion.div>
  )}
</AnimatePresence>
```

**Step 4: Add reply action to CommentItem**

Add an `onReply` prop to `CommentItem`. Add a reply button next to edit/delete (or show it for all messages, not just own):

```tsx
<button
  onClick={() => onReply(comment)}
  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
  title="Reply"
>
  <Reply className="size-3" /> {/* import Reply from lucide-react */}
</button>
```

Show this button on hover for ALL messages (not just own).

**Step 5: Show "replying to" reference on messages that have reply_to_id**

Above the message content in `CommentItem`, if `comment.reply_to_id` exists:

```tsx
{comment.reply_to_id && (() => {
  const parent = allComments.find(c => c.id === comment.reply_to_id);
  const parentName = parent?.profiles?.display_name ?? 'Unknown';
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70 mb-0.5">
      <Reply className="size-2.5" />
      <span>replying to <span className="font-medium">{parentName}</span></span>
    </div>
  );
})()}
```

Pass `allComments` (the full comments array) to `CommentItem` so it can resolve reply references.

**Step 6: Include reply_to_id in handleSend**

Update the `handleSend` callback to include `reply_to_id` in both the optimistic comment and the Supabase insert:

```ts
const optimistic: TaskComment = {
  // ... existing fields
  reply_to_id: replyTo?.id,
};

// In the insert:
const { data: inserted } = await supabase.from('task_comments').insert({
  task_id: task.id,
  user_id: currentUserId,
  content: optimistic.content,
  reply_to_id: replyTo?.id ?? null,
}).select('id').single();

// Clear reply target after sending:
setReplyTo(null);
```

**Step 7: Verify in browser**

- Click a message's reply button, see "Replying to [name]" bar above compose
- Send a message, see "replying to [name]" reference above it
- Click X to dismiss reply target

**Step 8: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: add threaded replies with reply-to references in chat"
```

---

### Task 7: File Attachments in Chat

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Context:** Attach button in compose area + drag and drop. Files upload via the API route created in Task 2. Inline previews: images show thumbnail, other files show icon + name.

**Step 1: Add file state to TaskDetail**

```ts
const [pendingFiles, setPendingFiles] = useState<File[]>([]);
const [uploading, setUploading] = useState(false);
const dropRef = useRef<HTMLDivElement>(null);
const [isDragging, setIsDragging] = useState(false);
```

**Step 2: Add drag-and-drop handlers on the chat area**

Wrap the chat tab content in a div with drag handlers:

```tsx
<div
  ref={dropRef}
  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={e => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setPendingFiles(prev => [...prev, ...files]);
  }}
  className={cn('flex flex-1 flex-col overflow-hidden', isDragging && 'ring-2 ring-inset ring-seeko-accent/50')}
>
```

**Step 3: Add attach button and pending files preview in compose area**

Next to the send button, add a file input trigger:

```tsx
<label className="cursor-pointer rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
  <Paperclip className="size-4" /> {/* import from lucide-react */}
  <input
    type="file"
    multiple
    className="hidden"
    onChange={e => {
      const files = Array.from(e.target.files ?? []);
      setPendingFiles(prev => [...prev, ...files]);
      e.target.value = '';
    }}
  />
</label>
```

Show pending files as removable chips above the compose input:

```tsx
{pendingFiles.length > 0 && (
  <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border">
    {pendingFiles.map((file, i) => (
      <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
        <Paperclip className="size-3 text-muted-foreground" />
        <span className="truncate max-w-[120px]">{file.name}</span>
        <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      </div>
    ))}
  </div>
)}
```

**Step 4: Upload files after sending the comment**

In `handleSend`, after the comment is inserted and we have the real comment ID:

```ts
// Upload pending files
if (pendingFiles.length > 0) {
  for (const file of pendingFiles) {
    const form = new FormData();
    form.append('file', file);
    form.append('comment_id', realCommentId);
    await fetch(`/api/tasks/${task.id}/comments/attachments`, { method: 'POST', body: form });
  }
  setPendingFiles([]);
  // Reload comments to get attachment data
  loadComments();
}
```

**Step 5: Update loadComments to fetch attachments**

Update the Supabase select to include attachments:

```ts
.select('*, profiles(id, display_name, avatar_url), task_comment_reactions(id, emoji, user_id), task_comment_attachments(id, file_url, file_name, file_type, file_size)')
```

**Step 6: Render attachments in CommentItem**

Below message content (and above reactions), show attachments:

```tsx
{(comment.attachments ?? []).length > 0 && (
  <div className="flex flex-wrap gap-2 mt-2">
    {(comment.attachments ?? []).map(att => {
      const isImage = att.file_type.startsWith('image/');
      return isImage ? (
        <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={att.file_url}
            alt={att.file_name}
            className="rounded-md border border-border max-w-[200px] max-h-[150px] object-cover"
          />
        </a>
      ) : (
        <a
          key={att.id}
          href={att.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
        >
          <FileText className="size-4 text-muted-foreground" />
          <span className="truncate max-w-[140px]">{att.file_name}</span>
          <Download className="size-3 text-muted-foreground" />
        </a>
      );
    })}
  </div>
)}
```

**Step 7: Verify in browser**

- Click attach button, select file, see chip in compose area
- Send message, file uploads and appears inline
- Drag a file onto chat area, see highlight ring, drop to attach
- Image files show thumbnail, other files show icon + name

**Step 8: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: add file attachments with drag-and-drop to chat"
```

---

### Task 8: Visual Polish + Animation Pass

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Context:** Final pass to ensure the redesigned chat matches the visual language of the tasks table redesign. Use the UX persona conventions: OKLCH tokens, JetBrains Mono for timestamps, Outfit for content, Framer Motion for entrances.

**Step 1: Message entrance animations**

Each new message should fade + slide in:
```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.15 }}
>
```

Already exists in `CommentItem` — verify it still works in the new tab layout.

**Step 2: Tab content transition**

Wrap each tab panel in `AnimatePresence` with a subtle fade:
```tsx
<AnimatePresence mode="wait">
  {activeTab === 'details' && (
    <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
      {/* ... */}
    </motion.div>
  )}
  {activeTab === 'chat' && (
    <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
      {/* ... */}
    </motion.div>
  )}
</AnimatePresence>
```

**Step 3: Ensure typography consistency**

- Timestamps: `font-mono text-[11px] text-muted-foreground` (JetBrains Mono via `--font-mono`)
- Message content: `text-sm text-foreground/80` (Outfit via `--font-sans`)
- Names: `text-sm font-medium text-foreground`

**Step 4: Ensure the chat compose area has proper dark styling**

The compose area border and background should use the token system:
- Border: `border-border` (oklch 0.22)
- Background: `bg-muted/30`
- Input text: `text-foreground`
- Placeholder: `text-muted-foreground/50`

Already exists — verify these survive the refactor.

**Step 5: Ensure scrollbar is hidden in the slide-out**

Add `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` to the scrollable content area inside the slide-out panel, matching the Dialog style.

**Step 6: Test full flow end-to-end**

1. Click task row → slide-out opens from right
2. Details tab shows task metadata
3. Switch to Chat tab → comments load, compose at bottom
4. Type message → sends, appears with animation
5. Hover message → see reply button + "+" reaction button
6. Add reaction → pill appears below message
7. Click reply → "Replying to [name]" bar shows
8. Attach file → chip shows, sends with message
9. Click backdrop → slide-out closes
10. On mobile viewport → dialog opens instead

**Step 7: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: visual polish and animation pass for chat redesign"
```
