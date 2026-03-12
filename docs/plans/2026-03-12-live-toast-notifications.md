# Live Toast Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real-time toast notifications at the bottom-center of the screen when Supabase INSERT events arrive, with spring animations, swipe-to-dismiss, auto-dismiss timers, and a stacking system (max 3 visible + overflow count).

**Architecture:** A standalone `LiveToastProvider` context wraps the dashboard layout. NotificationBell's existing Supabase subscription calls `addLiveToast()` via context on INSERT events. A portaled `LiveToastContainer` renders up to 3 `LiveToastCard` components at the bottom of the viewport with `AnimatePresence` for layout reflow.

**Tech Stack:** React 19, motion/react (springs, AnimatePresence, layout animations), Next.js 16 App Router, Supabase real-time, Tailwind v4

---

### Task 1: LiveToastProvider — Context and State Management

**Files:**
- Create: `src/components/dashboard/notifications/LiveToastContext.tsx`

**Step 1: Create the provider with toast stack state, timers, and context API**

```tsx
'use client';

import { createContext, useContext, useCallback, useRef, useState } from 'react';
import { Notification } from '@/lib/types';

export interface LiveToast {
  id: string;
  notification: Notification;
  createdAt: number; // Date.now() for timer tracking
}

interface LiveToastContextValue {
  addLiveToast: (notification: Notification) => void;
  dismissToast: (id: string) => void;
  toasts: LiveToast[];
  overflowCount: number;
  /** Set to true when notification panel is open — suppresses new toasts */
  suppress: boolean;
  setSuppressed: (v: boolean) => void;
}

const LiveToastContext = createContext<LiveToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 10_000;
const ACCELERATED_DISMISS_MS = 2_000;

export function LiveToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const [suppress, setSuppressed] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seenIds = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    seenIds.current.delete(id);
  }, []);

  const startTimer = useCallback((id: string, ms: number) => {
    // Clear any existing timer for this id
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      dismissToast(id);
    }, ms);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  const pauseTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const resumeTimer = useCallback((id: string, ms: number) => {
    startTimer(id, ms);
  }, [startTimer]);

  const addLiveToast = useCallback((notification: Notification) => {
    // Skip if suppressed or duplicate
    if (suppress) return;
    if (seenIds.current.has(notification.id)) return;
    seenIds.current.add(notification.id);

    const toast: LiveToast = {
      id: notification.id,
      notification,
      createdAt: Date.now(),
    };

    setToasts(prev => {
      const next = [...prev, toast];

      // If stack is over capacity, accelerate oldest toast's timer
      if (next.length > MAX_VISIBLE) {
        const oldest = next[0];
        startTimer(oldest.id, ACCELERATED_DISMISS_MS);
      }

      return next;
    });

    // Start auto-dismiss timer
    startTimer(notification.id, AUTO_DISMISS_MS);
  }, [suppress, startTimer]);

  return (
    <LiveToastContext.Provider
      value={{
        addLiveToast,
        dismissToast,
        toasts,
        overflowCount: Math.max(0, toasts.length - MAX_VISIBLE),
        suppress,
        setSuppressed,
      }}
    >
      {children}
    </LiveToastContext.Provider>
  );
}

export function useLiveToast() {
  const ctx = useContext(LiveToastContext);
  if (!ctx) throw new Error('useLiveToast must be used within LiveToastProvider');
  return ctx;
}

export { MAX_VISIBLE, AUTO_DISMISS_MS };
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep LiveToastContext || echo "No errors in LiveToastContext"`
Expected: No errors referencing the new file

**Step 3: Commit**

```bash
git add src/components/dashboard/notifications/LiveToastContext.tsx
git commit -m "feat: add LiveToastProvider context for live toast notifications"
```

---

### Task 2: LiveToastCard — Individual Toast Component

**Files:**
- Create: `src/components/dashboard/notifications/LiveToastCard.tsx`
- Reference: `src/components/dashboard/notifications/constants.ts` (KIND_CONFIG)

**Step 1: Create the toast card with entrance/exit animations and swipe-to-dismiss**

