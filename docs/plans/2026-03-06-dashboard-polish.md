# Dashboard Polish & Workflow Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cinematic page transitions, loading skeletons, micro-interactions, a command palette, notification management, and docs workflow improvements to the SEEKO Studio dashboard.

**Architecture:** Client-side motion wrapper (`AnimatePresence`) in the dashboard layout drives page transitions. Each page has its own entrance storyboard (existing pattern). New components: `CommandPalette`, `PageTransition`, skeleton variants, enhanced `NotificationsPanel`. All motion uses existing spring configs from `src/components/motion.tsx`.

**Tech Stack:** Next.js 16 App Router, motion/react v12, Sonner v2 (already installed), Supabase realtime, Tailwind v4

**Key existing infrastructure:**
- Springs: `src/components/motion.tsx` — `snappy`, `smooth`, `gentle`
- Toast: `<Toaster richColors position="top-center" />` at `src/app/layout.tsx:51`
- Dashboard layout: `src/app/(dashboard)/layout.tsx` — server component, wraps `{children}` in `<main>`
- Types: `src/lib/types.ts` — `Notification`, `NotificationKind`, `Doc`, `Profile`
- Data: `src/lib/supabase/data.ts` — `fetchNotifications`, `fetchUnreadNotificationCount`, `fetchDocs`

---

## Task 1: Page Transition Wrapper

Add `AnimatePresence` to the dashboard layout so route changes get a fast fade-out (150ms) then each page plays its entrance storyboard.

**Files:**
- Create: `src/components/layout/PageTransition.tsx`
- Modify: `src/app/(dashboard)/layout.tsx:42-45`

**Step 1: Create `PageTransition.tsx`**

```tsx
// src/components/layout/PageTransition.tsx
'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldReduce = useReducedMotion();

  if (shouldReduce) return <>{children}</>;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{
          enter: { type: 'spring', stiffness: 300, damping: 25 },
          exit: { duration: 0.15, ease: 'easeOut' },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

**Step 2: Create a wrapper client component for the dashboard layout**

The dashboard layout is a server component, so we need a thin client wrapper.

```tsx
// Modify src/app/(dashboard)/layout.tsx
// Add import at top:
import { PageTransition } from '@/components/layout/PageTransition';

// Wrap {children} at line 44:
// Before: {children}
// After:  <PageTransition>{children}</PageTransition>
```

**Step 3: Verify page transitions work**

Run: `npm run dev`
Navigate between Overview → Team → Docs → Activity. Each route change should:
- Fade out current page (150ms, scale to 0.98)
- Fade in new page (spring, scale from 0.98 to 1)
- Each page's existing entrance storyboard plays after the fade-in

**Step 4: Commit**

```bash
git add src/components/layout/PageTransition.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add cinematic page transitions with AnimatePresence"
```

---

## Task 2: Loading Skeletons

Add pulse-shimmer skeleton components that match each page's first-paint layout. Use Suspense boundaries to show skeletons while server components fetch data.

**Files:**
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/skeletons/OverviewSkeleton.tsx`
- Create: `src/components/skeletons/TeamSkeleton.tsx`
- Create: `src/components/skeletons/DocsSkeleton.tsx`
- Create: `src/components/skeletons/ActivitySkeleton.tsx`
- Modify: `src/app/(dashboard)/page.tsx` — add loading.tsx
- Create: `src/app/(dashboard)/loading.tsx`
- Create: `src/app/(dashboard)/team/loading.tsx`
- Create: `src/app/(dashboard)/docs/loading.tsx`
- Create: `src/app/(dashboard)/activity/loading.tsx`

**Step 1: Create the base `Skeleton` component**

```tsx
// src/components/ui/skeleton.tsx
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-seeko-accent/8',
        className,
      )}
      {...props}
    />
  );
}
```

**Step 2: Create `OverviewSkeleton`**

Matches the Overview page layout: heading → 4 stat cards → 3 area cards → upcoming/activity split.

```tsx
// src/components/skeletons/OverviewSkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton';

export function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Area cards */}
      <div>
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Upcoming + Activity split */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3 space-y-3">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
        <div className="md:col-span-2 space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create `TeamSkeleton`**

```tsx
// src/components/skeletons/TeamSkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton';

