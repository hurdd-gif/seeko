# Live Toast Notifications — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Show real-time toast notifications at the bottom of the screen when events happen while the user is active, stacking up to 3 with overflow, independent from the existing Sonner action toasts.

## Architecture

**Approach:** Standalone context provider (Approach A). A new `LiveToastProvider` manages toast stack state and timers. NotificationBell's existing Supabase subscription calls `addLiveToast()` via context when an INSERT event arrives. Two independent UIs (bell panel + live toasts) consuming one data source.

**New components:**

| Component | Purpose |
|-----------|---------|
| `LiveToastProvider` | React context — manages toast stack, timers, overflow count |
| `LiveToastContainer` | Portal renderer at bottom-center of viewport |
| `LiveToastCard` | Individual toast with entrance/exit/swipe animations |

**Data flow:**

```
Supabase INSERT event
  → NotificationBell (existing handler)
    → addLiveToast(notification) via context
      → LiveToastProvider adds to stack
        → LiveToastContainer renders via portal
          → LiveToastCard animates in
```

**Provider placement:** Wraps the dashboard layout at the same level as NotificationBell, so the context is available where the subscription lives.

## Toast Stack Behavior

- **Max 3 visible** toasts at once, newest at bottom (closest to thumb)
- 4th+ arrivals push oldest visible toast into overflow count
- **Overflow pill** ("+N more") sits above the stack — tapping opens notification panel
- When a visible toast dismisses, next overflow toast promotes into visible stack

### Timer Logic

- **10 second** auto-dismiss by default
- **Pauses** on hover (desktop) or touch-hold (mobile)
- **Resumes** on mouse leave / touch end
- Stack full + new arrival → oldest toast's timer **accelerates to 2 seconds**
- Dismissed toasts are only removed from toast stack — they still live in the notification panel

### Deduplication & Suppression

- **Panel open** → suppress toasts (user is already reading notifications)
- **Duplicate ID** → skip
- **Already read** → show with muted styling

## Interaction

### Tap

- **Navigate to link** + **mark read** (same as notification panel tap behavior)
- No link → just mark read and dismiss

### Swipe-to-Dismiss

- Swipe **down** to dismiss (natural for bottom-positioned toasts)
- Threshold: 60px displacement OR velocity > 300px/s
- Partial swipe snaps back with spring
- Opacity fades as toast moves down

### X Button

- Always visible on mobile (no hover state)
- Appears on hover on desktop
- Dismisses single toast

## Visual Design

### Toast Card

- Dark card: `bg-[#1a1a1a]`, border `border-white/[0.08]`, `rounded-xl`
- **Left:** Kind icon (same KIND_CONFIG colors as notification panel)
- **Center:** Title (13px, medium) + body preview (12px, muted, 1-line clamp) + timestamp
- **Right:** X dismiss button
- Unread dot indicator on left edge

### Layout

- **Position:** Bottom-center
- Respects `env(safe-area-inset-bottom)` + 16px extra offset
- Stack grows **upward** — newest at bottom of stack
- **8px gap** between stacked toasts
- **Max width:** 400px desktop, `calc(100vw - 32px)` mobile
- Overflow pill above top toast

## Animations

All spring-based, using motion/react.

| Moment | Animation |
|--------|-----------|
| Entrance | Slide up from below + fade in + scale 0.95→1 (spring: stiffness 300, damping 25) |
| Exit (timer/X) | Fade out + scale 1→0.95 + slide down slightly (200ms) |
| Exit (swipe) | Follow finger, velocity-based throw, fade out |
| Stack reflow | `layout` animation — remaining toasts shift position (spring) |
| Overflow pill | AnimatePresence fade + scale entrance |

## Edge Cases

- **Page navigation** — toasts persist across dashboard route changes (provider at layout level)
- **Rapid burst** — 5+ notifications in 1 second: show first 3, overflow rest, no visual jank
- **No link** — tap marks read and dismisses
- **Already read** — show toast with muted styling
- **Mobile sheet open** — suppress toasts

## Mobile Considerations

- X button always visible (no hover on mobile)
- Swipe down uses `touch-action: none` on toast only — doesn't interfere with page scroll
- Toast width: full width minus 32px padding
- Bottom offset respects safe-area-inset-bottom

## Accessibility

- `role="status"` and `aria-live="polite"` on toast container
- `aria-label="Dismiss notification"` on X button
- Reduced motion: skip entrance/exit animations, just show/hide

## What This Does NOT Change

- Sonner stays at top-center for action feedback (saved, error, etc.)
- NotificationBell panel/sheet behavior unchanged
- Supabase subscription unchanged (just add one callback line)
- Notification data model unchanged
