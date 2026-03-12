# Notification Swipe Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the basic right-only drag-to-dismiss on notification cards with a bidirectional swipe-actions system — swipe right to dismiss (red), swipe left to mark read (green) — with spring physics, partial reveal, and full-swipe snap.

**Architecture:** Manual pointer event tracking on `document` replaces Motion's `drag="x"`. `useSpring`/`useMotionValue` drive card position. All swipe logic lives in NotificationCard.tsx. A new `onMarkRead` callback threads through NotificationStack → panels → NotificationBell. DialContext gets new swipe tuning values.

**Tech Stack:** motion/react (`useSpring`, `useMotionValue`, `useTransform`, `animate`, `clamp`), React pointer events, existing DialContext tuning system.

---

## Task 1: Add swipe tuning values to DialContext

**Files:**
- Modify: `src/components/dashboard/notifications/DialContext.tsx:7-36`

**Step 1: Add swipe config to DIALS**

In `DialContext.tsx`, add a `swipe` section to `DIALS` and extend the `card` section:

```tsx
export const DIALS = {
  bell: {
    hoverScale: 1.1,
    tapScale: 0.77,
    spring: { type: 'spring' as const, stiffness: 500, damping: 30 },
  },
  panel: {
    spring: { type: 'spring' as const, visualDuration: 0.45, bounce: 0.45 },
    initialScale: 0.91,
    initialY: -9,
    rowStagger: 0.05,
  },
  card: {
    spring: { type: 'spring' as const, visualDuration: 0.5, bounce: 0.4 },
    entranceY: 20,
    exitX: 80,
    exitScale: 0.88,
    swipeThreshold: 130, // kept for backwards compat but superseded by swipe config
  },
  swipe: {
    spring: { stiffness: 900, damping: 80 },
    /** Fraction of card width — release above this snaps to 50% revealing actions */
    partialThreshold: 0.25,
    /** Fraction of card width — swipe past this locks to edge, commits on release */
    fullThreshold: 0.8,
    /** Fraction of card width to snap to when partially revealed */
    partialSnap: 0.5,
    /** Colors for dismiss (right swipe) */
    dismissBg: 'rgba(239,68,68,0.12)',
    dismissBgFull: 'rgba(239,68,68,0.3)',
    /** Colors for mark-read (left swipe) */
    readBg: 'rgba(110,231,183,0.12)',
    readBgFull: 'rgba(110,231,183,0.3)',
    /** Squish animation on full-swipe commit */
    commitScaleY: 1.05,
    commitScaleX: 0.95,
    commitY: -24,
    /** Delay before reset after commit animation */
    commitResetDelay: 0.3,
  },
  stack: {
    spring: { type: 'spring' as const, stiffness: 600, damping: 50 },
    cardGap: 6,
    scaleStep: 0.05,
    opacityStep: 0.35,
    expandStagger: 0.04,
    collapseStagger: 0.03,
    collapsedPeek: 10,
    badgeMorphDuration: 0.15,
  },
};
```

**Step 2: Commit**

```bash
git add src/components/dashboard/notifications/DialContext.tsx
git commit -m "feat(notifications): add swipe tuning values to DialContext"
```

---

## Task 2: Rewrite NotificationCard swipe mechanics

**Files:**
- Modify: `src/components/dashboard/notifications/NotificationCard.tsx` (full rewrite of swipe logic)

This is the core task. Replace the existing `drag="x"` with manual pointer tracking, action reveal, and full-swipe snap.

**Step 1: Rewrite NotificationCard.tsx**

Replace the entire file with this implementation:

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  clamp,
} from 'motion/react';
import { X, CheckCheck, MailOpen } from 'lucide-react';
import { DisplayNotification } from './types';
import { KIND_CONFIG } from './constants';
import { formatTime } from './utils';
import { useDials } from './DialContext';

interface NotificationCardProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
  onMarkRead?: (ids: string[]) => void;
  noPadding?: boolean;
  hideClose?: boolean;
}

