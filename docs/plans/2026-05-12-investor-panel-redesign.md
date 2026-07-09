# Investor Panel Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework `/investor` so it answers all four investor questions (is progress happening · where is risk · when will it ship · where is my money going) in one coherent top-to-bottom narrative.

**Architecture:** Three named narrative sections (Where we are · Where we're going · What it cost) replace the current KPI grid. Activity feed demoted to a collapsed footer. Schema gains a nullable `areas.target_date date` column. Investor RLS on payments widens to include `pending`. PDF export route replaced with a three-tab `.xlsx` workbook (exceljs).

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · Supabase Postgres · motion/react (`FadeRise`, `Stagger`, `HoverCard`) · Vitest · exceljs (new dependency).

**Design source:** `docs/plans/2026-05-12-investor-panel-redesign-design.md` (v2 — incorporates reviewer / IA / designer agent findings).

---

## Pre-flight

- [ ] Confirm a dev server is running on `http://localhost:3000` against the **main** repo (per Worktree ↔ Main Sync Rule — dev server runs from main, not worktrees).
- [ ] Confirm Supabase migrations directory is `supabase/migrations/`.
- [ ] Confirm Vitest is wired: `npm test` runs the suite.

---

### Task 1: Schema migration — add `areas.target_date`

**Files:**
- Create: `supabase/migrations/20260512000001_areas_target_date.sql`
- Modify: `docs/supabase-schema.sql` (mirror the column addition)
- Modify: `src/lib/types.ts` (lines 25-33, `Area` type)

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260512000001_areas_target_date.sql
alter table public.areas add column if not exists target_date date;
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or via Supabase MCP `apply_migration`)
Expected: migration applies cleanly; re-running is a no-op (idempotent).

**Step 3: Mirror in `docs/supabase-schema.sql`**

Locate the `create table public.areas` block. Add the line:

```sql
  target_date date,
```

immediately after the `phase area_phase,` line.

**Step 4: Update the `Area` TypeScript type**

In `src/lib/types.ts:25-33`, replace:

```ts
export type Area = {
  id: string;
  name: string;
  status: string;
  progress: number;
  description?: string;
  phase?: string;
  sort_order?: number;
};
```

with:

```ts
export type Area = {
  id: string;
  name: string;
  status: string;
  progress: number;
  description?: string;
  phase?: string;
  sort_order?: number;
  target_date?: string; // ISO YYYY-MM-DD; null/undefined renders as "TBD"
};
```

**Step 5: Add `target_date` to `fetchAreas` select clause**

In `src/lib/supabase/data.ts:37`, replace:

```ts
.select('id, name, status, progress, description, phase, created_at, sort_order')
```

with:

```ts
.select('id, name, status, progress, description, phase, created_at, sort_order, target_date')
```

**Step 6: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 7: Commit**

```bash
git add supabase/migrations/20260512000001_areas_target_date.sql docs/supabase-schema.sql src/lib/types.ts src/lib/supabase/data.ts
git commit -m "feat(investor): add areas.target_date for ship forecast"
```

---

### Task 2: Schema migration — widen investor payments RLS to paid+pending

**Files:**
- Create: `supabase/migrations/20260512000002_investor_pending_payments_rls.sql`
- Modify: `docs/supabase-schema.sql` (mirror policy)

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260512000002_investor_pending_payments_rls.sql
drop policy if exists "Investors can read paid payments" on public.payments;

create policy "Investors can read paid and pending payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and (profiles.is_investor = true or profiles.is_admin = true)
    )
    and status in ('paid', 'pending')
  );
```

> Verify the predicate matches the existing helper or `is_investor`/`is_admin` check pattern used elsewhere in `supabase/migrations/`. If a helper like `is_investor_or_admin()` already exists (grep first), use it instead of the inline `exists` block.

**Step 2: Grep for the existing helper**

Run: `grep -rn "is_investor_or_admin\|is_admin_or_investor" supabase/migrations/`
- If a helper exists → rewrite the policy `using` clause to use it.
- If not → keep the inline `exists` predicate.

**Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: old policy dropped, new policy created.

**Step 4: Smoke-test the policy in SQL editor**

```sql
-- As an investor user, this should now return both 'paid' AND 'pending' rows:
select status, count(*) from public.payments group by status;
```

**Step 5: Mirror policy in `docs/supabase-schema.sql`**

Replace the old `"Investors can read paid payments"` policy block with the new one.

**Step 6: Commit**

```bash
git add supabase/migrations/20260512000002_investor_pending_payments_rls.sql docs/supabase-schema.sql
git commit -m "feat(investor): widen RLS to surface pending payments"
```

---

### Task 3: `fetchPaymentsSummary` data function

**Files:**
- Modify: `src/lib/supabase/data.ts` (append new function)
- Create: `src/lib/supabase/__tests__/fetchPaymentsSummary.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/supabase/__tests__/fetchPaymentsSummary.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPaymentsSummary } from '../data';

vi.mock('../server', () => ({
  createClient: vi.fn(),
}));

