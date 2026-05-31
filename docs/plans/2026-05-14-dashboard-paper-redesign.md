# Dashboard Root — Paper Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Run @docs/personas/ux.md and @docs/personas/swe.md as needed per the SEEKO routing table.

**Goal:** Ship a centered-column Notion-style dashboard root that follows the validated design at `docs/plans/2026-05-14-dashboard-paper-redesign-design.md`.

**Architecture:** Thin RSC at `src/app/(dashboard)/page.tsx` composes 7 sections — Hero, Recently worked on, Today's tasks, Next milestone, Studio progress, Game areas, Quick notes — using three reusable shells (`SectionEyebrow`, `TileRow`, `SplitPanel`). Entrance storyboard with single TIMING object at the top of `page.tsx`.

**Tech Stack:** Next.js 16 RSC, motion/react springs, Tailwind v4 tokens, Supabase data layer, Vitest.

**Test posture:** TDD on data helpers and the page composition. Smoke render tests on presentational components (assert renders without crashing + key text). No tests for pure styling — visual QA carries that load via `/interface-craft critique`.

**Commit cadence:** One commit per task. Each commit signs off with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## Task 0: Branch sanity check

**Files:** none

**Step 1:** Confirm we're on the right branch and clean.

```bash
cd /Volumes/CODEUSER/seeko-studio/.worktrees/dashboard-paper-redesign
git branch --show-current
git status --short
```

Expected: `feat/dashboard-paper-redesign`, only the two new docs/plans files untracked.

**Step 2:** Stage and commit the two design docs as a starting commit.

```bash
git add docs/plans/2026-05-14-dashboard-paper-redesign-design.md docs/plans/2026-05-14-dashboard-paper-redesign.md
git commit -m "docs: dashboard paper redesign design + plan"
```

---

## Task 1: Foundation tokens

**Files:**
- Modify: `src/app/globals.css`

**Step 1:** Open `globals.css`, find the `@theme inline {}` block.

**Step 2:** Add the glass token inside `@theme inline`:

```css
--color-glass: rgba(32, 32, 32, 0.9);
--color-eyebrow: #ADA9A3;
```

**Step 3:** Replace the `body` background rule with the radial gradient so backdrop-blur picks up tonal variation:

```css
body {
  background:
    radial-gradient(circle at 50% 0%, oklch(0.14 0 0), oklch(0.10 0 0) 60%);
  color: var(--color-foreground);
  min-height: 100vh;
}
```

**Step 4:** Build to verify no token regressions.

```bash
npm run build
```

Expected: build succeeds. If `--color-eyebrow` collides with anything in `globals.css`, drop it and reuse `--color-muted-foreground` everywhere.

**Step 5:** Commit.

```bash
git add src/app/globals.css
git commit -m "feat(dashboard): glass token + radial gradient body bg"
```

---

## Task 2: SectionEyebrow component

**Files:**
- Create: `src/components/dashboard/SectionEyebrow.tsx`
- Test: `src/components/dashboard/__tests__/SectionEyebrow.test.tsx`

**Step 1:** Write the failing smoke test.

```tsx
// __tests__/SectionEyebrow.test.tsx
import { render, screen } from '@testing-library/react';
import { Clock } from 'lucide-react';
import { SectionEyebrow } from '../SectionEyebrow';

describe('SectionEyebrow', () => {
  it('renders icon + sentence-case label', () => {
    render(<SectionEyebrow icon={Clock}>Recently visited</SectionEyebrow>);
    expect(screen.getByText('Recently visited')).toBeInTheDocument();
  });
});
```

**Step 2:** Run it.

```bash
npm test -- SectionEyebrow
```

Expected: FAIL (component does not exist).

**Step 3:** Implement.

```tsx
// SectionEyebrow.tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionEyebrow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="ml-2 flex h-8 items-center gap-2 pb-3.5">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="text-xs font-medium leading-[150%] text-muted-foreground">{children}</span>
    </div>
  );
}
```

**Step 4:** Run test.

```bash
npm test -- SectionEyebrow
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/SectionEyebrow.tsx src/components/dashboard/__tests__/SectionEyebrow.test.tsx
git commit -m "feat(dashboard): SectionEyebrow shared shell"
```

---

## Task 3: Tile + TileRow shells

**Files:**
- Create: `src/components/dashboard/Tile.tsx`
- Create: `src/components/dashboard/TileRow.tsx`
- Test: `src/components/dashboard/__tests__/TileRow.test.tsx`

