# Architecture Deepening (Candidates 1–6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen six shallow/scattered seams found by the 2026-07-09 architecture review: delete the vestigial next-* shims, centralize realtime subscription auth, collapse six admin-gate copies onto one guard, share the route-loader access anatomy, put one repository behind `external_signing_invites`, and put one seam in front of all `tasks` reads/writes.

**Architecture:** Each candidate becomes one commit on `codex/eko-agent-current`, on top of a checkpoint commit of the current 529-file working tree. Order: 6 → 2 → 3 → 4 → 5 → 1 (smallest/safest first). Every new module is designed interface-first: small interface, injectable dependencies, tested through the interface.

**Tech Stack:** Vite + React Router 7 (`src/rr-app`), Hono api-server (`src/api-server`, tsx, port 8787), Supabase JS v2, Vitest.

## Global Constraints

- Branch: `codex/eko-agent-current`. One candidate = one commit. Never mix candidates in a commit.
- Behavior-preserving except where a task explicitly says "intended bug fix". The tasks write rule stays: **any authenticated user may create/patch; only admins delete** (matches live RLS, verified 2026-07-09).
- `npm test` green before every commit. `npx tsc --noEmit` clean before every commit.
- The api-server is plain tsx — after any `src/api-server/**` or `src/lib/**` change consumed by it, the dev server must be restarted to verify live. `vite build` alone ships client changes (the 8788 server reads `index.html` per request).
- Do NOT touch: `eko_pending_actions` semantics, the EKO approval gate, `.worktrees/**`, RLS policies in the live DB.
- Do NOT re-apply any Supabase migration; no DB changes at all in this plan.
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5`
- Out of scope (filed as follow-ups, do not do): RLS tightening, CLAUDE.md/persona doc rewrite, candidates 7–11 (dialogs, notifyAdmins/rate-limit primitives, light context, EKO activity fixups, AgentCompanion split).

---

### Task 0: Checkpoint commit

**Files:** entire working tree (529 changes including the `src/app` deletions).

- [ ] **Step 1: Verify branch + capture status**

Run: `git branch --show-current` → expect `codex/eko-agent-current`.
Run: `git status --porcelain | wc -l` → expect ~529.

- [ ] **Step 2: Commit everything as a checkpoint**

```bash
git add -A
git commit -m "checkpoint: Vite migration working tree + shipped design work (pre-refactor baseline)

Snapshot of the migrated Vite/RR7 tree before the architecture-deepening
refactor series (docs/plans/2026-07-09-architecture-deepening-1-6.md).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

- [ ] **Step 3: Verify clean tree**

Run: `git status --porcelain | wc -l` → expect 0.
Run: `npm test` → record the baseline pass count (expect all green; if anything is red at baseline, STOP and report — do not fix pre-existing failures inside this series).

---

### Task 1 (Candidate 6): Delete the vestigial next-* shims; one router adapter

**Files:**
- Delete: `src/rr-app/shims/next-navigation.ts`, `next-headers.ts`, `next-cache.ts`, `next-link.tsx`, `next-image.tsx`, `next-dynamic.tsx`, plus their test files under `src/rr-app/shims/__tests__/` (list with `ls src/rr-app/shims/`).
- Modify: `vitest.config.ts:18-23` (remove the six `next/*` alias lines; keep the `'@'` alias).
- Modify: `src/lib/react-router-adapters.tsx` (add `useDataRouter`).
- Modify: `src/lib/hooks/useTasksRealtimeRefresh.ts:1-2,25-26`, `src/rr-app/EkoBusBridge.tsx` (consume `useDataRouter` instead of raw `UNSAFE_DataRouterContext`).

**Interfaces:**
- Produces: `useDataRouter(): Router | null` exported from `@/lib/react-router-adapters` — returns the data router when mounted inside `createBrowserRouter`, `null` otherwise (plain `<MemoryRouter>` in tests).

- [ ] **Step 1: Prove the shims are dead**

Run: `grep -rn "from 'next/\|from \"next/" src --include='*.ts' --include='*.tsx' | grep -v rr-app/shims | grep -v __tests__`
Expected: no output. If any line appears, STOP — the shim is live; report instead of deleting.
Run: `grep -rln "rr-app/shims" src vitest.config.ts vite.config.ts`
Expected: only `vitest.config.ts` and files inside `src/rr-app/shims/` itself.

- [ ] **Step 2: Write the failing test for `useDataRouter`**

