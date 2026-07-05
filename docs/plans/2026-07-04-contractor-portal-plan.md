# Contractor Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a contractor-only home at `/contractor` — a single-column vertical-breadcrumb timeline of the signed-in contractor's own deliverables, with progress-update and deliverable-upload actions.

**Architecture:** A new server index builder (`contractor-index.ts`) gates on `is_contractor`/`is_admin` and returns the caller's own tasks via the service client. A new Hono route `/api/contractor-index` serves it with 401/403/404 mapping. A new React Router route `/contractor` (top-level, outside `RootLayout`, its own `StandaloneErrorBoundary`) renders a login-styled shell + a `DeliverableTimeline` composed of `DeliverableRow`s. Progress writes go through a new `PATCH /api/tasks/:id/progress` route (authorized by the existing `canAccessTask`); deliverable uploads reuse the existing `POST /api/tasks/:id/deliverables` route as-is. A shared `resolvePostLoginDestination` sends contractors to `/contractor` after login.

**Tech Stack:** React Router 7 (data router, `lazy`/`Component`), Hono (`src/api-server`), Supabase (service client server-side; browser client for role resolution), Tailwind v4 (`.overview-light` Paper theme + `lightKit`), Vitest + Testing Library.

## Global Constraints

- **Stack:** Vite + React Router 7 (`src/rr-app`) + Hono (`src/api-server`). NEVER reinstall or import `next`. Loader/redirect/Outlet/useLoaderData/`LoaderFunctionArgs` import **directly from `react-router`**; only Next-compat shims (`useRouter`, `usePathname`, `useSearchParams`, `Link`, `Image`) come from `@/lib/react-router-adapters`.
- **No schema changes.** No new tables/columns/enums. Check-in dates ARE deadlines.
- **Contractor sees ONLY their own tasks** — enforced server-side (`assignee_id === session user id`), never by client filtering alone.
- **Never render** bounty/payment amounts or personal contact info on this surface. Public `/login` and `/legal/*` must not name this portal.
- **Design language** inherited verbatim from login reference (Paper `27P-0`): white canvas, `antialiased`, `.overview-light` scope; top bar `px-10 py-8` with gray `seeko-mark.svg` (24px) + `Studio` label `#686868`; centered column `max-w-[620px]`; heading `text-[22px] font-semibold tracking-[-0.02em] text-[#454545]`; muted text `#969696`.
- **Test runner:** `npx vitest run <file>` for a single file. Baseline: only `src/rr-app/routes/__tests__/investor.test.tsx` is expected-red; every other suite must stay green.
- **Commits** end with the trailers:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs
  ```

---

### Task 1: Bucketing + greeting/summary pure helpers

**Files:**
- Create: `src/lib/contractor-buckets.ts`
- Test: `src/lib/__tests__/contractor-buckets.test.ts`

**Interfaces:**
- Consumes: `ContractorDeliverable` type (defined in Task 2). For Task 1, define a local structural import placeholder — this task's code imports the type from `@/lib/contractor-index` but only the runtime functions are exercised in the test with inline fixtures, so the test does not require Task 2's runtime.
- Produces:
  - `type BucketKey = 'overdue' | 'thisWeek' | 'upcoming' | 'delivered'`
  - `type Bucket = { key: BucketKey; label: string; items: ContractorDeliverable[] }`
  - `bucketDeliverables(items: ContractorDeliverable[], now: Date): Bucket[]`
  - `summarizeDeliverables(items: ContractorDeliverable[], now: Date): { count: number; nextDueLabel: string | null }`
  - `formatDueLabel(d: Date): string`
  - `parseDeadline(deadline: string): Date` — parses a date-only string as **local** midnight (matches `src/lib/format-deadline.ts`), so bucketing and labels use the local calendar day. Exported for reuse by later tasks.
  - `greetingFor(hours: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/contractor-buckets.test.ts
import { describe, expect, it } from 'vitest';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import {
  bucketDeliverables,
  greetingFor,
  summarizeDeliverables,
} from '@/lib/contractor-buckets';

const NOW = new Date('2026-07-04T09:00:00'); // Saturday

function d(partial: Partial<ContractorDeliverable>): ContractorDeliverable {
  return {
    id: partial.id ?? 'id',
    name: partial.name ?? 'Task',
    department: partial.department ?? 'Coding',
    status: partial.status ?? 'Todo',
    priority: partial.priority ?? 'Medium',
    deadline: partial.deadline ?? null,
    progress: partial.progress ?? 0,
    description: partial.description ?? null,
  };
}

describe('bucketDeliverables', () => {
  it('classifies by deadline vs today and drops canceled/duplicate', () => {
    const items = [
      d({ id: 'over', deadline: '2026-07-01', status: 'In Progress' }),
      d({ id: 'week', deadline: '2026-07-08', status: 'Todo' }),
      d({ id: 'later', deadline: '2026-07-24', status: 'Backlog' }),
      d({ id: 'none', deadline: null, status: 'Todo' }),
      d({ id: 'done', deadline: '2026-07-02', status: 'Done' }),
      d({ id: 'cancel', deadline: '2026-07-02', status: 'Canceled' }),
      d({ id: 'dup', deadline: '2026-07-02', status: 'Duplicate' }),
    ];
    const buckets = bucketDeliverables(items, NOW);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.items.map((i) => i.id)]));

    expect(byKey.overdue).toEqual(['over']);
    expect(byKey.thisWeek).toEqual(['week']);
    expect(byKey.upcoming).toEqual(['later', 'none']); // no-deadline sorts last within upcoming
    expect(byKey.delivered).toEqual(['done']);
    // canceled + duplicate appear in NO bucket
    expect(JSON.stringify(buckets)).not.toContain('cancel');
    expect(JSON.stringify(buckets)).not.toContain('dup');
    // empty buckets are omitted
    expect(buckets.every((b) => b.items.length > 0)).toBe(true);
  });

  it('sorts within a bucket by deadline then priority', () => {
    const items = [
      d({ id: 'b', deadline: '2026-07-08', priority: 'Low' }),
      d({ id: 'a', deadline: '2026-07-06', priority: 'Low' }),
      d({ id: 'a-high', deadline: '2026-07-06', priority: 'High' }),
    ];
    const [week] = bucketDeliverables(items, NOW);
    expect(week.items.map((i) => i.id)).toEqual(['a-high', 'a', 'b']);
  });
});

describe('summarizeDeliverables', () => {
  it('counts active deliverables and labels the next due date', () => {
    const items = [
      d({ id: 'x', deadline: '2026-07-10', status: 'In Progress' }),
      d({ id: 'y', deadline: '2026-07-08', status: 'Todo' }),
      d({ id: 'done', deadline: '2026-07-02', status: 'Done' }),
    ];
    const s = summarizeDeliverables(items, NOW);
    expect(s.count).toBe(2); // Done excluded
    expect(s.nextDueLabel).toBe('Wed, Jul 8'); // earliest active deadline
  });

  it('returns null next-due when no active deadlines', () => {
    const s = summarizeDeliverables([d({ deadline: null })], NOW);
    expect(s).toEqual({ count: 1, nextDueLabel: null });
  });
});