describe('fetchPaymentsSummary', () => {
  it('returns zeros and empty recent when ledger is empty', async () => {
    const { createClient } = await import('../server');
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockEmptySupabase());

    const result = await fetchPaymentsSummary();
    expect(result.paidTotal).toBe(0);
    expect(result.pendingTotal).toBe(0);
    expect(result.recent).toEqual([]);
  });

  it('sums paid and pending separately via SQL aggregation', async () => {
    const { createClient } = await import('../server');
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabaseWithTotals({ paid: 12400, pending: 1800 })
    );

    const result = await fetchPaymentsSummary();
    expect(result.paidTotal).toBe(12400);
    expect(result.pendingTotal).toBe(1800);
  });

  it('returns 3 most-recent payments with nested recipient', async () => {
    const { createClient } = await import('../server');
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSupabaseWithRecent([
        { id: '1', description: 'Concept art', amount: 500, status: 'paid', created_at: '2026-05-10', recipient: { id: 'u1', display_name: 'Alice' } },
        { id: '2', description: 'Animation', amount: 1200, status: 'pending', created_at: '2026-05-09', recipient: { id: 'u2', display_name: 'Bob' } },
        { id: '3', description: 'UI polish', amount: 300, status: 'paid', created_at: '2026-05-08', recipient: { id: 'u3', display_name: 'Carol' } },
      ])
    );

    const result = await fetchPaymentsSummary();
    expect(result.recent).toHaveLength(3);
    expect(result.recent[0].recipient.display_name).toBe('Alice');
  });
});

// Minimal mock helpers — tighten to match the actual Supabase chain shape during impl.
function mockEmptySupabase() { /* fill in step 3 */ }
function mockSupabaseWithTotals(_: { paid: number; pending: number }) { /* fill in step 3 */ }
function mockSupabaseWithRecent(_: unknown[]) { /* fill in step 3 */ }
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/supabase/__tests__/fetchPaymentsSummary.test.ts`
Expected: FAIL — `fetchPaymentsSummary is not exported from '../data'`.

**Step 3: Implement `fetchPaymentsSummary`**

Append to `src/lib/supabase/data.ts`:

```ts
export async function fetchPaymentsSummary(): Promise<{
  paidTotal: number;
  pendingTotal: number;
  recent: Array<{
    id: string;
    description: string;
    amount: number;
    status: 'pending' | 'paid';
    created_at: string;
    recipient: Pick<Profile, 'id' | 'display_name'>;
  }>;
}> {
  const supabase = await createClient();

  const [paidAgg, pendingAgg, recent] = await Promise.all([
    supabase.from('payments').select('amount').eq('status', 'paid'),
    supabase.from('payments').select('amount').eq('status', 'pending'),
    supabase
      .from('payments')
      .select('id, description, amount, status, created_at, recipient:profiles!payments_recipient_id_fkey(id, display_name)')
      .in('status', ['paid', 'pending'])
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const sumAmount = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.amount), 0);

  return {
    paidTotal: sumAmount(paidAgg.data),
    pendingTotal: sumAmount(pendingAgg.data),
    recent: (recent.data ?? []) as Array<{
      id: string;
      description: string;
      amount: number;
      status: 'pending' | 'paid';
      created_at: string;
      recipient: Pick<Profile, 'id' | 'display_name'>;
    }>,
  };
}
```

> NOTE: Supabase `amount.sum()` is technically supported but the existing codebase uses `count: 'exact', head: true` for counts and JS-side sums for monetary totals (small N). Stay consistent with the prevailing pattern: fetch `amount` rows filtered by status, sum in JS. Re-evaluate if payment volume exceeds ~10k rows.

**Step 4: Fill in the test mock helpers**

In the test file, implement `mockEmptySupabase`, `mockSupabaseWithTotals`, `mockSupabaseWithRecent` to return the Supabase chain shape (`from().select().eq()` etc.) with the right data shape.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/supabase/__tests__/fetchPaymentsSummary.test.ts`
Expected: 3 PASS.

**Step 6: Commit**

```bash
git add src/lib/supabase/data.ts src/lib/supabase/__tests__/fetchPaymentsSummary.test.ts
git commit -m "feat(investor): add fetchPaymentsSummary aggregate query"
```

---

### Task 4: `InvestorWhereWeAre` component

**Files:**
- Create: `src/components/dashboard/InvestorWhereWeAre.tsx`
- Create: `src/components/dashboard/__tests__/InvestorWhereWeAre.test.tsx`
- Reference (extract from): `src/components/dashboard/InvestorKPIStrip.tsx` — copy `LargeProgressRing` and the completion-edit Dialog.

**Step 1: Write the failing tests**

```tsx
// src/components/dashboard/__tests__/InvestorWhereWeAre.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestorWhereWeAre } from '../InvestorWhereWeAre';

const mockAreas = [
  { id: 'a1', name: 'Main Game', status: 'Active', progress: 62, phase: 'Beta' },
  { id: 'a2', name: 'Fighting Club', status: 'Active', progress: 34, phase: 'Alpha' },
];

describe('InvestorWhereWeAre', () => {
  it('renders completion ring with overall percentage', () => {
    render(<InvestorWhereWeAre areas={mockAreas} isAdmin={false} />);
    expect(screen.getByText('48%')).toBeInTheDocument(); // (62 + 34) / 2 rounded
  });

  it('renders one row per area with name and progress', () => {
    render(<InvestorWhereWeAre areas={mockAreas} isAdmin={false} />);
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Fighting Club')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('34%')).toBeInTheDocument();
  });

  it('renders empty state when areas list is empty', () => {
    render(<InvestorWhereWeAre areas={[]} isAdmin={false} />);
    expect(screen.getByText(/no areas/i)).toBeInTheDocument();
  });

  it('does NOT wrap the ring in a button for non-admin viewers', () => {
    render(<InvestorWhereWeAre areas={mockAreas} isAdmin={false} />);
    expect(screen.queryByRole('button', { name: /edit completion/i })).toBeNull();
  });

  it('wraps the ring in an editable trigger for admins', () => {
    render(<InvestorWhereWeAre areas={mockAreas} isAdmin={true} />);
    expect(screen.getByRole('button', { name: /edit completion/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorWhereWeAre.test.tsx`
