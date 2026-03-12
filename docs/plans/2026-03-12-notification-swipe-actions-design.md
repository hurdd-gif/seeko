# Notification Swipe Actions — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Replace the basic right-only drag-to-dismiss on notification cards with a bidirectional swipe-actions system inspired by the Motion swipe-actions reference pattern.

**Architecture:** Manual pointer event tracking (pointermove/pointerup on document) replaces Motion's built-in `drag="x"`. Spring-based offset via `useSpring` drives the card's x position. All logic stays in NotificationCard.tsx with new DialContext tuning values.

**Tech Stack:** motion/react (useSpring, useMotionValue, useTransform, animate), React pointer events, existing DialContext tuning system.

---

## Gesture Model

- **Swipe right → Dismiss** (red, destructive)
- **Swipe left → Mark read/unread** (seeko accent green, positive)

## Swipe Mechanics

- **Pointer tracking**: `pointermove`/`pointerup` on `document` (not element-bound drag) so gestures continue even when pointer leaves the card bounds
- **Spring-based offset**: `useSpring` drives the card's `x` position for smooth physics
- **Partial reveal at 25%**: Release between 25–80% snaps to 50% width, keeping the action button visible. Below 25% snaps back to center.
- **Full-swipe snap at 80%**: Past 80% in either direction, card locks to the edge. Releasing commits the action (dismiss or mark-read).
- **Full-swipe feedback**: On commit, the card does a squish animation (`scaleY: 1.05, scaleX: 0.95, y: -24`) then springs back, followed by the existing exit animation for dismiss or a subtle flash for mark-read.

## Action Reveal

- **Right side (dismiss)**: Red background (`rgba(239,68,68,0.12)` → full `rgba(239,68,68,0.3)` at snap). X icon centered in the revealed area.
- **Left side (mark read)**: Seeko accent green background (`rgba(110,231,183,0.12)` → `rgba(110,231,183,0.3)` at snap). CheckCheck or MailOpen icon.
- **Elastic content motion**: Action icons get spring-driven `contentX`/`contentScale`/`contentOpacity` — scale down at full swipe, shift slightly for bounce feel.
- **Card content fades**: Card opacity drops to 0.3 as swipe approaches threshold in either direction. Card content also shifts slightly opposite to swipe direction.

## Architecture

- **Replace `drag="x"`** in NotificationCard with manual pointer event tracking
- **Single component change**: All logic stays in `NotificationCard.tsx` — `onDismiss` and new `onMarkRead` callback handle parent communication
- **DialContext additions**: Add tuning values for swipe thresholds, snap percentages, and action colors
- **Mobile-first**: `touch-action: none` on the swipe container, works identically on desktop with pointer events

## What stays the same

- NotificationStack grouping/expand/collapse — untouched
- Hover close button (X) on desktop — stays as-is
- Exit animation on dismiss — same `exitX`/`exitScale` from DialContext
- MobileNotificationSheet and DesktopNotificationsPanel — no changes needed, just pass through the new `onMarkRead` callback

## Reference

The swipe mechanics are adapted from the Motion swipe-actions example pattern:
- Manual pointer tracking on document for uninterrupted gesture
- `useSpring` for smooth physics-based card movement
- Snap thresholds at 25% (partial reveal), 80% (full commit)
- Elastic action icon animation (scale, opacity, x offset) driven by swipe progress
- Squish animation on full-swipe commit before action executes