describe('greetingFor', () => {
  it('maps hour-of-day to a greeting', () => {
    expect(greetingFor(9)).toBe('Good morning');
    expect(greetingFor(13)).toBe('Good afternoon');
    expect(greetingFor(20)).toBe('Good evening');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/contractor-buckets.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/contractor-buckets"` (module not yet created).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/contractor-buckets.ts
import type { ContractorDeliverable } from './contractor-index';

export type BucketKey = 'overdue' | 'thisWeek' | 'upcoming' | 'delivered';
export type Bucket = { key: BucketKey; label: string; items: ContractorDeliverable[] };

const DELIVERED: Record<string, true> = { Done: true };
const HIDDEN: Record<string, true> = { Canceled: true, Duplicate: true };

const BUCKET_ORDER: BucketKey[] = ['overdue', 'thisWeek', 'upcoming', 'delivered'];
const BUCKET_LABEL: Record<BucketKey, string> = {
  overdue: 'Overdue',
  thisWeek: 'This week',
  upcoming: 'Upcoming',
  delivered: 'Delivered',
};

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * Parse a `YYYY-MM-DD` deadline as LOCAL midnight. A bare `new Date('2026-07-08')`
 * parses as UTC midnight, which shifts back a day when read in a UTC-negative
 * timezone — so buckets and labels would show the wrong calendar day. Appending
 * `T00:00:00` pins it to the local day (same fix as src/lib/format-deadline.ts).
 */
export function parseDeadline(deadline: string): Date {
  return new Date(`${deadline}T00:00:00`);
}

function priorityRank(p: string | null): number {
  return p === 'High' ? 0 : p === 'Medium' ? 1 : p === 'Low' ? 2 : 3;
}

function deadlineMs(d: ContractorDeliverable): number {
  return d.deadline ? parseDeadline(d.deadline).getTime() : Number.POSITIVE_INFINITY;
}

function sortByDeadlineThenPriority(a: ContractorDeliverable, b: ContractorDeliverable): number {
  const da = deadlineMs(a);
  const db = deadlineMs(b);
  if (da !== db) return da - db;
  return priorityRank(a.priority) - priorityRank(b.priority);
}

export function bucketDeliverables(items: ContractorDeliverable[], now: Date): Bucket[] {
  const today = startOfDay(now);
  const weekAhead = today + 7 * 24 * 60 * 60 * 1000;
  const groups: Record<BucketKey, ContractorDeliverable[]> = {
    overdue: [],
    thisWeek: [],
    upcoming: [],
    delivered: [],
  };

  for (const item of items) {
    if (HIDDEN[item.status]) continue;
    if (DELIVERED[item.status]) {
      groups.delivered.push(item);
      continue;
    }
    if (item.deadline == null) {
      groups.upcoming.push(item);
      continue;
    }
    const due = startOfDay(parseDeadline(item.deadline));
    if (due < today) groups.overdue.push(item);
    else if (due < weekAhead) groups.thisWeek.push(item);
    else groups.upcoming.push(item);
  }

  for (const key of BUCKET_ORDER) groups[key].sort(sortByDeadlineThenPriority);

  return BUCKET_ORDER.filter((key) => groups[key].length > 0).map((key) => ({
    key,
    label: BUCKET_LABEL[key],
    items: groups[key],
  }));
}

export function formatDueLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function summarizeDeliverables(
  items: ContractorDeliverable[],
  _now: Date,
): { count: number; nextDueLabel: string | null } {
  const active = items.filter((i) => !DELIVERED[i.status] && !HIDDEN[i.status]);
  const next = active
    .filter((i) => i.deadline != null)
    .sort((a, b) => parseDeadline(a.deadline!).getTime() - parseDeadline(b.deadline!).getTime())[0];
  return {
    count: active.length,
    nextDueLabel: next ? formatDueLabel(parseDeadline(next.deadline!)) : null,
  };
}

export function greetingFor(hours: number): string {
  if (hours < 12) return 'Good morning';
  if (hours < 18) return 'Good afternoon';
  return 'Good evening';
}
```

> Note: Task 1's test imports the `ContractorDeliverable` **type** from `@/lib/contractor-index`. Types are erased at runtime, and Vitest resolves the module for its exported runtime symbols only when a value is imported. Because Task 2 creates `contractor-index.ts`, run Task 1 and Task 2 as a pair if the type import fails to resolve; otherwise Task 1's test passes standalone since only type positions reference it. If resolution errors in Step 2, do Task 2 Step 3 first (create the file + type), then return.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/contractor-buckets.test.ts`
Expected: PASS (3 describe blocks, all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contractor-buckets.ts src/lib/__tests__/contractor-buckets.test.ts
git commit -m "feat(contractor): deliverable bucketing + greeting/summary helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

### Task 2: Server index builder + access gate

**Files:**
- Create: `src/lib/contractor-index.ts`
- Test: `src/lib/__tests__/contractor-index.test.ts`

**Interfaces:**
- Consumes: `getServiceClient` — copy the exact import line from the top of `src/lib/investor-index.ts` (same module). `TaskStatus`, `Priority` from `@/lib/types`.
- Produces:
  - `class ContractorAccessError extends Error` with `code: 'profile_not_found' | 'contractor_required'`
  - `type ContractorProfile = { id; displayName; email; avatarUrl; isAdmin; isContractor }`
  - `type ContractorDeliverable = { id; name; department; status; priority; deadline; progress; description }`
  - `type ContractorOverviewData = { profile: ContractorProfile; deliverables: ContractorDeliverable[] }`
  - `assertContractorAccess(profile: { is_contractor: boolean | null; is_admin: boolean | null }): void`
  - `loadContractorOverview(currentUser: { id: string }): Promise<ContractorOverviewData>`

- [ ] **Step 1: Write the failing test** (only the pure gate is unit-tested; the service-client loader is covered at the route boundary in Task 3, mirroring how `investor-index.ts` is tested)

```ts
// src/lib/__tests__/contractor-index.test.ts
import { describe, expect, it } from 'vitest';
import { assertContractorAccess, ContractorAccessError } from '@/lib/contractor-index';

describe('assertContractorAccess', () => {
  it('allows a contractor', () => {
    expect(() => assertContractorAccess({ is_contractor: true, is_admin: false })).not.toThrow();
  });

  it('allows an admin who is not a contractor', () => {
    expect(() => assertContractorAccess({ is_contractor: false, is_admin: true })).not.toThrow();
  });

  it('rejects a non-contractor non-admin with contractor_required', () => {
    try {
      assertContractorAccess({ is_contractor: false, is_admin: false });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContractorAccessError);
      expect((err as ContractorAccessError).code).toBe('contractor_required');
    }
  });

  it('rejects null flags with contractor_required', () => {
    try {
      assertContractorAccess({ is_contractor: null, is_admin: null });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContractorAccessError);
      expect((err as ContractorAccessError).code).toBe('contractor_required');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/contractor-index.test.ts`
Expected: FAIL — cannot resolve `@/lib/contractor-index`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/contractor-index.ts
import { getServiceClient } from './investor-index'; // ⚠ replace with the ACTUAL getServiceClient import path used at the top of investor-index.ts (copy that exact line); investor-index does not necessarily re-export it.
import type { Priority, TaskStatus } from './types';

export class ContractorAccessError extends Error {
  constructor(public readonly code: 'profile_not_found' | 'contractor_required') {
    super(code);
    this.name = 'ContractorAccessError';
  }
}

export type ContractorProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isContractor: boolean;
};

export type ContractorDeliverable = {
  id: string;
  name: string;
  department: string | null;
  status: TaskStatus;
  priority: Priority | null;
  deadline: string | null;
  progress: number;
  description: string | null;
};

export type ContractorOverviewData = {
  profile: ContractorProfile;
  deliverables: ContractorDeliverable[];
};

const CONTRACTOR_PROFILE_SELECT =
  'id, display_name, email, avatar_url, is_admin, is_contractor' as const;
const CONTRACTOR_TASK_SELECT =
  'id, name, department, status, priority, deadline, progress, description' as const;

export function assertContractorAccess(profile: {
  is_contractor: boolean | null;
  is_admin: boolean | null;
}): void {
  if (!profile.is_contractor && !profile.is_admin) {
    throw new ContractorAccessError('contractor_required');
  }
}

async function loadContractorProfile(userId: string): Promise<ContractorProfile> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select(CONTRACTOR_PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ContractorAccessError('profile_not_found');

  const p = data as {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    is_admin: boolean | null;
    is_contractor: boolean | null;
  };
  assertContractorAccess(p);

  return {
    id: p.id,
    displayName: p.display_name,
    email: p.email,
    avatarUrl: p.avatar_url,
    isAdmin: !!p.is_admin,
    isContractor: !!p.is_contractor,
  };
}

export async function loadContractorOverview(currentUser: {
  id: string;
}): Promise<ContractorOverviewData> {
  const service = getServiceClient();
  const profile = await loadContractorProfile(currentUser.id);

  const { data, error } = await service
    .from('tasks')
    .select(CONTRACTOR_TASK_SELECT)
    .eq('assignee_id', currentUser.id)
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw error;

  const deliverables: ContractorDeliverable[] = (data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: t.name as string,
    department: (t.department as string | null) ?? null,
    status: t.status as TaskStatus,
    priority: (t.priority as Priority | null) ?? null,
    deadline: (t.deadline as string | null) ?? null,
    progress: typeof t.progress === 'number' ? t.progress : 0,
    description: (t.description as string | null) ?? null,
  }));

  return { profile, deliverables };
}
```

> ⚠ **Import correctness (do this first):** open `src/lib/investor-index.ts`, copy its `getServiceClient` import line verbatim (it is imported from the shared service-client module, NOT re-exported by investor-index), and replace the placeholder import above. The `getServiceClient` singleton and the `.from(...).select(...).eq(...).order(...)` chain must match what `loadInvestorOverview` uses.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/contractor-index.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contractor-index.ts src/lib/__tests__/contractor-index.test.ts
git commit -m "feat(contractor): server index builder + is_contractor access gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

### Task 3: Hono route `/api/contractor-index` + mount

**Files:**
- Create: `src/api-server/routes/contractor.ts`
- Modify: `src/api-server/app.ts` (import + `.route('/api', createContractorRoutes({...}))` next to the investor mount; add `contractorAuthResolver?` to the dependencies type + default the loader)
- Test: `src/api-server/__tests__/contractor.test.ts`

**Interfaces:**
- Consumes: `getAuthenticatedUser`, `AuthResolver`, `AuthenticatedUser` — mirror the exact import surface at the top of `src/api-server/routes/investor.ts`. `loadContractorOverview`, `ContractorAccessError`, `ContractorOverviewData` from `@/lib/contractor-index`.
- Produces: `createContractorRoutes(options?: { authResolver?; contractorOverviewLoader? }): Hono` serving `GET /contractor-index` (→ `/api/contractor-index` once mounted under `/api`).

- [ ] **Step 1: Write the failing test**

```ts
// src/api-server/__tests__/contractor.test.ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../supabase';
import { createContractorRoutes } from '../routes/contractor';
import { ContractorAccessError, type ContractorOverviewData } from '@/lib/contractor-index';

const READY: ContractorOverviewData = {
  profile: {
    id: 'u1',
    displayName: 'Dana',
    email: 'dana@example.com',
    avatarUrl: null,
    isAdmin: false,
    isContractor: true,
  },
  deliverables: [],
};

function appWith(opts: Parameters<typeof createContractorRoutes>[0]) {
  return new Hono().route('/api', createContractorRoutes(opts));
}

describe('GET /api/contractor-index', () => {
  it('401 when unauthenticated', async () => {
    const app = appWith({ authResolver: async () => null });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(401);
  });

  it('403 when the loader reports contractor_required', async () => {
    const app = appWith({
      authResolver: async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser,
      contractorOverviewLoader: async () => {
        throw new ContractorAccessError('contractor_required');
      },
    });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'contractor_required' });
  });

  it('404 when the profile is missing', async () => {
    const app = appWith({
      authResolver: async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser,
      contractorOverviewLoader: async () => {
        throw new ContractorAccessError('profile_not_found');
      },
    });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(404);
  });

  it('200 with the overview payload when authorized', async () => {
    const app = appWith({
      authResolver: async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser,
      contractorOverviewLoader: async () => READY,
    });
    const res = await app.request('/api/contractor-index');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(READY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api-server/__tests__/contractor.test.ts`
Expected: FAIL — cannot resolve `../routes/contractor`.

- [ ] **Step 3: Write the implementation**

```ts
// src/api-server/routes/contractor.ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  ContractorAccessError,
  loadContractorOverview,
  type ContractorOverviewData,
} from '@/lib/contractor-index';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

interface ContractorRoutesOptions {
  authResolver?: AuthResolver;
  contractorOverviewLoader?: (user: AuthenticatedUser) => Promise<ContractorOverviewData>;
}

export function createContractorRoutes(options: ContractorRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const contractorOverviewLoader = options.contractorOverviewLoader ?? loadContractorOverview;

  return new Hono().get('/contractor-index', (c) =>
    handleContractorLoad(c, authResolver, contractorOverviewLoader),
  );
}

async function handleContractorLoad<T>(
  c: Context,
  authResolver: AuthResolver,
  loader: (user: AuthenticatedUser) => Promise<T>,
) {
  const user = await authResolver(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  try {
    return c.json(await loader(user));
  } catch (error) {
    if (error instanceof ContractorAccessError) {
      return c.json({ error: error.code }, error.code === 'contractor_required' ? 403 : 404);
    }
    console.error('[hono contractor] load failed:', error);
    return c.json({ error: 'Failed to load contractor data.' }, 500);
  }
}
```

> If `getAuthenticatedUser`'s return type is not exported as `AuthenticatedUser` from `../supabase`, mirror whatever type name `investor.ts` uses for its `AuthResolver`. Do not invent a new shape.

Then wire the mount in `src/api-server/app.ts` — mirror the investor mount (found near the investor `.route('/api', createInvestorRoutes({...}))` call):

```ts
// near the other route imports in app.ts:
import { createContractorRoutes } from './routes/contractor';
import { loadContractorOverview } from '@/lib/contractor-index';

// where dependencies/options are defaulted (next to investor defaults):
const contractorOverviewLoader = dependencies.contractorOverviewLoader ?? loadContractorOverview;

// in the dependencies interface (next to investorAuthResolver):
//   contractorAuthResolver?: AuthResolver;
//   contractorOverviewLoader?: typeof loadContractorOverview;

// in the chained .route(...) calls, right after the investor mount:
    .route('/api', createContractorRoutes({
      authResolver: dependencies.contractorAuthResolver,
      contractorOverviewLoader,
    }))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api-server/__tests__/contractor.test.ts`
Expected: PASS (4 cases).
Then confirm the server still type-checks and boots: `npm run build` (Vite build succeeds).

- [ ] **Step 5: Commit**

```bash
git add src/api-server/routes/contractor.ts src/api-server/app.ts src/api-server/__tests__/contractor.test.ts
git commit -m "feat(contractor): /api/contractor-index route + app mount

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

### Task 4: `PATCH /api/tasks/:id/progress` route

**Files:**
- Modify: `src/api-server/routes/tasks.ts` (add one route to the existing `createTaskRoutes` chain, beside `POST /tasks/:id/deliverables`)
- Test: `src/api-server/__tests__/tasks-progress.test.ts`

**Interfaces:**
- Consumes (already in scope inside `tasks.ts`): `authResolver`, `canAccessTask` (`tasks.ts:329`, returns `{ found, allowed, isAdmin, task, profile }`), `getServiceClient`.
- Produces: `PATCH /tasks/:id/progress` → `/api/tasks/:id/progress`. Body `{ progress: number }` (0–100). Responses: 401 no user, 400 invalid body, 404 not found, 403 not owner/admin, 200 `{ id, progress }`.

- [ ] **Step 1: Write the failing test** (covers the guards that do not require the Supabase service client; ownership 403/404 is delegated to the already-covered `canAccessTask`)

```ts
// src/api-server/__tests__/tasks-progress.test.ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../supabase';
import { createTaskRoutes } from '../routes/tasks';

function appWith(authResolver: (c: unknown) => Promise<AuthenticatedUser | null>) {
  // Pass through whatever other options createTaskRoutes requires with test doubles;
  // only authResolver + the validation branch are exercised here.
  return new Hono().route('/api', createTaskRoutes({ authResolver } as never));
}

async function patch(app: Hono, id: string, body: unknown) {
  return app.request(`/api/tasks/${id}/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/tasks/:id/progress', () => {
  it('401 when unauthenticated', async () => {
    const app = appWith(async () => null);
    const res = await patch(app, 't1', { progress: 50 });
    expect(res.status).toBe(401);
  });

  it('400 when progress is out of range', async () => {
    const app = appWith(async () => ({ id: 'u1', email: 'x' }) as AuthenticatedUser);
    expect((await patch(app, 't1', { progress: 150 })).status).toBe(400);
    expect((await patch(app, 't1', { progress: -1 })).status).toBe(400);
    expect((await patch(app, 't1', { progress: 'nope' })).status).toBe(400);
    expect((await patch(app, 't1', {})).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api-server/__tests__/tasks-progress.test.ts`
Expected: FAIL — route returns 404 (no `/tasks/:id/progress` handler yet) instead of 401/400.

- [ ] **Step 3: Write the implementation** — add this route to the `createTaskRoutes` chain in `src/api-server/routes/tasks.ts`, immediately after the `.post('/tasks/:id/deliverables', ...)` handler:

```ts
    .patch('/tasks/:id/progress', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      const progress = (body as { progress?: unknown }).progress;
      if (
        typeof progress !== 'number' ||
        !Number.isFinite(progress) ||
        progress < 0 ||
        progress > 100
      ) {
        return c.json({ error: 'progress must be a number between 0 and 100' }, 400);
      }

      const taskId = c.req.param('id');
      const access = await canAccessTask(user.id, taskId);
      if (!access.found) return c.json({ error: 'Task not found' }, 404);
      if (!access.allowed) {
        return c.json({ error: 'Only the assignee or an admin can update this task' }, 403);
      }

      const service = getServiceClient();
      const rounded = Math.round(progress);
      const { error } = await service
        .from('tasks')
        .update({ progress: rounded } as never)
        .eq('id', taskId);
      if (error) return c.json({ error: 'Failed to update progress' }, 500);

      return c.json({ id: taskId, progress: rounded });
    })
```

> If `createTaskRoutes` does not currently accept an injectable `authResolver`, add it exactly as the deliverables route resolves `authResolver` (options with a `getAuthenticatedUser` default) — do not change the existing deliverables/other handlers' behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api-server/__tests__/tasks-progress.test.ts`
Expected: PASS (guards). Then run the full tasks suite to confirm no regression: `npx vitest run src/api-server/__tests__/tasks.test.ts` (if present) — expected green.

- [ ] **Step 5: Commit**

```bash
git add src/api-server/routes/tasks.ts src/api-server/__tests__/tasks-progress.test.ts
git commit -m "feat(contractor): PATCH /api/tasks/:id/progress (assignee-or-admin)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

### Task 5: `DeliverableRow` (leaf: card + expand + progress + upload)

**Files:**
- Create: `src/components/contractor/DeliverableRow.tsx`
- Test: `src/components/contractor/__tests__/DeliverableRow.test.tsx`

**Interfaces:**
- Consumes: `ContractorDeliverable` from `@/lib/contractor-index`; `formatDueLabel` from `@/lib/contractor-buckets`; inline progress-meter pattern (from `investor.tsx` `GaugeBar`); `lightKit` (`LIGHT_DEPT_BADGE`, `LIGHT_FOCUS_RING`, `CARD_TITLE`, `CARD_DESC`) from `@/components/dashboard/lightKit`.
- Produces:
  - `type DeliverableRowProps = { deliverable: ContractorDeliverable; overdue?: boolean; delivered?: boolean; onProgressCommit?: (id: string, progress: number) => Promise<void>; onUpload?: (id: string, files: File[]) => Promise<void> }`
  - `DeliverableRow(props: DeliverableRowProps): JSX.Element`
  - Default `onProgressCommit` → `PATCH /api/tasks/:id/progress`; default `onUpload` → `POST /api/tasks/:id/deliverables` (single `file` field).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/contractor/__tests__/DeliverableRow.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import { DeliverableRow } from '../DeliverableRow';

const base: ContractorDeliverable = {
  id: 't1',
  name: 'Main menu wireframes',
  department: 'UI/UX',
  status: 'In Progress',
  priority: 'High',
  deadline: '2026-07-10',
  progress: 45,
  description: 'Low-fi flows for the main menu.',
};

describe('DeliverableRow', () => {
  it('renders name, department, status pill, and progress in the collapsed row', () => {
    render(<DeliverableRow deliverable={base} />);
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('UI/UX')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('expands on click and commits a new progress value', async () => {
    const onProgressCommit = vi.fn().mockResolvedValue(undefined);
    render(<DeliverableRow deliverable={base} onProgressCommit={onProgressCommit} />);

    fireEvent.click(screen.getByRole('button', { name: /main menu wireframes/i }));
    const slider = await screen.findByRole('slider', { name: /progress/i });
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(onProgressCommit).toHaveBeenCalledWith('t1', 70));
  });

  it('uploads a deliverable file through the injected handler', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<DeliverableRow deliverable={base} onUpload={onUpload} />);

    fireEvent.click(screen.getByRole('button', { name: /main menu wireframes/i }));
    const file = new File(['x'], 'menu.fig', { type: 'application/octet-stream' });
    const input = await screen.findByLabelText(/upload deliverable/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('t1', [file]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/contractor/__tests__/DeliverableRow.test.tsx`
Expected: FAIL — cannot resolve `../DeliverableRow`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/contractor/DeliverableRow.tsx
import { useId, useRef, useState } from 'react';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import { CARD_DESC, CARD_TITLE, LIGHT_DEPT_BADGE, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { formatDueLabel, parseDeadline } from '@/lib/contractor-buckets';

const STATUS_DOT: Record<string, string> = {
  Backlog: '#c4c4c4',
  Todo: '#c4c4c4',
  'In Progress': '#fbbf24',
  'In Review': '#93c5fd',
  Done: '#0d7aff',
  Canceled: '#c4c4c4',
  Duplicate: '#c4c4c4',
};

const STATUS_PILL: Record<string, string> = {
  Backlog: 'text-[#808080] border-black/[0.08]',
  Todo: 'text-[#808080] border-black/[0.08]',
  'In Progress': 'text-[#946a00] border-[#b8801a]/40 bg-[#b8801a]/10',
  'In Review': 'text-[#3f5fb5] border-[#3f5fb5]/30 bg-[#3f5fb5]/10',
  Done: 'text-[#0a63cc] border-[#0a63cc]/30 bg-[#0a63cc]/10',
  Canceled: 'text-[#9a9a9a] border-black/[0.08]',
  Duplicate: 'text-[#9a9a9a] border-black/[0.08]',
};

async function defaultProgressCommit(id: string, progress: number): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress }),
  });
  if (!res.ok) throw new Error('progress_failed');
}

async function defaultUpload(id: string, files: File[]): Promise<void> {
  const form = new FormData();
  form.append('file', files[0]);
  const res = await fetch(`/api/tasks/${id}/deliverables`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('upload_failed');
}

export type DeliverableRowProps = {
  deliverable: ContractorDeliverable;
  overdue?: boolean;
  delivered?: boolean;
  onProgressCommit?: (id: string, progress: number) => Promise<void>;
  onUpload?: (id: string, files: File[]) => Promise<void>;
};

export function DeliverableRow({
  deliverable,
  overdue = false,
  delivered = false,
  onProgressCommit = defaultProgressCommit,
  onUpload = defaultUpload,
}: DeliverableRowProps) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(deliverable.progress);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const fileInputId = useId();
  const committed = useRef(deliverable.progress);

  const dotColor = overdue && !delivered ? '#f87171' : STATUS_DOT[deliverable.status] ?? '#c4c4c4';
  const deptBadge = deliverable.department ? LIGHT_DEPT_BADGE[deliverable.department] : undefined;
  const dueLabel = deliverable.deadline ? formatDueLabel(parseDeadline(deliverable.deadline)) : 'No deadline';

  async function commitProgress() {
    if (progress === committed.current) return;
    setSaving('saving');
    try {
      await onProgressCommit(deliverable.id, progress);
      committed.current = progress;
      setSaving('idle');
    } catch {
      setSaving('error');
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadState('uploading');
    try {
      await onUpload(deliverable.id, Array.from(files));
      setUploadState('done');
    } catch {
      setUploadState('error');
    }
  }

  return (
    <li className="relative">
      {/* node dot on the spine */}
      <span
        className="absolute -left-[19px] top-[18px] size-2.5 rounded-full ring-4 ring-white"
        style={{ backgroundColor: dotColor }}
        aria-hidden
      />
      <div className="rounded-[14px] border border-[#E8E8E8]/75 bg-white shadow-[0_10px_20px_#D1D1D126]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left ${LIGHT_FOCUS_RING} rounded-[14px]`}
        >
          <span className="flex w-full items-center gap-3">
            <span className={`min-w-0 flex-1 truncate ${CARD_TITLE}`}>{deliverable.name}</span>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL[deliverable.status] ?? STATUS_PILL.Todo}`}
            >
              {deliverable.status}
            </span>
          </span>
          <span className={`flex items-center gap-2 ${CARD_DESC}`}>
            {deptBadge && (
              <span className={`inline-flex items-center rounded-full px-1.5 text-[10px] ${deptBadge}`}>
                {deliverable.department}
              </span>
            )}
            <span className={overdue && !delivered ? 'text-[#d4503e] tabular-nums' : 'tabular-nums'}>
              due {dueLabel}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/[0.06]">
                <span
                  className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(2, Math.min(100, progress))}%`, backgroundColor: dotColor }}
                />
              </span>
              <span className="w-9 text-right text-[11px] tabular-nums text-[#808080]">{progress}%</span>
            </span>
          </span>
        </button>

        {open && (
          <div className="border-t border-black/[0.06] px-4 py-3">
            {deliverable.description && (
              <p className="text-[13px] leading-relaxed text-[#505050]">{deliverable.description}</p>
            )}

            <label htmlFor={`${fileInputId}-range`} className="mt-3 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#969696]">
              Progress
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id={`${fileInputId}-range`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                aria-label="Progress"
                onChange={(e) => setProgress(Number(e.target.value))}
                onPointerUp={commitProgress}
                onKeyUp={commitProgress}
                onBlur={commitProgress}
                className="h-1.5 flex-1 accent-[#0d7aff]"
              />
              <span className="w-10 text-right text-[13px] tabular-nums text-[#111]">{progress}%</span>
            </div>
            {saving === 'saving' && <p className="mt-1 text-[11px] text-[#969696]">Saving…</p>}
            {saving === 'error' && <p className="mt-1 text-[11px] text-[#d4503e]">Couldn’t save — try again.</p>}

            <div className="mt-4">
              <label
                htmlFor={fileInputId}
                className="inline-flex cursor-pointer items-center rounded-[14px] bg-[#f4f4f4] px-4 py-2 text-[13px] font-medium text-[#2a2a2a] transition-colors hover:bg-[#ececec]"
              >
                Upload deliverable
              </label>
              <input
                id={fileInputId}
                type="file"
                aria-label="Upload deliverable"
                className="sr-only"
                onChange={(e) => handleUpload(e.target.files)}
              />
              {uploadState === 'uploading' && <span className="ml-3 text-[12px] text-[#969696]">Uploading…</span>}
              {uploadState === 'done' && <span className="ml-3 text-[12px] text-[#15803d]">Uploaded ✓</span>}
              {uploadState === 'error' && <span className="ml-3 text-[12px] text-[#d4503e]">Upload failed</span>}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
```

> The collapsed row renders name + status pill (top line) and department badge · due · progress meter (second line), matching design §5. Both `STATUS_DOT` (node/meter color) and `STATUS_PILL` (pill classes) are used. Keep the two `STATUS_*` maps local to this file for now (a shared `LIGHT_TASK_STATUS` in `lightKit.ts` is a later refactor, out of scope).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/contractor/__tests__/DeliverableRow.test.tsx`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/contractor/DeliverableRow.tsx src/components/contractor/__tests__/DeliverableRow.test.tsx
git commit -m "feat(contractor): DeliverableRow — expandable card with progress + upload

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

### Task 6: `DeliverableTimeline` (spine + buckets + empty state)

**Files:**
- Create: `src/components/contractor/DeliverableTimeline.tsx`
- Test: `src/components/contractor/__tests__/DeliverableTimeline.test.tsx`

**Interfaces:**
- Consumes: `Bucket` from `@/lib/contractor-buckets`; `DeliverableRow` from `./DeliverableRow`.
- Produces:
  - `type DeliverableTimelineProps = { buckets: Bucket[]; onProgressCommit?; onUpload? }` (the two handlers are threaded down to each `DeliverableRow` so tests can inject them portal-wide).
  - `DeliverableTimeline(props): JSX.Element` — renders the empty state when `buckets` is empty.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/contractor/__tests__/DeliverableTimeline.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Bucket } from '@/lib/contractor-buckets';
import { DeliverableTimeline } from '../DeliverableTimeline';

const bucket = (over: Partial<Bucket>): Bucket => ({
  key: over.key ?? 'thisWeek',
  label: over.label ?? 'This week',
  items: over.items ?? [],
});

describe('DeliverableTimeline', () => {
  it('renders an empty state when there are no buckets', () => {
    render(<DeliverableTimeline buckets={[]} />);
    expect(screen.getByText(/no deliverables assigned yet/i)).toBeInTheDocument();
  });

  it('renders bucket labels and their deliverables', () => {
    const buckets: Bucket[] = [
      bucket({
        key: 'overdue',
        label: 'Overdue',
        items: [
          {
            id: 'a',
            name: 'SFX pass',
            department: 'Animation',
            status: 'In Review',
            priority: 'High',
            deadline: '2026-07-01',
            progress: 70,
            description: null,
          },
        ],
      }),
    ];
    render(<DeliverableTimeline buckets={buckets} />);
    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByText('SFX pass')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/contractor/__tests__/DeliverableTimeline.test.tsx`
Expected: FAIL — cannot resolve `../DeliverableTimeline`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/contractor/DeliverableTimeline.tsx
import type { Bucket } from '@/lib/contractor-buckets';
import { DeliverableRow } from './DeliverableRow';

export type DeliverableTimelineProps = {
  buckets: Bucket[];
  onProgressCommit?: (id: string, progress: number) => Promise<void>;
  onUpload?: (id: string, files: File[]) => Promise<void>;
};

export function DeliverableTimeline({ buckets, onProgressCommit, onUpload }: DeliverableTimelineProps) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-[20px] border border-[#E8E8E8]/75 bg-white px-6 py-10 text-center shadow-[0_10px_20px_#D1D1D126]">
        <p className="text-[15px] font-medium text-[#454545]">No deliverables assigned yet</p>
        <p className="mt-1 text-sm text-[#969696]">New work will show up here.</p>
      </div>
    );
  }

  return (
    <div>
      {buckets.map((b) => (
        <section key={b.key} className="mb-6 last:mb-0">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#969696]">{b.label}</h2>
          <div className="relative pl-5">
            <div className="absolute bottom-2 left-[4px] top-2 w-px bg-black/[0.08]" aria-hidden />
            <ul className="space-y-3">
              {b.items.map((d) => (
                <DeliverableRow
                  key={d.id}
                  deliverable={d}
                  overdue={b.key === 'overdue'}
                  delivered={b.key === 'delivered'}
                  onProgressCommit={onProgressCommit}
                  onUpload={onUpload}
                />
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
```

> `onProgressCommit`/`onUpload` are optional; when omitted, `DeliverableRow` falls back to its real `fetch` defaults. Passing `undefined` down is fine — the row's default-parameter values apply.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/contractor/__tests__/DeliverableTimeline.test.tsx`
Expected: PASS (2 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/contractor/DeliverableTimeline.tsx src/components/contractor/__tests__/DeliverableTimeline.test.tsx
git commit -m "feat(contractor): DeliverableTimeline — bucketed spine + empty state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

### Task 7: `/contractor` route — loader, shell, greeting + registration

**Files:**
- Create: `src/rr-app/routes/contractor.tsx`
- Modify: `src/rr-app/routes.tsx` (add the top-level `/contractor` route object outside `RootLayout`, using the existing `StandaloneErrorBoundary`)
- Test: `src/rr-app/routes/__tests__/contractor.test.tsx`

**Interfaces:**
- Consumes: `redirect`, `useLoaderData`, `type LoaderFunctionArgs` from `react-router`; `Link` from `@/lib/react-router-adapters`; `ContractorOverviewData` from `@/lib/contractor-index`; `bucketDeliverables`, `summarizeDeliverables`, `greetingFor` from `@/lib/contractor-buckets`; `DeliverableTimeline` from `@/components/contractor/DeliverableTimeline`.
- Produces:
  - `contractorLoader(args: LoaderFunctionArgs): Promise<ContractorData | Response>` where `type ContractorData = { status: 'ready'; index: ContractorOverviewData } | { status: 'forbidden' }`
  - `ContractorRoute(): JSX.Element` (reads loader data)
  - `ContractorRouteContent({ data, now? }: { data: ContractorData; now?: Date }): JSX.Element` (pure, prop-driven — the test target)

- [ ] **Step 1: Write the failing test**

```tsx
// src/rr-app/routes/__tests__/contractor.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ContractorOverviewData } from '@/lib/contractor-index';
import { ContractorRouteContent } from '../contractor';

const NOW = new Date('2026-07-04T09:00:00');

const ready: ContractorOverviewData = {
  profile: { id: 'u1', displayName: 'Dana Okafor', email: 'dana@x.com', avatarUrl: null, isAdmin: false, isContractor: true },
  deliverables: [
    { id: 'a', name: 'Main menu wireframes', department: 'UI/UX', status: 'In Progress', priority: 'High', deadline: '2026-07-10', progress: 45, description: null },
  ],
};

const renderContent = (data: React.ComponentProps<typeof ContractorRouteContent>['data']) =>
  render(<MemoryRouter><ContractorRouteContent data={data} now={NOW} /></MemoryRouter>);

describe('ContractorRouteContent', () => {
  it('gates non-contractors with a Paper access card', () => {
    renderContent({ status: 'forbidden' });
    expect(screen.getByRole('heading', { name: /contractor access required/i })).toBeInTheDocument();
  });

  it('greets the contractor and shows the next-due summary + a deliverable', () => {
    renderContent({ status: 'ready', index: ready });
    expect(screen.getByRole('heading', { name: /good morning, dana/i })).toBeInTheDocument();
    expect(screen.getByText(/1 deliverable · next due/i)).toBeInTheDocument();
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
  });

  it('shows the empty state when the contractor has no deliverables', () => {
    renderContent({ status: 'ready', index: { ...ready, deliverables: [] } });
    expect(screen.getByText(/no deliverables assigned yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rr-app/routes/__tests__/contractor.test.tsx`
Expected: FAIL — cannot resolve `../contractor`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/rr-app/routes/contractor.tsx
import { CircleHelp } from 'lucide-react';
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Link } from '@/lib/react-router-adapters';
import type { ContractorOverviewData } from '@/lib/contractor-index';
import { bucketDeliverables, greetingFor, summarizeDeliverables } from '@/lib/contractor-buckets';
import { DeliverableTimeline } from '@/components/contractor/DeliverableTimeline';

/**
 * Contractor home per the login reference (Paper 27P-0): white canvas, quiet top
 * bar, a centered column. Instead of an auth card it renders the signed-in
 * contractor's own deliverables as a vertical-breadcrumb timeline. Access is
 * loader-gated against /api/contractor-index (401 → /login, 403|404 → forbidden).
 */

export type ContractorData =
  | { status: 'ready'; index: ContractorOverviewData }
  | { status: 'forbidden' };

export async function contractorLoader(_args: LoaderFunctionArgs): Promise<ContractorData | Response> {
  const response = await fetch('/api/contractor-index');
  if (response.status === 401) return redirect('/login');
  if (response.status === 403 || response.status === 404) return { status: 'forbidden' };
  if (!response.ok) {
    throw new Response('Unable to load contractor portal', { status: response.status });
  }
  const index = (await response.json()) as ContractorOverviewData;
  return { status: 'ready', index };
}

export function ContractorRoute() {
  const data = useLoaderData() as ContractorData;
  return <ContractorRouteContent data={data} />;
}

export function ContractorRouteContent({ data, now = new Date() }: { data: ContractorData; now?: Date }) {
  if (data.status === 'forbidden') {
    return (
      <div className="overview-light flex min-h-screen items-center justify-center bg-white px-6 antialiased">
        <div className="w-full max-w-md rounded-[20px] border border-[#E8E8E8]/75 bg-white p-6 shadow-[0_10px_20px_#D1D1D126]">
          <h1 className="m-0 text-xl font-semibold text-[#111]">Contractor access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#505050]">
            This portal is available to contractors and admins. If you think this is a
            mistake, ask a SEEKO admin to enable contractor access on your profile.
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex h-9 items-center rounded-full bg-[#111] px-4 text-sm font-medium text-white transition-colors hover:bg-[#000]"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  const { profile, deliverables } = data.index;
  const firstName = (profile.displayName ?? '').trim().split(' ')[0] || 'there';
  const summary = summarizeDeliverables(deliverables, now);
  const buckets = bucketDeliverables(deliverables, now);
  const countLabel = `${summary.count} deliverable${summary.count === 1 ? '' : 's'}`;
  const subline = summary.nextDueLabel ? `${countLabel} · next due ${summary.nextDueLabel}` : countLabel;

  return (
    <div className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased [scrollbar-gutter:stable_both-edges]">
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-[#686868]">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20contractor%20help"
          className="flex items-center gap-2 text-base text-[#686868] transition-colors duration-150 hover:text-[#3a3a3a] active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      <main className="mx-auto w-full max-w-[620px] flex-col py-[clamp(5rem,12vh,8rem)]">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#454545]">
            {greetingFor(now.getHours())}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-[#969696] tabular-nums">{subline}</p>
        </div>
        <DeliverableTimeline buckets={buckets} />
        <p className="mt-10 text-center text-xs text-[#b3b3b3]">
          Questions about a deliverable?{' '}
          <Link to="/legal/terms" className="font-medium text-[#969696] transition-colors hover:text-[#111]">
            Contractor terms
          </Link>
        </p>
      </main>
    </div>
  );
}
```

Then register the route in `src/rr-app/routes.tsx` as a top-level object (outside `RootLayout`), beside the investor cluster — using the file's existing `StandaloneErrorBoundary`:

```tsx
  {
    // Contractor portal — its own light Paper surface built from the login
    // reference (not the investor shell). Loader-gated on is_contractor.
    path: '/contractor',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/contractor');
      return {
        loader: route.contractorLoader,
        Component: route.ContractorRoute,
      };
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rr-app/routes/__tests__/contractor.test.tsx`
Expected: PASS (3 cases). Then `npm run build` to confirm the lazy route + registration compile.

- [ ] **Step 5: Commit**

```bash
git add src/rr-app/routes/contractor.tsx src/rr-app/routes.tsx src/rr-app/routes/__tests__/contractor.test.tsx
git commit -m "feat(contractor): /contractor route — login-styled deliverables home

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

### Task 8: Post-login role redirect (contractor > investor > tasks)

**Files:**
- Create: `src/lib/post-login-destination.ts`
- Modify: `src/components/auth/LoginForm.tsx` (password site ~line 368 and passkey site ~line 416)
- Test: `src/lib/__tests__/post-login-destination.test.ts`

**Interfaces:**
- Consumes: the browser Supabase client already imported in `LoginForm.tsx` (`supabase`).
- Produces:
  - `type PostLoginDestination = '/contractor' | '/investor' | '/tasks'`
  - `resolvePostLoginDestination(supabase: { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }; from: (t: string) => any }): Promise<PostLoginDestination>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/post-login-destination.test.ts
import { describe, expect, it } from 'vitest';
import { resolvePostLoginDestination } from '@/lib/post-login-destination';

function makeSupabase(user: { id: string } | null, profile: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
      }),
    }),
  } as never;
}

describe('resolvePostLoginDestination', () => {
  it('sends contractors to /contractor (contractor wins over investor)', async () => {
    const dest = await resolvePostLoginDestination(
      makeSupabase({ id: 'u1' }, { is_contractor: true, is_investor: true }),
    );
    expect(dest).toBe('/contractor');
  });

  it('sends investors to /investor', async () => {
    const dest = await resolvePostLoginDestination(
      makeSupabase({ id: 'u1' }, { is_contractor: false, is_investor: true }),
    );
    expect(dest).toBe('/investor');
  });

  it('defaults everyone else to /tasks', async () => {
    const dest = await resolvePostLoginDestination(
      makeSupabase({ id: 'u1' }, { is_contractor: false, is_investor: false }),
    );
    expect(dest).toBe('/tasks');
  });

  it('defaults to /tasks when there is no user', async () => {
    const dest = await resolvePostLoginDestination(makeSupabase(null, null));
    expect(dest).toBe('/tasks');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/post-login-destination.test.ts`
Expected: FAIL — cannot resolve `@/lib/post-login-destination`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/post-login-destination.ts
export type PostLoginDestination = '/contractor' | '/investor' | '/tasks';

type MinimalSupabase = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { is_contractor?: boolean | null; is_investor?: boolean | null } | null; error: unknown }>;
      };
    };
  };
};

/**
 * Resolve where a just-authenticated user should land. Role precedence:
 * contractor → /contractor, else investor → /investor, else /tasks (default).
 * Safe fallback to /tasks on any missing user/profile/error.
 */
export async function resolvePostLoginDestination(supabase: MinimalSupabase): Promise<PostLoginDestination> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return '/tasks';

  const { data } = await supabase
    .from('profiles')
    .select('is_contractor, is_investor')
    .eq('id', user.id)
    .maybeSingle();

  if (data?.is_contractor) return '/contractor';
  if (data?.is_investor) return '/investor';
  return '/tasks';
}
```

Then wire it into `src/components/auth/LoginForm.tsx`. Add the import near the top:

```ts
import { resolvePostLoginDestination } from '@/lib/post-login-destination';
```

At the **password sign-in** success site (currently `router.push('/tasks')` near line 368):

```tsx
    trigger('success');
    const dest = await resolvePostLoginDestination(supabase);
    router.push(dest);
    router.refresh();
```

At the **passkey sign-in** success site (currently `router.push('/tasks')` near line 416):

```tsx
      trigger('success');
      const dest = await resolvePostLoginDestination(supabase);
      router.push(dest);
      router.refresh();
```

> Leave the Google OAuth call (`next=/tasks`, ~line 379) unchanged in this task — OAuth role-routing happens server-side in the callback and is a documented follow-up (see “Deferred” below), because Google OAuth is not yet verified end-to-end. Invited contractors sign in via password/passkey, which this task covers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/post-login-destination.test.ts`
Expected: PASS (4 cases).
Run the login suite to confirm no regression: `npx vitest run src/components/auth/__tests__/login.test.tsx` (if present) — expected green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/post-login-destination.ts src/lib/__tests__/post-login-destination.test.ts src/components/auth/LoginForm.tsx
git commit -m "feat(contractor): land contractors on /contractor after login

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0196JisyLwptT87JmYuDmsMs"
```

---

## Final Verification

- [ ] Run the full suite: `npx vitest run`. Expected: all green except the known-red `src/rr-app/routes/__tests__/investor.test.tsx` (pre-existing baseline).
- [ ] `npm run build` succeeds (Vite build ~35–44s).
- [ ] Manual smoke on `:8788` after `npm run build` + restart: sign in as a contractor → lands on `/contractor`; timeline renders bucketed deliverables; expanding a row and moving the slider persists (network `PATCH /api/tasks/:id/progress` → 200); uploading a file → 201 and admin gets a `deliverable_uploaded` notification; a non-contractor hitting `/contractor` sees the forbidden card; a signed-out visitor is redirected to `/login`.
- [ ] Confirm no bounty/payment/personal data appears on the surface.

## Spec coverage notes (design §7 states)

The design lists five render states. This plan implements **empty** (Task 6), **overdue** (red node + pinned bucket, Tasks 5–6), and **write error** (inline, retryable, Task 5). The remaining two are handled as follows:

- **Loading skeleton** — not a component in this plan. React Router 7's `contractorLoader` is a *blocking* loader: the client waits on `/api/contractor-index` before the route renders, so there is no in-route loading frame to skeleton. (A shimmer spine would require converting to a deferred loader + `<Suspense>`/`HydrateFallback` — deliberately out of scope for v1.)
- **All-delivered "You're all caught up" line** — the `Delivered` bucket already renders delivered work; the celebratory line is a one-line polish addition folded into a follow-up, not a blocker. If desired now, add to `ContractorRouteContent` above `<DeliverableTimeline>`: when `summary.count === 0 && deliverables.length > 0`, render `<p className="mb-4 text-sm text-[#15803d]">You're all caught up.</p>`.

## Deferred (documented follow-ups, not in this plan)

- **OAuth callback role routing** — route Google-OAuth contractors to `/contractor` by resolving role in `src/api-server/routes/auth.ts` after code exchange (change the client `next=/tasks` accordingly). Gated on Google OAuth being verified end-to-end.
- **Account-menu `/contractor` link** — mirror the existing `/investor` menu entries (`PageHeaderUser.tsx:181`, `StudioHeaderActions.tsx:247`) behind an `is_contractor` check so the portal is reachable from within the app.
- **Contractor deliverable listing/download** — the GET/DELETE deliverable endpoints are admin-only; grant assignee read access if contractors need to see/re-download prior uploads.
- **Shared `LIGHT_TASK_STATUS` ramp** — promote `DeliverableRow`'s local `STATUS_DOT`/`STATUS_PILL` maps into `lightKit.ts` if reused elsewhere.