export function NotificationCard({
  notification,
  group,
  index,
  stagger,
  onTap,
  onDismiss,
  onMarkRead,
  noPadding,
  hideClose,
}: NotificationCardProps) {
  const [hovered, setHovered] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const d = useDials();
  const cfg = KIND_CONFIG[notification.kind] ?? KIND_CONFIG.comment_reply;
  const Icon = cfg.icon;

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const itemWidth = useRef(0);
  const swipeStartX = useRef(0);
  const swipeStartOffset = useRef(0);
  const fullSwipeSnapPosition = useRef<'left' | 'right' | null>(null);

  // Core motion values
  const swipeAmount = useMotionValue(0);
  const swipeAmountSpring = useSpring(swipeAmount, d.swipe.spring);
  const swipeProgress = useTransform(swipeAmount, (value) => {
    const w = itemWidth.current;
    if (!w) return 0;
    return value / w;
  });

  // Card content visual feedback
  const cardOpacity = useTransform(
    swipeProgress,
    [-0.5, 0, 0.5],
    [0.3, 1, 0.3]
  );
  const cardContentX = useTransform(
    swipeProgress,
    [-0.5, 0, 0.5],
    [40, 0, -40]
  );
  const cardOpacitySpring = useSpring(cardOpacity, d.swipe.spring);
  const cardContentXSpring = useSpring(cardContentX, d.swipe.spring);

  // Action icon elastic motion (dismiss — right side, revealed on right swipe)
  const dismissIconOpacity = useTransform(
    swipeProgress,
    [0, 0.15, 0.5, 0.8, 1],
    [0, 1, 1, 1, 1]
  );
  const dismissIconX = useTransform(
    swipeProgress,
    [0, 0.5, 0.8, 1],
    [0, 0, -16, 0]
  );
  const dismissIconScale = useTransform(
    swipeProgress,
    [0, 0.5, 0.8, 1],
    [1, 1, 0.8, 1]
  );
  const dismissIconOpacitySpr = useSpring(dismissIconOpacity, d.swipe.spring);
  const dismissIconXSpr = useSpring(dismissIconX, d.swipe.spring);
  const dismissIconScaleSpr = useSpring(dismissIconScale, d.swipe.spring);

  // Action icon elastic motion (mark-read — left side, revealed on left swipe)
  const readIconOpacity = useTransform(
    swipeProgress,
    [-1, -0.8, -0.5, -0.15, 0],
    [1, 1, 1, 1, 0]
  );
  const readIconX = useTransform(
    swipeProgress,
    [-1, -0.8, -0.5, 0],
    [0, 16, 0, 0]
  );
  const readIconScale = useTransform(
    swipeProgress,
    [-1, -0.8, -0.5, 0],
    [1, 0.8, 1, 1]
  );
  const readIconOpacitySpr = useSpring(readIconOpacity, d.swipe.spring);
  const readIconXSpr = useSpring(readIconX, d.swipe.spring);
  const readIconScaleSpr = useSpring(readIconScale, d.swipe.spring);

  // Background color based on swipe direction
  const bgColor = useTransform(swipeProgress, (p) => {
    if (p > 0) {
      // Swiping right — dismiss (red)
      const t = Math.min(p / d.swipe.fullThreshold, 1);
      return t < 0.5 ? d.swipe.dismissBg : d.swipe.dismissBgFull;
    } else if (p < 0) {
      // Swiping left — mark read (green)
      const t = Math.min(Math.abs(p) / d.swipe.fullThreshold, 1);
      return t < 0.5 ? d.swipe.readBg : d.swipe.readBgFull;
    }
    return 'transparent';
  });

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to primary button / touch
      if (e.button !== 0) return;
      setIsSwiping(true);
      swipeStartX.current = e.clientX;
      swipeStartOffset.current = swipeAmount.get();
    },
    [swipeAmount]
  );

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isSwiping) return;
      const w = itemWidth.current;
      if (!w) return;

      const delta = e.clientX - swipeStartX.current + swipeStartOffset.current;
      const fullThresholdPx = w * d.swipe.fullThreshold;
      const isBeyondFull = Math.abs(delta) > fullThresholdPx;
      const isLeft = delta < 0;

      if (fullSwipeSnapPosition.current) {
        // Already snapped — check if pulling back
        if (Math.abs(delta) < fullThresholdPx) {
          fullSwipeSnapPosition.current = null;
          swipeAmount.set(delta);
        } else {
          const snap = fullSwipeSnapPosition.current === 'left' ? -w : w;
          swipeAmount.set(snap);
        }
        return;
      }

      if (isBeyondFull) {
        fullSwipeSnapPosition.current = isLeft ? 'left' : 'right';
        swipeAmount.set(isLeft ? -w : w);
      } else {
        swipeAmount.set(clamp(-w, w, delta));
      }
    };

    const handlePointerUp = () => {
      if (!isSwiping) return;
      const w = itemWidth.current;
      if (!w) return;

      const current = swipeAmount.get();
      const isFullySwiped = fullSwipeSnapPosition.current;

      if (isFullySwiped) {
        // Commit action — squish animation then execute
        if (containerRef.current) {
          animate([
            [
              containerRef.current,
              {
                scaleY: d.swipe.commitScaleY,
                scaleX: d.swipe.commitScaleX,
                y: d.swipe.commitY,
              },
              { duration: 0.1, ease: 'easeOut' },
            ],
            [
              containerRef.current,
              { scaleY: 1, scaleX: 1, y: 0 },
              { duration: 0.6, type: 'spring' },
            ],
          ]);
        }

        // Execute action after brief delay
        const direction = fullSwipeSnapPosition.current;
        setTimeout(() => {
          if (direction === 'right') {
            onDismiss(notification.ids);
          } else if (direction === 'left' && onMarkRead) {
            onMarkRead(notification.ids);
          }
        }, 150);

        // Reset position
        animate(swipeAmount, 0, { duration: 0.5, delay: d.swipe.commitResetDelay });
      } else {
        // Partial swipe — snap to partial reveal or back to center
        let target = 0;
        const partialThresholdPx = w * d.swipe.partialThreshold;

        if (Math.abs(current) > partialThresholdPx) {
          target = current > 0
            ? w * d.swipe.partialSnap
            : -w * d.swipe.partialSnap;
        }

        swipeAmount.set(target);
      }

      setIsSwiping(false);
      fullSwipeSnapPosition.current = null;
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isSwiping, swipeAmount, d.swipe, notification.ids, onDismiss, onMarkRead]);

  // Measure width on mount and resize
  useEffect(() => {
    const measure = () => {
      const w = itemRef.current?.getBoundingClientRect().width;
      if (!w) return;
      itemWidth.current = w;

      const currentProgress = swipeProgress.get();
      const newOffset = currentProgress * w;
      swipeAmount.jump(newOffset);
      swipeAmountSpring.jump(newOffset);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [swipeAmount, swipeAmountSpring, swipeProgress]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: d.card.entranceY }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: d.card.exitX, scale: d.card.exitScale }}
      transition={{ ...d.card.spring, delay: index * stagger }}
      className={noPadding ? '' : 'px-1 py-[3px]'}
    >
      <motion.div
        ref={containerRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 12,
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
      >
        {/* Swipeable card surface */}
        <motion.div
          ref={itemRef}
          style={{
            position: 'relative',
            zIndex: 10,
            x: swipeAmountSpring,
          }}
        >
          <motion.div style={{ opacity: cardOpacitySpring }}>
            <button
              onClick={() => {
                // Only fire tap if not mid-swipe and card is near center
                if (Math.abs(swipeAmount.get()) < 5) {
                  onTap(notification);
                } else {
                  // Tapped while partially revealed — snap back
                  swipeAmount.set(0);
                }
              }}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              className={[
                'relative flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors',
                notification.read
                  ? 'bg-[#212121] hover:bg-[#272727] border border-white/[0.06]'
                  : 'bg-[#2c2c2c] hover:bg-[#333] active:bg-[#383838] border border-white/[0.10]',
              ].join(' ')}
            >
              <div
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${
                  notification.read
                    ? 'bg-white/[0.04] text-muted-foreground/50'
                    : `${cfg.bg} ${cfg.className}`
                }`}
              >
                <Icon className="size-3.5" />
              </div>

              <motion.div
                className="flex-1 min-w-0 pr-5"
                style={{ x: cardContentXSpring }}
              >
                <p
                  className={`text-[13px] leading-snug ${
                    !notification.read
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {notification.title}
                </p>
                {notification.body && (
                  <p
                    className={`text-xs mt-0.5 line-clamp-2 ${
                      notification.read
                        ? 'text-muted-foreground/40'
                        : 'text-muted-foreground/70'
                    }`}
                  >
                    {notification.body}
                  </p>
                )}
                <p
                  className={`text-[11px] mt-1 ${
                    notification.read
                      ? 'text-muted-foreground/30'
                      : 'text-muted-foreground/50'
                  }`}
                >
                  {formatTime(notification.created_at, group)}
                </p>
              </motion.div>

              {!hideClose && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{
                    opacity: hovered ? 1 : 0,
                    scale: hovered ? 1 : 0.8,
                  }}
                  transition={d.bell.spring}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(notification.ids);
                  }}
                  className={[
                    'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full',
                    'bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground transition-colors',
                    hovered ? 'cursor-pointer' : 'pointer-events-none',
                  ].join(' ')}
                  role="button"
                  aria-label="Dismiss notification"
                >
                  <X className="size-3" />
                </motion.span>
              )}
            </button>
          </motion.div>
        </motion.div>

        {/* Action backgrounds — positioned behind the card */}

        {/* Right side: dismiss (revealed when swiping right) */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 20,
            backgroundColor: bgColor,
            zIndex: 1,
            borderRadius: 12,
          }}
        >
          <motion.div
            style={{
              opacity: dismissIconOpacitySpr,
              x: dismissIconXSpr,
              scale: dismissIconScaleSpr,
              transformOrigin: 'left',
            }}
            className="flex flex-col items-center gap-1 text-red-400"
          >
            <X className="size-5" />
            <span className="text-[10px] font-medium">Dismiss</span>
          </motion.div>
        </motion.div>

        {/* Left side: mark read (revealed when swiping left) */}
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 20,
            backgroundColor: bgColor,
            zIndex: 1,
            borderRadius: 12,
          }}
        >
          <motion.div
            style={{
              opacity: readIconOpacitySpr,
              x: readIconXSpr,
              scale: readIconScaleSpr,
              transformOrigin: 'right',
            }}
            className="flex flex-col items-center gap-1 text-seeko-accent"
          >
            {notification.read ? (
              <>
                <MailOpen className="size-5" />
                <span className="text-[10px] font-medium">Unread</span>
              </>
            ) : (
              <>
                <CheckCheck className="size-5" />
                <span className="text-[10px] font-medium">Read</span>
              </>
            )}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit 2>&1 | grep NotificationCard`
Expected: No errors related to NotificationCard (there may be a pre-existing test error)

**Step 3: Commit**

```bash
git add src/components/dashboard/notifications/NotificationCard.tsx
git commit -m "feat(notifications): bidirectional swipe actions with spring physics"
```

---

## Task 3: Thread onMarkRead through NotificationStack

**Files:**
- Modify: `src/components/dashboard/notifications/NotificationStack.tsx:14-21,58-67,114-122`

**Step 1: Add onMarkRead to NotificationStackProps and pass it through**

Add `onMarkRead?: (ids: string[]) => void` to the interface and pass it to every `<NotificationCard>`:

In the interface (around line 14):
```tsx
interface NotificationStackProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
  onMarkRead?: (ids: string[]) => void;
}
```

In the destructured props (line 23):
```tsx
export function NotificationStack({
  notification,
  group,
  index,
  stagger,
  onTap,
  onDismiss,
  onMarkRead,
}: NotificationStackProps) {
```

In the single-card render (line 59, add `onMarkRead`):
```tsx
      <NotificationCard
        notification={notification}
        group={group}
        index={index}
        stagger={stagger}
        onTap={onTap}
        onDismiss={onDismiss}
        onMarkRead={onMarkRead}
      />
```

In the stack cards render (line 115, add `onMarkRead`):
```tsx
              <NotificationCard
                notification={card}
                group={group}
                index={isFront ? index : 0}
                stagger={isFront ? stagger : 0}
                onTap={isFront && !expanded ? () => setExpanded(true) : onTap}
                onDismiss={onDismiss}
                onMarkRead={onMarkRead}
                hideClose={isFront}
              />
```

**Step 2: Commit**

```bash
git add src/components/dashboard/notifications/NotificationStack.tsx
git commit -m "feat(notifications): thread onMarkRead through NotificationStack"
```

---

## Task 4: Thread onMarkRead through panels

**Files:**
- Modify: `src/components/dashboard/notifications/DesktopNotificationPanel.tsx:10-18,22,71-79`
- Modify: `src/components/dashboard/notifications/MobileNotificationSheet.tsx:11-20,24,118-126`

**Step 1: Add onMarkRead to DesktopNotificationPanel**

In the interface (line 10), add:
```tsx
  onMarkRead?: (ids: string[]) => void;
```

In the destructured props (line 22), add `onMarkRead`:
```tsx
    { open, grouped, isEmpty, unreadCount, onMarkAllRead, onTap, onDismiss, onMarkRead },
```

In the `<NotificationStack>` render (line 71), add:
```tsx
                          <NotificationStack
                            key={notif.id}
                            notification={notif}
                            group={group.label}
                            index={idx}
                            stagger={d.panel.rowStagger}
                            onTap={onTap}
                            onDismiss={onDismiss}
                            onMarkRead={onMarkRead}
                          />
```

**Step 2: Add onMarkRead to MobileNotificationSheet**

In the interface (line 11), add:
```tsx
  onMarkRead?: (ids: string[]) => void;
```

In the destructured props (line 24), add `onMarkRead`:
```tsx
    { open, grouped, isEmpty, unreadCount, onClose, onMarkAllRead, onTap, onDismiss, onMarkRead },
```

In the `<NotificationStack>` render (line 118), add:
```tsx
                            <NotificationStack
                              key={notif.id}
                              notification={notif}
                              group={group.label}
                              index={idx}
                              stagger={MOBILE_ROW_STAGGER}
                              onTap={onTap}
                              onDismiss={onDismiss}
                              onMarkRead={onMarkRead}
                            />
```

**Step 3: Commit**

```bash
git add src/components/dashboard/notifications/DesktopNotificationPanel.tsx src/components/dashboard/notifications/MobileNotificationSheet.tsx
git commit -m "feat(notifications): thread onMarkRead through desktop and mobile panels"
```

---

## Task 5: Wire onMarkRead in NotificationBell

**Files:**
- Modify: `src/components/dashboard/notifications/../../NotificationBell.tsx:129-133,170-179,183-195`

**Step 1: Create a markRead callback that handles both read and unread**

The existing `markOneRead` (line 129) only marks as read. We need a toggle-aware version for the swipe action. Add after `dismissNotification` (around line 143):

```tsx
  // Swipe mark-read: toggle read state for given IDs
  const swipeMarkRead = useCallback(async (ids: string[]) => {
    // Check if all are already read — if so, mark unread
    const allRead = ids.every(id => notifications.find(n => n.id === id)?.read);

    if (allRead) {
      // Mark unread
      setNotifications(prev =>
        prev.map(n => ids.includes(n.id) ? { ...n, read: false } : n)
      );
      setUnreadCount(c => c + ids.length);
      for (const id of ids) {
        await supabase.from('notifications').update({ read: false }).eq('id', id);
      }
    } else {
      // Mark read
      const unreadIds = ids.filter(id => !notifications.find(n => n.id === id)?.read);
      setNotifications(prev =>
        prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n)
      );
      setUnreadCount(c => Math.max(0, c - unreadIds.length));
      for (const id of unreadIds) {
        await supabase.from('notifications').update({ read: true }).eq('id', id);
      }
    }
  }, [supabase, notifications]);