Create `src/lib/__tests__/react-router-adapters.data-router.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';
import { useDataRouter } from '@/lib/react-router-adapters';

describe('useDataRouter', () => {
  it('returns null outside a data router', () => {
    const { result } = renderHook(() => useDataRouter(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    expect(result.current).toBeNull();
  });

  it('returns the router inside a data router', () => {
    let captured: unknown = undefined;
    function Probe() {
      captured = useDataRouter();
      return null;
    }
    const router = createMemoryRouter([{ path: '/', element: <Probe /> }]);
    renderHook(() => null, {
      wrapper: () => <RouterProvider router={router} />,
    });
    expect(captured).not.toBeNull();
    expect(typeof (captured as { revalidate: unknown }).revalidate).toBe('function');
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`useDataRouter` is not exported): `npx vitest run src/lib/__tests__/react-router-adapters.data-router.test.tsx`

- [ ] **Step 4: Implement `useDataRouter` in `src/lib/react-router-adapters.tsx`**

Add (reusing the file's existing `UNSAFE_DataRouterContext` import — it already uses it for `useRouter`):

```tsx
/**
 * The data router when mounted under createBrowserRouter/createMemoryRouter,
 * or null under a plain <MemoryRouter> (tests). The ONLY sanctioned access
 * to UNSAFE_DataRouterContext outside this module is via this hook.
 */
export function useDataRouter() {
  const ctx = useContext(UNSAFE_DataRouterContext);
  return ctx?.router ?? null;
}
```

- [ ] **Step 5: Run the test — expect PASS.**

- [ ] **Step 6: Migrate the two raw consumers**

In `src/lib/hooks/useTasksRealtimeRefresh.ts` replace:

```ts
import { useContext, useEffect, useMemo } from 'react';
import { UNSAFE_DataRouterContext } from 'react-router';
...
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const router = dataRouter?.router ?? null;
```

with:

```ts
import { useEffect, useMemo } from 'react';
import { useDataRouter } from '@/lib/react-router-adapters';
...
  const router = useDataRouter();
```

Apply the same substitution in `src/rr-app/EkoBusBridge.tsx` (find its `UNSAFE_DataRouterContext` usage with grep; keep any `useInRouterContext` logic it has that is unrelated to the data router).

- [ ] **Step 7: Delete the shim layer + aliases**

```bash
git rm -r src/rr-app/shims
```

Then delete lines 18–23 of `vitest.config.ts` (the six `next/*` aliases and their comment), keeping `'@'`.

- [ ] **Step 8: Full verification**

Run: `npm test` → same pass count as baseline minus the deleted shim tests, zero failures.
Run: `npx tsc --noEmit` → clean. Run: `npx vite build` → clean.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: delete vestigial next-* shims; useDataRouter is the one router seam

The rr-app/shims layer was aliased only in vitest.config.ts and had zero
source importers; react-router-adapters (47 importers) is the sole Next
bridge. Raw UNSAFE_DataRouterContext reaches in useTasksRealtimeRefresh and
EkoBusBridge now go through useDataRouter().

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

---

### Task 2 (Candidate 2): `subscribeToTable` realtime seam

**Files:**
- Create: `src/lib/realtime.ts`
- Test: `src/lib/__tests__/realtime.test.ts`
- Modify: `src/lib/hooks/useTasksRealtimeRefresh.ts:59-89`, `src/components/dashboard/NotificationBell.tsx:104-144`, `src/components/dashboard/TaskDetail.tsx:935-988`

**Interfaces:**
- Produces:

```ts
export type PostgresChangeSpec = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  table: string;
  schema?: string;            // default 'public'
  filter?: string;            // e.g. `user_id=eq.${userId}`
  handler: (payload: { new: unknown; old: unknown; eventType: string }) => void;
};
// Subscribes with the session token attached FIRST (RLS otherwise silently
// filters every row — the invariant this module exists to own).
// Returns a dispose function; safe to call twice (StrictMode).
export function subscribeToTable(
  client: SupabaseLike,
  channelName: string,
  specs: PostgresChangeSpec[],
): () => void;
```

`SupabaseLike` is the structural subset used: `{ channel(name): ChannelLike; removeChannel(ch): unknown; realtime: { setAuth(token: string): void }; auth: { getSession(): Promise<{ data: { session: { access_token: string } | null } }> } }` with `ChannelLike = { on(type: 'postgres_changes', filter: object, cb: (payload: never) => void): ChannelLike; subscribe(): unknown }`. Define both types in `realtime.ts` — structural typing keeps the module testable with a hand-rolled fake (same style as `doc-share.test.ts`'s fake QueryBuilder).

**Behavior change (intended bug fix):** NotificationBell and TaskDetail currently subscribe WITHOUT `setAuth` — under RLS they receive zero events for session-bearing users. Routing them through this module fixes that. Fixing it is the point; note it in the commit message.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/realtime.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { subscribeToTable, type PostgresChangeSpec } from '@/lib/realtime';

function makeFakeClient(session: { access_token: string } | null) {
  const calls: string[] = [];
  const channel = {
    on: vi.fn(function (this: unknown) { calls.push('on'); return channel; }),
    subscribe: vi.fn(() => { calls.push('subscribe'); }),
  };
  const client = {
    channel: vi.fn(() => { calls.push('channel'); return channel; }),
    removeChannel: vi.fn((ch: unknown) => { calls.push('removeChannel'); return ch; }),
    realtime: { setAuth: vi.fn(() => { calls.push('setAuth'); }) },
    auth: { getSession: vi.fn(async () => ({ data: { session } })) },
  };
  return { client, channel, calls };
}

const spec: PostgresChangeSpec[] = [
  { event: '*', table: 'tasks', handler: () => {} },
];

describe('subscribeToTable', () => {
  it('attaches the session token BEFORE subscribing', async () => {
    const { client, calls } = makeFakeClient({ access_token: 'tok' });
    subscribeToTable(client, 'test-channel', spec);
    await vi.waitFor(() => expect(calls).toContain('subscribe'));
    expect(client.realtime.setAuth).toHaveBeenCalledWith('tok');
    expect(calls.indexOf('setAuth')).toBeLessThan(calls.indexOf('subscribe'));
  });

  it('still subscribes when there is no session (dev)', async () => {
    const { client, channel } = makeFakeClient(null);
    subscribeToTable(client, 'test-channel', spec);
    await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalled());
    expect(client.realtime.setAuth).not.toHaveBeenCalled();
  });

  it('registers one .on per spec with schema defaulted to public', async () => {
    const { client, channel } = makeFakeClient(null);
    subscribeToTable(client, 'c', [
      { event: 'INSERT', table: 'notifications', filter: 'user_id=eq.1', handler: () => {} },
      { event: 'UPDATE', table: 'notifications', filter: 'user_id=eq.1', handler: () => {} },
    ]);
    await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalled());
    expect(channel.on).toHaveBeenCalledTimes(2);
    expect(channel.on.mock.calls[0][1]).toMatchObject({ event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.1' });
  });

  it('dispose removes the channel and is idempotent; disposal before session resolution never subscribes', async () => {
    let resolveSession!: (v: { data: { session: null } }) => void;
    const pending = new Promise<{ data: { session: null } }>((r) => { resolveSession = r; });
    const { client, channel } = makeFakeClient(null);
    client.auth.getSession = vi.fn(() => pending) as never;
    const dispose = subscribeToTable(client, 'c', spec);
    dispose();
    dispose();
    resolveSession({ data: { session: null } });
    await Promise.resolve();
    expect(channel.subscribe).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing): `npx vitest run src/lib/__tests__/realtime.test.ts`

- [ ] **Step 3: Implement `src/lib/realtime.ts`**

```ts
/**
 * The one seam for Supabase postgres_changes subscriptions.
 *
 * Invariant this module owns: the session token is attached to the realtime
 * socket BEFORE the channel subscribes — a channel that joins as anon is
 * silently filtered to zero rows by RLS. (Previously re-derived per call
 * site and lost in 2 of 3.)
 */

