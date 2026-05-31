# Dashboard Root Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `src/app/(dashboard)/page.tsx` with a Notion-hero + Linear-right-rail layout (Approach A from the design doc), keeping layout chrome, data fetchers, and the existing `StatPills`/`UpcomingTasks`/`DashboardAreaCard` components untouched.

**Architecture:** New components in `src/components/dashboard/` (Hero, Rail wrapper, 4 rail modules), wired into a rewritten `page.tsx`. Tokens added to `src/app/globals.css`. A new helper module `src/lib/areas.ts` for the next-milestone derivation. Reuses existing data fetchers (`fetchTasks`, `fetchAreas`, `fetchTeam`, `fetchDocs`, `fetchActivity`, `fetchProfile`) — no schema or API changes. Quick Note POSTs to the existing `/api/notes` route.

**Tech Stack:** Next.js 16 App Router (RSC by default, `"use client"` only for the Quick Note input), motion/react (existing `FadeRise`/`Stagger`/`StaggerItem` wrappers), Tailwind v4 CSS-token theming, Vitest with Testing Library.

**Reference design doc:** `docs/plans/2026-05-13-dashboard-root-redesign-design.md`
**Reference Paper file:** https://app.paper.design/file/01KK7AC9H7M89EXWA8KD4PR99E/01KK7AC9H7HPGM859QCBZWWQ33

---

## Pre-flight

**Required sub-skill before starting:** `superpowers:test-driven-development`. Each task below is structured TDD — failing test first, then minimal implementation. Do not skip the "run the test and watch it fail" step.

**Branch:** This plan must run on a `dashboard-root-redesign` branch in its own worktree. If the main repo is currently on `feat/studio-agents` (or anything else), create a worktree first:

```bash
git worktree add ../seeko-studio-dashboard-root-redesign -b dashboard-root-redesign main
cd ../seeko-studio-dashboard-root-redesign
```

Per the user's "Worktree ↔ Main Sync Rule": dev server still runs from the main repo. Mirror each completed edit back to main before testing in the browser.

**Visual QA gate (mandatory hook — global rule):** Before Task 1, run `/interface-craft critique` against the current dashboard root and capture the findings to compare against post-implementation. Re-run `/interface-craft critique` after Task 12 against the live route. No design changes ship without both passes.

---

### Task 1: Add tokens to globals.css

**Files:**
- Modify: `src/app/globals.css` — add `--radius-pill` and number pop-in tokens to both `:root` and `[data-theme="dark"]`, then expose `--radius-pill` in the `@theme inline` block

**Step 1: Write a failing snapshot/assertion**

Create `src/app/__tests__/globals-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8');

describe('globals.css design tokens', () => {
  it('defines --radius-pill in :root', () => {
    expect(css).toMatch(/--radius-pill:\s*9999px/);
  });

  it('defines number pop-in tokens', () => {
    expect(css).toMatch(/--digit-dur:\s*500ms/);
    expect(css).toMatch(/--digit-distance:\s*8px/);
    expect(css).toMatch(/--digit-stagger:\s*70ms/);
    expect(css).toMatch(/--digit-blur:\s*2px/);
    expect(css).toMatch(/--digit-ease:\s*cubic-bezier\(0\.34,\s*1\.45,\s*0\.64,\s*1\)/);
  });

  it('exposes --radius-pill through @theme inline', () => {
    const themeBlock = css.match(/@theme inline\s*{[\s\S]*?}/)?.[0] ?? '';
    expect(themeBlock).toMatch(/--radius-pill:\s*var\(--radius-pill\)/);
  });
});
```

**Step 2: Run it and verify it fails**

```bash
npm test -- src/app/__tests__/globals-tokens.test.ts
```

Expected: all 3 assertions FAIL with "expected …to match…".

**Step 3: Add the tokens**

In `src/app/globals.css` `:root` block (after `--focus-ring-duration: 200ms;`), add:

```css
  /* Pill geometry — interactive controls only; cards keep --radius */
  --radius-pill: 9999px;

  /* transitions-dev number pop-in (stat pill count changes) */
  --digit-dur: 500ms;
  --digit-distance: 8px;
  --digit-stagger: 70ms;
  --digit-blur: 2px;
  --digit-ease: cubic-bezier(0.34, 1.45, 0.64, 1);
  --digit-dir-x: 0;
  --digit-dir-y: 1;
```

In the `@theme inline { … }` block (after `--radius: var(--radius);`), add:

```css
  --radius-pill: var(--radius-pill);
```

The number pop-in tokens stay scoped to `:root` only — they are read by CSS, not by Tailwind utilities, so they do not need a `@theme inline` mirror.

**Step 4: Run tests and verify pass**

```bash
npm test -- src/app/__tests__/globals-tokens.test.ts
```

Expected: 3 PASS.

**Step 5: Commit**

```bash
git add src/app/globals.css src/app/__tests__/globals-tokens.test.ts
git commit -m "feat(tokens): add --radius-pill and digit pop-in tokens to globals.css"
```

---

### Task 2: Extract `soonestArea` helper into `lib/areas.ts`

The Next Milestone rail module needs to pick the area with the soonest non-null `target_date`. Extract this into a pure helper so it's tested in isolation and can be reused by the investor panel later.