**Step 1:** Write the failing test.

```tsx
// __tests__/TileRow.test.tsx
import { render, screen } from '@testing-library/react';
import { Clock } from 'lucide-react';
import { TileRow } from '../TileRow';
import { Tile } from '../Tile';

describe('TileRow', () => {
  it('renders eyebrow + tile children', () => {
    render(
      <TileRow icon={Clock} eyebrow="Recently visited">
        <Tile href="/x" title="A doc" subtitle="Mar 3" />
        <Tile href="/y" title="B doc" subtitle="Mar 4" />
      </TileRow>
    );
    expect(screen.getByText('Recently visited')).toBeInTheDocument();
    expect(screen.getByText('A doc')).toBeInTheDocument();
    expect(screen.getByText('B doc')).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- TileRow
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// Tile.tsx
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type Props = {
  href: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
};

export function Tile({ href, title, subtitle, icon: Icon, size = 'sm' }: Props) {
  const dims = size === 'sm' ? 'w-36 h-24' : 'w-[200px] h-[140px]';
  return (
    <Link
      href={href}
      className={`group ${dims} flex flex-shrink-0 snap-start flex-col justify-between rounded-xl bg-[var(--color-glass)] p-3 backdrop-blur-[48px] transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]`}
    >
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
      <div>
        <p className="line-clamp-2 text-sm leading-tight text-foreground">{title}</p>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </Link>
  );
}
```

```tsx
// TileRow.tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionEyebrow } from './SectionEyebrow';

export function TileRow({ icon, eyebrow, children }: { icon: LucideIcon; eyebrow: string; children: ReactNode }) {
  return (
    <section>
      <SectionEyebrow icon={icon}>{eyebrow}</SectionEyebrow>
      <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
        {children}
      </div>
    </section>
  );
}
```

**Step 4:** Run.

```bash
npm test -- TileRow
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/Tile.tsx src/components/dashboard/TileRow.tsx src/components/dashboard/__tests__/TileRow.test.tsx
git commit -m "feat(dashboard): Tile + TileRow shared shells"
```

---

## Task 4: SplitPanel + PanelPromo + PanelList shells

**Files:**
- Create: `src/components/dashboard/SplitPanel.tsx`
- Create: `src/components/dashboard/PanelPromo.tsx`
- Create: `src/components/dashboard/PanelList.tsx`
- Test: `src/components/dashboard/__tests__/SplitPanel.test.tsx`

**Step 1:** Write the failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { SplitPanel } from '../SplitPanel';
import { PanelPromo } from '../PanelPromo';
import { PanelList } from '../PanelList';

describe('SplitPanel', () => {
  it('renders eyebrow + left + right', () => {
    render(
      <SplitPanel
        icon={Calendar}
        eyebrow="Upcoming events"
        left={<PanelPromo title="Connect calendar" body="Calls in Notion" cta={{ href: '/x', label: 'Connect →' }} />}
        right={<PanelList rows={[{ id: '1', leading: 'Today', primary: 'Team standup', meta: '9 AM · Office' }]} />}
      />
    );
    expect(screen.getByText('Upcoming events')).toBeInTheDocument();
    expect(screen.getByText('Connect calendar')).toBeInTheDocument();
    expect(screen.getByText('Team standup')).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- SplitPanel
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// SplitPanel.tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionEyebrow } from './SectionEyebrow';

export function SplitPanel({
  icon, eyebrow, left, right,
}: { icon: LucideIcon; eyebrow: string; left: ReactNode; right: ReactNode }) {
  return (
    <section>
      <SectionEyebrow icon={icon}>{eyebrow}</SectionEyebrow>
      <div className="grid grid-cols-[minmax(220px,280px)_1fr] gap-px overflow-hidden rounded-xl bg-[var(--color-glass)] backdrop-blur-[48px]">
        <div className="p-6">{left}</div>
        <div className="p-6">{right}</div>
      </div>
    </section>
  );
}
```

```tsx
// PanelPromo.tsx
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type Props = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  cta: { href: string; label: string };
};

export function PanelPromo({ icon: Icon, title, body, cta }: Props) {
  return (
    <div className="flex h-full flex-col justify-between">
      {Icon && <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />}
      <div className="mt-auto">
        <p className="text-[15px] font-medium text-foreground">{title}</p>
        {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
        <Link href={cta.href} className="mt-3 inline-block text-sm text-[var(--color-seeko-accent)] hover:underline">
          {cta.label}
        </Link>
      </div>
    </div>
  );
}
```

```tsx
// PanelList.tsx
import type { ReactNode } from 'react';

type Row = {
  id: string;
  leading?: ReactNode;
  primary: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
};

export function PanelList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id} className="flex items-baseline gap-4 text-sm">
          {r.leading && <span className="w-16 flex-shrink-0 text-xs text-muted-foreground">{r.leading}</span>}
          <span className="min-w-0 flex-1 text-foreground">{r.primary}</span>
          {r.meta && <span className="text-xs text-muted-foreground">{r.meta}</span>}
          {r.trailing && <span className="flex-shrink-0">{r.trailing}</span>}
        </li>
      ))}
    </ul>
  );
}
```

**Step 4:** Run.

```bash
npm test -- SplitPanel
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/SplitPanel.tsx src/components/dashboard/PanelPromo.tsx src/components/dashboard/PanelList.tsx src/components/dashboard/__tests__/SplitPanel.test.tsx
git commit -m "feat(dashboard): SplitPanel + PanelPromo + PanelList shells"
```

---

## Task 5: DashboardHero

**Files:**
- Create: `src/components/dashboard/DashboardHero.tsx`
- Test: `src/components/dashboard/__tests__/DashboardHero.test.tsx`

**Step 1:** Failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { DashboardHero } from '../DashboardHero';

describe('DashboardHero', () => {
  it('renders greeting + name', () => {
    render(<DashboardHero greeting="Good evening" name="Karti" />);
    expect(screen.getByText('Good evening, Karti')).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- DashboardHero
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// DashboardHero.tsx
export function DashboardHero({ greeting, name }: { greeting: string; name: string }) {
  return (
    <header className="mt-16 flex justify-center px-20">
      <h1 className="text-[30px] font-semibold leading-[1.2] text-foreground">
        {greeting}, {name}
      </h1>
    </header>
  );
}
```

