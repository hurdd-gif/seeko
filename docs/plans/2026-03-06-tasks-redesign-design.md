# Tasks Redesign — Design

**Date:** 2026-03-06
**Scope:** Visual simplification of TaskList component
**Theme:** Dark (existing OKLCH tokens), clean table aesthetic inspired by reference

---

## Summary

Redesign the tasks table from a feature-heavy grouped layout to a clean, minimal flat table with pill filters and avatar stacks. Admin editing capabilities are preserved but relocated — status stays inline-editable for admins, everything else moves to the detail panel.

---

## Layout

1. **Header** — "Tasks" title + kebab menu (admin: "Add Task" action)
2. **Filter bar** — 3 pill-shaped dropdown chips: Assignee, Status, Priority
3. **Table** — 3 columns: Name, Assignees, Status
4. **Detail panel** — Existing TaskDetail side panel (unchanged)

---

## Table Columns

| Column | Content | Admin | Member |
|--------|---------|-------|--------|
| Name | Task name text | Clickable -> detail panel | Clickable -> detail panel |
| Assignees | Overlapping avatar stack | Display only | Display only |
| Status | Color-coded pill badge with icon | Clickable dropdown to change status | Display only |

---

## Status Badges

Dark-theme pill badges with tinted backgrounds:

| Status | Icon | Style |
|--------|------|-------|
| In Progress | Play | `bg-amber-500/10 text-amber-400 border border-amber-500/20` |
| Complete | Check | `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20` |
| In Review | Eye | `bg-blue-500/10 text-blue-400 border border-blue-500/20` |
| Blocked | X-circle | `bg-red-500/10 text-red-400 border border-red-500/20` |

Completing a task: Admin clicks status badge -> selects "Complete" from dropdown.
Member clicks row -> opens detail panel -> changes status there.

---

## Filter Pills

- Rounded border chips: `border-border rounded-full px-4 py-1.5 text-sm uppercase tracking-wide`
- Chevron-down icon on each
- Active filter: slightly filled background (`bg-muted`)
- Inactive: transparent with border
- Font: Outfit (matches UI), uppercase labels like reference

---

## What Gets Removed From Table

- Checkboxes
- Department column and department grouping headers
- Priority column (now filter-only)
- Deadline column (visible in detail panel only)
- Search input (replaced by filter pills)
- Inline department/priority/assignee editing in table rows

---

## What Stays Unchanged

- TaskDetail side panel (comments, deliverables, handoff history)
- HandoffDialog component
- DeliverablesUploadDialog component
- All Supabase data queries and types
- API routes for deliverables and handoffs

---

## What Changes

- `TaskList.tsx` — Major rewrite: simplified render, 3-column table, pill filters, flat list
- Filter logic — 3 independent pill-dropdown filters replacing search + single status dropdown
- Row layout — Clean 3-column row with avatar stack
- Admin "Add Task" — Moves from top-level button to kebab menu in header
- Avatar display — Switch from single avatar to overlapping stack style

---

## Files Affected

| File | Change |
|------|--------|
| `src/components/dashboard/TaskList.tsx` | Major rewrite |
| `src/components/dashboard/TaskDetail.tsx` | Add status editing for members (if not already present) |
| `src/app/(dashboard)/tasks/page.tsx` | Minor — may simplify props passed |
