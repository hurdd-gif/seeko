# Dashboard Polish & Workflow Upgrade — Design

**Date:** 2026-03-06
**Status:** Approved
**Scope:** Global polish, page transitions, command palette, notification management, docs workflow
**Out of scope:** Task page, task modals, task filtering, task status changes (being redesigned separately)

---

## 1. Global Polish & Feel

### Page Transition System (Hybrid)

- **Route exit:** 150ms fade-out + subtle scale-down (0.98) on the content area
- **Route enter:** each page plays its own storyboard entrance
- Sidebar `layoutId` highlight animates simultaneously during transition
- Implementation: wrap `(dashboard)/layout.tsx` content area with `AnimatePresence` + per-page motion wrappers

### Loading Skeletons

- Pulse-shimmer skeletons matching the exact layout of each page's first paint
- Overview: 4 stat card skeletons, area cards, activity list
- Team: avatar + name rows
- Docs: tree skeleton
- Activity: timeline skeleton
- Shimmer uses `--color-seeko-accent` at 8% opacity for brand consistency

### Toast System (Top-center banner)

- Drops from top, blurs in (backdrop-filter), auto-dismisses in 4s
- Variants: success (accent green), error (red), info (blue)
- Optional undo action per toast
- Spring entrance: y: -40 to 0, smooth spring. Fade exit
- Stack max 2 — older toast exits as new one enters
- Surfaces: settings saved, doc created/updated, notification cleared, invite sent

### Micro-interactions

- **Sidebar breathe:** content area subtly scales (1.0 to 0.995 to 1.0) during collapse/expand resize
- **Stat card count-up:** number spring-interpolates from 0 to value on entrance
- **Progress bars:** animate from 0 to value on entrance (600ms, smooth spring)
- **Avatar hover:** ring glow pulses once then holds

---

## 2. Command Palette (Cmd+K)

### Structure

- Global keybinding `Cmd+K` opens centered modal overlay with search input
- Cinematic entrance: scale 0.95 to 1.0 + backdrop blur, spring physics

### Sections

| Section  | Source                    | Items                                      |
|----------|---------------------------|--------------------------------------------|
| Pages    | Static list               | Overview, Team, Docs, Activity, Settings   |
| Team     | Supabase cache (profiles) | Jump to team member profile                |
| Docs     | Supabase cache (docs)     | Search docs by title                       |
| Actions  | Static list               | Sign out, toggle sidebar                   |

### Behavior

- Fuzzy search across all sections
- Keyboard navigable: up/down to select, Enter to go, Esc to close
- Recent items shown by default (last 3 visited pages + last 3 opened docs)
- Each result row: icon + label + section badge + keyboard hint
- Data source: client-side from existing Supabase cache, no new API calls

---

## 3. Notification Management

### Real-time Updates

- Subscribe to Supabase realtime channel for user's notifications on mount
- New notifications animate into panel (slide-in from right, stagger if multiple)
- Bell icon badge pulses once on new notification

### Dismissal & Management

- Swipe-to-dismiss on mobile, hover X button on desktop
- "Mark all as read" button at panel top
- Read vs unread: unread has left accent border + bolder text
- Panel entrance: slide from right edge + backdrop blur

---

## 4. Docs Workflow

### Faster Navigation

- Collapsible tree sidebar within docs page (uses existing `parent_id` hierarchy)
- Keyboard shortcut `Cmd+Shift+N` for quick doc create (also in command palette)
- Breadcrumb trail at top showing doc hierarchy path

### Quick Create

- Inline "New doc" button at each tree level
- Click opens inline title input, Enter to create
- Inherits `parent_id` from current tree position

---

## Animation Principles (per interface-craft)

- **Spring-first:** all motion uses spring physics, no duration-based easing
- **Stage-driven:** single integer state drives entrance sequences
- **Readable storyboards:** timing constants at top of each page file
- **Reduced motion:** all animations respect `prefers-reduced-motion`

## Spring Configs (existing, reuse)

| Name   | Stiffness | Damping | Use case           |
|--------|-----------|---------|---------------------|
| snappy | 500       | 30      | Quick interactions  |
| smooth | 300       | 25      | Standard motion     |
| gentle | 200       | 20      | Slow entrances      |