```

**Step 2: Pass swipeMarkRead to both panels**

In `DesktopNotificationPanel` (around line 170):
```tsx
        <DesktopNotificationPanel
          ref={panelRef}
          open={open}
          grouped={grouped}
          isEmpty={notifications.length === 0}
          unreadCount={unreadCount}
          onMarkAllRead={markAllRead}
          onTap={handleNotificationTap}
          onDismiss={dismissNotification}
          onMarkRead={swipeMarkRead}
        />
```

In `MobileNotificationSheet` (around line 184):
```tsx
        <MobileNotificationSheet
          ref={panelRef}
          open={open}
          grouped={grouped}
          isEmpty={notifications.length === 0}
          unreadCount={unreadCount}
          onClose={() => setOpen(false)}
          onMarkAllRead={markAllRead}
          onTap={handleNotificationTap}
          onDismiss={dismissNotification}
          onMarkRead={swipeMarkRead}
        />,
```

**Step 3: Verify it builds**

Run: `npx tsc --noEmit 2>&1 | grep -i notification`
Expected: No errors related to notification files

**Step 4: Commit**

```bash
git add src/components/dashboard/NotificationBell.tsx
git commit -m "feat(notifications): wire swipeMarkRead toggle to both panels"
```

---

## Task 6: Manual testing & push

**Step 1: Test on desktop**

1. Open notification panel
2. Swipe a notification right — should reveal red dismiss action, release past 80% should commit dismiss with squish animation
3. Swipe a notification left — should reveal green mark-read action, release past 80% should toggle read state
4. Partial swipe (25-80%) — should snap to 50% revealing the action button, tapping card snaps back
5. Small swipe (<25%) — should snap back to center

**Step 2: Test on mobile (Chrome DevTools)**

1. Open notification sheet
2. Same swipe gestures as desktop
3. Verify swipe doesn't conflict with sheet's vertical drag-to-dismiss
4. Verify content scrolling still works in the notification list

**Step 3: Push**

```bash
git push
```
