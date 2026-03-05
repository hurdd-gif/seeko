# Realtime Comments & Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make comments in `TaskDetail` and notification read-state in `NotificationBell` update in real-time via Supabase Realtime, without any page refresh.

**Architecture:** Extend the existing `postgres_changes` subscription pattern (already proven in `NotificationBell`) to `task_comments`. When a task modal is open, subscribe to INSERT/UPDATE/DELETE on `task_comments` filtered by `task_id`. Add UPDATE handling to `NotificationBell`'s existing channel to sync read-state across tabs.

**Tech Stack:** Supabase Realtime (`postgres_changes`), `@supabase/ssr` browser client, React `useEffect`

---

## ⚠️ Manual Prerequisite: Enable Supabase Realtime on Tables

Before writing any code, this must be done in the Supabase dashboard:

1. Go to **Database → Replication** in the Supabase dashboard
2. Find `task_comments` table → toggle **Realtime ON**
3. Find `notifications` table → ensure **Realtime ON** (may already be on; verify it covers both INSERT and UPDATE)

This is a one-time setup. Without it, `postgres_changes` subscriptions will not fire.

---

### Task 1: Add Real-time Comment Subscription to TaskDetail

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx`

**Context:**
- `TaskDetail` currently loads comments once in `useEffect` when `open` changes (line 305-308)
- `comments` is already `useState<TaskComment[]>` (line 276)
- `supabase` browser client is already instantiated (lines 286-289)
- The optimistic INSERT in `handleSend` (lines 396-464) pre-adds the comment with a temp UUID, then replaces it with the real UUID after the DB insert — the realtime subscription must NOT double-add own comments

**Step 1: Add the realtime subscription effect**

In `TaskDetail`, add a new `useEffect` below the existing one at line 305. This effect subscribes when `open` is true and the `task.id` is known:

```tsx
useEffect(() => {
  if (!open) return;

  const channel = supabase
    .channel(`comments:${task.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
      (payload) => {
        const incoming = payload.new as TaskComment;
        // Skip if this is our own comment (already optimistically added)
        if (incoming.user_id === currentUserId) return;
        // Fetch full comment with profile join, then add to state
        supabase
          .from('task_comments')
          .select('*, profiles(id, display_name, avatar_url)')
          .eq('id', incoming.id)
          .single()
          .then(({ data }) => {
            if (data) setComments(prev => [...prev, data as TaskComment]);
          });
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
      (payload) => {
        const updated = payload.new as TaskComment;
        setComments(prev =>
          prev.map(c => c.id === updated.id ? { ...c, content: updated.content, updated_at: updated.updated_at } : c)
        );
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
      (payload) => {
        const deleted = payload.old as { id: string };
        setComments(prev => prev.filter(c => c.id !== deleted.id));
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [open, task.id, currentUserId, supabase]);
```

Place this new effect at approximately line 308, after the existing `useEffect` that calls `loadComments`.

**Step 2: Verify INSERT deduplication logic**

In `handleSend` (line 396), the optimistic comment uses `crypto.randomUUID()` as its temp ID (line 402). After the DB insert succeeds, the real ID is returned at line 422 (`realCommentId`). The state is NOT updated to swap the temp ID for the real one — meaning the optimistic comment with temp ID remains.

The realtime INSERT event will fire for the current user's own comment too. The `if (incoming.user_id === currentUserId) return;` guard above prevents double-adding.

However, the temp-ID optimistic comment will never get its ID corrected. Fix `handleSend` to replace the optimistic comment with the real one after insert:

Find the block starting at line 416:
```tsx
const { data: inserted } = await supabase.from('task_comments').insert({
  task_id: task.id,
  user_id: currentUserId,
  content: optimistic.content,
}).select('id').single();

const realCommentId = inserted?.id ?? optimistic.id;
```

After this block (around line 422), add the state update to replace the temp UUID with the real one:
```tsx
if (inserted?.id) {
  setComments(prev => prev.map(c =>
    c.id === optimistic.id ? { ...c, id: inserted.id } : c
  ));
}
```

**Step 3: Manually test**

1. Run `npm run dev`
2. Open the same task in two browser tabs
3. Post a comment in tab A → it should appear in tab B without refresh
4. Edit a comment in tab A → the edited text and "(edited)" label appear in tab B
5. Delete a comment in tab A → it disappears from tab B

**Step 4: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: add realtime comment sync via Supabase postgres_changes"
```

---

### Task 2: Extend NotificationBell to Sync Read State Across Tabs

**Files:**
- Modify: `src/components/dashboard/NotificationBell.tsx`

**Context:**
- Existing channel at lines 60-74 only listens to `INSERT` on `notifications`
- `markAllRead` (line 77) and `markOneRead` (line 91) update local state + DB, but other tabs don't pick up the `read=true` DB change
- We need to add an `UPDATE` event handler to the same channel

**Step 1: Add UPDATE handler to the existing channel**

The current channel setup (lines 61-72):
```tsx
const channel = supabase
  .channel('notifications')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
    (payload) => {
      const notif = payload.new as Notification;
      setNotifications(prev => [notif, ...prev].slice(0, 20));
      setUnreadCount(c => c + 1);
    }
  )
  .subscribe();
```

Replace with:
```tsx
const channel = supabase
  .channel('notifications')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
    (payload) => {
      const notif = payload.new as Notification;
      setNotifications(prev => [notif, ...prev].slice(0, 20));
      setUnreadCount(c => c + 1);
    }
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
    (payload) => {
      const updated = payload.new as Notification;
      setNotifications(prev =>
        prev.map(n => n.id === updated.id ? { ...n, read: updated.read } : n)
      );
      // Recompute unread count from state after update
      setNotifications(prev => {
        const newUnread = prev.filter(n => !n.read).length;
        setUnreadCount(newUnread);
        return prev;
      });
    }
  )
  .subscribe();
```

Note: the double `setNotifications` is needed because the second call needs the already-updated state. Alternatively, consolidate into one `setNotifications` call that also calls `setUnreadCount`:

```tsx
.on(
  'postgres_changes',
  { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
  (payload) => {
    const updated = payload.new as Notification;
    setNotifications(prev => {
      const next = prev.map(n => n.id === updated.id ? { ...n, read: updated.read } : n);
      setUnreadCount(next.filter(n => !n.read).length);
      return next;
    });
  }
)
```

Use the consolidated version (cleaner, avoids double render).

**Step 2: Manually test**

1. Open the app in two browser tabs, both logged in as the same user
2. In tab A, click the bell → click "Mark all read"
3. Tab B's notification badge should clear immediately (within ~1s) without refresh

**Step 3: Commit**

```bash
git add src/components/dashboard/NotificationBell.tsx
git commit -m "feat: sync notification read-state across tabs via realtime UPDATE events"
```

---

## Done

After both tasks:
- Comments in any open task modal update live (INSERT/UPDATE/DELETE)
- Notification read-state syncs across browser tabs
- No page refresh required for either
