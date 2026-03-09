# Deadline Clarity — Relative Labels + Color Tiers

**Date:** 2026-03-08
**Status:** Approved

## Problem

Task deadlines currently show a static date ("Mar 15") or a flat "Overdue" label. Team members can't gauge urgency at a glance — a task due tomorrow looks identical to one due in 3 weeks. The onboarding agreement promises deadlines are tracked via the platform, but the UI doesn't communicate proximity or urgency.

## Design

### Shared utility: `formatDeadline(dateStr: string)`

Returns `{ label: string, className: string, icon?: LucideIcon }`.

| Condition | Label | Color class | Icon |
|-----------|-------|-------------|------|
| Past deadline | "yesterday", "2 days ago", "1 week ago" | `text-red-400` | AlertTriangle |
| Due today | "Today" | `text-orange-400` | — |
| Due tomorrow | "Tomorrow" | `text-amber-400` | — |
| Due in 2–6 days | "in 3 days" | `text-amber-400` | — |
| Due in 7+ days | "Mar 28" (absolute) | `text-muted-foreground` | — |

Edge cases:
- No deadline → show nothing (same as today)
- Overdue uses natural language ("yesterday", "2 days ago", "1 week ago", "2 weeks ago")
- "Tomorrow" is amber even though it's within "due this week" — more specific label wins

### UpcomingTasks (dashboard cards)

Replace current `isOverdue ? 'Overdue' : formatDeadlineDisplay(task.deadline)` with the new formatter output. Same position (right side of row), smarter text + color.

### TaskDetail panel

Current: "Mar 15, 2026" with Clock icon in muted color.
New:
- Use `formatDeadline` for the label
- Apply color tiers
- Clock icon for normal/upcoming, AlertTriangle for overdue
- Tooltip with full absolute date ("Saturday, March 15, 2026")

## Files

1. **New:** `src/lib/format-deadline.ts` — shared utility
2. **Edit:** `src/components/dashboard/UpcomingTasks.tsx` — use new formatter
3. **Edit:** `src/components/dashboard/TaskDetail.tsx` — use new formatter + color tiers