Expected: FAIL — component does not exist.

**Step 3: Implement `InvestorWhereWeAre`**

```tsx
// src/components/dashboard/InvestorWhereWeAre.tsx
'use client';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { CompletionEditDialog } from './CompletionEditDialog'; // extracted from InvestorKPIStrip in this task
import { LargeProgressRing } from './LargeProgressRing';     // extracted from InvestorKPIStrip in this task
import type { Area } from '@/lib/types';

type Props = {
  areas: Area[];
  isAdmin: boolean;
};

export function InvestorWhereWeAre({ areas, isAdmin }: Props) {
  const overall = areas.length === 0
    ? 0
    : Math.round(areas.reduce((acc, a) => acc + (a.progress ?? 0), 0) / areas.length);

  return (
    <Card>
      <CardContent className="flex flex-col md:flex-row gap-8 p-6">
        <div className="flex-shrink-0 flex flex-col items-center md:items-start">
          {isAdmin ? (
            <CompletionEditDialog areas={areas} trigger={
              <button aria-label="Edit completion" className="cursor-pointer">
                <LargeProgressRing value={overall} radius={72} />
              </button>
            } />
          ) : (
            <LargeProgressRing value={overall} radius={72} />
          )}
          <p className="text-xs text-muted-foreground mt-3 tabular-nums">{overall}% complete</p>
        </div>

        <div className="flex-1 min-w-0">
          {areas.length === 0 ? (
            <EmptyState title="No areas yet" description="Areas will appear here once added." />
          ) : (
            <Stagger className="flex flex-col gap-3">
              {areas.map((area) => (
                <StaggerItem key={area.id}>
                  <AreaProgressRow area={area} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AreaProgressRow({ area }: { area: Area }) {
  const pct = area.progress ?? 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-foreground min-w-[10ch] truncate">{area.name}</span>
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-[--color-seeko-accent] transition-[width] duration-[400ms] ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground min-w-[3ch] text-right">{pct}%</span>
      {area.phase && (
        <span className="text-[10px] text-muted-foreground tracking-tight">{area.phase}</span>
      )}
    </div>
  );
}
```

> The `LargeProgressRing` and `CompletionEditDialog` components live in `InvestorKPIStrip.tsx` today. Extract each into its own file (`src/components/dashboard/LargeProgressRing.tsx`, `src/components/dashboard/CompletionEditDialog.tsx`) as part of this task so both old (until deletion in Task 10) and new components can import from a single source of truth.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorWhereWeAre.test.tsx`
Expected: 5 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/InvestorWhereWeAre.tsx src/components/dashboard/__tests__/InvestorWhereWeAre.test.tsx src/components/dashboard/LargeProgressRing.tsx src/components/dashboard/CompletionEditDialog.tsx
git commit -m "feat(investor): add Where We Are section (ring + per-area progress)"
```

---

### Task 5: `InvestorPhaseCard` component

**Files:**
- Create: `src/components/dashboard/InvestorPhaseCard.tsx`
- Create: `src/components/dashboard/__tests__/InvestorPhaseCard.test.tsx`

**Step 1: Write the failing tests**

```tsx
// src/components/dashboard/__tests__/InvestorPhaseCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestorPhaseCard } from '../InvestorPhaseCard';

describe('InvestorPhaseCard', () => {
  it('renders area name and formatted target_date', () => {
    render(<InvestorPhaseCard name="Main Game" targetDate="2026-06-15" tasksComplete={8} tasksTotal={12} />);
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Jun 15')).toBeInTheDocument();
    expect(screen.getByText('8 of 12 tasks complete')).toBeInTheDocument();
  });

  it('renders "TBD" when target_date is null', () => {
    render(<InvestorPhaseCard name="Fighting Club" targetDate={null} tasksComplete={2} tasksTotal={5} />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  it('renders past dates in the blocked status color', () => {
    render(<InvestorPhaseCard name="Main Game" targetDate="2020-01-01" tasksComplete={1} tasksTotal={1} isPast />);
    const dateEl = screen.getByText(/Jan 1, 2020|Jan 1/);
    expect(dateEl.className).toMatch(/text-status-blocked|text-\[--color-status-blocked\]/);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorPhaseCard.test.tsx`
Expected: FAIL — component does not exist.

**Step 3: Implement `InvestorPhaseCard`**

