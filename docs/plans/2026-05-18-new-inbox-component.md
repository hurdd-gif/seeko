# New Inbox Component — Pure Account-Menu Rebuild — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the ported dark-card Inbox dropdown with a purpose-built `InboxRow` + slimmed panels that are visually and behaviorally indistinguishable from the SEEKO account-menu popover (`OverviewHeaderActions`).

**Architecture:** `NotificationBell` stays the data/realtime owner. A new presentational `InboxRow` replaces `NotificationCard`. Notifications render as a **flat** date-grouped list (new `groupNotificationsFlat` util) — no swipe, no per-row X, no colored chips, no `+N` stacking. The two panel shells (desktop dropdown, mobile bottom sheet) keep their anchoring/shadow/spring/drag-dismiss exactly; only their row rendering + grouping source swap. Net new-file count: zero (1 created, 2 deleted).

**Tech Stack:** Next.js 16 App Router · React 19 · `motion/react` · Tailwind v4 (CSS-config) · Vitest · Supabase realtime · lucide-react.

**Design doc:** `docs/plans/2026-05-18-new-inbox-component-design.md` (approved).

---

## Working Environment & Sync Protocol (READ FIRST)

The dev server **and Vitest run from the main repo** `/Volumes/CODEUSER/seeko-studio`. The feature branch `feat/dashboard-paper-redesign` is **owned by the worktree** `/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign` (main is detached at its tip). `vitest.config.ts` **excludes `**/.worktrees/**`**, so tests only ever pick up files in main.

Therefore, for every task:

1. **Edit / create / delete files in the MAIN repo** (`/Volumes/CODEUSER/seeko-studio`).
2. **Run `npx tsc --noEmit` and `npm test` from MAIN.**
3. **Commit from the WORKTREE.** Before each commit, copy the exact touched files from MAIN → worktree (and `git rm` deleted ones in the worktree), then `git add`/`git commit` inside the worktree. Each task's Commit step lists the exact paths — copy only those, never bulk-sync (other in-progress work lives in both trees).

Shell variables used in every Commit step:

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
```

Commit messages end with:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Benign TS baseline:** `npx tsc --noEmit` emits pre-existing TS2582/TS2304 in `*.test.ts(x)` files (Vitest globals unknown to tsc). The new `__tests__/utils.test.ts` uses an explicit `import { describe, it, expect } from 'vitest'`, so it should NOT add such errors. Do not "fix" the pre-existing baseline noise.

---

## Task 1: Failing test for `groupNotificationsFlat` (RED)

**Files:**
- Create: `src/components/dashboard/notifications/__tests__/utils.test.ts`

**Step 1: Write the failing test**

Create `src/components/dashboard/notifications/__tests__/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupNotificationsFlat } from '../utils';
import type { Notification } from '@/lib/types';

function makeNotif(
  overrides: Partial<Notification> & { id: string; created_at: string },
): Notification {
  return {
    user_id: 'u1',
    kind: 'comment_reply',
    title: 'Reply on your task',
    read: false,
    ...overrides,
  } as Notification;
}

