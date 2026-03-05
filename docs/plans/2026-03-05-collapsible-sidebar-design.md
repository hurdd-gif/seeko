# Collapsible Sidebar — Design

**Date:** 2026-03-05
**Status:** Approved

## Behavior

- **Expanded:** 240px (current state)
- **Collapsed:** 56px icon-only rail
- **Toggle:** Chevron button (`ChevronLeft`/`ChevronRight`) at the right edge of the sidebar, visible on sidebar hover, centered vertically
- **Persistence:** `localStorage` key `seeko:sidebar-collapsed`, read on mount

## Collapsed State

| Element        | Expanded              | Collapsed                        |
|----------------|-----------------------|----------------------------------|
| Logo area      | Mark + "SEEKO" text   | Mark only                        |
| Nav items      | Icon + label          | Icon only, centered              |
| Notifications  | Bell + "Notifications" + badge | Icon + badge only      |
| User footer    | Avatar + name/email + sign-out | Avatar only              |

## Tooltips (collapsed only)

- Hover any nav icon → tooltip appears after **4000ms delay**
- Tooltip renders to the right of the icon as a small dark pill with the label
- Delay cancelled immediately if cursor leaves before 4s

## Animation

- `motion.aside` width spring: `stiffness: 300, damping: 30`
- Labels: `opacity 0` before width finishes collapsing; fade in after width finishes expanding
- Chevron rotates 180° on toggle (spring transition)

## Scope

- Desktop sidebar only — mobile header/bottom nav unchanged
- Single file change: `src/components/layout/Sidebar.tsx`