**Step 4:** Run.

```bash
npm test -- DashboardHero
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/DashboardHero.tsx src/components/dashboard/__tests__/DashboardHero.test.tsx
git commit -m "feat(dashboard): DashboardHero"
```

---

## Task 6: `fetchRecentItems` data helper

**Files:**
- Modify: `src/lib/supabase/data.ts`
- Test: `src/lib/supabase/__tests__/fetchRecentItems.test.ts`

**Step 1:** Failing test (mock the Supabase client).

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchRecentItems } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({
            data: table === 'tasks'
              ? [{ id: 't1', name: 'Task one', updated_at: '2026-05-13T10:00:00Z' }]
              : table === 'docs'
                ? [{ id: 'd1', title: 'Doc one', updated_at: '2026-05-13T11:00:00Z' }]
                : [{ id: 'a1', name: 'Area one', updated_at: '2026-05-13T09:00:00Z' }],
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

describe('fetchRecentItems', () => {
  it('returns union of tasks/docs/areas sorted by updated_at desc, capped at limit', async () => {
    const items = await fetchRecentItems('user-1', 3);
    expect(items.map((i) => i.id)).toEqual(['d1', 't1', 'a1']);
    expect(items[0]).toMatchObject({ kind: 'doc', title: 'Doc one', href: '/docs/d1' });
    expect(items[1]).toMatchObject({ kind: 'task', title: 'Task one', href: '/tasks/t1' });
    expect(items[2]).toMatchObject({ kind: 'area', title: 'Area one', href: '/areas/a1' });
  });
});
```

**Step 2:** Run.

```bash
npm test -- fetchRecentItems
```

Expected: FAIL.

**Step 3:** Implement in `src/lib/supabase/data.ts`. Append:

```ts
export type RecentItem = {
  id: string;
  kind: 'task' | 'doc' | 'area';
  title: string;
  updated_at: string;
  href: string;
};

export async function fetchRecentItems(userId: string, limit = 6): Promise<RecentItem[]> {
  const supabase = await createClient();
  const [{ data: tasks }, { data: docs }, { data: areas }] = await Promise.all([
    supabase.from('tasks').select('id, name, updated_at').order('updated_at', { ascending: false }).limit(limit),
    supabase.from('docs').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(limit),
    supabase.from('areas').select('id, name, updated_at').order('updated_at', { ascending: false }).limit(limit),
  ]);
  const items: RecentItem[] = [
    ...(tasks ?? []).map((t) => ({ id: t.id, kind: 'task' as const, title: t.name, updated_at: t.updated_at, href: `/tasks/${t.id}` })),
    ...(docs ?? []).map((d) => ({ id: d.id, kind: 'doc' as const, title: d.title, updated_at: d.updated_at, href: `/docs/${d.id}` })),
    ...(areas ?? []).map((a) => ({ id: a.id, kind: 'area' as const, title: a.name, updated_at: a.updated_at, href: `/areas/${a.id}` })),
  ];
  return items
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
}
```

`userId` param accepted but ignored for v1 — included so we don't change the signature when filtering goes in.

**Step 4:** Run.

```bash
npm test -- fetchRecentItems
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/lib/supabase/data.ts src/lib/supabase/__tests__/fetchRecentItems.test.ts
git commit -m "feat(data): fetchRecentItems union helper"
```

---

## Task 7: RecentItemsRow

**Files:**
- Create: `src/components/dashboard/RecentItemsRow.tsx`
- Test: `src/components/dashboard/__tests__/RecentItemsRow.test.tsx`

**Step 1:** Failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { RecentItemsRow } from '../RecentItemsRow';

describe('RecentItemsRow', () => {
  it('renders eyebrow + tiles', () => {
    render(<RecentItemsRow items={[
      { id: '1', kind: 'task', title: 'Wire up auth', updated_at: '2026-05-13T10:00:00Z', href: '/tasks/1' },
      { id: '2', kind: 'doc', title: 'Studio brief', updated_at: '2026-05-12T10:00:00Z', href: '/docs/2' },
    ]} />);
    expect(screen.getByText('Recently worked on')).toBeInTheDocument();
    expect(screen.getByText('Wire up auth')).toBeInTheDocument();
    expect(screen.getByText('Studio brief')).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- RecentItemsRow
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// RecentItemsRow.tsx
import { Clock, CheckSquare, FileText, Map } from 'lucide-react';
import { TileRow } from './TileRow';
import { Tile } from './Tile';
import type { RecentItem } from '@/lib/supabase/data';

const kindIcon = { task: CheckSquare, doc: FileText, area: Map } as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return 'Today';
  if (diff < day * 2) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentItemsRow({ items }: { items: RecentItem[] }) {
  if (items.length === 0) return null;
  return (
    <TileRow icon={Clock} eyebrow="Recently worked on">
      {items.map((item) => (
        <Tile
          key={item.id}
          href={item.href}
          icon={kindIcon[item.kind]}
          title={item.title}
          subtitle={timeAgo(item.updated_at)}
        />
      ))}
    </TileRow>
  );
}
```

**Step 4:** Run.

```bash
npm test -- RecentItemsRow
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/RecentItemsRow.tsx src/components/dashboard/__tests__/RecentItemsRow.test.tsx
git commit -m "feat(dashboard): RecentItemsRow"
```

---

## Task 8: `fetchTodayTasks` data helper

**Files:**
- Modify: `src/lib/supabase/data.ts`
- Test: `src/lib/supabase/__tests__/fetchTodayTasks.test.ts`

**Step 1:** Failing test.

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchTodayTasks } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => ({
            limit: () => Promise.resolve({
              data: [
                { id: 't1', name: 'Today task', priority: 'High', deadline: '2026-05-14', status: 'In Progress', department: 'Coding' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  })),
}));

describe('fetchTodayTasks', () => {
  it('returns top open tasks limited', async () => {
    const tasks = await fetchTodayTasks(5);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Today task');
  });
});
```

**Step 2:** Run.

```bash
npm test -- fetchTodayTasks
```

Expected: FAIL.

**Step 3:** Implement. Append to `src/lib/supabase/data.ts`:

```ts
export async function fetchTodayTasks(limit = 5): Promise<Task[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .in('status', ['In Progress', 'In Review'])
    .order('priority', { ascending: false })
    .limit(limit);
  return (data ?? []) as Task[];
}
```

**Step 4:** Run.

```bash
npm test -- fetchTodayTasks
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/lib/supabase/data.ts src/lib/supabase/__tests__/fetchTodayTasks.test.ts
git commit -m "feat(data): fetchTodayTasks helper"
```

---

## Task 9: TodaysTasksPanel

**Files:**
- Create: `src/components/dashboard/TodaysTasksPanel.tsx`
- Test: `src/components/dashboard/__tests__/TodaysTasksPanel.test.tsx`

**Step 1:** Failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { TodaysTasksPanel } from '../TodaysTasksPanel';

const tasks = [
  { id: 't1', name: 'Wire passkey flow', priority: 'High', status: 'In Progress', department: 'Coding' },
] as any;

describe('TodaysTasksPanel', () => {
  it('renders eyebrow + task rows + cta', () => {
    render(<TodaysTasksPanel tasks={tasks} totalOpen={12} />);
    expect(screen.getByText("Today's tasks")).toBeInTheDocument();
    expect(screen.getByText('Wire passkey flow')).toBeInTheDocument();
    expect(screen.getByText(/View all tasks/)).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- TodaysTasksPanel
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// TodaysTasksPanel.tsx
import { ListTodo, ChevronsUp, ChevronUp, ChevronDown } from 'lucide-react';
import type { Task } from '@/lib/types';
import { SplitPanel } from './SplitPanel';
import { PanelPromo } from './PanelPromo';
import { PanelList } from './PanelList';

const priorityIcon = { high: ChevronsUp, medium: ChevronUp, low: ChevronDown } as const;

export function TodaysTasksPanel({ tasks, totalOpen }: { tasks: Task[]; totalOpen: number }) {
  return (
    <SplitPanel
      icon={ListTodo}
      eyebrow="Today's tasks"
      left={
        <PanelPromo
          title={`${tasks.length} due soon`}
          body={`${totalOpen} open across the studio`}
          cta={{ href: '/tasks', label: 'View all tasks →' }}
        />
      }
      right={
        <PanelList
          rows={tasks.map((t) => {
            const Icon = priorityIcon[(t.priority ?? 'medium') as keyof typeof priorityIcon] ?? ChevronUp;
            return {
              id: t.id,
              leading: <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />,
              primary: t.name,
              meta: t.status,
            };
          })}
        />
      }
    />
  );
}
```

**Step 4:** Run.

```bash
npm test -- TodaysTasksPanel
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/TodaysTasksPanel.tsx src/components/dashboard/__tests__/TodaysTasksPanel.test.tsx
git commit -m "feat(dashboard): TodaysTasksPanel"
```

---

## Task 10: NextMilestonePanel

**Files:**
- Create: `src/components/dashboard/NextMilestonePanel.tsx`
- Test: `src/components/dashboard/__tests__/NextMilestonePanel.test.tsx`

**Step 1:** Failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { NextMilestonePanel } from '../NextMilestonePanel';

const areas = [
  { id: 'a1', name: 'Coding', phase: 'build', progress: 60, status: 'active', deadline: '2026-06-01' },
  { id: 'a2', name: 'Visual', phase: 'build', progress: 30, status: 'active', deadline: '2026-06-15' },
] as any;

describe('NextMilestonePanel', () => {
  it('renders eyebrow + phase + milestone rows', () => {
    render(<NextMilestonePanel areas={areas} />);
    expect(screen.getByText('Next milestone')).toBeInTheDocument();
    expect(screen.getByText(/build/i)).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- NextMilestonePanel
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// NextMilestonePanel.tsx
import { Calendar } from 'lucide-react';
import type { Area } from '@/lib/types';
import { SplitPanel } from './SplitPanel';
import { PanelPromo } from './PanelPromo';
import { PanelList } from './PanelList';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NextMilestonePanel({ areas }: { areas: Area[] }) {
  const phase = areas[0]?.phase ?? 'Studio plan';
  const dated = areas
    .filter((a): a is Area & { deadline: string } => Boolean((a as any).deadline))
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 4);

  return (
    <SplitPanel
      icon={Calendar}
      eyebrow="Next milestone"
      left={
        <PanelPromo
          title={phase}
          body={`${areas.length} areas in this phase`}
          cta={{ href: '/areas', label: 'Open phase plan →' }}
        />
      }
      right={
        <PanelList
          rows={dated.map((a) => ({
            id: a.id,
            leading: fmtDate(a.deadline),
            primary: a.name,
            meta: `${a.progress}%`,
          }))}
        />
      }
    />
  );
}
```

**Step 4:** Run.

```bash
npm test -- NextMilestonePanel
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/NextMilestonePanel.tsx src/components/dashboard/__tests__/NextMilestonePanel.test.tsx
git commit -m "feat(dashboard): NextMilestonePanel"
```

---

## Task 11: StudioProgressPanel

**Files:**
- Create: `src/components/dashboard/StudioProgressPanel.tsx`
- Test: `src/components/dashboard/__tests__/StudioProgressPanel.test.tsx`

**Step 1:** Failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { StudioProgressPanel } from '../StudioProgressPanel';

const areas = [
  { id: 'a1', name: 'Coding', progress: 72, status: 'active' },
  { id: 'a2', name: 'Visual', progress: 44, status: 'active' },
] as any;

describe('StudioProgressPanel', () => {
  it('renders eyebrow + area rows with progress', () => {
    render(<StudioProgressPanel areas={areas} />);
    expect(screen.getByText('Studio progress')).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- StudioProgressPanel
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// StudioProgressPanel.tsx
import { Gamepad2 } from 'lucide-react';
import type { Area } from '@/lib/types';
import { SplitPanel } from './SplitPanel';
import { PanelPromo } from './PanelPromo';
import { PanelList } from './PanelList';

export function StudioProgressPanel({ areas }: { areas: Area[] }) {
  const pinned = areas[0];
  return (
    <SplitPanel
      icon={Gamepad2}
      eyebrow="Studio progress"
      left={
        <PanelPromo
          title={pinned?.name ?? 'Studio'}
          body={`${areas.length} areas tracked`}
          cta={{ href: '/areas', label: 'Open studio →' }}
        />
      }
      right={
        <PanelList
          rows={areas.map((a) => ({
            id: a.id,
            primary: a.name,
            trailing: (
              <div className="flex items-center gap-2">
                <div className="h-1 w-20 rounded bg-muted">
                  <div className="h-full rounded bg-[var(--color-seeko-accent)]" style={{ width: `${a.progress}%` }} />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{a.progress}%</span>
              </div>
            ),
          }))}
        />
      }
    />
  );
}
```

**Step 4:** Run.

```bash
npm test -- StudioProgressPanel
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/StudioProgressPanel.tsx src/components/dashboard/__tests__/StudioProgressPanel.test.tsx
git commit -m "feat(dashboard): StudioProgressPanel"
```

---

## Task 12: AreaTileRow

**Files:**
- Create: `src/components/dashboard/AreaTileRow.tsx`
- Test: `src/components/dashboard/__tests__/AreaTileRow.test.tsx`

**Step 1:** Failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { AreaTileRow } from '../AreaTileRow';

const areas = [
  { id: 'a1', name: 'Coding', progress: 72, status: 'active' },
  { id: 'a2', name: 'Visual Art', progress: 44, status: 'active' },
] as any;

describe('AreaTileRow', () => {
  it('renders eyebrow + area tiles', () => {
    render(<AreaTileRow areas={areas} />);
    expect(screen.getByText('Game areas')).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
    expect(screen.getByText('Visual Art')).toBeInTheDocument();
  });
});
```

**Step 2:** Run.

```bash
npm test -- AreaTileRow
```

Expected: FAIL.

**Step 3:** Implement.

```tsx
// AreaTileRow.tsx
import Link from 'next/link';
import { Map } from 'lucide-react';
import type { Area } from '@/lib/types';
import { SectionEyebrow } from './SectionEyebrow';

export function AreaTileRow({ areas }: { areas: Area[] }) {
  return (
    <section>
      <SectionEyebrow icon={Map}>Game areas</SectionEyebrow>
      <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
        {areas.map((a) => (
          <Link
            key={a.id}
            href={`/areas/${a.id}`}
            className="group flex h-[140px] w-[200px] flex-shrink-0 snap-start flex-col justify-between rounded-xl bg-[var(--color-glass)] p-4 backdrop-blur-[48px] transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <p className="text-[15px] font-medium text-foreground">{a.name}</p>
            <div>
              <div className="h-1 w-full rounded bg-muted">
                <div className="h-full rounded bg-[var(--color-seeko-accent)]" style={{ width: `${a.progress}%` }} />
              </div>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">{a.progress}%</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

**Step 4:** Run.

```bash
npm test -- AreaTileRow
```

Expected: PASS.

**Step 5:** Commit.

```bash
git add src/components/dashboard/AreaTileRow.tsx src/components/dashboard/__tests__/AreaTileRow.test.tsx
git commit -m "feat(dashboard): AreaTileRow"
```

---

## Task 13: QuickNotesRow (admin only)

**Files:**
- Create: `src/components/dashboard/QuickNotesRow.tsx`
- Test: `src/components/dashboard/__tests__/QuickNotesRow.test.tsx`

**Step 1:** Read the existing `RailQuickNote.tsx` for composer logic.

**Step 2:** Failing test.

```tsx
import { render, screen } from '@testing-library/react';
import { QuickNotesRow } from '../QuickNotesRow';

const notes = [
  { id: 'n1', body: 'Mockup feedback for coding HUD', updated_at: '2026-05-14T08:00:00Z' },
  { id: 'n2', body: 'Email Olla about residency', updated_at: '2026-05-13T08:00:00Z' },
] as any;

describe('QuickNotesRow', () => {
  it('renders eyebrow + note tiles', () => {
    render(<QuickNotesRow notes={notes} />);
    expect(screen.getByText('Quick notes')).toBeInTheDocument();
    expect(screen.getByText(/Mockup feedback/)).toBeInTheDocument();
  });
});
```

**Step 3:** Run.

```bash
npm test -- QuickNotesRow
```

Expected: FAIL.

**Step 4:** Implement. Pull composer trigger from `RailQuickNote` (it stays as a child component) into a 4th "Add note" tile.

```tsx
// QuickNotesRow.tsx — sketch; final form depends on RailQuickNote API
import { StickyNote } from 'lucide-react';
import { SectionEyebrow } from './SectionEyebrow';
import type { QuickNote } from '@/lib/types';

export function QuickNotesRow({ notes }: { notes: QuickNote[] }) {
  return (
    <section>
      <SectionEyebrow icon={StickyNote}>Quick notes</SectionEyebrow>
      <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
        {notes.map((n) => (
          <article key={n.id} className="flex h-[140px] w-[200px] flex-shrink-0 snap-start flex-col rounded-xl bg-[var(--color-glass)] p-4 backdrop-blur-[48px]">
            <p className="line-clamp-4 text-sm text-foreground">{n.body}</p>
            <time className="mt-auto text-xs text-muted-foreground">
              {new Date(n.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </time>
          </article>
        ))}
        {/* TODO: 4th tile = add-note trigger using existing composer logic */}
      </div>
    </section>
  );
}
```

**Step 5:** Run.

```bash
npm test -- QuickNotesRow
```

Expected: PASS.

**Step 6:** Commit.

```bash
git add src/components/dashboard/QuickNotesRow.tsx src/components/dashboard/__tests__/QuickNotesRow.test.tsx
git commit -m "feat(dashboard): QuickNotesRow shell"
```

(Composer integration happens in Task 16 when we retire `RailQuickNote`.)

---

## Task 14: Compose new `page.tsx` with storyboard

**Files:**
- Modify: `src/app/(dashboard)/page.tsx` (full rewrite)

**Step 1:** Read current `page.tsx` to capture greeting helper, auth-role lookup, area/task fetches.

**Step 2:** Rewrite. Structure:

```tsx
// page.tsx
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   hero
 *  120ms   recently worked on  (stagger 40ms)
 *  240ms   today's tasks
 *  320ms   next milestone
 *  400ms   studio progress
 *  480ms   game areas          (stagger 50ms)
 *  560ms   quick notes         (stagger 50ms)
 * ───────────────────────────────────────────────────────── */
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  fetchAreas,
  fetchRecentItems,
  fetchTasks,
  fetchTodayTasks,
  fetchQuickNotes, // existing
} from '@/lib/supabase/data';
import { buildGreeting } from '@/lib/greeting'; // existing helper
import { isAdmin } from '@/lib/auth'; // existing
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { RecentItemsRow } from '@/components/dashboard/RecentItemsRow';
import { TodaysTasksPanel } from '@/components/dashboard/TodaysTasksPanel';
import { NextMilestonePanel } from '@/components/dashboard/NextMilestonePanel';
import { StudioProgressPanel } from '@/components/dashboard/StudioProgressPanel';
import { AreaTileRow } from '@/components/dashboard/AreaTileRow';
import { QuickNotesRow } from '@/components/dashboard/QuickNotesRow';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion/FadeRise'; // existing

const TIMING = {
  hero: 0,
  recent: 120,
  recentStagger: 40,
  todaysTasks: 240,
  milestone: 320,
  progress: 400,
  areas: 480,
  areasStagger: 50,
  quickNotes: 560,
  quickNotesStagger: 50,
} as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = await isAdmin(user.id);
  const [recent, todayTasks, totalOpen, areas, quickNotes] = await Promise.all([
    fetchRecentItems(user.id, 6),
    fetchTodayTasks(5),
    fetchTasks().then((t) => t.length),
    fetchAreas(),
    admin ? fetchQuickNotes() : Promise.resolve([]),
  ]);

  const { greeting, name } = await buildGreeting(user.id);

  return (
    <main className="mx-auto flex max-w-[900px] flex-col gap-10 px-6 py-20">
      <FadeRise delayMs={TIMING.hero} y={20}>
        <DashboardHero greeting={greeting} name={name} />
      </FadeRise>

      <FadeRise delayMs={TIMING.recent}>
        <RecentItemsRow items={recent} />
      </FadeRise>

      <FadeRise delayMs={TIMING.todaysTasks}>
        <TodaysTasksPanel tasks={todayTasks} totalOpen={totalOpen} />
      </FadeRise>

      <FadeRise delayMs={TIMING.milestone}>
        <NextMilestonePanel areas={areas} />
      </FadeRise>

      <FadeRise delayMs={TIMING.progress}>
        <StudioProgressPanel areas={areas} />
      </FadeRise>

      <FadeRise delayMs={TIMING.areas}>
        <AreaTileRow areas={areas} />
      </FadeRise>

      {admin && (
        <FadeRise delayMs={TIMING.quickNotes}>
          <QuickNotesRow notes={quickNotes} />
        </FadeRise>
      )}
    </main>
  );
}
```

**Step 3:** Build + run dev.

```bash
npm run build
```

Expected: build succeeds.

**Step 4:** Manually QA on dev server (started from main repo after sync — see Task 17).

**Step 5:** Commit.

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat(dashboard): centered-column page composition + storyboard"
```

---

## Task 15: Retire old rail components

**Files:**
- Delete: `src/components/dashboard/DashboardRail.tsx`
- Delete: `src/components/dashboard/RailNextMilestone.tsx`
- Delete: `src/components/dashboard/RailStudioProgress.tsx`
- Delete: `src/components/dashboard/RailRecentActivity.tsx`
- Delete: `src/components/dashboard/RailQuickNote.tsx` (only after extracting composer trigger into `QuickNotesRow`)
- Delete the old stat-pills row component

**Step 1:** Grep for references to each before deleting.

```bash
grep -rn "DashboardRail\|RailNextMilestone\|RailStudioProgress\|RailRecentActivity\|RailQuickNote" src/
```

**Step 2:** Confirm only `page.tsx` (already rewritten) and component tests reference them.

**Step 3:** Delete files + their test files.

**Step 4:** Build.

```bash
npm run build && npm test
```

Expected: both pass.

**Step 5:** Commit.

```bash
git add -u src/components/dashboard/
git commit -m "chore(dashboard): retire right-rail components"
```

---

## Task 16: Pre-merge `/interface-craft critique`

**Files:** none (manual)

**Step 1:** Start dev server in main repo (after syncing — see Task 17). Take screenshots of the rendered dashboard.

**Step 2:** Invoke `/interface-craft critique` on each screenshot. Surface:
- Spacing: 40px gaps end-to-end?
- Typography: eyebrows 12/500, hero 30/600?
- Contrast: panels readable on radial-gradient BG?
- Alignment: tiles snap-aligned, list rows form vertical lanes?
- Glass: backdrop-blur visible against the gradient BG?
- Motion: storyboard timing reads correctly on first paint?

**Step 3:** Address findings. Each fix = a fix-up commit.

**Step 4:** Mark plan task 56 (Implement + post-implementation critique) complete only when critique returns no structural or behavioral issues.

---

## Task 17: Sync worktree → main and QA

**Files:** none (mechanical)

**Step 1:** Stop the dev server running from main repo.

**Step 2:** Switch main repo to `feat/dashboard-paper-redesign` so the dev server picks up the new code:

```bash
cd /Volumes/CODEUSER/seeko-studio
git checkout feat/dashboard-paper-redesign
npm run dev
```

**Step 3:** Hard-refresh `http://localhost:3000` after logging in. Walk through each section.

**Step 4:** If QA passes, merge to `feat/studio-agents`:

```bash
git checkout feat/studio-agents
git merge --no-ff feat/dashboard-paper-redesign
```

**Step 5:** Push (only after explicit user approval — never auto-push).

---

## Remember

- Exact file paths always.
- TDD on data helpers, smoke tests on components.
- One commit per task. Sign with Co-Authored-By line.
- Run `/interface-craft critique` after Task 16 — mandatory before declaring done.
- `prefers-reduced-motion: reduce` must be honored across all motion code.
- No uppercase-tracked eyebrows. Anywhere. Ever.
- Dev server runs from main repo — when QA-ing, either switch main to this branch or merge first.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-14-dashboard-paper-redesign.md`. Two execution options:

1. **Subagent-Driven (this session)** — dispatch fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — open a new session with `superpowers:executing-plans`, batch execution with checkpoints.