export function TeamSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-24 rounded-xl" /> {/* Invite form area */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Create `DocsSkeleton`**

```tsx
// src/components/skeletons/DocsSkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton';

export function DocsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" style={{ marginLeft: i % 3 === 0 ? 0 : 24 }} />
        ))}
      </div>
    </div>
  );
}
```

**Step 5: Create `ActivitySkeleton`**

```tsx
// src/components/skeletons/ActivitySkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton';

export function ActivitySkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 6: Create `loading.tsx` files for each route**

Next.js App Router auto-wraps pages in Suspense using `loading.tsx` files.

```tsx
// src/app/(dashboard)/loading.tsx
import { OverviewSkeleton } from '@/components/skeletons/OverviewSkeleton';
export default function Loading() { return <OverviewSkeleton />; }
```

```tsx
// src/app/(dashboard)/team/loading.tsx
import { TeamSkeleton } from '@/components/skeletons/TeamSkeleton';
export default function Loading() { return <TeamSkeleton />; }
```

```tsx
// src/app/(dashboard)/docs/loading.tsx
import { DocsSkeleton } from '@/components/skeletons/DocsSkeleton';
export default function Loading() { return <DocsSkeleton />; }
```

```tsx
// src/app/(dashboard)/activity/loading.tsx
import { ActivitySkeleton } from '@/components/skeletons/ActivitySkeleton';
export default function Loading() { return <ActivitySkeleton />; }
```

**Step 7: Verify skeletons show during navigation**

Run: `npm run dev`
Navigate between pages. On slow connections (throttle in DevTools), skeletons should flash briefly before content appears. The shimmer should use `--color-seeko-accent` at 8% opacity.

**Step 8: Commit**

```bash
git add src/components/ui/skeleton.tsx src/components/skeletons/ src/app/\(dashboard\)/loading.tsx src/app/\(dashboard\)/team/loading.tsx src/app/\(dashboard\)/docs/loading.tsx src/app/\(dashboard\)/activity/loading.tsx
git commit -m "feat: add branded loading skeletons for all dashboard pages"
```

---

## Task 3: Micro-interactions — Count-Up Stats & Progress Bars

Add spring-interpolated count-up for stat card numbers and animated progress bars on area cards.

**Files:**
- Create: `src/components/ui/AnimatedNumber.tsx`
- Modify: `src/app/(dashboard)/page.tsx` — use AnimatedNumber in stat cards
- Modify: `src/components/dashboard/DashboardAreaCard.tsx` — animate progress bar width

**Step 1: Create `AnimatedNumber` component**

```tsx
// src/components/ui/AnimatedNumber.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useReducedMotion } from 'motion/react';

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const shouldReduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { stiffness: 200, damping: 25 });

  useEffect(() => {
    if (shouldReduce) {
      if (ref.current) ref.current.textContent = String(value);
      return;
    }
    motionValue.set(value);
    const unsubscribe = springValue.on('change', (v) => {
      if (ref.current) ref.current.textContent = String(Math.round(v));
    });
    return unsubscribe;
  }, [value, motionValue, springValue, shouldReduce]);

  return <span ref={ref} className={className}>{shouldReduce ? value : 0}</span>;
}
```

**Step 2: Use `AnimatedNumber` in Overview stat cards**

In `src/app/(dashboard)/page.tsx`, find the stat card number displays (the counts for open tasks, completed, team members, documents). Replace the raw number with `<AnimatedNumber value={count} />`.

Since the Overview page is a server component, and `AnimatedNumber` is a client component, import it and use it inline — React will handle the boundary.

```tsx
// Add import:
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

// Replace stat card numbers, e.g.:
// Before: <span className="text-2xl font-bold">{openTasks}</span>
// After:  <AnimatedNumber value={openTasks} className="text-2xl font-bold" />
```

**Step 3: Animate progress bar in `DashboardAreaCard.tsx`**

```tsx
// In src/components/dashboard/DashboardAreaCard.tsx
// Find the progress bar div (inline style width: `${area.progress}%`)
// Wrap it with motion.div and animate from width 0:

// Add import:
import { motion, useReducedMotion } from 'motion/react';

// Replace the progress bar inner div:
// Before: <div style={{ width: `${area.progress}%` }} className="h-full bg-seeko-accent rounded-full" />
// After:
<motion.div
  initial={{ width: 0 }}
  animate={{ width: `${area.progress}%` }}
  transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.3 }}
  className="h-full bg-seeko-accent rounded-full"
/>
```

**Step 4: Verify animations**

Run: `npm run dev`
- Overview stat numbers should count up from 0 on page entrance
- Area card progress bars should animate from 0% to their value

**Step 5: Commit**

```bash
git add src/components/ui/AnimatedNumber.tsx src/app/\(dashboard\)/page.tsx src/components/dashboard/DashboardAreaCard.tsx
git commit -m "feat: add count-up stat numbers and animated progress bars"
```

---

## Task 4: Enhanced Toast Styling

The Sonner `<Toaster>` is already mounted. Customize it to match the cinematic dark theme with backdrop blur.

**Files:**
- Modify: `src/app/layout.tsx:51` — add custom Sonner theme props
- Modify: `src/app/globals.css` — add Sonner overrides

**Step 1: Update Toaster props**

```tsx
// src/app/layout.tsx line 51
// Before:
<Toaster richColors position="top-center" />

// After:
<Toaster
  richColors
  position="top-center"
  toastOptions={{
    className: 'seeko-toast',
    duration: 4000,
  }}
/>
```

**Step 2: Add CSS overrides for Sonner**

```css
/* Add to src/app/globals.css, after the @theme block */

/* Sonner toast overrides */
[data-sonner-toaster] [data-sonner-toast] {
  --normal-bg: rgba(34, 34, 34, 0.85);
  --normal-border: var(--color-border);
  --normal-text: var(--color-foreground);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--color-border);
  font-family: var(--font-sans);
}
```

**Step 3: Verify toast styling**

Run: `npm run dev`
Trigger a toast (e.g., save settings). It should appear top-center with glassmorphic blur, dark background, and auto-dismiss after 4s.

**Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: style Sonner toasts with glassmorphic dark theme"
```

---

## Task 5: Command Palette (Cmd+K)

Build a fuzzy-search command palette for navigating pages, jumping to team members, searching docs, and running actions.

**Files:**
- Create: `src/components/dashboard/CommandPalette.tsx`
- Create: `src/lib/hooks/useCommandPalette.ts`
- Modify: `src/app/(dashboard)/layout.tsx` — mount CommandPalette
- Modify: `src/lib/supabase/data.ts` — no changes needed (data already cached client-side)

**Step 1: Create the keyboard hook**

```tsx
// src/lib/hooks/useCommandPalette.ts
'use client';

import { useEffect, useState, useCallback } from 'react';

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return { open, setOpen, toggle };
}
```

**Step 2: Create `CommandPalette.tsx`**