describe('groupNotificationsFlat', () => {
  it('keeps same-kind same-title same-day items as separate flat rows (no collapse)', () => {
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const iso = today.toISOString();
    const items: Notification[] = [
      makeNotif({ id: 'a', created_at: iso }),
      makeNotif({ id: 'b', created_at: iso }),
      makeNotif({ id: 'c', created_at: iso }),
    ];

    const result = groupNotificationsFlat(items);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Today');
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items.every((n) => n.count === 1)).toBe(true);
    expect(result[0].items.every((n) => n.children === undefined)).toBe(true);
    expect(result[0].items.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('buckets mixed days into Today/Yesterday/Earlier in fixed order, preserving input order within a group', () => {
    const now = new Date();
    const todayMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
    const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const items: Notification[] = [
      makeNotif({ id: 'old', created_at: lastWeek.toISOString() }),
      makeNotif({ id: 't1', created_at: todayMorning.toISOString() }),
      makeNotif({ id: 'y1', created_at: yesterday.toISOString() }),
      makeNotif({ id: 't2', created_at: todayNoon.toISOString() }),
    ];

    const result = groupNotificationsFlat(items);

    expect(result.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(result.find((g) => g.label === 'Today')!.items.map((n) => n.id)).toEqual(['t1', 't2']);
    expect(result.find((g) => g.label === 'Yesterday')!.items.map((n) => n.id)).toEqual(['y1']);
    expect(result.find((g) => g.label === 'Earlier')!.items.map((n) => n.id)).toEqual(['old']);
  });
});
```

**Step 2: Run test to verify it fails**

Run (from MAIN): `cd /Volumes/CODEUSER/seeko-studio && npx vitest run src/components/dashboard/notifications/__tests__/utils.test.ts`
Expected: **FAIL** — `groupNotificationsFlat` is not exported from `../utils` (TypeScript/import error: "groupNotificationsFlat is not a function" / no exported member). Confirm the failure is the missing function, not a typo in the test.

**Step 3: Commit the red test**

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
mkdir -p "$WT/$N/__tests__"
cp "$MAIN/$N/__tests__/utils.test.ts" "$WT/$N/__tests__/utils.test.ts"
cd "$WT" && git add "$N/__tests__/utils.test.ts" && git commit -m "test(inbox): failing spec for groupNotificationsFlat (flat, no collapse)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Implement `groupNotificationsFlat` (GREEN)

**Files:**
- Modify: `src/components/dashboard/notifications/utils.ts` (append new function; keep all existing exports intact)

**Step 1: Add the function**

Append to `src/components/dashboard/notifications/utils.ts` (after `groupNotifications`, end of file). Do **not** modify `formatTime`, `getTimeGroup`, `collapseNotifications`, or `groupNotifications`:

```ts
export function groupNotificationsFlat(notifications: Notification[]): GroupedNotification[] {
  const groups = new Map<string, Notification[]>();
  const order = ['Today', 'Yesterday', 'Earlier'];

  for (const n of notifications) {
    const group = getTimeGroup(n.created_at);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(n);
  }

  return order
    .filter((label) => groups.has(label))
    .map((label) => ({
      label,
      items: groups.get(label)!.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        created_at: n.created_at,
        count: 1,
        ids: [n.id],
      })),
    }));
}
```

**Step 2: Run test to verify it passes**

Run (from MAIN): `cd /Volumes/CODEUSER/seeko-studio && npx vitest run src/components/dashboard/notifications/__tests__/utils.test.ts`
Expected: **PASS** — 2 passing tests, output pristine.

**Step 3: Commit**

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
cp "$MAIN/$N/utils.ts" "$WT/$N/utils.ts"
cd "$WT" && git add "$N/utils.ts" && git commit -m "feat(inbox): groupNotificationsFlat — flat 1:1 date grouping

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Create `InboxRow`

**Files:**
- Create: `src/components/dashboard/notifications/InboxRow.tsx`

Presentational + motion only → TDD-exempt (no behavior test). Mirrors `OverviewHeaderActions` `PopoverLink`.

**Step 1: Create the component**

Create `src/components/dashboard/notifications/InboxRow.tsx`:

```tsx
'use client';

import { motion } from 'motion/react';
import { DisplayNotification } from './types';
import { KIND_CONFIG, SNAPPY } from './constants';
import { formatTime } from './utils';
import { useDials } from './DialContext';

interface InboxRowProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
}

export function InboxRow({ notification, group, index, stagger, onTap }: InboxRowProps) {
  const d = useDials();
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ ...d.card.spring, delay: index * stagger }}
    >
      <motion.button
        whileHover={{ x: 2 }}
        transition={SNAPPY}
        onClick={() => onTap(notification)}
        className="flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[#0000000a]"
      >
        <Icon className="size-5 text-[#808080] shrink-0 mt-px" aria-hidden />
        <div className="flex-1 min-w-0">
          <p
            className={`text-[14px] leading-snug tracking-[-0.28px] ${
              !notification.read ? 'font-medium text-[#0d0d0d]' : 'text-[#808080]'
            }`}
          >
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs mt-0.5 line-clamp-2 text-[#808080]">{notification.body}</p>
          )}
          <p className="text-[11px] mt-1 text-[#808080]">
            {formatTime(notification.created_at, group)}
          </p>
        </div>
      </motion.button>
    </motion.div>
  );
}
```

**Step 2: Typecheck the new file**

Run (from MAIN): `cd /Volumes/CODEUSER/seeko-studio && npx tsc --noEmit 2>&1 | grep -i "InboxRow" || echo "InboxRow: clean"`
Expected: `InboxRow: clean` (no type errors referencing InboxRow.tsx).

**Step 3: Commit**

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
cp "$MAIN/$N/InboxRow.tsx" "$WT/$N/InboxRow.tsx"
cd "$WT" && git add "$N/InboxRow.tsx" && git commit -m "feat(inbox): InboxRow — pure account-menu row (no swipe/X/chip)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Rewrite `DesktopNotificationPanel` rows

**Files:**
- Modify: `src/components/dashboard/notifications/DesktopNotificationPanel.tsx`

Keep panel `motion.div` anchoring/shadow/spring, header + Mark all read, hairlines, group labels, empty state EXACTLY as-is. Only: swap import, drop `onDismiss/onMarkRead`, flatten the row map.

**Step 1: Replace the file contents**

Overwrite `src/components/dashboard/notifications/DesktopNotificationPanel.tsx` with:

```tsx
'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { InboxRow } from './InboxRow';
import { GroupedNotification, DisplayNotification } from './types';
import { useDials } from './DialContext';