export type PostgresChangeSpec = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  table: string;
  schema?: string;
  filter?: string;
  handler: (payload: { new: unknown; old: unknown; eventType: string }) => void;
};

type ChannelLike = {
  on(type: 'postgres_changes', filter: Record<string, unknown>, cb: (payload: never) => void): ChannelLike;
  subscribe(): unknown;
};

export type SupabaseLike = {
  channel(name: string): ChannelLike;
  removeChannel(channel: ChannelLike): unknown;
  realtime: { setAuth(token: string): void };
  auth: { getSession(): Promise<{ data: { session: { access_token: string } | null } }> };
};

export function subscribeToTable(
  client: SupabaseLike,
  channelName: string,
  specs: PostgresChangeSpec[],
): () => void {
  let disposed = false;
  let channel: ChannelLike | null = client.channel(channelName);

  for (const spec of specs) {
    channel = channel.on(
      'postgres_changes',
      {
        event: spec.event,
        schema: spec.schema ?? 'public',
        table: spec.table,
        ...(spec.filter ? { filter: spec.filter } : {}),
      },
      spec.handler as (payload: never) => void,
    );
  }

  const live = channel;
  void client.auth.getSession().then(({ data: { session } }) => {
    if (disposed) return;
    if (session) client.realtime.setAuth(session.access_token);
    live.subscribe();
  });

  return () => {
    if (disposed) return;
    disposed = true;
    void client.removeChannel(live);
  };
}
```

- [ ] **Step 4: Run the tests — expect PASS.**

- [ ] **Step 5: Migrate the three call sites**

1. `src/lib/hooks/useTasksRealtimeRefresh.ts` — replace the channel block (lines 59–78) and the cleanup's `removeChannel` line with:

```ts
    // 2. Realtime row events — subscribeToTable owns the setAuth-before-
    // subscribe invariant.
    const disposeRealtime = supabase
      ? subscribeToTable(supabase, 'tasks-board-live', [
          { event: '*', table: 'tasks', handler: scheduleRevalidate },
        ])
      : () => {};