```tsx
// src/components/dashboard/InvestorPhaseCard.tsx
'use client';
import { HoverCard } from '@/components/motion';
import { cn } from '@/lib/utils';

type Props = {
  name: string;
  targetDate: string | null;
  tasksComplete: number;
  tasksTotal: number;
  isPast?: boolean;
};

export function InvestorPhaseCard({ name, targetDate, tasksComplete, tasksTotal, isPast }: Props) {
  const formatted = targetDate
    ? new Date(targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'TBD';

  return (
    <HoverCard>
      <div className="rounded-md border border-border bg-card p-3 flex flex-col gap-1">
        <span className="text-sm text-foreground">{name}</span>
        <span className={cn(
          'text-xs tabular-nums',
          isPast ? 'text-[--color-status-blocked]' : 'text-muted-foreground'
        )}>
          {formatted}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {tasksComplete} of {tasksTotal} tasks complete
        </span>
      </div>
    </HoverCard>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorPhaseCard.test.tsx`
Expected: 3 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/InvestorPhaseCard.tsx src/components/dashboard/__tests__/InvestorPhaseCard.test.tsx
git commit -m "feat(investor): add phase-timeline card primitive"
```

---

### Task 6: `InvestorWhereWereGoing` component

**Files:**
- Create: `src/components/dashboard/InvestorWhereWereGoing.tsx`
- Create: `src/components/dashboard/__tests__/InvestorWhereWereGoing.test.tsx`

**Step 1: Write the failing tests**

```tsx
// src/components/dashboard/__tests__/InvestorWhereWereGoing.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestorWhereWereGoing } from '../InvestorWhereWereGoing';

const tasksPerArea = { a1: { complete: 8, total: 12 }, a2: { complete: 2, total: 5 } };