interface DesktopNotificationPanelProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
}

export const DesktopNotificationPanel = forwardRef<HTMLDivElement, DesktopNotificationPanelProps>(
  function DesktopNotificationPanel(
    { open, grouped, isEmpty, unreadCount, onMarkAllRead, onTap },
    ref
  ) {
    const d = useDials();
    let rowIndex = 0;

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: d.panel.initialScale, y: d.panel.initialY }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: d.panel.initialScale, y: d.panel.initialY }}
            transition={d.panel.spring}
            className="absolute right-0 top-full mt-[9px] w-[400px] z-[9999] flex flex-col gap-1 overflow-hidden rounded-[20px] bg-white p-1 shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.10)]"
            style={{ transformOrigin: 'top right' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d]">Inbox</h3>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] text-[#808080] hover:bg-[#0000000a] hover:text-[#0d0d0d] transition-colors"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="mx-4 h-px bg-[#0000000d]" />

            {/* Content */}
            <div className="max-h-[min(500px,70vh)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="size-8 text-[#0000001f]" />
                  <p className="mt-3 text-[13px] text-[#808080]">You&apos;re all caught up</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {grouped.map((group, gi) => (
                    <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
                      {gi > 0 && <div className="mx-4 mb-1 h-px bg-[#0000000d]" />}
                      <div className="px-4 pt-2 pb-1.5 text-[13px] text-[#808080]">
                        {group.label}
                      </div>
                      {group.items.map((notif) => {
                        const idx = rowIndex++;
                        return (
                          <InboxRow
                            key={notif.id}
                            notification={notif}
                            group={group.label}
                            index={idx}
                            stagger={d.panel.rowStagger}
                            onTap={onTap}
                          />
                        );
                      })}
                    </div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
```

**Step 2: Typecheck**

Run (from MAIN): `cd /Volumes/CODEUSER/seeko-studio && npx tsc --noEmit 2>&1 | grep -i "DesktopNotificationPanel" || echo "DesktopNotificationPanel: clean"`
Expected: `DesktopNotificationPanel: clean`. (NotificationBell will still type-error here because it passes the now-removed `onDismiss`/`onMarkRead` — that is fixed in Task 6. Confirm only DesktopNotificationPanel.tsx itself is clean.)

**Step 3: Commit**

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
cp "$MAIN/$N/DesktopNotificationPanel.tsx" "$WT/$N/DesktopNotificationPanel.tsx"
cd "$WT" && git add "$N/DesktopNotificationPanel.tsx" && git commit -m "refactor(inbox): desktop panel renders flat InboxRow, drop dismiss/markRead

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Rewrite `MobileNotificationSheet` rows

**Files:**
- Modify: `src/components/dashboard/notifications/MobileNotificationSheet.tsx`

Keep the entire sheet shell (backdrop, `SHEET_SPRING`, drag handle, `drag="y"` + `onDragEnd` dismiss, scroll lock, header X = close, hairline, group labels, empty state, `onPointerDown` stopPropagation) EXACTLY. Only: swap import, drop `onDismiss/onMarkRead`, flatten the row map.

**Step 1: Replace the file contents**

Overwrite `src/components/dashboard/notifications/MobileNotificationSheet.tsx` with:

```tsx
'use client';

import { forwardRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2, X } from 'lucide-react';
import { SHEET_SPRING, MOBILE_ROW_STAGGER } from './constants';
import { InboxRow } from './InboxRow';
import { GroupedNotification, DisplayNotification } from './types';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';

interface MobileNotificationSheetProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
}

export const MobileNotificationSheet = forwardRef<HTMLDivElement, MobileNotificationSheetProps>(
  function MobileNotificationSheet(
    { open, grouped, isEmpty, unreadCount, onClose, onMarkAllRead, onTap },
    ref
  ) {
    let rowIndex = 0;

    // Lock scroll when sheet is open
    useEffect(() => {
      if (!open) return;
      acquireScrollLock();
      return () => { releaseScrollLock(); };
    }, [open]);

    return (
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9998] touch-none"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              onClick={onClose}
            />
            {/* Sheet */}
            <motion.div
              ref={ref}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={SHEET_SPRING}
              className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col rounded-t-[20px] overflow-hidden shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_-8px_28px_rgba(0,0,0,0.12)]"
              style={{
                backgroundColor: '#ffffff',
                maxHeight: '85dvh',
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 100 || info.velocity.y > 300) onClose();
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-9 h-1 rounded-full bg-[#0000001f]" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-[15px] font-medium tracking-[-0.28px] text-[#0d0d0d]">Inbox</h3>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllRead}
                      className="inline-flex items-center gap-1.5 text-[13px] text-[#808080] active:text-[#0d0d0d] transition-colors"
                    >
                      <CheckCheck className="size-3.5" />
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="flex size-8 items-center justify-center rounded-full bg-[#0000000d] text-[#808080] active:bg-[#0000001a]"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mx-4 h-px bg-[#0000000d]" />

              {/* Notification list */}
              <div
                className="flex-1 overflow-y-auto overscroll-contain touch-auto px-2"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {isEmpty ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle2 className="size-10 text-[#0000001f]" />
                    <p className="mt-3 text-[13px] text-[#808080]">You&apos;re all caught up</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {grouped.map((group, gi) => (
                      <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
                        {gi > 0 && <div className="mx-4 mb-1 h-px bg-[#0000000d]" />}
                        <div className="px-4 pt-2 pb-1.5 text-[13px] text-[#808080]">
                          {group.label}
                        </div>
                        {group.items.map((notif) => {
                          const idx = rowIndex++;
                          return (
                            <InboxRow
                              key={notif.id}
                              notification={notif}
                              group={group.label}
                              index={idx}
                              stagger={MOBILE_ROW_STAGGER}
                              onTap={onTap}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
);
```

**Step 2: Typecheck**

Run (from MAIN): `cd /Volumes/CODEUSER/seeko-studio && npx tsc --noEmit 2>&1 | grep -i "MobileNotificationSheet" || echo "MobileNotificationSheet: clean"`
Expected: `MobileNotificationSheet: clean` (NotificationBell still errors until Task 6 — expected).

**Step 3: Commit**

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
cp "$MAIN/$N/MobileNotificationSheet.tsx" "$WT/$N/MobileNotificationSheet.tsx"
cd "$WT" && git add "$N/MobileNotificationSheet.tsx" && git commit -m "refactor(inbox): mobile sheet renders flat InboxRow, drop dismiss/markRead

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Wire `NotificationBell` (memo swap + prop drop + dead-code delete)

**Files:**
- Modify: `src/components/dashboard/NotificationBell.tsx`

Four edits. Keep the realtime channel, `markAllRead`, `markOneRead`, `handleNotificationTap`, the plain wrapper `<div>` + its comment, scroll-lock, suppress-toast, click-outside, Escape, and `LiveToastContainer` EXACTLY.

**Step 1: Swap the grouping import**

In `src/components/dashboard/NotificationBell.tsx`, change line 32:

```tsx
// from:
import { groupNotifications } from './notifications/utils';
// to:
import { groupNotificationsFlat } from './notifications/utils';
```

**Step 2: Swap the memo**

Change the `grouped` memo (line ~202):

```tsx
// from:
const grouped = useMemo(() => groupNotifications(notifications), [notifications]);
// to:
const grouped = useMemo(() => groupNotificationsFlat(notifications), [notifications]);
```

**Step 3: Delete the now-dead callbacks**

Delete the entire `swipeMarkRead` `useCallback` (the `// Swipe mark-read:` block, lines ~156–181) and the entire `dismissNotification` `useCallback` (the `// Dismiss = delete from DB` block, lines ~183–189). Do not touch `markAllRead`, `markOneRead`, or `handleNotificationTap`.

**Step 4: Drop the removed props from both panels**

In the `<DesktopNotificationPanel ... />` JSX, remove the lines:
```tsx
onDismiss={dismissNotification}
onMarkRead={swipeMarkRead}
```
In the `<MobileNotificationSheet ... />` JSX, remove the same two lines:
```tsx
onDismiss={dismissNotification}
onMarkRead={swipeMarkRead}
```
Leave `onTap={handleNotificationTap}` and every other prop unchanged.

**Step 5: Typecheck the whole project**

Run (from MAIN): `cd /Volumes/CODEUSER/seeko-studio && npx tsc --noEmit 2>&1 | grep -iE "NotificationBell|DesktopNotificationPanel|MobileNotificationSheet|InboxRow|notifications/utils" || echo "notifications subsystem: clean"`
Expected: `notifications subsystem: clean`. (Pre-existing TS2582/TS2304 in unrelated `*.test.ts(x)` is the benign baseline — ignore.)

**Step 6: Commit**

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
cp "$MAIN/src/components/dashboard/NotificationBell.tsx" "$WT/src/components/dashboard/NotificationBell.tsx"
cd "$WT" && git add src/components/dashboard/NotificationBell.tsx && git commit -m "refactor(inbox): NotificationBell uses flat grouping, drop swipe/dismiss callbacks

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Update the barrel

**Files:**
- Modify: `src/components/dashboard/notifications/index.ts`

**Step 1: Edit exports**

Overwrite `src/components/dashboard/notifications/index.ts` with:

```ts
export * from './types';
export * from './constants';
export * from './utils';
export { InboxRow } from './InboxRow';
export { BellToggle } from './BellToggle';
export { DesktopNotificationPanel } from './DesktopNotificationPanel';
export { MobileNotificationSheet } from './MobileNotificationSheet';
```

(`NotificationCard` and `NotificationStack` exports removed; `InboxRow` added.)

**Step 2: Verify no remaining importers of the soon-deleted files**

Run (from MAIN): `cd /Volumes/CODEUSER/seeko-studio && grep -rn "NotificationCard\|NotificationStack" src --include="*.ts" --include="*.tsx"`
Expected: **only** the two soon-to-be-deleted source files themselves match (`NotificationCard.tsx`, `NotificationStack.tsx`) and nothing else. If any other file imports them, STOP and report.

**Step 3: Commit**

```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
cp "$MAIN/$N/index.ts" "$WT/$N/index.ts"
cd "$WT" && git add "$N/index.ts" && git commit -m "refactor(inbox): barrel exports InboxRow, drops NotificationCard/Stack

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Delete `NotificationCard` and `NotificationStack`

**Files:**
- Delete: `src/components/dashboard/notifications/NotificationCard.tsx`
- Delete: `src/components/dashboard/notifications/NotificationStack.tsx`

**Step 1: Delete in MAIN**

```bash
cd /Volumes/CODEUSER/seeko-studio
rm src/components/dashboard/notifications/NotificationCard.tsx
rm src/components/dashboard/notifications/NotificationStack.tsx
```

**Step 2: Typecheck + full test run from MAIN**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx tsc --noEmit 2>&1 | grep -iE "NotificationCard|NotificationStack" || echo "no dangling refs"`
Expected: `no dangling refs`.

Run: `cd /Volumes/CODEUSER/seeko-studio && npm test`
Expected: all suites green, including `notifications/__tests__/utils.test.ts` (2) and `notifications/__tests__/BellToggle.test.tsx` (2). Output pristine.

Run: `cd /Volumes/CODEUSER/seeko-studio && grep -rn "NotificationCard\|NotificationStack" src --include="*.ts" --include="*.tsx" || echo "zero hits"`
Expected: `zero hits`.

**Step 3: Commit the deletions (git rm in worktree)**

```bash
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
N=src/components/dashboard/notifications
cd "$WT" && git rm "$N/NotificationCard.tsx" "$N/NotificationStack.tsx" && git commit -m "chore(inbox): delete NotificationCard + dead NotificationStack

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Visual QA + `/interface-craft` critique (AFTER pass)

**Mandatory hook** (user global rule): run `/interface-craft critique` AND `make-interfaces-feel-better` review after the change.

**Step 1: Confirm dev server is up**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` — expect `307` (redirect to /login) or `200`. If not running, start from MAIN: `cd /Volumes/CODEUSER/seeko-studio && nohup npm run dev >/tmp/seeko-dev.log 2>&1 &` and wait for first compile.

**Step 2: Screenshot Inbox vs account menu (Playwright MCP, existing `ykartix@gmail.com` session)**

Navigate to `http://localhost:3000/` (Overview — note: it is `(dashboard)/page.tsx`, URL `/`, NOT `/overview`). Open the Inbox bell in `OverviewHeaderActions`, screenshot. Open the account-menu pill beside it, screenshot. Save both under `/Volumes/CODEUSER/`.

**Step 3: Compare against the account menu — verify (quantitative):**
- Panel radius `rounded-[20px]`, shadow `0_0_0_0.5px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.10)`, `mt-[9px]` right-aligned anchor under the header pill — identical to the account menu.
- Row rhythm `px-4 py-3`, `rounded-2xl`, `hover:bg-[#0000000a]`, `whileHover x:2` nudge feel — matches `PopoverLink`.
- Hairline `mx-4 h-px bg-[#0000000d]` under header and above each group except the first.
- Type ramp: unread `font-medium text-[#0d0d0d]`, read `text-[#808080]`; body/timestamp `#808080`.
- Per-row: left `size-5 text-[#808080]` lucide glyph (NO colored chip), NO unread dot, NO X, drag does nothing (no swipe), "Today/Yesterday/Earlier" labels, **every notification its own row** (no `+N` stacking).

**Step 4: Behavior checks**
- Click a row → it de-bolds (marked read) + navigates (if `link`) + panel closes.
- Header "Mark all read" clears all unread.
- Empty state: `CheckCircle2 size-8 text-[#0000001f]` + "You're all caught up".
- Resize to mobile width → bottom sheet: drag-dismiss works, backdrop dims, scroll locked, pure rows (no swipe).
- Open Inbox → trigger a live notification → toast suppressed while open; close Inbox → toast shows.
- Smoke: `PageHeaderUser` (dark header) and `MobileNav` — bell still mounts and opens (props unchanged → expected pass).

**Step 5: Run `/interface-craft critique`** on the Inbox screenshot vs the account-menu screenshot. Apply `make-interfaces-feel-better` + `emil-design-eng` checks (exact transition props, `ease-out`, concentric radius, shadows-over-borders, subtle exit `opacity:0`). Address any structural/behavioral finding; log visual nits.

**Step 6: Final commit (only if QA produced fixes)**

If Step 5 required code changes, sync the touched files MAIN → worktree and commit from the worktree:
```bash
MAIN=/Volumes/CODEUSER/seeko-studio
WT=/Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
# cp each fixed file, then:
cd "$WT" && git add <fixed paths> && git commit -m "polish(inbox): /interface-craft AFTER-pass fixes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
If no fixes needed, state that QA passed clean — no commit.

---

## Verification Checklist (before declaring done)

- [ ] `npx vitest run src/components/dashboard/notifications/__tests__/utils.test.ts` — 2 pass; saw it RED before Task 2.
- [ ] `npm test` (from MAIN) — all suites green, output pristine.
- [ ] `npx tsc --noEmit` — no new errors in the notifications subsystem; only the pre-existing benign TS2582/TS2304 baseline in unrelated `*.test.ts(x)`.
- [ ] `grep -rn "NotificationCard\|NotificationStack" src` — zero hits.
- [ ] Inbox visually + behaviorally indistinguishable from the account menu (Step 3/4 all verified via screenshots).
- [ ] No-regress: `NotificationBell` wrapper still a plain non-positioned `<div>` with its comment; desktop panel still `absolute right-0 top-full mt-[9px] w-[400px]` + exact shadow; mobile sheet still portaled with drag-dismiss + scroll lock; `NotificationBell` public props unchanged (3 consumers untouched).
- [ ] `/interface-craft critique` AFTER pass run; findings addressed.
- [ ] Each task committed from the worktree on `feat/dashboard-paper-redesign`; MAIN and worktree copies identical for every touched file.

## Out of Scope (do NOT touch)

`types.ts`, `constants.ts`, `DialContext.tsx`, `BellToggle.tsx`, `LiveToast*`, all 3 `NotificationBell` consumers, `BellToggle.test.tsx`, the pre-existing Overview dual-header artifact, moving static spring/stagger values out of `DialContext`.