**Files:**
- Create: `src/lib/areas.ts`
- Create: `src/lib/__tests__/areas.test.ts`

**Step 1: Write the failing test**

`src/lib/__tests__/areas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { soonestArea, monthsUntil } from '@/lib/areas';
import type { Area } from '@/lib/types';

const baseArea: Omit<Area, 'id' | 'name' | 'target_date'> = {
  status: 'Active',
  progress: 50,
  phase: 'Beta',
};

describe('soonestArea', () => {
  it('returns null when no areas have a target_date', () => {
    const areas: Area[] = [
      { ...baseArea, id: 'a', name: 'A' },
      { ...baseArea, id: 'b', name: 'B' },
    ];
    expect(soonestArea(areas)).toBeNull();
  });

  it('returns the area with the closest future target_date', () => {
    const areas: Area[] = [
      { ...baseArea, id: 'a', name: 'A', target_date: '2027-01-01' },
      { ...baseArea, id: 'b', name: 'B', target_date: '2026-08-15' },
      { ...baseArea, id: 'c', name: 'C', target_date: '2026-09-01' },
    ];
    expect(soonestArea(areas)?.id).toBe('b');
  });

  it('ignores areas with null/undefined target_date', () => {
    const areas: Area[] = [
      { ...baseArea, id: 'a', name: 'A' },
      { ...baseArea, id: 'b', name: 'B', target_date: '2026-12-01' },
    ];
    expect(soonestArea(areas)?.id).toBe('b');
  });

  it('returns null for empty list', () => {
    expect(soonestArea([])).toBeNull();
  });
});

describe('monthsUntil', () => {
  it('returns 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(monthsUntil(today, new Date())).toBe(0);
  });

  it('returns 4 for a date ~4 months out', () => {
    const ref = new Date('2026-05-13');
    expect(monthsUntil('2026-09-13', ref)).toBe(4);
  });

  it('returns negative for past dates', () => {
    const ref = new Date('2026-05-13');
    expect(monthsUntil('2026-01-13', ref)).toBe(-4);
  });
});
```

**Step 2: Run it and verify it fails**

```bash
npm test -- src/lib/__tests__/areas.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/areas'`.

**Step 3: Write the minimal implementation**

`src/lib/areas.ts`:

```ts
import type { Area } from './types';

export function soonestArea(areas: Area[]): Area | null {
  const dated = areas.filter((a): a is Area & { target_date: string } => Boolean(a.target_date));
  if (dated.length === 0) return null;
  return dated.reduce((acc, a) => (a.target_date < acc.target_date ? a : acc));
}

export function monthsUntil(targetDate: string, ref: Date = new Date()): number {
  const target = new Date(targetDate + 'T00:00:00');
  const years = target.getFullYear() - ref.getFullYear();
  const months = target.getMonth() - ref.getMonth();
  return years * 12 + months;
}
```

If `Area['target_date']` is not yet declared in `src/lib/types.ts`, add `target_date?: string;` to the `Area` type. (Per the project memory, the column already exists in Supabase — the type may already include it. Check `src/lib/types.ts` before adding.)

**Step 4: Run tests and verify pass**

```bash
npm test -- src/lib/__tests__/areas.test.ts
```

Expected: 7 PASS.

**Step 5: Commit**

```bash
git add src/lib/areas.ts src/lib/__tests__/areas.test.ts src/lib/types.ts
git commit -m "feat(lib): add soonestArea + monthsUntil helpers for next-milestone rail"
```

(Only stage `src/lib/types.ts` if you actually had to edit it.)

---

### Task 3: `DashboardHero`

Pure server component: greeting + subline + StatPills row. No client interactivity. Mirrors the current hero in `page.tsx:165-177` but uses time-of-day greeting.

**Files:**
- Create: `src/components/dashboard/DashboardHero.tsx`
- Create: `src/components/dashboard/__tests__/DashboardHero.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHero } from '../DashboardHero';

const pills = [{ label: 'open', count: 3, variant: 'accent' as const }];

describe('DashboardHero', () => {
  it('renders evening greeting at 20:00', () => {
    render(<DashboardHero firstName="karti" subline="3 due this week." pills={pills} now={new Date('2026-05-13T20:00:00')} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, karti');
  });

  it('renders morning greeting at 07:00', () => {
    render(<DashboardHero firstName="karti" subline="" pills={pills} now={new Date('2026-05-13T07:00:00')} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, karti');
  });

  it('renders afternoon greeting at 14:00', () => {
    render(<DashboardHero firstName="karti" subline="" pills={pills} now={new Date('2026-05-13T14:00:00')} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good afternoon, karti');
  });

  it('falls back to "there" when firstName is missing', () => {
    render(<DashboardHero firstName={undefined} subline="" pills={pills} now={new Date('2026-05-13T20:00:00')} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, there');
  });

  it('renders the subline below the heading', () => {
    render(<DashboardHero firstName="karti" subline="2 blocked, 3 due this week." pills={pills} now={new Date('2026-05-13T20:00:00')} />);
    expect(screen.getByText('2 blocked, 3 due this week.')).toBeInTheDocument();
  });
});
```

**Step 2: Run it and verify it fails**

```bash
npm test -- src/components/dashboard/__tests__/DashboardHero.test.tsx
```