```

and in the cleanup return: `disposeRealtime();` (delete the `disposed` flag and `if (supabase && channel) void supabase.removeChannel(channel);` — dispose handles both). Import: `import { subscribeToTable } from '@/lib/realtime';`. The real `SupabaseClient` satisfies `SupabaseLike` structurally; if tsc complains about the payload generic, adapt handlers as `(payload) => scheduleRevalidate()`.

2. `src/components/dashboard/NotificationBell.tsx:104-144` — replace the whole effect body with one `subscribeToTable(supabase, 'notifications', [...])` call carrying the three existing specs (INSERT/UPDATE/DELETE on `notifications`, filter `user_id=eq.${userId}`, handlers verbatim from the current `.on` callbacks — cast `payload.new as Notification` inside the handlers exactly as today). Effect cleanup returns the dispose function.

3. `src/components/dashboard/TaskDetail.tsx:935-988` — same treatment for the `comments:${task.id}` channel: three specs on `task_comments` with filter `task_id=eq.${task.id}`, handler bodies moved verbatim (including the `isMounted` guard — keep it, it guards the async profile-join fetch, not the channel).

- [ ] **Step 6: Verify**

Run: `npm test` (all green), `npx tsc --noEmit`, `npx vite build`.
Manual: dev server, open /tasks — the board still live-updates on an EKO `write-executed` (bus signal is the dev-working signal; realtime itself needs a browser session, which dev lacks — matching prior behavior).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: subscribeToTable owns the realtime setAuth invariant

One module now owns token-before-subscribe; NotificationBell and
TaskDetail's hand-rolled channels were missing setAuth entirely (latent
RLS silent-drop bugs) and are fixed by routing through the seam.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

---

### Task 3 (Candidate 3): One admin gate

**Files:**
- Modify: `src/api-server/auth-utils.ts` (extend `requireAdmin` with an injectable resolver variant)
- Test: `src/api-server/__tests__/auth-utils.test.ts` (create)
- Modify (delete copies): `src/api-server/routes/external-signing.ts:1053-1070` (local `requireAdmin`), `src/api-server/agent/eko-activity.ts` (`assertAdmin`), inline `is_admin` profile selects in `src/api-server/routes/tasks.ts` (×2), `routes/profile.ts`, `routes/payments.ts`, `routes/workflow.ts`, `routes/agreement.ts` (locate each with `grep -n "is_admin" src/api-server/routes/*.ts src/api-server/agent/*.ts`)

**Interfaces:**
- Consumes: existing `requireUser(c)` / `requireAdmin(c)` in `auth-utils.ts` (already return `{ok, user, isAdmin, isInvestor}` — the canonical guard EXISTS; this task deletes its copies).
- Produces:

```ts
// auth-utils.ts — new export. Same AuthGuard union as requireUser.
// authResolver preserves each route module's DI test seam (app.test.ts
// injects fake resolvers); flags are read via the service client so the
// guard works for token-only resolvers that bypass cookie auth.
export async function requireAdminVia(
  c: Context,
  authResolver: (c: Context) => Promise<AuthenticatedUser | null>,
): Promise<AuthGuard>;
```

Implementation to add:

```ts
export async function requireAdminVia(
  c: Context,
  authResolver: (c: Context) => Promise<AuthenticatedUser | null>,
): Promise<AuthGuard> {
  const user = await authResolver(c);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };

  if (isDevAuthBypass()) {
    return { ok: true, user, isAdmin: true, isInvestor: false };
  }

  const service = getServiceClient();
  const { data } = await service
    .from('profiles')
    .select('is_admin, is_investor')
    .eq('id', user.id)
    .maybeSingle();

  const profile = data as { is_admin?: boolean; is_investor?: boolean } | null;
  if (!profile?.is_admin) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, user, isAdmin: true, isInvestor: !!profile.is_investor };
}
```

- [ ] **Step 1: Inventory the copies** — `grep -n "is_admin" src/api-server/routes/*.ts src/api-server/agent/*.ts src/api-server/*.ts`. Record every gate-shaped hit (a profiles select feeding a 403). Expect ~6 besides auth-utils itself.

- [ ] **Step 2: Write failing tests** for `requireAdminVia` in `src/api-server/__tests__/auth-utils.test.ts`: (a) resolver returns null → `{ok:false,status:401}`; (b) resolver returns user, service profile has `is_admin:true` → ok with flags; (c) `is_admin:false` → 403; (d) no profile row (`maybeSingle` null) → 403. Mock `@/lib/supabase/service` with `vi.mock` returning a chainable fake (`from().select().eq().maybeSingle()`), and `../supabase`'s `isDevAuthBypass` to return false. Follow the mock style used in `src/api-server/__tests__/app.test.ts`.

- [ ] **Step 3: Run — FAIL. Implement (code above). Run — PASS.**

- [ ] **Step 4: Delete the copies, one route file at a time, running `npm test` after each:**

- `external-signing.ts`: delete the local `requireAdmin` (lines ~1053-1070); replace its call sites with `requireAdminVia(c, authResolver)` (the module's existing injected resolver). Leave the local `getClientIp`/`isRateLimited` alone (candidate 8, out of scope).
- `eko-activity.ts` `assertAdmin`: replace body with a call to the same service-client check via `requireAdminVia` IF it receives a Context; if its signature is `(service, userId)` (no Context), instead re-implement it as a thin delegate to a new small pure helper extracted inside auth-utils: `export async function isAdminUser(userId: string): Promise<boolean>` using `getServiceClient()` + `maybeSingle`. Then `requireAdminVia` also uses `isAdminUser` internally (single profile-flag read implementation; adjust the `requireAdminVia` code accordingly so flags come from one query — implementer's choice, but exactly ONE place may query `profiles.is_admin`).
- Inline selects in `tasks.ts`, `profile.ts`, `payments.ts`, `workflow.ts`, `agreement.ts`: replace each `service.from('profiles').select('is_admin'...)` + 403 block with `requireAdminVia(c, authResolver)` (modules with an injected resolver) or plain `requireAdmin(c)` (modules that already use cookie auth via auth-utils). Preserve each route's exact response shape (`c.json({ error: 'Forbidden' }, 403)` vs custom copy — grep the current literal and keep it).

- [ ] **Step 5: Verify** — `npm test` (esp. `app.test.ts`), `npx tsc --noEmit`. Restart the api-server; smoke `curl -s localhost:8787/api/tasks-board` (expect 401 JSON, unchanged shape).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: one admin gate — requireAdminVia + isAdminUser; delete 6 copies

profiles.is_admin is now read in exactly one module. Route modules keep
their injectable authResolver test seams.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

---

### Task 4 (Candidate 4): `loadView<T>` + one `AccessError`

**Files:**
- Create: `src/rr-app/load-view.ts` + `src/rr-app/__tests__/load-view.test.ts`
- Create: `src/lib/access-error.ts` + `src/lib/__tests__/access-error.test.ts`
- Modify: every `src/rr-app/routes/*.tsx` loader using the fetch/status anatomy (16 files — inventory with `grep -ln "status: 'unauthorized'" src/rr-app/routes/*.tsx`) and their `__tests__`
- Modify: the 10 `*AccessError` classes and their throw/catch sites — inventory with `grep -rn "AccessError" src/lib src/api-server --include='*.ts' | grep -v __tests__ | grep -v node_modules`

**Interfaces:**
- Produces (client):

```ts
// src/rr-app/load-view.ts
export type ViewState<T> =
  | { status: 'ready'; data: T }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function loadView<T>(url: string, errorMessage: string): Promise<ViewState<T>> {
  const response = await fetch(url);
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response(errorMessage, { status: response.status });
  return { status: 'ready', data: (await response.json()) as T };
}
```

- Produces (server):

```ts
// src/lib/access-error.ts
export type AccessReason = 'unauthorized' | 'forbidden' | 'profile_not_found' | 'not_found';

export class AccessError extends Error {
  constructor(public readonly reason: AccessReason, message?: string) {
    super(message ?? reason);
    this.name = 'AccessError';
  }
}

export function accessErrorStatus(reason: AccessReason): 401 | 403 | 404 {
  if (reason === 'unauthorized') return 401;
  if (reason === 'forbidden') return 403;
  return 404;
}
```

- [ ] **Step 1: TDD the two new modules.** load-view tests: mock global `fetch` (`vi.stubGlobal`) for 200→ready+parsed data / 401 / 403 / 404 / 500→throws Response with the message. access-error tests: reason→status mapping ×4, `instanceof AccessError`.

- [ ] **Step 2: Migrate loaders in three batches (~5 files each), `npm test` between batches.** Worked example — `src/rr-app/routes/tasks.tsx` becomes:

```ts
import { loadView, type ViewState } from '../load-view';
type TasksLoaderData = ViewState<TasksBoardData>;

export async function tasksLoader(_args: LoaderFunctionArgs): Promise<TasksLoaderData> {
  return loadView<TasksBoardData>('/api/tasks-board', 'Unable to load tasks');
}
```

and every `data.board` in the component becomes `data.data` — RENAME CAREFULLY per file (each route names its payload differently: `board`, `index`, `roster`…). Update each route's `__tests__` the same way. The per-file status unions (`TasksLoaderData` etc.) collapse to `ViewState<X>` aliases; the `RouteContent` switches keep their bespoke copy/JSX (only the union declaration and payload key change).

- [ ] **Step 3: Collapse the server error classes.** For each of the 10 `*AccessError` classes: change the lib loader to `throw new AccessError('forbidden')` (etc. — preserve each class's existing reason semantics exactly; check each class's fields for a reason/status it already carries), and change the route `catch` blocks to `if (err instanceof AccessError) return c.json({ error: err.reason }, accessErrorStatus(err.reason))` — PRESERVING each route's current JSON error body string (grep the current body first; if a route returns `{ error: 'profile_not_found' }` today, keep that exact string via `err.reason`/message). Keep `export type` re-exports if other files import the old class names, then delete the old classes once `npx tsc --noEmit` shows no remaining references. Update lib `__tests__` that assert on the old classes.

- [ ] **Step 4: Verify** — `npm test`, `npx tsc --noEmit`, `npx vite build`, restart api-server, smoke: unauthenticated `curl -s localhost:8787/api/tasks-board` → same status + body as before Task 4 (compare with the Task 3 smoke output).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: loadView<T> + one AccessError replace 16 loader copies and 10 error classes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

---

### Task 5 (Candidate 5): Invites repository over `external_signing_invites`

**Files:**
- Create: `src/lib/invites-repo.ts` + `src/lib/__tests__/invites-repo.test.ts`
- Modify: `src/lib/external-signing.ts`, `src/lib/doc-share.ts`, `src/lib/invoice-request.ts` (delegate to the repo; delete duplicated internals), `src/lib/invite-filters.ts` (unchanged — the repo imports `isSigningInvite` and friends)

**Interfaces:**
- Consumes: `isSigningInvite` (and the doc-share/invoice equivalents) from `@/lib/invite-filters`; the `service?` injection pattern already used by all three libs.
- Produces:

```ts
// src/lib/invites-repo.ts
export type InvitePurpose = 'signing' | 'doc_share' | 'invoice_request';

export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

// Loads one invite row by token for the given purpose. Applies the
// cross-product isolation guard INSIDE the seam (a row of the wrong
// purpose is not_found, never leaked) and the shared expire-if-past
// branch (mutates status to 'expired' when past due, best-effort).
export async function loadInviteByToken(opts: {
  token: string;
  purpose: InvitePurpose;
  service?: ServiceClient;      // same structural type the three libs declare today — move ONE copy here, export it
}): Promise<{ ok: true; invite: InviteRow } | { ok: false; reason: 'not_found' | 'expired' | 'revoked' }>;
```

`InviteRow` = the row type the three libs currently share (find the widest one they select; export it from the repo). The purpose guard maps: `signing` → `isSigningInvite(row)`, and the analogous predicates the other two libs use today (grep `invite-filters.ts` for the doc-share/invoice guards; if a lib open-codes its guard, move that predicate into `invite-filters.ts` first).

- [ ] **Step 1: Read the three load functions side by side** (`loadExternalSigningInvite` in `external-signing.ts`, `loadDocShare` in `doc-share.ts`, the invoice equivalent in `invoice-request.ts`). Write down: selected columns, status/expiry branches, purpose guards. The repo's behavior = the UNION of the three, parameterized; any genuine divergence stays in the veneer, NOT the repo.

- [ ] **Step 2: TDD `invites-repo`** with a fake `QueryBuilder` (copy the fake style from `src/lib/__tests__/doc-share.test.ts:22`): wrong-purpose row → `not_found` (isolation), past `expires_at` → `expired` + status write attempted, revoked → `revoked`, happy path → invite returned. Plus `maskEmail` cases (normal, short local part, no `@`).

- [ ] **Step 3: Delegate the three libs.** Each lib: delete its local `maskEmail` (re-export from the repo: `export { maskEmail } from './invites-repo';` so route imports keep working), delete its local `ServiceClient`/`QueryBuilder` structural types (import the repo's), and rewrite its load function's shared body as a `loadInviteByToken` call + purpose-specific shaping. Keep every exported signature IDENTICAL — routes and tests must not change in this task. `npm test` after each of the three libs.

- [ ] **Step 4: Verify** — `npm test` (the three libs' existing suites are the regression net), `npx tsc --noEmit`, restart api-server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: invites repository — one loader behind external_signing_invites

maskEmail/QueryBuilder/expiry logic deduped x3; cross-product isolation
enforced inside the seam instead of remembered at call sites.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

---

### Task 6 (Candidate 1): One seam for tasks reads & writes

**Files:**
- Create: `src/lib/tasks-repo.ts` + `src/lib/__tests__/tasks-repo.test.ts` (server repo)
- Create: `src/lib/task-store.ts` + `src/lib/__tests__/task-store.test.ts` (client store)
- Modify: `src/api-server/routes/tasks.ts` (add POST `/tasks`, PATCH `/tasks/:id`, DELETE `/tasks/:id`)
- Modify: `src/api-server/__tests__/app.test.ts` (endpoint coverage)
- Modify: `src/api-server/agent/tools/task-write-tools.ts` (commit() delegates to tasks-repo)
- Modify (client write sites → task-store): `src/components/dashboard/TaskDetail.tsx:852,905,1175,1593,1611`, `TaskList.tsx:244-259,277,323,326,363,383`, `tasks/TasksBoard.tsx:153-156,190-193,222`, `InvestorAreaCard.tsx:103`, `tasks/TaskDetailPage.tsx:80`, `tasks/PropertiesSection.tsx:164-171`

**Interfaces:**
- Produces (server, service-role, injectable):

```ts
// src/lib/tasks-repo.ts
export const TASK_PATCH_COLUMNS = [
  'name', 'status', 'priority', 'department', 'assignee_id',
  'deadline', 'area_id', 'description', 'progress', 'bounty',
] as const;
// ^ BEFORE finalizing: enumerate every column PropertiesSection.tsx's generic
// saveColumn() can send and every column the 5 TaskDetail/TaskList writes send;
// the whitelist must be a superset. Add any missing one.
export type TaskPatch = Partial<Record<(typeof TASK_PATCH_COLUMNS)[number], unknown>>;

export function sanitizeTaskPatch(input: Record<string, unknown>): TaskPatch; // drops unknown keys; {} if nothing valid
export async function createTask(fields: TaskPatch & { name: string }, service?: ServiceClient): Promise<{ task: TaskRow } | { error: string }>;
export async function updateTask(id: string, patch: TaskPatch, service?: ServiceClient): Promise<{ ok: true } | { error: string }>;
export async function deleteTask(id: string, service?: ServiceClient): Promise<{ ok: true } | { error: string }>;
```

- Produces (client):

```ts
// src/lib/task-store.ts — the client's ONLY door to task mutations.
export type TaskWriteResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export async function createTask(fields: Record<string, unknown>): Promise<TaskWriteResult<{ task: TaskRowLike }>>;
export async function updateTask(id: string, patch: Record<string, unknown>): Promise<TaskWriteResult>;
export async function deleteTask(id: string): Promise<TaskWriteResult>;
// fetch('/api/tasks'...), JSON body, credentials included by same-origin default;
// non-2xx → { ok:false, error: parsed error string or statusText }.
```

- Endpoint gates (Task 3's guards): POST + PATCH → `requireUser`-level (any authenticated; preserves live RLS behavior); DELETE → admin (`requireAdminVia` with the module's injected `authResolver`). PATCH body passes through `sanitizeTaskPatch`; empty patch → 400.

- [ ] **Step 1: Enumerate the real write surface.** Read `PropertiesSection.tsx` fully; list every column its `saveColumn` can send. Read the TaskList insert (lines 244-259) for creation fields. Adjust `TASK_PATCH_COLUMNS` to the superset. Record the list in the commit message.

- [ ] **Step 2: TDD `tasks-repo`** with an injected fake service (chainable `from('tasks').update().eq()` / `.insert().select().single()` / `.delete().eq()`): sanitize drops unknown keys (`{status:'Done', evil:'x'}` → `{status:'Done'}`); update happy path calls the right chain; delete happy path; supabase error surfaces as `{error}`.

- [ ] **Step 3: TDD the three endpoints** in `app.test.ts` style (inject stub loaders/resolvers): unauthenticated POST/PATCH/DELETE → 401; authenticated non-admin DELETE → 403; authenticated PATCH with `{status:'Done'}` → 200 and repo called with sanitized patch; PATCH with only unknown keys → 400. Wire the routes:

```ts
    .post('/tasks', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body.name !== 'string' || !body.name.trim()) return c.json({ error: 'invalid_body' }, 400);
      const fields = { ...sanitizeTaskPatch(body), name: body.name.trim() };
      const result = await createTask(fields);
      if ('error' in result) return c.json({ error: result.error }, 500);
      return c.json({ task: result.task });
    })
    .patch('/tasks/:id', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      const body = await c.req.json().catch(() => null);
      const patch = body ? sanitizeTaskPatch(body) : {};
      if (!Object.keys(patch).length) return c.json({ error: 'empty_patch' }, 400);
      const result = await updateTask(c.req.param('id'), patch);
      if ('error' in result) return c.json({ error: result.error }, 500);
      return c.json({ ok: true });
    })
    .delete('/tasks/:id', async (c) => {
      const guard = await requireAdminVia(c, authResolver);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const result = await deleteTask(c.req.param('id'));
      if ('error' in result) return c.json({ error: result.error }, 500);
      return c.json({ ok: true });
    })
```

(Repo functions injectable through `TasksRoutesOptions` like the existing loaders, so `app.test.ts` stubs them.)

- [ ] **Step 4: TDD `task-store`** with `vi.stubGlobal('fetch', ...)`: updateTask PATCHes the right URL/body/headers; non-2xx → `{ok:false}` with server error string; network throw → `{ok:false}`.

- [ ] **Step 5: Migrate client write sites, one component at a time, `npm test` between.** Worked example — `TasksBoard.tsx` `handleStatusChange` core:

```ts
      const result = await updateTask(taskId, { status: nextStatus });
      if (!result.ok) {
        setLocalTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: prevStatus } : t)));
        console.error('Failed to update task.status:', result.error);
        toast.error('Failed to change status. Please try again.');
      } else {
```

Every migration preserves the surrounding optimistic-update + revert + toast logic EXACTLY — only the transport line changes (`supabase.from('tasks')...` → `task-store` call, error checks flip from `{ error }` to `!result.ok`). Delete now-unused `createClient()` imports per file (only where no other query in the file needs it — TaskDetail keeps its client for comments/realtime).

- [ ] **Step 6: Point the EKO write tools at the repo.** In `task-write-tools.ts`, replace direct `service.from('tasks').update/insert/delete` calls inside `commit()` bodies with `updateTask/createTask/deleteTask(..., service)` (pass the tool's existing service client through — semantics, staging, and eko-activity fixups unchanged). Run the agent test suite: `npx vitest run src/api-server/agent`.

- [ ] **Step 7: Full verification.** `npm test`, `npx tsc --noEmit`, `npx vite build`, restart api-server. Live smoke with DEV_AUTH_BYPASS: PATCH a scratch task's status via `curl -X PATCH localhost:8787/api/tasks/<id> -H 'content-type: application/json' -d '{"status":"Todo"}'` → `{ok:true}` and the row changes (check via the board endpoint); then flip it back.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: tasks seam — tasks-repo (server) + task-store (client) behind /api/tasks

POST/PATCH/DELETE /api/tasks[:id] with whitelist sanitization; ~13 direct
browser writes and the EKO write tools now share one repository. Write
rule preserved: any authenticated user creates/patches, admins delete.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

---

### Task 7: Housekeeping — CONTEXT.md, schema doc, follow-ups

**Files:**
- Create: `CONTEXT.md` (repo root — domain glossary; the architecture review found none)
- Modify: `docs/supabase-schema.sql` (the `tasks` policy block — the doc claims `can_read_task_for_rls`; live DB has `authenticated`-wide SELECT/UPDATE, admin DELETE — verified 2026-07-09)

- [ ] **Step 1: Write `CONTEXT.md`** defining the new seams so future reviews use the same names: **task store** (client door to task mutations), **tasks repo** (server door to the `tasks` table), **invites repo** (one loader behind `external_signing_invites`, purpose-discriminated), **admin gate** (`requireUser`/`requireAdmin`/`requireAdminVia` — the only readers of `profiles.is_admin`), **view state** (`loadView`/`ViewState` — the loader access anatomy), **realtime seam** (`subscribeToTable` — owns setAuth-before-subscribe), **router adapter** (`react-router-adapters` — the only `UNSAFE_DataRouterContext` reader). One short paragraph each; note the EKO staged-write invariant (writes stage to `eko_pending_actions`; only `executeById` commits, behind the admin gate).

- [ ] **Step 2: Correct the `tasks` policies in `docs/supabase-schema.sql`** to match the live DB (SELECT: any authenticated; INSERT: any authenticated; UPDATE: any authenticated — flagged as a tightening candidate; DELETE: admin only). Add a `-- NOTE (2026-07-09): live policies verified via pg_policies; UPDATE-for-all is a known tightening candidate.` comment.

- [ ] **Step 3: Record follow-ups** at the bottom of this plan file under a `## Follow-ups` heading: RLS tightening decision, CLAUDE.md/persona doc drift (they still teach Next.js), candidates 7–11, worktree `.worktrees/external-signing` still carries the old fail-open DocuSign HMAC.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: CONTEXT.md seam glossary; correct tasks RLS in schema doc; log follow-ups

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UYh9KZ3r416eZwTN8hqbP5"
```

## Follow-ups

1. RLS tightening decision: tasks UPDATE-for-all-authenticated (any column) — decide whether to restrict to whitelisted columns/roles now that all writes flow through /api/tasks.
2. Doc drift: repo CLAUDE.md + all 4 docs/personas/*.md still describe Next.js 16/proxy.ts/localhost:3000 — actively wrong for the Vite+Hono reality.
3. Architecture-review candidates 7–11 not implemented (dialogs, notifyAdmins/rate-limit primitives incl. external-signing local getClientIp/isRateLimited copies, light context, EKO activity fixups, AgentCompanion split).
4. .worktrees/external-signing may still carry the old fail-open DocuSign HMAC — check before merging that worktree; also add a startup assertion for missing DOCUSIGN_CONNECT_HMAC_SECRET when SIGNING_PROVIDER=docusign (silent-401 availability footgun).
5. Admin-gate deferrals: workflow.ts:241 admin-OR-investor gate (untested), payments-auth.ts:65,69 passkey gates — consider folding into auth-utils with an allowInvestor/cookie-client variant.
6. Three server routes still write tasks directly (admin.ts:110, workflow.ts:227, tasks.ts:347) — route through tasks-repo.
7. Latent (pre-existing, preserved): signing invite guard keys off template_type not purpose — invariant maintained by insertion code; consider adding purpose==='signing' to isLocalSigningInvite.
8. createTask in tasks-repo doesn't self-sanitize (callers currently safe) — add sanitize for defense-in-depth; add POST blank-name 400 test.
9. Realtime polish: getSession().then() lacks .catch in realtime.ts; no component-level test that NotificationBell/TaskDetail wire correct table/filter specs; watch the lazy-bell test flake in CI.
10. Schema-doc staleness beyond tasks: the can_read_task_for_rls function body and the task_milestone/milestones policy sections in docs/supabase-schema.sql may also be stale vs live; SECURITY: the 20260619 tasks-SELECT hardening (can_read_task_for_rls) is no longer in force on the live DB — tasks SELECT is open to any authenticated user (contractors/investors included). Decide whether to re-harden alongside the UPDATE tightening in item 1.
