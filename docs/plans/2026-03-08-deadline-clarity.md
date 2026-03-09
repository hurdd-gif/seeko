# Deadline Clarity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static deadline dates with relative time labels and color-coded urgency tiers across task cards and detail panel.

**Architecture:** A shared `formatDeadline()` utility returns `{ label, className, icon }` based on 4 urgency tiers (overdue / today / this week / normal). Both UpcomingTasks and TaskDetail consume it, replacing their inline deadline formatting.

**Tech Stack:** TypeScript, Lucide icons, Tailwind classes

---

### Task 1: Create shared `formatDeadline` utility

**Files:**
- Create: `src/lib/format-deadline.ts`

**Step 1: Create the utility file**

```ts
import { AlertTriangle, Clock, type LucideIcon } from 'lucide-react';

export interface DeadlineDisplay {
  label: string;
  className: string;
  icon: LucideIcon;
}

/**
 * Returns a relative deadline label with urgency-based color.
 *
 * Tiers:
 *   Overdue     → "yesterday", "2 days ago", etc. — red
 *   Due today   → "Today" — orange
 *   Due 1-6 days→ "Tomorrow", "in 3 days" — amber
 *   Due 7+ days → "Mar 28" (absolute) — muted
 */
export function formatDeadline(dateStr: string): DeadlineDisplay {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadline = new Date(dateStr + 'T00:00:00');
  const diffMs = deadline.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  // Overdue
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    let label: string;
    if (absDays === 1) label = 'Yesterday';
    else if (absDays < 7) label = `${absDays} days ago`;
    else if (absDays < 14) label = '1 week ago';
    else label = `${Math.floor(absDays / 7)} weeks ago`;
    return { label, className: 'text-red-400', icon: AlertTriangle };
  }

  // Due today
  if (diffDays === 0) {
    return { label: 'Today', className: 'text-orange-400', icon: Clock };
  }

  // Due tomorrow
  if (diffDays === 1) {
    return { label: 'Tomorrow', className: 'text-amber-400', icon: Clock };
  }

  // Due this week (2-6 days)
  if (diffDays <= 6) {
    return { label: `in ${diffDays} days`, className: 'text-amber-400', icon: Clock };
  }

  // Normal (7+ days)
  const formatted = deadline.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return { label: formatted, className: 'text-muted-foreground', icon: Clock };
}

/** Full absolute date for tooltips */
export function formatDeadlineFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
```

**Step 2: Commit**

```bash
git add src/lib/format-deadline.ts
git commit -m "feat: add shared formatDeadline utility with urgency tiers"
```

---

### Task 2: Update UpcomingTasks to use `formatDeadline`

**Files:**
- Modify: `src/components/dashboard/UpcomingTasks.tsx`

**Step 1: Replace deadline display**

Remove these local functions (they're replaced by the shared utility):
- `formatDeadlineDisplay` (lines 26-31)
- `isOverdue` (lines 33-36)

Remove the `AlertTriangle` import from lucide-react (it'll come from the utility's returned icon).

Add import:
```ts
import { formatDeadline } from '@/lib/format-deadline';
```

Replace the deadline rendering block (lines 88-96) from:
```tsx
{task.deadline && (
  <span className={cn(
    'inline-flex items-center gap-1 text-xs',
    overdue ? 'text-red-400 font-medium' : 'text-muted-foreground'
  )}>
    {overdue && <AlertTriangle className="size-3" />}
    {overdue ? 'Overdue' : formatDeadlineDisplay(task.deadline)}
  </span>
)}
```

To:
```tsx
{task.deadline && (() => {
  const dl = formatDeadline(task.deadline);
  const DlIcon = dl.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', dl.className)} title={task.deadline}>
      {dl.className === 'text-red-400' && <DlIcon className="size-3" />}
      {dl.label}
    </span>
  );
})()}
```

Also remove the `overdue` variable on line 66 since it's no longer needed.

**Step 2: Verify the dev server compiles without errors**

Run: `npm run dev` — check the dashboard renders, deadline labels show relative text with correct colors.

**Step 3: Commit**

```bash
git add src/components/dashboard/UpcomingTasks.tsx
git commit -m "feat: use relative deadline labels in UpcomingTasks"
```

---

### Task 3: Update TaskDetail to use `formatDeadline`

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx` (around lines 1114-1122)

**Step 1: Add imports**

```ts
import { formatDeadline, formatDeadlineFull } from '@/lib/format-deadline';
```

Note: Keep existing `Clock` import since it's used elsewhere in the file. Add `AlertTriangle` to the lucide-react import list.

**Step 2: Replace the deadline display block**

Find (around lines 1114-1122):
```tsx
{task.deadline && (
  <>
    <div className="hidden md:block w-px h-4 bg-border" />
    <div className="flex items-center gap-1.5 cursor-default" title={formatLocalTime(task.deadline)}>
      <Clock className="size-3 text-muted-foreground" />
      <span className="text-xs text-foreground">{new Date(task.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
    </div>
  </>
)}
```

Replace with:
```tsx
{task.deadline && (() => {
  const dl = formatDeadline(task.deadline);
  const DlIcon = dl.icon;
  return (
    <>
      <div className="hidden md:block w-px h-4 bg-border" />
      <div className={cn('flex items-center gap-1.5 cursor-default', dl.className)} title={formatDeadlineFull(task.deadline)}>
        <DlIcon className="size-3" />
        <span className="text-xs font-medium">{dl.label}</span>
      </div>
    </>
  );
})()}
```

**Step 3: Verify dev server compiles, open a task detail panel and confirm deadline shows relative label with correct color and tooltip shows full date.**

**Step 4: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat: use relative deadline labels in TaskDetail panel"
```