Expected: FAIL with `Cannot find module '../DashboardHero'`.

**Step 3: Write the minimal implementation**

`src/components/dashboard/DashboardHero.tsx`:

```tsx
import { StatPills } from './StatPills';

type Pill = { label: string; count: number; variant: 'danger' | 'accent' | 'muted'; href?: string };

function greetingPrefix(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardHero({
  firstName,
  subline,
  pills,
  now = new Date(),
  pillDelayMs = 0,
  pillStaggerMs = 0,
}: {
  firstName?: string;
  subline: string;
  pills: Pill[];
  now?: Date;
  pillDelayMs?: number;
  pillStaggerMs?: number;
}) {
  const name = firstName ?? 'there';
  const prefix = greetingPrefix(now.getHours());
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-foreground text-balance">
          {prefix}, {name}
        </h1>
        {subline && <p className="text-sm text-muted-foreground mt-1">{subline}</p>}
      </div>
      <StatPills pills={pills} delayMs={pillDelayMs} staggerMs={pillStaggerMs} />
    </div>
  );
}
```

**Step 4: Run tests and verify pass**

```bash
npm test -- src/components/dashboard/__tests__/DashboardHero.test.tsx
```

Expected: 5 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/DashboardHero.tsx src/components/dashboard/__tests__/DashboardHero.test.tsx
git commit -m "feat(dashboard): add DashboardHero with time-of-day greeting"
```

---

### Task 4: `RailNextMilestone`

**Files:**
- Create: `src/components/dashboard/RailNextMilestone.tsx`
- Create: `src/components/dashboard/__tests__/RailNextMilestone.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RailNextMilestone } from '../RailNextMilestone';
import type { Area } from '@/lib/types';

const base: Omit<Area, 'id' | 'name' | 'target_date'> = {
  status: 'Active',
  progress: 50,
  phase: 'Beta',
};