```tsx
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { X } from 'lucide-react';
import { KIND_CONFIG } from './constants';
import { formatTime } from './utils';
import type { LiveToast } from './LiveToastContext';
import { AUTO_DISMISS_MS } from './LiveToastContext';

const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 300;

interface LiveToastCardProps {
  toast: LiveToast;
  onDismiss: (id: string) => void;
  onTap: (toast: LiveToast) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string, ms: number) => void;
}

export function LiveToastCard({
  toast,
  onDismiss,
  onTap,
  onPauseTimer,
  onResumeTimer,
}: LiveToastCardProps) {
  const { notification } = toast;
  const [hovered, setHovered] = useState(false);
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  // Track remaining time for pause/resume
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const pausedAtRef = useRef<number | null>(null);

  // Swipe-to-dismiss (downward)
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 80], [1, 0]);
  const scale = useTransform(y, [0, 80], [1, 0.95]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > SWIPE_THRESHOLD || info.velocity.y > VELOCITY_THRESHOLD) {
        // Animate out then dismiss
        animate(y, 120, { duration: 0.2 }).then(() => {
          onDismiss(toast.id);
        });
      } else {
        // Snap back
        animate(y, 0, { type: 'spring', stiffness: 500, damping: 30 });
      }
    },
    [y, onDismiss, toast.id]
  );

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    pausedAtRef.current = Date.now();
    const elapsed = Date.now() - toast.createdAt;
    remainingRef.current = Math.max(AUTO_DISMISS_MS - elapsed, 1000);
    onPauseTimer(toast.id);
  }, [toast.id, toast.createdAt, onPauseTimer]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    onResumeTimer(toast.id, remainingRef.current);
    pausedAtRef.current = null;
  }, [toast.id, onResumeTimer]);

  // Touch hold = pause
  const handleTouchStart = useCallback(() => {
    pausedAtRef.current = Date.now();
    const elapsed = Date.now() - toast.createdAt;
    remainingRef.current = Math.max(AUTO_DISMISS_MS - elapsed, 1000);
    onPauseTimer(toast.id);
  }, [toast.id, toast.createdAt, onPauseTimer]);

  const handleTouchEnd = useCallback(() => {
    if (pausedAtRef.current) {
      onResumeTimer(toast.id, remainingRef.current);
      pausedAtRef.current = null;
    }
  }, [toast.id, onResumeTimer]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={{ opacity, scale, y }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.1, bottom: 0.6 }}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="w-full max-w-[400px] mx-auto touch-none"
    >
      <button
        onClick={() => onTap(toast)}
        className={[
          'relative flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors',
          notification.read
            ? 'bg-[#212121] border border-white/[0.06]'
            : 'bg-[#1a1a1a] border border-white/[0.08]',
        ].join(' ')}
        style={{ backdropFilter: 'blur(16px) saturate(180%)', WebkitBackdropFilter: 'blur(16px) saturate(180%)' }}
      >
        {/* Unread dot */}
        {!notification.read && (
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-seeko-accent" />
        )}

        {/* Kind icon */}
        <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg} ${cfg.className}`}>
          <Icon className="size-3.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-6">
          <p className="text-[13px] leading-snug font-medium text-foreground">
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs mt-0.5 line-clamp-1 text-muted-foreground/70">
              {notification.body}
            </p>
          )}
          <p className="text-[11px] mt-1 text-muted-foreground/50">
            {formatTime(notification.created_at, 'Today')}
          </p>
        </div>

        {/* Dismiss X */}
        <motion.span
          initial={false}
          animate={{
            opacity: hovered ? 1 : 0.5,
            scale: hovered ? 1 : 0.8,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className={[
            'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full',
            'bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground transition-colors cursor-pointer',
          ].join(' ')}
          role="button"
          aria-label="Dismiss notification"
        >
          <X className="size-3" />
        </motion.span>
      </button>
    </motion.div>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep LiveToastCard || echo "No errors in LiveToastCard"`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/dashboard/notifications/LiveToastCard.tsx
git commit -m "feat: add LiveToastCard component with spring animations and swipe-to-dismiss"
```

---

### Task 3: LiveToastContainer — Portal Renderer

**Files:**
- Create: `src/components/dashboard/notifications/LiveToastContainer.tsx`
- Reference: `src/components/dashboard/notifications/LiveToastContext.tsx`

**Step 1: Create the container that portals the toast stack to the viewport bottom-center**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useLiveToast, MAX_VISIBLE, AUTO_DISMISS_MS } from './LiveToastContext';
import { LiveToastCard } from './LiveToastCard';
import type { LiveToast } from './LiveToastContext';

interface LiveToastContainerProps {
  onTapToast: (toast: LiveToast) => void;
  onOpenPanel: () => void;
}

export function LiveToastContainer({ onTapToast, onOpenPanel }: LiveToastContainerProps) {
  const { toasts, overflowCount, dismissToast } = useLiveToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Timer pause/resume via refs in context — we pass callbacks that call into context
  const { addLiveToast: _, ...ctx } = useLiveToast();

  const handlePauseTimer = useCallback((id: string) => {
    // Find and clear the timer — this is handled by the context's pauseTimer
    // We access it indirectly: the LiveToastCard tracks remaining time itself,
    // and we just clear/restart the context timer
  }, []);

  const handleResumeTimer = useCallback((_id: string, _ms: number) => {
    // Resume is handled by LiveToastCard passing remaining ms
  }, []);

  const visibleToasts = toasts.slice(-MAX_VISIBLE);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-[9997] flex flex-col items-center pointer-events-none"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      {/* Overflow pill */}
      <AnimatePresence>
        {overflowCount > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={onOpenPanel}
            className="pointer-events-auto mb-2 px-3 py-1 rounded-full bg-white/[0.12] text-xs font-medium text-muted-foreground hover:bg-white/[0.18] hover:text-foreground transition-colors backdrop-blur-sm cursor-pointer"
          >
            +{overflowCount} more
          </motion.button>
        )}
      </AnimatePresence>

      {/* Toast stack */}
      <div className="w-full max-w-[400px] flex flex-col gap-2 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {visibleToasts.map(toast => (
            <LiveToastCard
              key={toast.id}
              toast={toast}
              onDismiss={dismissToast}
              onTap={onTapToast}
              onPauseTimer={handlePauseTimer}
              onResumeTimer={handleResumeTimer}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>,
    document.body
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep LiveToastContainer || echo "No errors"`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/dashboard/notifications/LiveToastContainer.tsx
git commit -m "feat: add LiveToastContainer portal with overflow pill and stack layout"
```

---

### Task 4: Expose pauseTimer/resumeTimer from Context and Wire Timer Controls

The LiveToastCard needs to pause/resume timers on hover. The context needs to expose these.

**Files:**
- Modify: `src/components/dashboard/notifications/LiveToastContext.tsx`
- Modify: `src/components/dashboard/notifications/LiveToastContainer.tsx`

**Step 1: Add pauseTimer and resumeTimer to the context value**

In `LiveToastContext.tsx`, update the `LiveToastContextValue` interface:

```tsx
interface LiveToastContextValue {
  addLiveToast: (notification: Notification) => void;
  dismissToast: (id: string) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string, ms: number) => void;
  toasts: LiveToast[];
  overflowCount: number;
  suppress: boolean;
  setSuppressed: (v: boolean) => void;
}
```

Add `pauseTimer` and `resumeTimer` to the Provider's value prop:

```tsx
<LiveToastContext.Provider
  value={{
    addLiveToast,
    dismissToast,
    pauseTimer,
    resumeTimer,
    toasts,
    overflowCount: Math.max(0, toasts.length - MAX_VISIBLE),
    suppress,
    setSuppressed,
  }}
>
```

**Step 2: Update LiveToastContainer to pass real timer controls**

Replace the placeholder `handlePauseTimer` and `handleResumeTimer` in `LiveToastContainer.tsx`:

```tsx
const { toasts, overflowCount, dismissToast, pauseTimer, resumeTimer } = useLiveToast();

// ...

<LiveToastCard
  key={toast.id}
  toast={toast}
  onDismiss={dismissToast}
  onTap={onTapToast}
  onPauseTimer={pauseTimer}
  onResumeTimer={resumeTimer}
/>
```

Remove the unused `handlePauseTimer`, `handleResumeTimer` callbacks and the destructured `ctx` / `addLiveToast: _`.

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "LiveToast" || echo "No errors"`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/dashboard/notifications/LiveToastContext.tsx src/components/dashboard/notifications/LiveToastContainer.tsx
git commit -m "feat: wire pause/resume timer controls from context to toast cards"
```

---

### Task 5: Wire into NotificationBell and Dashboard Layout

**Files:**
- Modify: `src/components/dashboard/NotificationBell.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Wrap dashboard layout with LiveToastProvider**

In `src/app/(dashboard)/layout.tsx`, add the import and wrap the content:

```tsx
// Add import at top
import { LiveToastProvider } from '@/components/dashboard/notifications/LiveToastContext';
```

Wrap the return JSX — the `LiveToastProvider` wraps everything inside the `DashboardTourWrapper`:

```tsx
return (
  <DashboardTourWrapper ...>
    <LiveToastProvider>
      {/* ... existing layout content ... */}
    </LiveToastProvider>
  </DashboardTourWrapper>
);
```

**Note:** `LiveToastProvider` is a client component ('use client'). Since the dashboard layout is a server component, `LiveToastProvider` can still wrap children because React supports interleaving server and client components — client components can render `{children}` which can be server components.

**Step 2: Hook into NotificationBell's real-time subscription**

In `src/components/dashboard/NotificationBell.tsx`:

Add import:
```tsx
import { useLiveToast } from './notifications/LiveToastContext';
```

Inside the component function, after existing hooks:
```tsx
const { addLiveToast, setSuppressed } = useLiveToast();
```

In the existing INSERT handler (around line 99-103), add one line to fire the live toast:
```tsx
.on(
  'postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
  (payload) => {
    const notif = payload.new as Notification;
    setNotifications(prev => [notif, ...prev].slice(0, 20));
    setUnreadCount(c => c + 1);
    addLiveToast(notif); // ← NEW: fire live toast
  }
)
```

Sync `suppress` with panel open state — when the panel opens, suppress toasts:
```tsx
// After existing open state toggle handler, sync suppression
useEffect(() => {
  setSuppressed(open);
}, [open, setSuppressed]);
```

**Step 3: Add LiveToastContainer render inside NotificationBell**

At the bottom of NotificationBell's return JSX (after the mobile portal), add:

```tsx
import { LiveToastContainer } from './notifications/LiveToastContainer';

// Inside the return, after the mobile portal createPortal:
{mounted && typeof document !== 'undefined' && (
  <LiveToastContainer
    onTapToast={(toast) => {
      handleNotificationTap({
        id: toast.notification.id,
        kind: toast.notification.kind,
        title: toast.notification.title,
        body: toast.notification.body,
        link: toast.notification.link,
        read: toast.notification.read,
        created_at: toast.notification.created_at,
        count: 1,
        ids: [toast.notification.id],
      });
    }}
    onOpenPanel={() => setOpen(true)}
  />
)}
```

**Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors (the pre-existing `agreement-pdf.test.ts` error is unrelated)

**Step 5: Test manually**

Run: `npm run dev`
1. Open the app in a browser
2. Open a second browser tab or use Supabase's Table Editor to insert a notification row for your user
3. The toast should appear at the bottom-center of the screen
4. Verify: auto-dismiss after 10 seconds
5. Verify: hover pauses the timer
6. Verify: swipe down dismisses
7. Verify: tap navigates to the notification's link
8. Verify: opening the notification panel suppresses new toasts

**Step 6: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx src/components/dashboard/NotificationBell.tsx
git commit -m "feat: wire live toast notifications into dashboard layout and real-time subscription"
```

---

### Task 6: Accessibility and Reduced Motion

**Files:**
- Modify: `src/components/dashboard/notifications/LiveToastCard.tsx`
- Modify: `src/components/dashboard/notifications/LiveToastContainer.tsx`

**Step 1: Add reduced motion support to LiveToastCard**

In `LiveToastCard.tsx`, import `useReducedMotion`:

```tsx
import { useReducedMotion } from 'motion/react';
```

Inside the component:
```tsx
const prefersReducedMotion = useReducedMotion();
```

Update the motion.div props to respect reduced motion:

```tsx
<motion.div
  layout={!prefersReducedMotion}
  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.95 }}
  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
  transition={prefersReducedMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 25 }}
  // ...rest unchanged
>
```

**Step 2: Ensure the toast container has proper ARIA attributes**

The container already has `role="status"` and `aria-live="polite"` from Task 3. Verify the X button has `aria-label="Dismiss notification"` (already added in Task 2).

**Step 3: Add mobile X button always-visible behavior**

The X button should always be visible on mobile (already partially handled by opacity 0.5 default). Update the X button in `LiveToastCard.tsx` to use a media query approach:

```tsx
<motion.span
  initial={false}
  animate={{
    opacity: hovered ? 1 : 0.5,
    scale: hovered ? 1 : 0.8,
  }}
  // ... rest stays the same
>
```

The 0.5 base opacity ensures it's always partially visible on mobile (where hover doesn't exist), while desktop users see it become fully opaque on hover.

**Step 4: Commit**

```bash
git add src/components/dashboard/notifications/LiveToastCard.tsx src/components/dashboard/notifications/LiveToastContainer.tsx
git commit -m "feat: add reduced motion support and verify accessibility for live toasts"
```