describe('InvestorWhereWereGoing', () => {
  it('renders three phase headers (Alpha, Beta, Launch)', () => {
    render(<InvestorWhereWereGoing areas={[]} tasksPerArea={tasksPerArea} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Launch')).toBeInTheDocument();
  });

  it('pins area cards to their phase column', () => {
    render(<InvestorWhereWereGoing
      areas={[
        { id: 'a1', name: 'Main Game', status: 'Active', progress: 60, phase: 'Beta', target_date: '2026-06-15' },
        { id: 'a2', name: 'Fighting Club', status: 'Active', progress: 30, phase: 'Alpha', target_date: '2026-08-01' },
      ]}
      tasksPerArea={tasksPerArea}
    />);
    // Both cards render; alignment under correct header verified via data-phase attribute.
    expect(screen.getByText('Main Game').closest('[data-phase]')?.getAttribute('data-phase')).toBe('Beta');
    expect(screen.getByText('Fighting Club').closest('[data-phase]')?.getAttribute('data-phase')).toBe('Alpha');
  });

  it('pins the soonest-date marker to the correct phase column', () => {
    render(<InvestorWhereWereGoing
      areas={[
        { id: 'a1', name: 'A', status: 'Active', progress: 0, phase: 'Beta', target_date: '2026-09-01' },
        { id: 'a2', name: 'B', status: 'Active', progress: 0, phase: 'Alpha', target_date: '2026-06-01' },
      ]}
      tasksPerArea={tasksPerArea}
    />);
    const marker = screen.getByTestId('timeline-marker');
    expect(marker.getAttribute('data-marker-phase')).toBe('Alpha');
  });

  it('renders no marker when all target_dates are null', () => {
    render(<InvestorWhereWereGoing
      areas={[
        { id: 'a1', name: 'A', status: 'Active', progress: 0, phase: 'Alpha' },
        { id: 'a2', name: 'B', status: 'Active', progress: 0, phase: 'Beta' },
      ]}
      tasksPerArea={tasksPerArea}
    />);
    expect(screen.queryByTestId('timeline-marker')).toBeNull();
    expect(screen.getByText(/no ship dates set/i)).toBeInTheDocument();
  });

  it('renders a connector stroke across all three headers', () => {
    render(<InvestorWhereWereGoing areas={[]} tasksPerArea={tasksPerArea} />);
    expect(screen.getByTestId('phase-connector')).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorWhereWereGoing.test.tsx`
Expected: FAIL — component does not exist.

**Step 3: Implement `InvestorWhereWereGoing`**

```tsx
// src/components/dashboard/InvestorWhereWereGoing.tsx
'use client';
import { Card, CardContent } from '@/components/ui/card';
import { InvestorPhaseCard } from './InvestorPhaseCard';
import type { Area } from '@/lib/types';

const PHASES = ['Alpha', 'Beta', 'Launch'] as const;
type Phase = (typeof PHASES)[number];

type Props = {
  areas: Area[];
  tasksPerArea: Record<string, { complete: number; total: number }>;
};

export function InvestorWhereWereGoing({ areas, tasksPerArea }: Props) {
  const datedAreas = areas.filter(a => a.target_date);
  const soonest = datedAreas.length
    ? datedAreas.reduce((acc, a) => (!acc || a.target_date! < acc.target_date! ? a : acc), null as Area | null)
    : null;
  const markerPhase = soonest?.phase as Phase | undefined;
  const allNullDates = datedAreas.length === 0;

  return (
    <Card>
      <CardContent className="p-6 flex flex-col gap-6">
        {/* Desktop: 3-column grid with connector */}
        <div className="hidden md:grid grid-cols-3 gap-6 relative">
          <div data-testid="phase-connector" className="absolute top-3 left-[8%] right-[8%] h-px bg-border" />
          {PHASES.map((phase) => {
            const isMarker = markerPhase === phase;
            return (
              <div key={phase} className="flex flex-col gap-3 relative">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground tracking-tight">{phase}</span>
                  {isMarker && (
                    <span
                      data-testid="timeline-marker"
                      data-marker-phase={phase}
                      className="w-2 h-2 rounded-full bg-[--color-seeko-accent]"
                    />
                  )}
                </div>
                {areas.filter(a => a.phase === phase).length === 0 ? (
                  <span className="text-xs text-muted-foreground/60">—</span>
                ) : (
                  areas
                    .filter(a => a.phase === phase)
                    .map(area => (
                      <div key={area.id} data-phase={phase}>
                        <InvestorPhaseCard
                          name={area.name}
                          targetDate={area.target_date ?? null}
                          tasksComplete={tasksPerArea[area.id]?.complete ?? 0}
                          tasksTotal={tasksPerArea[area.id]?.total ?? 0}
                          isPast={!!area.target_date && new Date(area.target_date) < new Date()}
                        />
                      </div>
                    ))
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile: vertical phase headers with connector between headers */}
        <div className="md:hidden flex flex-col gap-5 relative">
          {PHASES.map((phase, i) => (
            <div key={phase} className="flex flex-col gap-2 relative">
              {i > 0 && <div className="absolute -top-3 left-3 w-px h-3 bg-border" />}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground tracking-tight">{phase}</span>
                {markerPhase === phase && (
                  <span data-testid="timeline-marker" data-marker-phase={phase} className="w-2 h-2 rounded-full bg-[--color-seeko-accent]" />
                )}
              </div>
              {areas.filter(a => a.phase === phase).map(area => (
                <div key={area.id} data-phase={phase}>
                  <InvestorPhaseCard
                    name={area.name}
                    targetDate={area.target_date ?? null}
                    tasksComplete={tasksPerArea[area.id]?.complete ?? 0}
                    tasksTotal={tasksPerArea[area.id]?.total ?? 0}
                    isPast={!!area.target_date && new Date(area.target_date) < new Date()}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {allNullDates && (
          <p className="text-xs text-muted-foreground">No ship dates set.</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorWhereWereGoing.test.tsx`
Expected: 5 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/InvestorWhereWereGoing.tsx src/components/dashboard/__tests__/InvestorWhereWereGoing.test.tsx
git commit -m "feat(investor): add Where We're Going phase timeline"
```

---

### Task 7: `InvestorWhatItCost` component

**Files:**
- Create: `src/components/dashboard/InvestorWhatItCost.tsx`
- Create: `src/components/dashboard/__tests__/InvestorWhatItCost.test.tsx`

**Step 1: Write the failing tests**

```tsx
// src/components/dashboard/__tests__/InvestorWhatItCost.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestorWhatItCost } from '../InvestorWhatItCost';

const recent = [
  { id: 'p1', description: 'Concept art', amount: 500, status: 'paid' as const, created_at: '2026-05-10', recipient: { id: 'u1', display_name: 'Alice' } },
  { id: 'p2', description: 'Animation', amount: 1200, status: 'pending' as const, created_at: '2026-05-09', recipient: { id: 'u2', display_name: 'Bob' } },
];

describe('InvestorWhatItCost', () => {
  it('renders paid and pending totals at hero scale', () => {
    render(<InvestorWhatItCost paidTotal={12400} pendingTotal={1800} recent={[]} />);
    expect(screen.getByText('$12,400')).toBeInTheDocument();
    expect(screen.getByText('$1,800')).toBeInTheDocument();
  });

  it('renders up to 3 recent payments with recipient name', () => {
    render(<InvestorWhatItCost paidTotal={0} pendingTotal={0} recent={recent} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('uses neutral muted dot for pending (not amber)', () => {
    render(<InvestorWhatItCost paidTotal={0} pendingTotal={0} recent={recent} />);
    const pendingDot = screen.getByTestId('status-dot-p2');
    expect(pendingDot.className).toMatch(/bg-muted-foreground|bg-\[--color-muted-foreground\]/);
    expect(pendingDot.className).not.toMatch(/amber|status-progress/);
  });

  it('shows empty state when no recent payments', () => {
    render(<InvestorWhatItCost paidTotal={0} pendingTotal={0} recent={[]} />);
    expect(screen.getByText(/no recent payments/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorWhatItCost.test.tsx`
Expected: FAIL — component does not exist.

**Step 3: Implement `InvestorWhatItCost`**

```tsx
// src/components/dashboard/InvestorWhatItCost.tsx
'use client';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

type RecentPayment = {
  id: string;
  description: string;
  amount: number;
  status: 'paid' | 'pending';
  created_at: string;
  recipient: { id: string; display_name?: string };
};

type Props = {
  paidTotal: number;
  pendingTotal: number;
  recent: RecentPayment[];
};

const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function InvestorWhatItCost({ paidTotal, pendingTotal, recent }: Props) {
  return (
    <Card>
      <CardContent className="p-6 flex flex-col gap-5">
        <div className="flex gap-8">
          <div>
            <p className="text-2xl tabular-nums text-foreground">{fmt(paidTotal)}</p>
            <p className="text-xs text-muted-foreground">paid total</p>
          </div>
          <div>
            <p className="text-2xl tabular-nums text-foreground">{fmt(pendingTotal)}</p>
            <p className="text-xs text-muted-foreground">pending</p>
          </div>
        </div>

        {recent.length === 0 ? (
          <EmptyState title="No recent payments" description="Recent transactions will appear here." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {recent.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <span
                  data-testid={`status-dot-${p.id}`}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    p.status === 'paid' ? 'bg-[--color-seeko-accent]' : 'bg-[--color-muted-foreground]'
                  )}
                />
                <span className="text-xs text-muted-foreground tabular-nums w-[68px]">
                  {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-sm text-foreground flex-1 truncate">{p.description}</span>
                <span className="text-xs text-muted-foreground">{p.recipient?.display_name ?? '—'}</span>
                <span className="text-sm text-foreground tabular-nums">{fmt(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <Link href="/investor/payments" className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150">
          View all payments →
        </Link>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorWhatItCost.test.tsx`
Expected: 4 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/InvestorWhatItCost.tsx src/components/dashboard/__tests__/InvestorWhatItCost.test.tsx
git commit -m "feat(investor): add What It Cost section (spend KPIs + recent)"
```

---

### Task 8: `InvestorActivityFooter` component

**Files:**
- Create: `src/components/dashboard/InvestorActivityFooter.tsx`
- Create: `src/components/dashboard/__tests__/InvestorActivityFooter.test.tsx`
- Reference: `src/app/(investor)/investor/page.tsx` — the existing inline activity rendering (this is what we're extracting + refactoring).

**Step 1: Write the failing tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvestorActivityFooter } from '../InvestorActivityFooter';

const items = [
  { id: '1', action: 'updated', target: 'Main Game', created_at: '2026-05-10T10:00:00Z' },
  { id: '2', action: 'completed', target: 'Asset upload', created_at: '2026-05-10T09:00:00Z' },
  { id: '3', action: 'commented', target: 'Concept doc', created_at: '2026-05-09T15:00:00Z' },
];

describe('InvestorActivityFooter', () => {
  it('renders collapsed by default with the item count', () => {
    render(<InvestorActivityFooter items={items} />);
    expect(screen.getByText(/3 this week|3 updates/i)).toBeInTheDocument();
    expect(screen.queryByText('Main Game')).toBeNull(); // body hidden when collapsed
  });

  it('expands to reveal items when toggled', () => {
    render(<InvestorActivityFooter items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /recent updates/i }));
    expect(screen.getByText('Main Game')).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorActivityFooter.test.tsx`
Expected: FAIL.

**Step 3: Implement `InvestorActivityFooter`**

```tsx
// src/components/dashboard/InvestorActivityFooter.tsx
'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ActivityItem } from '@/lib/supabase/data';

type Props = { items: ActivityItem[] };

export function InvestorActivityFooter({ items }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="p-4">
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 active:scale-[0.99]"
          aria-label="Recent updates toggle"
        >
          <span>Recent updates ({items.length} this week)</span>
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200 ease-out"
            style={{ transform: open ? 'rotate(180deg)' : undefined }}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', visualDuration: 0.25, bounce: 0 }}
              className="overflow-hidden"
            >
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                {items.map(item => (
                  <li key={item.id}>
                    <span className="text-foreground">{item.action}</span>{' '}
                    <span>{item.target}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/__tests__/InvestorActivityFooter.test.tsx`
Expected: 2 PASS.

**Step 5: Commit**

```bash
git add src/components/dashboard/InvestorActivityFooter.tsx src/components/dashboard/__tests__/InvestorActivityFooter.test.tsx
git commit -m "feat(investor): demote activity feed to collapsed footer"
```

---

### Task 9: Rewire `investor/page.tsx`

**Files:**
- Modify: `src/app/(investor)/investor/page.tsx`

**Step 1: Replace the page body**

Replace the entire `<main>` body (preserve auth gating, profile fetch, hero, and health summary banner) with the four new sections, wrapped in the existing `FadeRise` primitives. Update `TIMING`:

```tsx
const TIMING = {
  hero:        0,
  whereWeAre:  80,
  forecast:    180,
  spend:       280,
  activity:    380,
};
```

Wire all fetchers in parallel:

```tsx
const [tasks, areas, paymentsSummary, activity] = await Promise.all([
  fetchTasks().catch(() => []),
  fetchAreas().catch(() => []),
  fetchPaymentsSummary().catch(() => ({ paidTotal: 0, pendingTotal: 0, recent: [] })),
  fetchInvestorActivity().catch(() => []),
]);

const tasksPerArea = areas.reduce((acc, area) => {
  const areaTasks = tasks.filter(t => t.area_id === area.id);
  acc[area.id] = {
    complete: areaTasks.filter(t => t.status === 'Complete').length,
    total: areaTasks.length,
  };
  return acc;
}, {} as Record<string, { complete: number; total: number }>);
```

Render order:

```tsx
<FadeRise delay={TIMING.hero}>...hero + health banner...</FadeRise>
<FadeRise delay={TIMING.whereWeAre}><InvestorWhereWeAre areas={areas} isAdmin={profile.is_admin} /></FadeRise>
<FadeRise delay={TIMING.forecast}><InvestorWhereWereGoing areas={areas} tasksPerArea={tasksPerArea} /></FadeRise>
<FadeRise delay={TIMING.spend}><InvestorWhatItCost {...paymentsSummary} /></FadeRise>
<FadeRise delay={TIMING.activity}><InvestorActivityFooter items={activity} /></FadeRise>
```

**Step 2: Type-check + start dev server**

Run: `npx tsc --noEmit` (in one shell)
Run: `npm run dev` (in another shell — leave running)

Open `http://localhost:3000/investor` in a browser. Sign in as an investor account.

**Step 3: Visual sanity check**

- All four sections render top-to-bottom.
- Health banner red state still triggers when issues are present.
- Activity footer is collapsed by default.
- No console errors.

**Step 4: Commit**

```bash
git add src/app/(investor)/investor/page.tsx
git commit -m "feat(investor): rewire dashboard to three-section narrative"
```

---

### Task 10: Delete superseded components

**Files:**
- Delete: `src/components/dashboard/InvestorKPIStrip.tsx`
- Delete: `src/components/dashboard/CollapsibleInvestorAreas.tsx`
- Delete: `src/components/dashboard/InvestorAreaCard.tsx`

**Step 1: Verify no remaining imports**

Run (sequentially):
- `grep -rn "InvestorKPIStrip" src/`
- `grep -rn "CollapsibleInvestorAreas" src/`
- `grep -rn "InvestorAreaCard" src/`

Expected: only matches inside the files being deleted (or zero matches if they're fully orphaned). If anything else references them, fix that callsite first.

**Step 2: Delete the files**

Run: `rm src/components/dashboard/InvestorKPIStrip.tsx src/components/dashboard/CollapsibleInvestorAreas.tsx src/components/dashboard/InvestorAreaCard.tsx`

Also delete their `__tests__/` counterparts if present.

**Step 3: Type-check + test suite**

Run: `npx tsc --noEmit`
Run: `npm test`
Expected: both pass with no references to the deleted files.

**Step 4: Commit**

```bash
git add -u
git commit -m "chore(investor): remove superseded KPI strip + collapsible areas"
```

---

### Task 11: Excel export — replace PDF route

**Files:**
- Modify: `package.json` (add `exceljs` dependency)
- Modify: `src/app/api/investor/export-summary/route.ts` (rewrite for `.xlsx`)
- Delete (or strip): any PDF-specific helpers under `src/lib/investor-fallback-pdf.ts`, `src/components/InvestorSummaryPDF.tsx`, etc. — grep first.
- Modify: `src/components/layout/InvestorSidebar.tsx` (update download label)
- Create: `src/app/api/investor/export-summary/__tests__/route.test.ts`

**Step 1: Add dependency**

Run: `npm install exceljs`

**Step 2: Grep PDF surface area**

Run: `grep -rln "InvestorSummaryPDF\|investor-fallback-pdf\|@react-pdf/renderer" src/`
Note every file. These either get deleted or have their PDF code paths removed.

**Step 3: Write the failing route test**

```ts
// src/app/api/investor/export-summary/__tests__/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from '../route';
import ExcelJS from 'exceljs';

vi.mock('@/lib/supabase/server', () => ({ /* mock createClient w/ profile.is_investor=true + mock data */ }));
vi.mock('@/lib/supabase/data', () => ({
  fetchAreas: () => Promise.resolve([{ id: 'a1', name: 'Main Game', status: 'Active', progress: 60, phase: 'Beta', target_date: '2026-06-15' }]),
  fetchTasks: () => Promise.resolve([]),
  fetchPaymentsSummary: () => Promise.resolve({ paidTotal: 1000, pendingTotal: 500, recent: [] }),
}));

describe('GET /api/investor/export-summary', () => {
  it('returns an .xlsx workbook with three sheets', async () => {
    const res = await GET(new Request('http://localhost/api/investor/export-summary'));
    expect(res.headers.get('content-type')).toContain('spreadsheet');
    const buffer = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map(w => w.name)).toEqual(['Progress', 'Forecast', 'Payments']);
  });

  it('Forecast sheet headers include Target date', async () => {
    const res = await GET(new Request('http://localhost/api/investor/export-summary'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const forecast = wb.getWorksheet('Forecast');
    const headerRow = forecast?.getRow(1).values as (string | undefined)[];
    expect(headerRow).toContain('Target date');
  });
});
```

**Step 4: Run test to verify it fails**

Run: `npx vitest run src/app/api/investor/export-summary/__tests__/route.test.ts`
Expected: FAIL (current route still emits PDF).

**Step 5: Rewrite the route**

Replace `src/app/api/investor/export-summary/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { fetchAreas, fetchTasks, fetchPaymentsSummary } from '@/lib/supabase/data';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_investor, is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_investor && !profile?.is_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [areas, tasks, payments] = await Promise.all([
    fetchAreas(),
    fetchTasks(),
    fetchPaymentsSummary(),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SEEKO Studio';
  wb.created = new Date();

  // Sheet 1: Progress
  const progress = wb.addWorksheet('Progress');
  progress.columns = [
    { header: 'Area', key: 'name', width: 28 },
    { header: 'Phase', key: 'phase', width: 12 },
    { header: 'Progress %', key: 'progress', width: 12 },
    { header: 'Tasks complete', key: 'tasksComplete', width: 14 },
    { header: 'Tasks total', key: 'tasksTotal', width: 12 },
  ];
  for (const a of areas) {
    const areaTasks = tasks.filter(t => t.area_id === a.id);
    progress.addRow({
      name: a.name,
      phase: a.phase ?? '',
      progress: a.progress,
      tasksComplete: areaTasks.filter(t => t.status === 'Complete').length,
      tasksTotal: areaTasks.length,
    });
  }

  // Sheet 2: Forecast
  const forecast = wb.addWorksheet('Forecast');
  forecast.columns = [
    { header: 'Area', key: 'name', width: 28 },
    { header: 'Phase', key: 'phase', width: 12 },
    { header: 'Target date', key: 'target_date', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Days remaining', key: 'days', width: 14 },
    { header: 'Tasks complete', key: 'tasksComplete', width: 14 },
    { header: 'Tasks total', key: 'tasksTotal', width: 12 },
  ];
  const today = new Date();
  for (const a of areas) {
    const td = a.target_date ? new Date(a.target_date) : null;
    const days = td ? Math.ceil((td.getTime() - today.getTime()) / 86400000) : null;
    const areaTasks = tasks.filter(t => t.area_id === a.id);
    forecast.addRow({
      name: a.name,
      phase: a.phase ?? '',
      target_date: td,
      days: days ?? '',
      tasksComplete: areaTasks.filter(t => t.status === 'Complete').length,
      tasksTotal: areaTasks.length,
    });
  }

  // Sheet 3: Payments
  const paySheet = wb.addWorksheet('Payments');
  paySheet.columns = [
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Recipient', key: 'recipient', width: 22 },
    { header: 'Amount', key: 'amount', width: 12, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Status', key: 'status', width: 10 },
  ];
  for (const p of payments.recent) {
    paySheet.addRow({
      date: new Date(p.created_at),
      description: p.description,
      recipient: p.recipient?.display_name ?? '',
      amount: p.amount,
      currency: 'USD',
      status: p.status,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const today_str = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="seeko-studio-investor-summary-${today_str}.xlsx"`,
    },
  });
}
```

**Step 6: Remove PDF-specific files**

Based on the grep in Step 2, delete or strip those files. At minimum: `src/components/InvestorSummaryPDF.tsx`, `src/lib/investor-fallback-pdf.ts`.

Run: `npm uninstall @react-pdf/renderer` (if present in package.json).

**Step 7: Update sidebar button label**

In `src/components/layout/InvestorSidebar.tsx`, change the download button label from "Download summary (PDF)" → "Download summary (Excel)". Filename in href stays the same (`/api/investor/export-summary`).

**Step 8: Run tests + browser smoke test**

Run: `npx vitest run src/app/api/investor/export-summary/__tests__/route.test.ts`
Expected: 2 PASS.

In the browser: click the sidebar download button. A `.xlsx` file downloads. Open it in Numbers/Excel. Verify three tabs: Progress · Forecast · Payments, each populated.

**Step 9: Commit**

```bash
git add package.json package-lock.json src/app/api/investor/export-summary/ src/components/layout/InvestorSidebar.tsx
git rm <pdf-files-from-step-6>
git commit -m "feat(investor): replace PDF export with .xlsx workbook"
```

---

### Task 12: Visual QA + post-implementation critique

**Files:** none — verification only.

**Step 1: `/interface-craft critique` (post-implementation)**

Take screenshots at `/investor` in three states (populated · empty · error). Run `/interface-craft critique` on each. Address P0/P1 findings before declaring done. (This is the user's standing hook — design changes do not ship without before AND after critique.)

**Step 2: Reduced-motion check**

In Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce". Reload `/investor`. Verify:
- Ring does NOT draw (renders at final state).
- Bars do NOT fill (rendered at final width).
- Section staggers replaced by simultaneous appearance.
- Activity footer expand still works (it's a user action, not auto-motion).

**Step 3: Non-admin investor sanity check**

Sign in as a non-admin investor. Verify:
- No edit affordances visible (ring is not clickable, no completion-edit Dialog).
- All four sections render.
- Console clean.
- Excel download works.

**Step 4: Lighthouse a11y**

Run Lighthouse on `/investor` in Chrome. Score should be ≥ 95 on Accessibility.

**Step 5: Mobile breakpoint check (375px)**

In DevTools, switch to iPhone SE viewport. Verify:
- Section 1: ring stacks above the per-area list.
- Section 2: vertical phase headers, connector strokes between headers only (not between cards), no ladder-rung effect.
- Section 3: KPIs stack if needed; payments list rows stay legible.
- Activity footer: tappable.

**Step 6: Final commit (if any tweaks)**

```bash
git add -u
git commit -m "polish(investor): visual QA pass + reduced-motion + a11y"
```

---

## Completion checklist

Before declaring done:

- [ ] Migrations applied to remote Supabase (verify `target_date` column exists; verify new RLS policy active).
- [ ] All sections render populated · empty · error.
- [ ] `prefers-reduced-motion` respected on ring + bars + footer expand.
- [ ] Non-admin investor sees no admin affordances; zero console errors.
- [ ] Excel download produces a 3-tab workbook with the correct columns.
- [ ] No imports remain to deleted components (`grep -rn` clean).
- [ ] `/interface-craft critique` ran post-implementation; findings addressed.
- [ ] Lighthouse a11y ≥ 95 on `/investor`.
- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.

---

*Cross-references: design doc `docs/plans/2026-05-12-investor-panel-redesign-design.md`; SWE persona `docs/personas/swe.md`; UX persona `docs/personas/ux.md`; IA persona `docs/personas/ia.md`.*