describe('RailNextMilestone', () => {
  it('renders the area name, phase, and months-out', () => {
    const areas: Area[] = [{ ...base, id: 'a', name: 'Main Game', target_date: '2026-09-13' }];
    render(<RailNextMilestone areas={areas} now={new Date('2026-05-13')} />);
    expect(screen.getByText(/Main Game/)).toBeInTheDocument();
    expect(screen.getByText(/Beta/)).toBeInTheDocument();
    expect(screen.getByText(/4\s*mo/i)).toBeInTheDocument();
  });

  it('renders the formatted target date', () => {
    const areas: Area[] = [{ ...base, id: 'a', name: 'Main Game', target_date: '2026-09-15' }];
    render(<RailNextMilestone areas={areas} now={new Date('2026-05-13')} />);
    expect(screen.getByText('Sep 15')).toBeInTheDocument();
  });

  it('renders an empty state when no areas have target_date', () => {
    const areas: Area[] = [{ ...base, id: 'a', name: 'Main Game' }];
    render(<RailNextMilestone areas={areas} now={new Date('2026-05-13')} />);
    expect(screen.getByText(/No target dates set/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run it and verify it fails**

```bash
npm test -- src/components/dashboard/__tests__/RailNextMilestone.test.tsx
```

Expected: FAIL — module not found.

**Step 3: Write the minimal implementation**

```tsx
import { soonestArea, monthsUntil } from '@/lib/areas';
import type { Area } from '@/lib/types';

export function RailNextMilestone({ areas, now = new Date() }: { areas: Area[]; now?: Date }) {
  const area = soonestArea(areas);

  if (!area || !area.target_date) {
    return (
      <div className="px-4 py-3.5">
        <p className="text-xs text-muted-foreground">Next milestone</p>
        <p className="text-sm text-muted-foreground mt-1">No target dates set</p>
      </div>
    );
  }

  const months = monthsUntil(area.target_date, now);
  const formatted = new Date(area.target_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-muted-foreground">Next milestone</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground truncate">
          {area.name}
          {area.phase && <span className="text-muted-foreground"> · {area.phase}</span>}
        </p>
        <p className="text-sm tabular-nums text-foreground shrink-0">{months} mo</p>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{formatted}</p>
    </div>
  );
}
```

**Step 4: Run tests and verify pass**

```bash
npm test -- src/components/dashboard/__tests__/RailNextMilestone.test.tsx
```

Expected: 3 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/RailNextMilestone.tsx src/components/dashboard/__tests__/RailNextMilestone.test.tsx
git commit -m "feat(dashboard): add RailNextMilestone rail module"
```

---

### Task 5: `RailStudioProgress`

**Files:**
- Create: `src/components/dashboard/RailStudioProgress.tsx`
- Create: `src/components/dashboard/__tests__/RailStudioProgress.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RailStudioProgress } from '../RailStudioProgress';
import type { Area } from '@/lib/types';

const a = (over: Partial<Area>): Area => ({
  id: 'x', name: 'X', status: 'Active', progress: 0, phase: 'Beta', ...over,
});

describe('RailStudioProgress', () => {
  it('shows avg progress and active count', () => {
    render(<RailStudioProgress areas={[a({ progress: 40 }), a({ id: 'y', progress: 60 })]} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/2 active areas/i)).toBeInTheDocument();
  });

  it('rounds the average', () => {
    render(<RailStudioProgress areas={[a({ progress: 33 }), a({ id: 'y', progress: 34 })]} />);
    expect(screen.getByText('34%')).toBeInTheDocument();
  });

  it('only counts Active areas in the subline', () => {
    render(<RailStudioProgress areas={[a({ progress: 40 }), a({ id: 'y', progress: 60, status: 'Planned' })]} />);
    expect(screen.getByText(/1 active area/i)).toBeInTheDocument();
  });

  it('shows empty state when no areas', () => {
    render(<RailStudioProgress areas={[]} />);
    expect(screen.getByText(/No active areas/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run it and verify it fails**

```bash
npm test -- src/components/dashboard/__tests__/RailStudioProgress.test.tsx
```

Expected: FAIL.

**Step 3: Write the minimal implementation**

```tsx
import type { Area } from '@/lib/types';

export function RailStudioProgress({ areas }: { areas: Area[] }) {
  if (areas.length === 0) {
    return (
      <div className="px-4 py-3.5">
        <p className="text-xs text-muted-foreground">Studio progress</p>
        <p className="text-sm text-muted-foreground mt-1">No active areas</p>
      </div>
    );
  }
  const avg = Math.round(areas.reduce((sum, a) => sum + a.progress, 0) / areas.length);
  const active = areas.filter(a => a.status === 'Active').length;
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">Studio progress</p>
        <p className="text-sm font-medium text-foreground tabular-nums">{avg}%</p>
      </div>
      <div
        className="mt-2 h-[3px] w-full bg-muted overflow-hidden"
        style={{ borderRadius: 'var(--radius-pill)' }}
        role="progressbar"
        aria-valuenow={avg}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-[color:var(--color-status-complete)]"
          style={{ width: `${avg}%`, borderRadius: 'var(--radius-pill)' }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1 tabular-nums">
        {active} active area{active === 1 ? '' : 's'}
      </p>
    </div>
  );
}
```

**Step 4: Run tests and verify pass**

```bash
npm test -- src/components/dashboard/__tests__/RailStudioProgress.test.tsx
```

Expected: 4 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/RailStudioProgress.tsx src/components/dashboard/__tests__/RailStudioProgress.test.tsx
git commit -m "feat(dashboard): add RailStudioProgress aggregate bar"
```

---

### Task 6: `RailRecentActivity`

Reuses `ActivityFeedItem` directly. The page parent slices to 3 items before passing in; the rail does not slice itself (keeps it dumb).

**Files:**
- Create: `src/components/dashboard/RailRecentActivity.tsx`
- Create: `src/components/dashboard/__tests__/RailRecentActivity.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RailRecentActivity } from '../RailRecentActivity';

const items = [
  { id: '1', name: 'karti', action: 'completed', target: 'Login bug', time: '2h ago', actionKey: 'completed', iconClassName: '', iconBg: 'bg-muted' },
  { id: '2', name: 'karti', action: 'assigned', target: 'Asset cleanup', time: '4h ago', actionKey: 'assigned', iconClassName: '', iconBg: 'bg-muted' },
];

describe('RailRecentActivity', () => {
  it('renders the activity items', () => {
    render(<RailRecentActivity items={items} showViewAll />);
    expect(screen.getByText(/Login bug/)).toBeInTheDocument();
    expect(screen.getByText(/Asset cleanup/)).toBeInTheDocument();
  });

  it('renders View all link when showViewAll is true', () => {
    render(<RailRecentActivity items={items} showViewAll />);
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/activity');
  });

  it('hides View all link when showViewAll is false', () => {
    render(<RailRecentActivity items={items} showViewAll={false} />);
    expect(screen.queryByRole('link', { name: /view all/i })).toBeNull();
  });

  it('renders empty state', () => {
    render(<RailRecentActivity items={[]} showViewAll />);
    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run it and verify it fails**

```bash
npm test -- src/components/dashboard/__tests__/RailRecentActivity.test.tsx
```

Expected: FAIL.

**Step 3: Write the minimal implementation**

```tsx
import Link from 'next/link';
import { ActivityFeedItem } from './ActivityFeedItem';

type Item = {
  id: string;
  name: string;
  action: string;
  target: string;
  time: string;
  actionKey: string;
  iconClassName: string;
  iconBg: string;
};

export function RailRecentActivity({ items, showViewAll }: { items: Item[]; showViewAll: boolean }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-muted-foreground mb-2">Recent activity</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent activity</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map(item => (
            <li key={item.id}>
              <ActivityFeedItem
                name={item.name}
                action={item.action}
                target={item.target}
                time={item.time}
                actionKey={item.actionKey}
                iconClassName={item.iconClassName}
                iconBg={item.iconBg}
              />
            </li>
          ))}
        </ul>
      )}
      {showViewAll && items.length > 0 && (
        <Link
          href="/activity"
          className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all →
        </Link>
      )}
    </div>
  );
}
```

**Step 4: Run tests and verify pass**

```bash
npm test -- src/components/dashboard/__tests__/RailRecentActivity.test.tsx
```

Expected: 4 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/RailRecentActivity.tsx src/components/dashboard/__tests__/RailRecentActivity.test.tsx
git commit -m "feat(dashboard): add RailRecentActivity (top-3 activity)"
```

---

### Task 7: `RailQuickNote` (admin-only, client component)

Single-line `<input>` + enter-to-submit. POSTs to `/api/notes`.

**Files:**
- Create: `src/components/dashboard/RailQuickNote.tsx`
- Create: `src/components/dashboard/__tests__/RailQuickNote.test.tsx`

**Step 1: Verify the POST contract**

Before writing the component, confirm the request shape `/api/notes` expects. Quick check:

```bash
grep -n "export async function POST" src/app/api/notes/route.ts
```

The Telegram bot inserts notes via service role, but the in-app web composer must POST through the route. The body shape used by the existing admin Quick Note (in `StudioAgents` if present, or analogous flow) is `{ body: string }`. If the route doesn't yet accept this shape, this task is a no-op for the component and a follow-up to wire the route — note that in the commit message and proceed.

**Step 2: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RailQuickNote } from '../RailQuickNote';

describe('RailQuickNote', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'note-1' }) }) as never;
  });

  it('submits the input on Enter and clears it', async () => {
    render(<RailQuickNote />);
    const input = screen.getByPlaceholderText(/Drop a thought/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'fix login bug' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('does not submit empty input', () => {
    render(<RailQuickNote />);
    const input = screen.getByPlaceholderText(/Drop a thought/i);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the input value on error', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    render(<RailQuickNote />);
    const input = screen.getByPlaceholderText(/Drop a thought/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'whoops' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(input.value).toBe('whoops'));
  });
});
```

**Step 3: Run it and verify it fails**

```bash
npm test -- src/components/dashboard/__tests__/RailQuickNote.test.tsx
```

Expected: FAIL.

**Step 4: Write the minimal implementation**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export function RailQuickNote() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error('post failed');
      setValue('');
    } catch {
      toast.error('Could not save note');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-muted-foreground mb-2">Quick note</p>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        disabled={busy}
        placeholder="Drop a thought…"
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none border-b border-border focus:border-foreground/40 transition-colors py-1"
      />
    </div>
  );
}
```

**Step 5: Run tests and verify pass**

```bash
npm test -- src/components/dashboard/__tests__/RailQuickNote.test.tsx
```

Expected: 3 PASS.

**Step 6: Commit**

```bash
git add src/components/dashboard/RailQuickNote.tsx src/components/dashboard/__tests__/RailQuickNote.test.tsx
git commit -m "feat(dashboard): add RailQuickNote single-line composer"
```

---

### Task 8: `DashboardRail` wrapper

Provides the divide-y bordered surface that holds the 4 modules.

**Files:**
- Create: `src/components/dashboard/DashboardRail.tsx`

No new test file — covered by the page-level smoke check in Task 9.

**Step 1: Write the wrapper**

```tsx
import type { ReactNode } from 'react';

export function DashboardRail({ children }: { children: ReactNode }) {
  return (
    <aside className="divide-y divide-border border border-border overflow-hidden">
      {children}
    </aside>
  );
}
```

**Step 2: Confirm typecheck passes**

```bash
npx tsc --noEmit
```

Expected: no new errors (pre-existing data.ts:224 cast error is acknowledged out-of-scope).

**Step 3: Commit**

```bash
git add src/components/dashboard/DashboardRail.tsx
git commit -m "feat(dashboard): add DashboardRail divide-y wrapper"
```

---

### Task 9: Rewire `page.tsx` with the new layout and motion storyboard

This is the heart of the redesign. Replace the current Hero + 5-col grid + Areas structure with Hero + 2-col grid (tasks | rail) + Areas, keeping `force-dynamic`, the `Promise.all` data fetch, `buildGreeting`, the timeAgo helper, and the activity-icon map.

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Step 1: Write the full new file**

Replace `src/app/(dashboard)/page.tsx` with the layout below. The header comment storyboard reflects the design doc §7.

```tsx
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Overview page entrance
 *
 *    0ms   hero greeting + subline fade-rise (y 20 → 0)
 *   80ms   stat pills stagger in (40ms between each)
 *  200ms   tasks section fade-rise (y 16 → 0)
 *  300ms   right-rail cascade (60ms stagger across 4 modules)
 *  500ms   game areas — whileInView, once, margin "-100px"
 *  550ms   area tiles stagger in (50ms each)
 *
 * Springs: smooth { stiffness: 300, damping: 25 } for sections,
 *          snappy { stiffness: 500, damping: 30 } for pills (in StatPills).
 * Reduced motion: stagger + y disabled (opacity-only) inside motion helpers.
 * ───────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server';
import {
  fetchTasks,
  fetchAllTasksWithAssignees,
  fetchAreas,
  fetchTeam,
  fetchDocs,
  fetchActivity,
  fetchProfile,
} from '@/lib/supabase/data';
import { Task, Area } from '@/lib/types';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { UpcomingTasks } from '@/components/dashboard/UpcomingTasks';
import { DashboardAreaCard } from '@/components/dashboard/DashboardAreaCard';
import { CollapsibleAreas } from '@/components/dashboard/CollapsibleAreas';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardRail } from '@/components/dashboard/DashboardRail';
import { RailNextMilestone } from '@/components/dashboard/RailNextMilestone';
import { RailStudioProgress } from '@/components/dashboard/RailStudioProgress';
import { RailRecentActivity } from '@/components/dashboard/RailRecentActivity';
import { RailQuickNote } from '@/components/dashboard/RailQuickNote';
import { ViewAllLink } from '@/components/dashboard/ViewAllLink';
import {
  CheckSquare,
  Activity,
  Map,
  UserPlus,
  MessageSquare,
  Pencil,
  Trash2,
  FileText,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ── Animation timing (ms) ────────────────────────────────────────
const TIMING = {
  hero: 0,
  pills: 80,
  pillStagger: 40,
  tasks: 200,
  rail: 300,
  railStagger: 60,
  areas: 500,
  areasInner: 50,
};
const delay = (ms: number) => ms / 1000;
const SECTION_Y = 16;

// ── Activity kind → icon + color ────────────────────────────────
const ACTIVITY_ICONS: Record<string, { icon: typeof Activity; className: string; bg: string }> = {
  assigned:           { icon: UserPlus,      className: 'text-foreground',                                  bg: 'bg-muted' },
  completed:          { icon: CheckSquare,   className: 'text-[color:var(--color-status-complete)]',        bg: 'bg-muted' },
  created:            { icon: FileText,      className: 'text-[color:var(--color-status-review)]',          bg: 'bg-muted' },
  updated:            { icon: Pencil,        className: 'text-[color:var(--color-status-progress)]',        bg: 'bg-muted' },
  commented:          { icon: MessageSquare, className: 'text-foreground',                                  bg: 'bg-muted' },
  deleted:            { icon: Trash2,        className: 'text-[color:var(--color-status-blocked)]',         bg: 'bg-muted' },
  started:            { icon: Activity,      className: 'text-[color:var(--color-status-progress)]',        bg: 'bg-muted' },
  'moved to review':  { icon: Activity,      className: 'text-[color:var(--color-status-review)]',          bg: 'bg-muted' },
};
const ACTIVITY_DEFAULT = { icon: Activity, className: 'text-muted-foreground', bg: 'bg-muted' };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildGreeting(tasks: Task[]): string {
  const open = tasks.filter(t => t.status !== 'Complete');
  const blocked = open.filter(t => t.status === 'Blocked').length;
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const dueSoon = open.filter(t => {
    if (!t.deadline) return false;
    const d = new Date(t.deadline + 'T23:59:59');
    return d <= weekFromNow;
  }).length;
  if (blocked > 0 && dueSoon > 0) return `${blocked} blocked, ${dueSoon} due this week.`;
  if (blocked > 0) return `${blocked} task${blocked === 1 ? ' is' : 's are'} blocked.`;
  if (dueSoon > 0) return `${dueSoon} task${dueSoon === 1 ? '' : 's'} due this week.`;
  if (open.length === 0) return "You're all caught up.";
  return "Here's what's happening.";
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await fetchProfile(user.id) : null;
  const isAdmin = profile?.is_admin ?? false;
  const isContractor = profile?.is_contractor ?? false;

  const [tasks, areas, team, docs, activity] = await Promise.all([
    isAdmin ? fetchAllTasksWithAssignees().catch(() => []) : fetchTasks(user?.id ?? '').catch(() => []),
    fetchAreas().catch((): Area[] => []),
    fetchTeam().catch(() => []),
    fetchDocs().catch(() => []),
    fetchActivity(5).catch(() => []),
  ]);

  const openTasks  = tasks.filter(t => t.status !== 'Complete').length;
  const completed  = tasks.filter(t => t.status === 'Complete').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const blocked    = tasks.filter(t => t.status === 'Blocked').length;
  const overdue    = tasks.filter(t => t.status !== 'Complete' && t.deadline && new Date(t.deadline + 'T23:59:59') < new Date()).length;

  const upcoming = tasks.filter(t => t.status !== 'Complete').slice(0, 5);
  const earliestDeadline = upcoming.filter(t => t.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0]?.deadline;

  const greeting = buildGreeting(tasks);
  const firstName = profile?.display_name?.split(' ')[0];

  const pills: { label: string; count: number; variant: 'danger' | 'accent' | 'muted'; href?: string }[] = [];
  if (overdue > 0) pills.push({ label: 'overdue', count: overdue, variant: 'danger' });
  pills.push({ label: 'open', count: openTasks, variant: 'accent', href: '/tasks' });
  if (inProgress > 0) pills.push({ label: 'in progress', count: inProgress, variant: 'muted' });
  if (blocked > 0) pills.push({ label: 'blocked', count: blocked, variant: 'danger' });
  pills.push({ label: 'done', count: completed, variant: 'muted' });

  const activityItems = activity.map(item => {
    const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
    const name = prof?.display_name ?? 'Unknown';
    const actionWord = item.action?.toLowerCase() ?? '';
    const kindCfg = ACTIVITY_ICONS[actionWord] ?? ACTIVITY_DEFAULT;
    return {
      id: item.id,
      name,
      action: actionWord,
      target: item.target,
      time: timeAgo(item.created_at),
      iconClassName: kindCfg.className,
      iconBg: kindCfg.bg,
      actionKey: actionWord,
    };
  });
  const railActivity = activityItems.slice(0, 3);

  return (
    <div className="flex flex-col gap-6 overflow-hidden">

      {/* ── Hero ─────────────────────────────────────── */}
      <FadeRise delay={delay(TIMING.hero)} y={SECTION_Y}>
        <DashboardHero
          firstName={firstName}
          subline={greeting}
          pills={pills}
          pillDelayMs={delay(TIMING.pills)}
          pillStaggerMs={delay(TIMING.pillStagger)}
        />
      </FadeRise>

      {/* ── Tasks + Right Rail ───────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">

        <FadeRise delay={delay(TIMING.tasks)} y={SECTION_Y}>
          <section>
            <header className="mb-3">
              <h3 className="text-lg font-semibold text-foreground">Your Tasks</h3>
              {earliestDeadline && upcoming.length > 0 && (
                <p className={cn('text-xs tabular-nums mt-0.5', new Date(earliestDeadline + 'T23:59:59') < new Date() ? 'text-[color:var(--color-status-blocked)]' : 'text-muted-foreground')}>
                  {new Date(earliestDeadline + 'T23:59:59') < new Date()
                    ? `Overdue since ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : `Next deadline: ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </p>
              )}
            </header>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Sparkles className="size-8 text-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-foreground">You're all caught up</p>
                  <p className="text-xs text-muted-foreground mt-1">No open tasks right now.</p>
                </div>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <FileText className="size-3" />
                  Browse docs
                </Link>
              </div>
            ) : (
              <>
                <UpcomingTasks
                  tasks={upcoming}
                  team={team}
                  docs={docs}
                  currentUserId={user?.id ?? ''}
                  isAdmin={isAdmin}
                />
                <ViewAllLink href="/tasks" label="View all tasks" />
              </>
            )}
          </section>
        </FadeRise>

        <Stagger delayMs={delay(TIMING.rail)} staggerMs={delay(TIMING.railStagger)}>
          <DashboardRail>
            <StaggerItem><RailNextMilestone areas={areas} /></StaggerItem>
            <StaggerItem><RailStudioProgress areas={areas} /></StaggerItem>
            <StaggerItem><RailRecentActivity items={railActivity} showViewAll={!isContractor} /></StaggerItem>
            {isAdmin && <StaggerItem><RailQuickNote /></StaggerItem>}
          </DashboardRail>
        </Stagger>

      </div>

      {/* ── Game Areas ───────────────────────────────── */}
      {areas.length > 0 && (
        <FadeRise delay={delay(TIMING.areas)} y={SECTION_Y}>
          <div className="hidden md:block">
            <section>
              <header className="mb-3 flex items-center gap-2">
                <Map className="size-4 text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">Game Areas</h3>
              </header>
              <Stagger className="flex flex-col gap-4 md:flex-row md:flex-wrap" delayMs={delay(TIMING.areasInner)}>
                {areas.map(area => (
                  <div key={area.id} className="w-full md:w-[calc(33.333%-0.667rem)]">
                    <DashboardAreaCard area={area} isAdmin={isAdmin} />
                  </div>
                ))}
              </Stagger>
            </section>
          </div>
          <div className="md:hidden">
            <CollapsibleAreas areas={areas} isAdmin={isAdmin} subtitle="" />
          </div>
        </FadeRise>
      )}
    </div>
  );
}
```

**Step 2: Typecheck and run all existing tests**

```bash
npx tsc --noEmit && npm test -- --run
```

Expected: typecheck clean (pre-existing data.ts:224 issue remains out of scope); test suite passes. If any existing page-level test (e.g., that asserted "Activity" `<h3>`) breaks, update the assertion to match the new structure — the rail uses `"Recent activity"` (lowercase eyebrow) instead of an `<h3>`.

**Step 3: Mirror to main repo and smoke check in browser**

Per the Worktree ↔ Main Sync Rule:

```bash
diff /Volumes/CODEUSER/seeko-studio-dashboard-root-redesign/src/app/\(dashboard\)/page.tsx \
     /Volumes/CODEUSER/seeko-studio/src/app/\(dashboard\)/page.tsx
# Then copy the worktree file into main.
```

In the main repo (where the dev server runs), reload `localhost:3000/`. Verify:
- Hero shows "Good {morning|afternoon|evening}, {firstName}"
- Pills row appears below
- Right rail visible at ≥1024px, stacked below on mobile
- Areas row full-width below

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat(dashboard): rewire root page with hero + right-rail layout"
```

---

### Task 10: Number pop-in on stat pill count changes (transitions-dev)

Apply the transitions-dev "number pop-in" pattern from the global tokens added in Task 1 to `StatPills.tsx` so that when a count changes mid-session the digit re-enters with the blurred slide.

**Files:**
- Modify: `src/components/dashboard/StatPills.tsx`
- Append to: `src/app/globals.css` — the `.t-number` rules and `@keyframes` from `transitions-dev/02-number-pop-in.md`

**Step 1: Read the canonical pattern**

Open `/Users/user/.claude/skills/transitions-dev/02-number-pop-in.md` and copy the CSS + JS orchestration block verbatim. Do not rewrite it. The CSS depends on the `--digit-*` tokens added in Task 1.

**Step 2: Append the CSS to `globals.css`**

Paste the `.t-number`, `.t-number__digit`, keyframe, and `@media (prefers-reduced-motion: reduce)` block from the reference at the bottom of `src/app/globals.css`. Do not strip the reduced-motion guard.

**Step 3: Wire `StatPills` to use `.t-number` on the count**

In `src/components/dashboard/StatPills.tsx`, locate the span that renders `{count}` and wrap it with the documented hook structure (`<span className="t-number" data-value={count}>…</span>`), and adapt the JS orchestration snippet from the reference to fire the replay on count change. Since `StatPills` is currently a server-friendly component, this step makes it (or a small inner span) a `"use client"` component — keep the `"use client"` scope as narrow as possible (e.g. extract a `<StatPillCount value={count} />` client subcomponent).

**Step 4: Manual smoke check**

In the dev server: change a task's status in Supabase (or via the UI) and refresh. The pill counts should re-render with the pop-in. Then test `prefers-reduced-motion`: in Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce" → reload → the count should snap without animation.

**Step 5: Commit**

```bash
git add src/components/dashboard/StatPills.tsx src/app/globals.css
git commit -m "feat(dashboard): apply transitions-dev number pop-in to stat pill counts"
```

---

### Task 11: Verify `ActivityFeed.tsx` is still in use, retire dashboard-root usage

The dashboard root no longer renders `ActivityFeed` (the rail's `RailRecentActivity` uses `ActivityFeedItem` directly). The full `ActivityFeed` component must remain because `/activity` still uses it.

**Files:**
- Inspect: `src/components/dashboard/ActivityFeed.tsx`
- Inspect callers

**Step 1: Grep callers**

```bash
grep -rn "ActivityFeed" src --include='*.tsx' --include='*.ts' | grep -v "ActivityFeedItem" | grep -v "RailRecentActivity"
```

Expected: at least one remaining caller in `src/app/(dashboard)/activity/`. If yes → leave the component as-is. If no → delete it and stage the deletion.

**Step 2: If deletion is appropriate, also remove its test**

```bash
ls src/components/dashboard/__tests__/ActivityFeed*.test.tsx
```

Delete any orphan test files.

**Step 3: Run the test suite once more**

```bash
npm test -- --run
```

Expected: green.

**Step 4: Commit (only if there were changes)**

```bash
git add src/components/dashboard/ActivityFeed.tsx  # or 'rm' if deleted
git commit -m "chore(dashboard): retire ActivityFeed from dashboard root"
```

If no changes were made, skip the commit — nothing to record.

---

### Task 12: Visual QA, post-implementation critique, manual smoke

**Step 1: Mirror final state to main and run dev server**

From the main repo (`/Volumes/CODEUSER/seeko-studio`):

```bash
npm run dev
```

Open `http://localhost:3000/`.

**Step 2: Manual smoke checklist (per design §11)**

1. Admin user — Quick Note module renders. Drop a thought, hit Enter, verify the input clears and a row appears in `notes` (Supabase Table Editor).
2. Switch to a contractor profile (or impersonate via service role insert) — Recent activity "View all" link hidden, Quick Note hidden.
3. Resize browser to <1024px — rail stacks under tasks, areas row still full-width, no horizontal scroll.
4. Change a task's status via the UI — pill counts pop-in fires.
5. DevTools → Rendering → `prefers-reduced-motion: reduce` → reload → no stagger, no y, no pop-in animation. Only opacity transitions allowed.
6. Check the Network tab — only one Supabase auth + the existing data fetches; no new requests beyond what the page used to make.

**Step 3: `/interface-craft critique` AFTER pass**

Take a full-page screenshot of the new dashboard root at 1440×900 and at 375×812, and run `/interface-craft critique` against each. The before/after critique pair must be saved to the design doc as a follow-up note (`§14 — Post-implementation critique`). Use the artboard map in the design doc Reference section to verify each section still matches its source artboard.

**Step 4: Push and open PR**

```bash
git push -u origin dashboard-root-redesign
gh pr create --title "Dashboard root redesign — Notion hero + Linear rail" --body "$(cat <<'EOF'
## Summary
- Rewires `src/app/(dashboard)/page.tsx` with a Notion "Good evening" hero + a Linear-style right rail (Next Milestone / Studio Progress / Recent Activity / Quick Note).
- Adds 6 new components in `src/components/dashboard/`, a helper module `src/lib/areas.ts`, and `--radius-pill` + digit-pop-in tokens to `globals.css`.
- No schema or API changes. Quick Note POSTs to the existing `/api/notes` route.

## Design doc
`docs/plans/2026-05-13-dashboard-root-redesign-design.md`

## Test plan
- [ ] Greeting prefix matches time of day at 07:00 / 14:00 / 20:00
- [ ] Stat pill counts pop-in on status change
- [ ] Rail collapses below tasks on <1024px viewports
- [ ] Admin sees Quick Note; contractor does not
- [ ] `prefers-reduced-motion` disables all transforms
- [ ] `/interface-craft critique` before vs after recorded in design doc §14

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Done definition

- All 12 commits land on `dashboard-root-redesign` branch.
- `npm test -- --run` green; `npx tsc --noEmit` no new errors.
- `/interface-craft critique` BEFORE and AFTER artifacts are appended to the design doc.
- Manual smoke checks 1–6 pass on the dev server.
- PR open against `main`; user reviews and merges manually.

---

*Generated by `writing-plans` from `docs/plans/2026-05-13-dashboard-root-redesign-design.md`. DRY, YAGNI, TDD, frequent commits.*