```tsx
// src/components/dashboard/CommandPalette.tsx
'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, FileText, Activity, Settings, LogOut, Search, PanelLeftClose,
} from 'lucide-react';
import { useCommandPalette } from '@/lib/hooks/useCommandPalette';
import { springs } from '@/components/motion';
import type { Profile, Doc } from '@/lib/types';

type CommandItem = {
  id: string;
  label: string;
  section: 'Pages' | 'Team' | 'Docs' | 'Actions';
  icon: React.ElementType;
  action: () => void;
  keywords?: string;
};

interface CommandPaletteProps {
  team: Pick<Profile, 'id' | 'display_name'>[];
  docs: Pick<Doc, 'id' | 'title'>[];
}

export function CommandPalette({ team, docs }: CommandPaletteProps) {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const shouldReduce = useReducedMotion();

  const go = useCallback((path: string) => {
    setOpen(false);
    setQuery('');
    router.push(path);
  }, [setOpen, router]);

  const items = useMemo<CommandItem[]>(() => {
    const pages: CommandItem[] = [
      { id: 'p-overview', label: 'Overview', section: 'Pages', icon: LayoutDashboard, action: () => go('/') },
      { id: 'p-team', label: 'Team', section: 'Pages', icon: Users, action: () => go('/team') },
      { id: 'p-docs', label: 'Docs', section: 'Pages', icon: FileText, action: () => go('/docs') },
      { id: 'p-activity', label: 'Activity', section: 'Pages', icon: Activity, action: () => go('/activity') },
      { id: 'p-settings', label: 'Settings', section: 'Pages', icon: Settings, action: () => go('/settings') },
    ];
    const teamItems: CommandItem[] = team.map((m) => ({
      id: `t-${m.id}`,
      label: m.display_name ?? 'Unknown',
      section: 'Team',
      icon: Users,
      action: () => go(`/team?member=${m.id}`),
      keywords: m.display_name ?? '',
    }));
    const docItems: CommandItem[] = docs.map((d) => ({
      id: `d-${d.id}`,
      label: d.title,
      section: 'Docs',
      icon: FileText,
      action: () => go(`/docs?doc=${d.id}`),
      keywords: d.title,
    }));
    const actions: CommandItem[] = [
      { id: 'a-sidebar', label: 'Toggle Sidebar', section: 'Actions', icon: PanelLeftClose, action: () => { setOpen(false); document.dispatchEvent(new CustomEvent('toggle-sidebar')); } },
    ];
    return [...pages, ...teamItems, ...docItems, ...actions];
  }, [team, docs, go, setOpen]);

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 12);
    const q = query.toLowerCase();
    return items.filter((item) => {
      const haystack = `${item.label} ${item.section} ${item.keywords ?? ''}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 12);
  }, [query, items]);

  // Reset selection when results change
  useEffect(() => setSelectedIndex(0), [filtered]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, selectedIndex]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            className="fixed inset-x-0 top-[20%] z-50 mx-auto w-full max-w-lg"
            initial={shouldReduce ? undefined : { opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={springs.snappy}
          >
            <div className="mx-4 overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages, team, docs..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <kbd className="hidden md:inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
                {filtered.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results</p>
                )}
                {filtered.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        i === selectedIndex ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">{item.section}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

**Step 3: Mount CommandPalette in dashboard layout**

The dashboard layout is a server component, so we need to pass data down. We already fetch team and docs in pages, but the command palette needs them globally. Add a thin data fetch + client mount.

```tsx
// Modify src/app/(dashboard)/layout.tsx
// Add imports:
import { fetchTeam, fetchDocs } from '@/lib/supabase/data';
import { CommandPalette } from '@/components/dashboard/CommandPalette';

// Inside DashboardLayout, after existing fetches (line 21-24), add:
const [team, docs] = await Promise.all([
  fetchTeam().catch(() => []),
  fetchDocs().catch(() => []),
]);

// After the <ActivityTracker> line (line 50), add:
<CommandPalette
  team={team.map((m) => ({ id: m.id, display_name: m.display_name }))}
  docs={docs.map((d) => ({ id: d.id, title: d.title }))}
/>
```

**Step 4: Verify command palette**

Run: `npm run dev`
- Press `Cmd+K` → palette opens with cinematic scale entrance
- Type "team" → filters to Team page + team members
- Arrow keys navigate, Enter selects, Esc closes
- Clicking backdrop closes

**Step 5: Commit**

```bash
git add src/lib/hooks/useCommandPalette.ts src/components/dashboard/CommandPalette.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add Cmd+K command palette with fuzzy search"
```

---

## Task 6: Notification Management — Real-time & Dismissal

Upgrade the notification system with Supabase realtime subscriptions, mark-as-read, dismiss, and "mark all read".

**Files:**
- Modify: `src/components/dashboard/NotificationBell.tsx` — add realtime subscription, dismiss UI
- Modify: `src/lib/supabase/data.ts` — add `markNotificationRead`, `markAllNotificationsRead`, `dismissNotification`
- Modify: `src/lib/types.ts` — no changes needed (Notification type already has `read` field)

**Step 1: Add notification mutation functions to data layer**

```tsx
// Add to src/lib/supabase/data.ts at the end of the file:

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

export async function dismissNotification(notificationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('notifications').delete().eq('id', notificationId);
}
```

**Step 2: Add realtime subscription to NotificationBell**

In `src/components/dashboard/NotificationBell.tsx`, add a `useEffect` that subscribes to Supabase realtime for the user's notifications channel:

```tsx
// Add import at top:
import { createBrowserClient } from '@supabase/ssr';
import { markNotificationRead, markAllNotificationsRead, dismissNotification } from '@/lib/supabase/data';
import { toast } from 'sonner';
import { X } from 'lucide-react';

// Inside the component, after existing state declarations, add:
useEffect(() => {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const channel = supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      const newNotif = payload.new as Notification;
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((c) => c + 1);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [userId]);
```

**Step 3: Add mark-as-read and dismiss handlers**

```tsx
// Inside NotificationBell component, add handlers:

async function handleMarkAllRead() {
  await markAllNotificationsRead(userId);
  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  setUnreadCount(0);
  toast.success('All notifications marked as read');
}

async function handleDismiss(id: string) {
  await dismissNotification(id);
  setNotifications((prev) => {
    const removed = prev.find((n) => n.id === id);
    if (removed && !removed.read) setUnreadCount((c) => Math.max(0, c - 1));
    return prev.filter((n) => n.id !== id);
  });
}

async function handleMarkRead(id: string) {
  await markNotificationRead(id);
  setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  setUnreadCount((c) => Math.max(0, c - 1));
}
```

**Step 4: Update notification panel UI**

In the notification dropdown/panel rendering section of NotificationBell, add:
- "Mark all as read" button in the header
- Unread indicator: left border accent on unread items (`border-l-2 border-seeko-accent`)
- X button on hover for each notification
- Click on notification marks it as read

**Step 5: Verify real-time notifications**

Run: `npm run dev`
1. Open the app in two tabs
2. In Supabase Table Editor, insert a notification row for the logged-in user
3. Bell badge should pulse and new notification should appear without refresh
4. Click "Mark all as read" → all items lose accent border, count resets
5. Hover an item → X appears → click dismisses it

**Step 6: Commit**

```bash
git add src/lib/supabase/data.ts src/components/dashboard/NotificationBell.tsx
git commit -m "feat: add real-time notifications with mark-read and dismiss"
```

---

## Task 7: Docs Workflow — Breadcrumbs & Quick Create

Add breadcrumb navigation showing doc hierarchy and an inline quick-create button.

**Files:**
- Create: `src/components/dashboard/DocBreadcrumbs.tsx`
- Modify: `src/components/dashboard/DocList.tsx` — add breadcrumbs, inline create button
- Modify: `src/lib/supabase/data.ts` — add `createDoc` function

**Step 1: Add `createDoc` to data layer**

```tsx
// Add to src/lib/supabase/data.ts:

export async function createDoc(title: string, parentId?: string): Promise<Doc | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('docs')
    .insert({
      title,
      parent_id: parentId ?? null,
      sort_order: 0,
      content: '',
    })
    .select()
    .single();
  if (error) return null;
  return data;
}
```

**Step 2: Create `DocBreadcrumbs.tsx`**

```tsx
// src/components/dashboard/DocBreadcrumbs.tsx
'use client';

import { ChevronRight, FileText } from 'lucide-react';
import type { Doc } from '@/lib/types';

interface DocBreadcrumbsProps {
  ancestors: Pick<Doc, 'id' | 'title'>[];
  onNavigate: (docId: string | null) => void;
}

export function DocBreadcrumbs({ ancestors, onNavigate }: DocBreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4 overflow-x-auto">
      <button
        onClick={() => onNavigate(null)}
        className="hover:text-foreground transition-colors shrink-0"
      >
        <FileText className="h-4 w-4" />
      </button>
      {ancestors.map((doc) => (
        <span key={doc.id} className="flex items-center gap-1 shrink-0">
          <ChevronRight className="h-3 w-3" />
          <button
            onClick={() => onNavigate(doc.id)}
            className="hover:text-foreground transition-colors truncate max-w-32"
          >
            {doc.title}
          </button>
        </span>
      ))}
    </nav>
  );
}
```

**Step 3: Add inline quick-create to `DocList.tsx`**

In `src/components/dashboard/DocList.tsx`, add a "New doc" button that shows an inline input:

```tsx
// Add imports:
import { DocBreadcrumbs } from './DocBreadcrumbs';
import { createDoc } from '@/lib/supabase/data';
import { Plus } from 'lucide-react';

// Add state:
const [creatingTitle, setCreatingTitle] = useState('');
const [isCreating, setIsCreating] = useState(false);

// Add handler:
async function handleCreate() {
  if (!creatingTitle.trim()) return;
  const doc = await createDoc(creatingTitle.trim(), currentParentId);
  if (doc) {
    setDocs((prev) => [...prev, doc]);
    setCreatingTitle('');
    setIsCreating(false);
    toast.success(`Created "${doc.title}"`);
    trigger?.('light');
  }
}

// Add to UI, after the doc list heading:
// "New doc" button that toggles an inline input
<button
  onClick={() => setIsCreating(true)}
  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
>
  <Plus className="h-4 w-4" />
  New doc
</button>

{isCreating && (
  <div className="flex items-center gap-2 mt-2">
    <input
      autoFocus
      value={creatingTitle}
      onChange={(e) => setCreatingTitle(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
      placeholder="Document title..."
      className="flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-seeko-accent/40"
    />
    <button onClick={handleCreate} className="text-sm text-seeko-accent hover:underline">Create</button>
  </div>
)}
```

**Step 4: Register `Cmd+Shift+N` shortcut for quick doc create**

In `DocList.tsx`, add a keyboard listener:

```tsx
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
      e.preventDefault();
      setIsCreating(true);
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, []);
```

**Step 5: Verify docs workflow**

Run: `npm run dev`
1. Navigate to `/docs`
2. Click "New doc" → inline input appears → type title → Enter → doc created, toast shows
3. Press `Cmd+Shift+N` → same inline create input opens
4. Breadcrumbs show hierarchy when navigating into nested docs

**Step 6: Commit**

```bash
git add src/components/dashboard/DocBreadcrumbs.tsx src/components/dashboard/DocList.tsx src/lib/supabase/data.ts
git commit -m "feat: add doc breadcrumbs and quick-create with keyboard shortcut"
```

---

## Task 8: Avatar Hover Glow Pulse

Upgrade the sidebar avatar hover to pulse the ring glow once, then hold.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` — update avatar hover animation

**Step 1: Update avatar hover in Sidebar**

Find the avatar hover animation in `Sidebar.tsx` (uses `whileHover={{ scale: 1.1 }}`). Replace with a keyframe-based glow pulse:

```tsx
// Replace the avatar motion.div whileHover:
whileHover={{
  scale: 1.08,
  boxShadow: [
    '0 0 0 0px rgba(110, 231, 183, 0)',
    '0 0 0 3px rgba(110, 231, 183, 0.4)',
    '0 0 0 2px rgba(110, 231, 183, 0.25)',
  ],
}}
transition={springs.smooth}
```

**Step 2: Verify avatar glow**

Run: `npm run dev`
Hover the avatar in the sidebar footer. The ring should pulse (expand then settle) with the seeko-accent color.

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add avatar hover glow pulse animation"
```

---

## Summary

| Task | What | Key files |
|------|------|-----------|
| 1 | Page transitions (AnimatePresence) | `PageTransition.tsx`, `layout.tsx` |
| 2 | Loading skeletons | `skeleton.tsx`, `skeletons/*.tsx`, `loading.tsx` files |
| 3 | Count-up stats + animated progress | `AnimatedNumber.tsx`, `page.tsx`, `DashboardAreaCard.tsx` |
| 4 | Toast styling | `layout.tsx`, `globals.css` |
| 5 | Command palette (Cmd+K) | `CommandPalette.tsx`, `useCommandPalette.ts`, `layout.tsx` |
| 6 | Notification management | `NotificationBell.tsx`, `data.ts` |
| 7 | Docs workflow | `DocBreadcrumbs.tsx`, `DocList.tsx`, `data.ts` |
| 8 | Avatar glow pulse | `Sidebar.tsx` |
