# EKO Agent — In-Server Tool-Use Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EKO's brittle prose-as-API planner with a real in-server Anthropic tool-use loop where read tools run live and write tools stage gated `eko_pending_actions` rows the user approves by id — so a conditional request like "update the milestones if they aren't on track" resolves and acts instead of narrating.

**Architecture:** A provider-agnostic `runAgentLoop` (behind an injectable `ModelCaller`) drives an Anthropic tool-use conversation. Tools come from a single registry: read tools return live board slices; write tools `stage()` (resolve entity refs against the structured board via `entity-index.ts`, validate, no mutation) and `commit()` (bare Supabase mutation + activity-feed attribution). The runtime stages resolved writes as durable `eko_pending_actions` rows; approval executes each row by id through the tool's `commit`. The old prose-planner, its regex reparsers, and the client's `inferPendingWriteDraft` are deleted in the cutover tasks.

**Tech Stack:** TypeScript, Hono api-server (plain `tsx`), `@anthropic-ai/sdk@^0.78.0`, Supabase (`getServiceClient` service-role singleton), Vitest 4, React 19 client (`AgentCompanion.tsx`).

## Global Constraints

- **Approval gate is inviolable.** Every write stays approval-gated end to end. NEVER weaken, bypass, or alter the admin check — the current `assertAdminUser` logic (`profiles.is_admin`, throw 403 when false) moves verbatim into `assertAdmin` in `eko-activity.ts` and runs at execute time on every approval.
- **api-server is plain `tsx`.** After editing any `src/api-server/**` file, the running dev api-server must be restarted for the change to take effect (implementers do not restart it; note it for QA).
- **Do NOT edit App Router pages, `route.ts`, or `proxy.ts`** — a parallel migration agent may be rewriting them. This plan touches only `src/api-server/**`, `src/lib/**`, `src/components/dashboard/AgentCompanion.tsx`, and `supabase/migrations/**`.
- **Commit hygiene:** stage only the explicit paths each step names (`git add <path> <path>`). NEVER `git add -A`, `git add .`, or `git add -a` — the working tree carries ~520 unrelated Next→Vite migration deltas.
- **Commit trailers (every commit):**
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XEwokG6praJ2DGhc79fpiA
  ```
- **Branch:** all work lands on `codex/eko-agent-current` (EKO lives here, unmerged, mid Next→Vite migration). Do not merge to `main`.
- **Gate (per task and final):** the task's scoped Vitest files green **and** no NEW `tsc --noEmit` errors on touched files. The repo carries **45 pre-existing** Next→Vite `tsc` errors, **0 on the EKO surface** — a clean repo-wide `tsc` is not achievable; the bar is "no new errors on files this task touched."
- **Enum values (verbatim, from `src/lib/types.ts` + `docs/personas/ia.md`):**
  - `task_status`: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`
  - `priority`: `Urgent`, `High`, `Medium`, `Low`
  - `milestone_health`: `on_track`, `at_risk`, `off_track`
  - `area_status`: `Active`, `Planned`, `Complete`
  - `area_phase`: `Alpha`, `Beta`, `Launch`
  - task `department` default for EKO-created tasks: `Coding`
- **Supabase table type gap:** `eko_pending_actions`, `milestones`, and `areas` write-paths are not in the generated `Database` types until types are regenerated post-migration. Use the repo's established cast — `(service as any).from('…')` — exactly as `loadTasksBoard`/`context.ts` already do. Do not add new type generation to this plan.
- **Migration is user-gated.** The migration SQL ships in this plan, but APPLYING it to the live remote DB is the user's call (like `notes`). Every test mocks the service client and never requires the live table.
- **Never print secrets** (API keys, service-role key, auth headers) in output, logs, or test fixtures.

---

## File Structure

New files:
- `supabase/migrations/20260706000001_eko_pending_actions.sql` — the durable staging table (Task 2).
- `src/api-server/agent/pending-actions.ts` — lifecycle CRUD over `eko_pending_actions` (Task 2).
- `src/api-server/agent/errors.ts` — `AgentActionError` (shared, cycle-free) (Task 4).
- `src/api-server/agent/eko-activity.ts` — `assertAdmin` + activity-feed attribution helpers (Task 4).
- `src/api-server/agent/tool-contract.ts` — tool type contract (Task 3).
- `src/api-server/agent/tools/read-tools.ts` — `list_tasks`/`list_milestones`/`list_areas`/`list_staff` (Task 3).
- `src/api-server/agent/tools/task-write-tools.ts` — task create/status/assignee/priority/due/delete (Task 4).
- `src/api-server/agent/tools/milestone-area-write-tools.ts` — milestone health, area status/progress (Task 5).
- `src/api-server/agent/tool-registry.ts` — `AGENT_TOOLS`, `getToolById` (Task 3, grows Tasks 4–5).
- `src/api-server/agent/runtime.ts` — `runAgentLoop`, `ModelCaller`, `createAnthropicCaller`, `EKO_AGENT_SYSTEM` (Task 6).
- `src/lib/eko-agent-client.ts` — pure client request/response mapping helpers (Task 8).
- Colocated `__tests__/*.test.ts` for each new module.

Modified files:
- `src/api-server/agent/entity-index.ts` — add milestone/area/staff resolvers (Task 1).
- `src/api-server/routes/agent.ts` — strangled down to the loop driver + approval executor (Task 7).
- `src/api-server/__tests__/app.test.ts` — swap deleted-export tests for the new contract (Task 7).
- `src/components/dashboard/AgentCompanion.tsx` — mint/send `conversationId`, render from `pendingActions`, approve by id, delete `inferPendingWriteDraft` (Task 8).

Deleted files:
- `src/api-server/routes/__tests__/agent-planner.test.ts` (Task 7 — its subject, `planLocalIssueWrite`, is deleted).
- `src/api-server/agent/context.ts` + `src/api-server/agent/__tests__/context.test.ts` (Task 9 — orphaned once the chat path stops dumping prose context; only if grep confirms zero remaining consumers).

---

## Task 1: Extend entity-index with milestone / area / staff resolvers

**Files:**
- Modify: `src/api-server/agent/entity-index.ts`
- Test: `src/api-server/agent/__tests__/entity-index.test.ts` (append)

**Interfaces:**
- Consumes: `TasksBoardData` (`board.projectMilestones: Milestone[]`, `board.areas: Area[]`, `board.team: Profile[]`).
- Produces (later tasks rely on these exact signatures):
  - `type MilestoneIndexEntry = { id: string; name: string; health?: string; targetDate?: string }`
  - `type AreaIndexEntry = { id: string; name: string; status?: string; progress?: number; phase?: string }`
  - `buildMilestoneIndex(board: TasksBoardData | null): MilestoneIndexEntry[]`
  - `buildAreaIndex(board: TasksBoardData | null): AreaIndexEntry[]`
  - `resolveMilestoneRef(value: string, index: MilestoneIndexEntry[]): MilestoneIndexEntry | undefined`
  - `resolveAreaRef(value: string, index: AreaIndexEntry[]): AreaIndexEntry | undefined`
  - `resolveStaffRef(value: string, index: StaffIndexEntry[]): StaffIndexEntry | undefined`

- [ ] **Step 1: Write the failing tests** — append to `src/api-server/agent/__tests__/entity-index.test.ts`:

```ts
import {
  buildMilestoneIndex,
  buildAreaIndex,
  resolveMilestoneRef,
  resolveAreaRef,
  resolveStaffRef,
} from '../entity-index';

describe('buildMilestoneIndex', () => {
  it('maps every board milestone to an entry with id, name, health, targetDate', () => {
    const board = makeBoard({
      projectMilestones: [
        { id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-05-01', sort_order: 0, created_at: 'x' },
        { id: 'm2', name: 'Beta', health: null, sort_order: 1, created_at: 'x' },
      ] as never,
    });
    expect(buildMilestoneIndex(board)).toEqual([
      { id: 'm1', name: 'Alpha', health: 'on_track', targetDate: '2026-05-01' },
      { id: 'm2', name: 'Beta', health: undefined, targetDate: undefined },
    ]);
  });
  it('returns [] for a null board', () => {
    expect(buildMilestoneIndex(null)).toEqual([]);
  });
});

describe('buildAreaIndex', () => {
  it('maps every board area to an entry with id, name, status, progress, phase', () => {
    const board = makeBoard({
      areas: [{ id: 'a1', name: 'Main Game', status: 'Active', progress: 40, phase: 'Beta' }] as never,
    });
    expect(buildAreaIndex(board)).toEqual([
      { id: 'a1', name: 'Main Game', status: 'Active', progress: 40, phase: 'Beta' },
    ]);
  });
});

describe('resolveMilestoneRef / resolveAreaRef / resolveStaffRef', () => {
  it('resolves the longest contained name', () => {
    const milestones = [
      { id: 'm1', name: 'Alpha' },
      { id: 'm2', name: 'Alpha Combat' },
    ];
    expect(resolveMilestoneRef('mark alpha combat off track', milestones)).toMatchObject({ id: 'm2' });
    const areas = [{ id: 'a1', name: 'Main Game' }];
    expect(resolveAreaRef('set main game to complete', areas)).toMatchObject({ id: 'a1' });
    const staff = [{ id: 's1', name: 'Karti' }];
    expect(resolveStaffRef('assign it to karti', staff)).toMatchObject({ id: 's1' });
  });
  it('returns undefined when nothing matches', () => {
    expect(resolveAreaRef('set nothing', [{ id: 'a1', name: 'Main Game' }])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api-server/agent/__tests__/entity-index.test.ts`
Expected: FAIL — `buildMilestoneIndex is not a function` (and siblings).

- [ ] **Step 3: Implement** — append to `src/api-server/agent/entity-index.ts` (keep existing exports untouched):

```ts
export type MilestoneIndexEntry = { id: string; name: string; health?: string; targetDate?: string };
export type AreaIndexEntry = {
  id: string;
  name: string;
  status?: string;
  progress?: number;
  phase?: string;
};

export function buildMilestoneIndex(board: TasksBoardData | null): MilestoneIndexEntry[] {
  if (!board) return [];
  return board.projectMilestones.map((milestone) => ({
    id: milestone.id,
    name: milestone.name,
    health: milestone.health ?? undefined,
    targetDate: milestone.target_date ?? undefined,
  }));
}

export function buildAreaIndex(board: TasksBoardData | null): AreaIndexEntry[] {
  if (!board) return [];
  return board.areas.map((area) => ({
    id: area.id,
    name: area.name,
    status: area.status ?? undefined,
    progress: typeof area.progress === 'number' ? area.progress : undefined,
    phase: area.phase ?? undefined,
  }));
}

/** Longest-contained-name match — the shared name-resolution idiom. */
function resolveByName<T extends { name: string }>(value: string, index: T[]): T | undefined {
  const normalized = value.toLowerCase();
  return [...index]
    .sort((a, b) => b.name.length - a.name.length)
    .find((entry) => normalized.includes(entry.name.toLowerCase()));
}

export function resolveMilestoneRef(
  value: string,
  index: MilestoneIndexEntry[],
): MilestoneIndexEntry | undefined {
  return resolveByName(value, index);
}

export function resolveAreaRef(value: string, index: AreaIndexEntry[]): AreaIndexEntry | undefined {
  return resolveByName(value, index);
}

export function resolveStaffRef(value: string, index: StaffIndexEntry[]): StaffIndexEntry | undefined {
  return resolveByName(value, index);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/api-server/agent/__tests__/entity-index.test.ts`
Expected: PASS (all describe blocks, including the pre-existing ones).

- [ ] **Step 5: Verify no new tsc errors on the touched file**

Run: `npx tsc --noEmit 2>&1 | grep 'agent/entity-index.ts' || echo 'no entity-index errors'`
Expected: `no entity-index errors`.

- [ ] **Step 6: Commit**

```bash
git add src/api-server/agent/entity-index.ts src/api-server/agent/__tests__/entity-index.test.ts
git commit -m "feat(eko): add milestone/area/staff resolvers to entity-index"
```

---

## Task 2: `eko_pending_actions` migration + pending-actions lifecycle module

**Files:**
- Create: `supabase/migrations/20260706000001_eko_pending_actions.sql`
- Create: `src/api-server/agent/pending-actions.ts`
- Test: `src/api-server/agent/__tests__/pending-actions.test.ts`

**Interfaces:**
- Produces:
  - `type PendingActionStatus = 'awaiting_approval' | 'executing' | 'executed' | 'rejected' | 'failed'`
  - `type EkoPendingActionRow = { id: string; conversation_id: string; user_id: string; tool_id: string; resolved_args: Record<string, unknown>; summary: string; status: PendingActionStatus; error: string | null; created_at: string; executed_at: string | null }`
  - `stagePendingAction(input: { conversationId: string; userId: string; toolId: string; resolvedArgs: Record<string, unknown>; summary: string }): Promise<string>` (returns the new row id)
  - `getPendingActionById(id: string): Promise<EkoPendingActionRow | null>`
  - `markExecuting(id: string): Promise<void>`
  - `markExecuted(id: string): Promise<void>`
  - `markRejected(id: string): Promise<void>`
  - `markFailed(id: string, error: string): Promise<void>`
  - `listAwaitingByConversation(conversationId: string): Promise<EkoPendingActionRow[]>`
  - `isExecutable(status: PendingActionStatus): boolean`

- [ ] **Step 1: Write the migration** — `supabase/migrations/20260706000001_eko_pending_actions.sql`:

```sql
-- EKO pending actions: durable staging for approval-gated agent writes.
-- Mirrors the notes-table RLS pattern (admin-only select/update; the api-server
-- stages and executes via the service role, bypassing RLS).

create type public.eko_pending_action_status as enum (
  'awaiting_approval', 'executing', 'executed', 'rejected', 'failed'
);

create table public.eko_pending_actions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tool_id         text not null,
  resolved_args   jsonb not null,
  summary         text not null,
  status          public.eko_pending_action_status not null default 'awaiting_approval',
  error           text,
  created_at      timestamptz not null default now(),
  executed_at     timestamptz
);

-- Status set is intentionally 5, not the 8 sketched in the design's data-shapes
-- block. `proposed`/`needs_slots` are dropped because a row is only ever
-- inserted AFTER the write tool's stage() resolves + validates (it enters
-- directly at awaiting_approval); an unresolvable ref never becomes a row — the
-- error goes back to the model instead. `approved` is dropped because approval
-- transitions awaiting_approval → executing directly (no distinct persisted
-- "approved" state to guard). isExecutable() keys off the single live state.

create index eko_pending_actions_conversation_status_idx
  on public.eko_pending_actions (conversation_id, status);

alter table public.eko_pending_actions enable row level security;

create policy "eko_pending_actions_admin_select"
  on public.eko_pending_actions for select
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);

create policy "eko_pending_actions_admin_update"
  on public.eko_pending_actions for update
  to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) = true);

comment on table public.eko_pending_actions is
  'Approval-gated staging for EKO agent writes — admin-only via RLS; api-server stages/executes via service role.';
```

- [ ] **Step 2: Write the failing tests** — `src/api-server/agent/__tests__/pending-actions.test.ts`. These mock `getServiceClient` with a tiny in-memory fake so no live table is required:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

// In-memory fake of the service client's fluent query builder, scoped to the
// eko_pending_actions single-row operations this module performs.
type Row = Record<string, unknown>;
function makeFakeService(seed: Row[] = []) {
  const rows = [...seed];
  return {
    rows,
    from(_table: string) {
      const state: { filters: Array<[string, unknown]> } = { filters: [] };
      const builder: Record<string, unknown> = {
        insert(payload: Row) {
          const created = { id: `pa-${rows.length + 1}`, error: null, executed_at: null, ...payload };
          rows.push(created);
          return {
            select() {
              return { single: async () => ({ data: { id: created.id }, error: null }) };
            },
          };
        },
        update(patch: Row) {
          return {
            eq(col: string, val: unknown) {
              const target = rows.find((r) => r[col] === val);
              if (target) Object.assign(target, patch);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          state.filters.push([col, val]);
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle: async () => {
          const match = rows.find((r) => state.filters.every(([c, v]) => r[c] === v));
          return { data: match ?? null, error: null };
        },
        then(resolve: (v: { data: Row[]; error: null }) => unknown) {
          const matches = rows.filter((r) => state.filters.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data: matches, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

const fake = makeFakeService();
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: () => fake }));

import {
  stagePendingAction,
  getPendingActionById,
  markExecuting,
  markExecuted,
  markFailed,
  isExecutable,
} from '../pending-actions';

afterEach(() => {
  fake.rows.length = 0;
});

describe('pending-actions lifecycle', () => {
  it('stages a row and reads it back by id', async () => {
    const id = await stagePendingAction({
      conversationId: 'c1',
      userId: 'u1',
      toolId: 'set_milestone_health',
      resolvedArgs: { milestoneId: 'm1', health: 'off_track' },
      summary: 'Set Alpha health to off_track',
    });
    const row = await getPendingActionById(id);
    expect(row).toMatchObject({
      id,
      tool_id: 'set_milestone_health',
      status: 'awaiting_approval',
      resolved_args: { milestoneId: 'm1', health: 'off_track' },
    });
  });

  it('transitions awaiting → executing → executed', async () => {
    const id = await stagePendingAction({
      conversationId: 'c1', userId: 'u1', toolId: 't', resolvedArgs: {}, summary: 's',
    });
    await markExecuting(id);
    expect((await getPendingActionById(id))?.status).toBe('executing');
    await markExecuted(id);
    expect((await getPendingActionById(id))?.status).toBe('executed');
  });

  it('records a failure with its error text', async () => {
    const id = await stagePendingAction({
      conversationId: 'c1', userId: 'u1', toolId: 't', resolvedArgs: {}, summary: 's',
    });
    await markFailed(id, 'row gone');
    const row = await getPendingActionById(id);
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('row gone');
  });

  it('isExecutable is true only for awaiting_approval', () => {
    expect(isExecutable('awaiting_approval')).toBe(true);
    expect(isExecutable('executed')).toBe(false);
    expect(isExecutable('rejected')).toBe(false);
    expect(isExecutable('failed')).toBe(false);
    expect(isExecutable('executing')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/api-server/agent/__tests__/pending-actions.test.ts`
Expected: FAIL — cannot resolve `../pending-actions`.

- [ ] **Step 4: Implement** — `src/api-server/agent/pending-actions.ts`:

```ts
import { getServiceClient } from '@/lib/supabase/service';

export type PendingActionStatus =
  | 'awaiting_approval'
  | 'executing'
  | 'executed'
  | 'rejected'
  | 'failed';

export type EkoPendingActionRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  tool_id: string;
  resolved_args: Record<string, unknown>;
  summary: string;
  status: PendingActionStatus;
  error: string | null;
  created_at: string;
  executed_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(): any {
  // eko_pending_actions is not in the generated Database types until the
  // migration is applied + types regenerated — same untyped cast the repo
  // uses for `milestones`/`task_milestone` (tasks-board.ts, context.ts).
  return (getServiceClient() as unknown as { from: (t: string) => unknown }).from(
    'eko_pending_actions',
  );
}

export function isExecutable(status: PendingActionStatus): boolean {
  return status === 'awaiting_approval';
}

export async function stagePendingAction(input: {
  conversationId: string;
  userId: string;
  toolId: string;
  resolvedArgs: Record<string, unknown>;
  summary: string;
}): Promise<string> {
  const { data, error } = await table()
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      tool_id: input.toolId,
      resolved_args: input.resolvedArgs,
      summary: input.summary,
      status: 'awaiting_approval',
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getPendingActionById(id: string): Promise<EkoPendingActionRow | null> {
  const { data, error } = await table().select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as EkoPendingActionRow | null) ?? null;
}

export async function markExecuting(id: string): Promise<void> {
  const { error } = await table().update({ status: 'executing' }).eq('id', id);
  if (error) throw error;
}

export async function markExecuted(id: string): Promise<void> {
  const { error } = await table()
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markRejected(id: string): Promise<void> {
  const { error } = await table().update({ status: 'rejected' }).eq('id', id);
  if (error) throw error;
}

export async function markFailed(id: string, message: string): Promise<void> {
  const { error } = await table().update({ status: 'failed', error: message }).eq('id', id);
  if (error) throw error;
}

export async function listAwaitingByConversation(
  conversationId: string,
): Promise<EkoPendingActionRow[]> {
  const { data, error } = await table()
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('status', 'awaiting_approval')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as EkoPendingActionRow[] | null) ?? [];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/api-server/agent/__tests__/pending-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify no new tsc errors**

Run: `npx tsc --noEmit 2>&1 | grep 'agent/pending-actions.ts' || echo 'no pending-actions errors'`
Expected: `no pending-actions errors`.

- [ ] **Step 7: Commit** (migration is NOT applied to the live DB here — user-gated)

```bash
git add supabase/migrations/20260706000001_eko_pending_actions.sql src/api-server/agent/pending-actions.ts src/api-server/agent/__tests__/pending-actions.test.ts
git commit -m "feat(eko): add eko_pending_actions table + lifecycle module"
```

---

## Task 3: Tool contract + read tools + registry

**Files:**
- Create: `src/api-server/agent/tool-contract.ts`
- Create: `src/api-server/agent/tools/read-tools.ts`
- Create: `src/api-server/agent/tool-registry.ts`
- Test: `src/api-server/agent/tools/__tests__/read-tools.test.ts`

**Interfaces:**
- Consumes: `entity-index` builders (Task 1), `TasksBoardData`, `AuthenticatedUser` from `../../supabase`, `isTaskOverdue` (reimplemented locally — see note), `AgentActionError` is NOT needed here.
- Produces:
  - `type ToolContext = { user: AuthenticatedUser; board: TasksBoardData | null; conversationId: string }`
  - `type ToolJsonSchema = { type: 'object'; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required?: string[]; additionalProperties?: boolean }`
  - `type AgentWriteTarget` (re-exported shape used by commit results — see below)
  - `type CommitResult = { reply: string; target?: AgentWriteTarget }`
  - `type StageResult = { ok: true; resolvedArgs: Record<string, unknown>; summary: string } | { ok: false; error: string }`
  - `type ReadTool = { id: string; gated: false; description: string; inputSchema: ToolJsonSchema; run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> }`
  - `type WriteTool = { id: string; gated: true; description: string; inputSchema: ToolJsonSchema; stage(input: Record<string, unknown>, ctx: ToolContext): Promise<StageResult>; commit(resolvedArgs: Record<string, unknown>, user: AuthenticatedUser): Promise<CommitResult> }`
  - `type AgentTool = ReadTool | WriteTool`
  - `READ_TOOLS: ReadTool[]`
  - `AGENT_TOOLS: AgentTool[]` and `getToolById(id: string): AgentTool | undefined` (registry grows in Tasks 4–5)

- [ ] **Step 1: Write the failing tests** — `src/api-server/agent/tools/__tests__/read-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { READ_TOOLS } from '../read-tools';
import type { ToolContext } from '../../tool-contract';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeBoard(over: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'u1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...over,
  } as TasksBoardData;
}
function ctxFor(board: TasksBoardData | null): ToolContext {
  return { user: { id: 'u1', email: 'a@b.invalid' }, board, conversationId: 'c1' };
}
const byId = (id: string) => READ_TOOLS.find((t) => t.id === id)!;

describe('list_milestones', () => {
  it('returns name, health, targetDate, and computed overdueDays', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const board = makeBoard({
      projectMilestones: [
        { id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-04-24', sort_order: 0, created_at: 'x' },
      ] as never,
    });
    const out = (await byId('list_milestones').run({}, ctxFor(board))) as Array<Record<string, unknown>>;
    // 2026-06-01 minus 2026-04-24 = 38 days overdue.
    expect(out[0]).toMatchObject({ name: 'Alpha', health: 'on_track', targetDate: '2026-04-24' });
    expect(typeof out[0].overdueDays).toBe('number');
  });
});

describe('list_tasks', () => {
  it('lists tasks with number, name, status, priority, assignee', async () => {
    const task = { id: 't1', task_number: 12, name: 'UI Extension', department: 'Coding',
      status: 'In Progress', priority: 'High', assignee: { display_name: 'Karti' } } as unknown as TaskWithAssignee;
    const out = (await byId('list_tasks').run({}, ctxFor(makeBoard({ tasks: [task] })))) as Array<Record<string, unknown>>;
    expect(out[0]).toMatchObject({ number: 12, name: 'UI Extension', status: 'In Progress', priority: 'High', assignee: 'Karti' });
  });
  it('returns [] when the board is null', async () => {
    expect(await byId('list_tasks').run({}, ctxFor(null))).toEqual([]);
  });
});

describe('read tools are ungated', () => {
  it('every read tool has gated:false', () => {
    expect(READ_TOOLS.every((t) => t.gated === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api-server/agent/tools/__tests__/read-tools.test.ts`
Expected: FAIL — cannot resolve `../read-tools`.

- [ ] **Step 3: Implement the contract** — `src/api-server/agent/tool-contract.ts`:

```ts
import type { AuthenticatedUser } from '../supabase';
import type { TasksBoardData } from '@/lib/tasks-board';

export type ToolContext = {
  user: AuthenticatedUser;
  board: TasksBoardData | null;
  conversationId: string;
};

export type ToolJsonSchema = {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
  additionalProperties?: boolean;
};

/**
 * Deep-link target for an executed write. Pure UI-choreography metadata for the
 * tray's post-write receipt — never carries or triggers a mutation. Deletes and
 * milestone/area writes return no target.
 */
export type AgentWriteTarget = {
  kind: 'task';
  taskId: string;
  taskNumber?: number | null;
  name: string;
  action: 'create' | 'status' | 'assignee' | 'priority' | 'dueDate';
};

export type CommitResult = { reply: string; target?: AgentWriteTarget };

export type StageResult =
  | { ok: true; resolvedArgs: Record<string, unknown>; summary: string }
  | { ok: false; error: string };

export type ReadTool = {
  id: string;
  gated: false;
  description: string;
  inputSchema: ToolJsonSchema;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
};

export type WriteTool = {
  id: string;
  gated: true;
  description: string;
  inputSchema: ToolJsonSchema;
  /** Resolve entity refs against the board + validate. NO mutation. */
  stage(input: Record<string, unknown>, ctx: ToolContext): Promise<StageResult>;
  /** Execute the stored, already-resolved write. */
  commit(resolvedArgs: Record<string, unknown>, user: AuthenticatedUser): Promise<CommitResult>;
};

export type AgentTool = ReadTool | WriteTool;

const EMPTY_SCHEMA: ToolJsonSchema = { type: 'object', properties: {}, additionalProperties: false };
export { EMPTY_SCHEMA };
```

- [ ] **Step 4: Implement the read tools** — `src/api-server/agent/tools/read-tools.ts`:

```ts
import type { ReadTool } from '../tool-contract';
import { EMPTY_SCHEMA } from '../tool-contract';
import type { TaskWithAssignee } from '@/lib/types';

/** UTC day-bucket overdue count — deterministic regardless of server tz. */
function daysOverdue(dateIso: string | undefined, now: Date): number {
  if (!dateIso) return 0;
  const target = Date.parse(dateIso);
  if (Number.isNaN(target)) return 0;
  return Math.floor(now.getTime() / 86_400_000) - Math.floor(target / 86_400_000);
}

function taskIsOverdue(task: TaskWithAssignee, now: Date): boolean {
  if (!task.deadline || task.status === 'Done' || task.status === 'Canceled' || task.status === 'Duplicate') {
    return false;
  }
  return daysOverdue(task.deadline, now) > 0;
}

export const READ_TOOLS: ReadTool[] = [
  {
    id: 'list_tasks',
    gated: false,
    description:
      'List every issue on the board with its task number, name, status, priority, assignee, due date, and whether it is overdue. Call this before proposing any task write.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      const now = new Date();
      return (ctx.board?.tasks ?? []).map((task) => ({
        number: typeof task.task_number === 'number' ? task.task_number : null,
        name: task.name,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee?.display_name ?? null,
        due: task.deadline ?? null,
        overdue: taskIsOverdue(task, now),
      }));
    },
  },
  {
    id: 'list_milestones',
    gated: false,
    description:
      'List project milestones with their stored health (on_track | at_risk | off_track), target date, and how many days overdue they are. Use this to decide whether a milestone is on track.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      const now = new Date();
      return (ctx.board?.projectMilestones ?? []).map((milestone) => ({
        name: milestone.name,
        health: milestone.health ?? null,
        targetDate: milestone.target_date ?? null,
        overdueDays: milestone.target_date ? Math.max(0, daysOverdue(milestone.target_date, now)) : 0,
      }));
    },
  },
  {
    id: 'list_areas',
    gated: false,
    description: 'List game areas with their status (Active | Planned | Complete), phase, and progress percent.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      return (ctx.board?.areas ?? []).map((area) => ({
        name: area.name,
        status: area.status,
        phase: area.phase ?? null,
        progress: typeof area.progress === 'number' ? area.progress : null,
      }));
    },
  },
  {
    id: 'list_staff',
    gated: false,
    description: 'List roster members EKO can assign tasks to, by display name and department.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      return (ctx.board?.team ?? [])
        .filter((member) => member.display_name)
        .map((member) => ({ name: member.display_name, department: member.department ?? null }));
    },
  },
];
```

- [ ] **Step 5: Implement the registry** — `src/api-server/agent/tool-registry.ts`:

```ts
import type { AgentTool } from './tool-contract';
import { READ_TOOLS } from './tools/read-tools';

// Write tools are appended in Tasks 4–5. Keep this the single source the loop,
// the approval executor, and the system prompt all read from.
export const AGENT_TOOLS: AgentTool[] = [...READ_TOOLS];

export function getToolById(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/api-server/agent/tools/__tests__/read-tools.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify no new tsc errors on touched files**

Run: `npx tsc --noEmit 2>&1 | grep -E 'agent/(tool-contract|tool-registry|tools/read-tools)\.ts' || echo 'no tool errors'`
Expected: `no tool errors`.

- [ ] **Step 8: Commit**

```bash
git add src/api-server/agent/tool-contract.ts src/api-server/agent/tools/read-tools.ts src/api-server/agent/tool-registry.ts src/api-server/agent/tools/__tests__/read-tools.test.ts
git commit -m "feat(eko): add tool contract, read tools, and registry"
```

---

## Task 4: Shared errors + activity helpers + task write tools

**Files:**
- Create: `src/api-server/agent/errors.ts`
- Create: `src/api-server/agent/eko-activity.ts`
- Create: `src/api-server/agent/tools/task-write-tools.ts`
- Modify: `src/api-server/agent/tool-registry.ts`
- Test: `src/api-server/agent/tools/__tests__/task-write-tools.test.ts`

**Interfaces:**
- Produces:
  - `errors.ts`: `class AgentActionError extends Error { status: number; constructor(message: string, status?: number) }`
  - `eko-activity.ts`: `assertAdmin(userId: string): Promise<void>`; `markLatestTaskActivityAsEko(input: { taskId: string; userId: string; kind?: string; action?: string }): Promise<void>`; `hideLatestHumanAssignedEcho(input: { taskId: string; taskName: string; userId: string }): Promise<void>`; `markLatestDeletedTaskActivityAsEko(input: { taskName: string; userId: string }): Promise<void>`; `normalizeDueDate(value: string): string | null`
  - `task-write-tools.ts`: `TASK_WRITE_TOOLS: WriteTool[]` (ids `create_task`, `set_task_status`, `set_task_assignee`, `set_task_priority`, `set_task_due`, `delete_task`)
- Consumes: `getServiceClient`, `entity-index` resolvers (Task 1), `tool-contract` (Task 3), `TASK_STATUSES` + `Priority` from `@/lib/types`.

**Note on cycle-free design:** `eko-activity.ts` depends only on `getServiceClient` + `errors.ts`. `task-write-tools.ts` imports the activity helpers from `eko-activity.ts` — NOT from `routes/agent.ts`. This preserves activity-feed attribution without an import cycle (Task 7 later deletes the now-orphaned copies in `agent.ts`).

**⚠️ Fidelity requirement (read before writing Steps 4–5):** the `eko-activity.ts` helper bodies and every write-tool `commit()` mutation below are a **strangler MOVE** of code that currently lives in `src/api-server/routes/agent.ts`. The code shown here is the intended shape and call-site wiring, but the canonical source of the exact Supabase columns, filters, and activity-attribution logic is the LIVE `agent.ts`. Before implementing, open `agent.ts` and copy the real current bodies of: `assertAdminUser` (~L1278), `markLatestTaskActivityAsEko` (~L1284), `hideLatestHumanAssignedEcho` (~L1313), `markLatestDeletedTaskActivityAsEko` (~L1337), `normalizeDueDate` (~L1230), and the six task executors' mutations — create (~L684→insert), status (~L750→update), assignee (~L779→update+`hideLatestHumanAssignedEcho`), priority (~L811→update), due (~L840→update+activity insert), delete (~L932→delete+`markLatestDeletedTaskActivityAsEko`). **Where the live code differs from what's shown here (column names, `.eq()` filter chains, activity `kind`/`action` strings, before/after values), the LIVE code wins** — the goal is byte-equivalent behavior, not the paraphrase below. Task 7 deletes these originals only after this task reproduces them; a diff of old-executor-vs-new-commit behavior is part of Task 7's review.

- [ ] **Step 1: Write the failing tests** — `src/api-server/agent/tools/__tests__/task-write-tools.test.ts`. The stage path is pure (board resolution) and needs no DB; the commit path is covered indirectly by Task 6's runtime integration + Task 7's route tests, so here we test `stage` resolution/validation only:

```ts
import { describe, expect, it } from 'vitest';
import { TASK_WRITE_TOOLS } from '../task-write-tools';
import type { ToolContext, WriteTool } from '../../tool-contract';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeTask(over: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  return { id: 't1', task_number: 12, name: 'UI Extension', department: 'Coding',
    status: 'In Progress', priority: 'High', ...over } as TaskWithAssignee;
}
function makeBoard(over: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'u1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...over,
  } as TasksBoardData;
}
function ctx(board: TasksBoardData | null): ToolContext {
  return { user: { id: 'u1', email: 'a@b.invalid' }, board, conversationId: 'c1' };
}
const tool = (id: string) => TASK_WRITE_TOOLS.find((t) => t.id === id) as WriteTool;

describe('set_task_status stage', () => {
  it('resolves a task by number and validates the status enum', async () => {
    const board = makeBoard({ tasks: [makeTask({ task_number: 22, name: 'Boss Fight' })] });
    const result = await tool('set_task_status').stage({ task: 'task 22', status: 'Done' }, ctx(board));
    expect(result).toEqual({
      ok: true,
      resolvedArgs: { taskId: 't1', taskName: 'Boss Fight', taskNumber: 22, status: 'Done' },
      summary: 'Move "Boss Fight" to Done',
    });
  });
  it('rejects an unknown status', async () => {
    const board = makeBoard({ tasks: [makeTask()] });
    const result = await tool('set_task_status').stage({ task: 'UI Extension', status: 'Shipped' }, ctx(board));
    expect(result.ok).toBe(false);
  });
  it('rejects when the task cannot be resolved', async () => {
    const result = await tool('set_task_status').stage({ task: 'nonexistent', status: 'Done' }, ctx(makeBoard()));
    expect(result).toMatchObject({ ok: false });
  });
});

describe('set_task_assignee stage', () => {
  it('resolves both task and assignee from the board', async () => {
    const board = makeBoard({ tasks: [makeTask({ name: 'Boss Fight', task_number: 22 })] });
    board.team = [{ id: 'p9', display_name: 'Karti' } as never];
    const result = await tool('set_task_assignee').stage({ task: 'Boss Fight', assignee: 'Karti' }, ctx(board));
    expect(result).toMatchObject({
      ok: true,
      resolvedArgs: { taskId: 't1', assigneeId: 'p9', assigneeName: 'Karti' },
    });
  });
});

describe('create_task stage', () => {
  it('requires title, status, and priority', async () => {
    const bad = await tool('create_task').stage({ title: 'New Thing' }, ctx(makeBoard()));
    expect(bad.ok).toBe(false);
    const ok = await tool('create_task').stage(
      { title: 'New Thing', status: 'Todo', priority: 'High', dueDate: '2026-08-01' },
      ctx(makeBoard()),
    );
    expect(ok).toMatchObject({
      ok: true,
      resolvedArgs: { name: 'New Thing', status: 'Todo', priority: 'High', deadline: '2026-08-01' },
    });
  });
});

describe('every task write tool is gated', () => {
  it('has gated:true', () => {
    expect(TASK_WRITE_TOOLS.every((t) => t.gated === true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api-server/agent/tools/__tests__/task-write-tools.test.ts`
Expected: FAIL — cannot resolve `../task-write-tools`.

- [ ] **Step 3: Implement `errors.ts`**:

```ts
/** Structured error for the EKO agent action layer (carries an HTTP status). */
export class AgentActionError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AgentActionError';
    this.status = status;
  }
}
```

- [ ] **Step 4: Implement `eko-activity.ts`** (the gate + attribution helpers moved out of `agent.ts`, verbatim behavior):

```ts
import { getServiceClient } from '@/lib/supabase/service';
import { AgentActionError } from './errors';

/** Admin gate — verbatim from routes/agent.ts's assertAdminUser. */
export async function assertAdmin(userId: string): Promise<void> {
  const { data, error } = await getServiceClient()
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new AgentActionError('EKO could not verify your permissions.', 500);
  if (!data?.is_admin) throw new AgentActionError('Only admins can approve EKO writes.', 403);
}

/** Normalize a due-date token to an ISO date or null (verbatim from agent.ts). */
export function normalizeDueDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (/tomorrow/i.test(value)) date.setDate(date.getDate() + 1);
  if (/next week/i.test(value)) date.setDate(date.getDate() + 7);
  if (/no date/i.test(value)) return null;
  return date.toISOString().slice(0, 10);
}

export async function markLatestTaskActivityAsEko({
  taskId,
  userId,
  kind,
  action,
}: {
  taskId: string;
  userId: string;
  kind?: string;
  action?: string;
}): Promise<void> {
  const service = getServiceClient();
  let query = service
    .from('activity_log')
    .select('id')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (kind) query = query.eq('kind', kind);
  if (action) query = query.eq('action', action);

  const { data } = await query;
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return;
  await service.from('activity_log').update({ source: 'eko', user_id: userId } as never).eq('id', id);
}

export async function hideLatestHumanAssignedEcho({
  taskId,
  taskName,
  userId,
}: {
  taskId: string;
  taskName: string;
  userId: string;
}): Promise<void> {
  const service = getServiceClient();
  const { data } = await service
    .from('activity_log')
    .select('id')
    .eq('task_id', taskId)
    .eq('action', 'Assigned')
    .like('target', `task: ${taskName}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return;
  await service.from('activity_log').delete().eq('id', id).eq('user_id', userId);
}

export async function markLatestDeletedTaskActivityAsEko({
  taskName,
  userId,
}: {
  taskName: string;
  userId: string;
}): Promise<void> {
  const service = getServiceClient();
  const { data } = await service
    .from('activity_log')
    .select('id')
    .eq('action', 'Deleted')
    .eq('target', `task: ${taskName}`)
    .is('task_id', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (id) {
    await service
      .from('activity_log')
      .update({ action: 'deleted this task', target: '', source: 'eko', user_id: userId } as never)
      .eq('id', id);
    return;
  }
  await service.from('activity_log').insert({
    user_id: userId,
    action: 'deleted this task',
    target: '',
    task_id: null,
    source: 'eko',
  } as never);
}
```

- [ ] **Step 5: Implement `task-write-tools.ts`**:

```ts
import type { WriteTool, ToolContext, StageResult, CommitResult } from '../tool-contract';
import { getServiceClient } from '@/lib/supabase/service';
import { TASK_STATUSES, type Priority, type TaskStatus } from '@/lib/types';
import {
  buildTaskIndex,
  buildStaffIndex,
  resolveTaskRef,
  resolveStaffRef,
} from '../entity-index';
import { AgentActionError } from '../errors';
import {
  assertAdmin,
  normalizeDueDate,
  markLatestTaskActivityAsEko,
  hideLatestHumanAssignedEcho,
  markLatestDeletedTaskActivityAsEko,
} from '../eko-activity';

const PRIORITIES: readonly Priority[] = ['Urgent', 'High', 'Medium', 'Low'];

function asString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTask(input: Record<string, unknown>, ctx: ToolContext) {
  return resolveTaskRef(asString(input, 'task'), buildTaskIndex(ctx.board));
}

// --- create_task -----------------------------------------------------------

const createTask: WriteTool = {
  id: 'create_task',
  gated: true,
  description:
    'Create a new issue. Requires title, status, and priority; dueDate is optional (omit for no deadline). The issue is staged for the user to approve — never claim it was created.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Issue title' },
      status: { type: 'string', enum: [...TASK_STATUSES], description: 'Initial status' },
      priority: { type: 'string', enum: [...PRIORITIES], description: 'Priority' },
      dueDate: { type: 'string', description: 'ISO date (YYYY-MM-DD) or omit for no deadline' },
    },
    required: ['title', 'status', 'priority'],
    additionalProperties: false,
  },
  async stage(input): Promise<StageResult> {
    const title = asString(input, 'title');
    const status = asString(input, 'status') as TaskStatus;
    const priority = asString(input, 'priority') as Priority;
    const missing = [
      title ? null : 'title',
      TASK_STATUSES.includes(status) ? null : 'a valid status',
      PRIORITIES.includes(priority) ? null : 'a valid priority',
    ].filter(Boolean);
    if (missing.length) return { ok: false, error: `create_task needs ${missing.join(', ')}.` };
    const dueToken = asString(input, 'dueDate');
    const deadline = dueToken ? normalizeDueDate(dueToken) : null;
    return {
      ok: true,
      resolvedArgs: { name: title, status, priority, deadline },
      summary: `Create "${title}" as ${status}, ${priority} priority${deadline ? `, due ${deadline}` : ''}`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { data, error } = await service
      .from('tasks')
      .insert({
        name: args.name,
        department: 'Coding',
        status: args.status,
        priority: args.priority,
        deadline: args.deadline ?? null,
        description: null,
      } as never)
      .select('id, task_number, name, status, priority, deadline')
      .single();
    if (error) throw new AgentActionError('EKO could not create the issue.', 500);
    const created = data as unknown as { id: string; task_number?: number | null } | null;
    if (created) await markLatestTaskActivityAsEko({ taskId: created.id, kind: 'created', userId: user.id });
    return {
      reply: `Created issue "${args.name}" in ${args.status}.`,
      target: created
        ? { kind: 'task', taskId: created.id, taskNumber: created.task_number, name: String(args.name), action: 'create' }
        : undefined,
    };
  },
};

// --- set_task_status -------------------------------------------------------

const setTaskStatus: WriteTool = {
  id: 'set_task_status',
  gated: true,
  description: 'Move an existing issue to a different status. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Task number ("task 22"/"#22") or exact/contained task name' },
      status: { type: 'string', enum: [...TASK_STATUSES] },
    },
    required: ['task', 'status'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const status = asString(input, 'status') as TaskStatus;
    if (!TASK_STATUSES.includes(status)) return { ok: false, error: `Unknown status "${input.status}".` };
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null, status },
      summary: `Move "${task.name}" to ${status}`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('tasks').update({ status: args.status } as never).eq('id', args.taskId);
    if (error) throw new AgentActionError('EKO could not update the issue status.', 500);
    await markLatestTaskActivityAsEko({ taskId: String(args.taskId), kind: 'status_changed', userId: user.id });
    return {
      reply: `Moved "${args.taskName}" to ${args.status}.`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'status' },
    };
  },
};

// --- set_task_assignee -----------------------------------------------------

const setTaskAssignee: WriteTool = {
  id: 'set_task_assignee',
  gated: true,
  description: 'Assign an existing issue to a roster member. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string' },
      assignee: { type: 'string', description: 'Roster member display name' },
    },
    required: ['task', 'assignee'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    const member = resolveStaffRef(asString(input, 'assignee'), buildStaffIndex(ctx.board));
    if (!member) return { ok: false, error: `Could not find "${asString(input, 'assignee')}" on the roster.` };
    return {
      ok: true,
      resolvedArgs: {
        taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null,
        assigneeId: member.id, assigneeName: member.name,
      },
      summary: `Assign "${task.name}" to ${member.name}`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('tasks').update({ assignee_id: args.assigneeId } as never).eq('id', args.taskId);
    if (error) throw new AgentActionError('EKO could not assign the issue.', 500);
    await markLatestTaskActivityAsEko({ taskId: String(args.taskId), kind: 'assignee_changed', userId: user.id });
    await hideLatestHumanAssignedEcho({ taskId: String(args.taskId), taskName: String(args.taskName), userId: user.id });
    return {
      reply: `Assigned "${args.taskName}" to ${args.assigneeName}.`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'assignee' },
    };
  },
};

// --- set_task_priority -----------------------------------------------------

const setTaskPriority: WriteTool = {
  id: 'set_task_priority',
  gated: true,
  description: 'Change an existing issue priority. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string' }, priority: { type: 'string', enum: [...PRIORITIES] } },
    required: ['task', 'priority'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const priority = asString(input, 'priority') as Priority;
    if (!PRIORITIES.includes(priority)) return { ok: false, error: `Unknown priority "${input.priority}".` };
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null, priority },
      summary: `Set "${task.name}" to ${priority} priority`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('tasks').update({ priority: args.priority } as never).eq('id', args.taskId);
    if (error) throw new AgentActionError('EKO could not update the issue priority.', 500);
    await markLatestTaskActivityAsEko({ taskId: String(args.taskId), action: 'Changed priority', userId: user.id });
    return {
      reply: `Set "${args.taskName}" to ${args.priority} priority.`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'priority' },
    };
  },
};

// --- set_task_due ----------------------------------------------------------

const setTaskDue: WriteTool = {
  id: 'set_task_due',
  gated: true,
  description: 'Set or clear an existing issue due date. Pass an ISO date, or "no date" to clear. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string' }, dueDate: { type: 'string', description: 'ISO date or "no date"' } },
    required: ['task', 'dueDate'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    const deadline = normalizeDueDate(asString(input, 'dueDate'));
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null, deadline },
      summary: deadline ? `Set "${task.name}" due date to ${deadline}` : `Clear the due date for "${task.name}"`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const deadline = (args.deadline as string | null) ?? null;
    const { error } = await service.from('tasks').update({ deadline } as never).eq('id', args.taskId);
    if (error) throw new AgentActionError('EKO could not update the issue due date.', 500);
    await service.from('activity_log').insert({
      user_id: user.id,
      action: 'Due date changed',
      target: deadline ? `task: ${args.taskName} → ${deadline}` : `task: ${args.taskName} → no date`,
      task_id: args.taskId,
      before_value: null,
      after_value: deadline,
      source: 'eko',
    } as never);
    return {
      reply: deadline ? `Set "${args.taskName}" due date to ${deadline}.` : `Cleared the due date for "${args.taskName}".`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'dueDate' },
    };
  },
};

// --- delete_task -----------------------------------------------------------

const deleteTask: WriteTool = {
  id: 'delete_task',
  gated: true,
  description: 'Delete an existing issue. Destructive and irreversible — always staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string' } },
    required: ['task'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name },
      summary: `Delete "${task.name}" from Issues (cannot be undone)`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { data, error } = await service.from('tasks').delete().eq('id', args.taskId).select('id');
    if (error) throw new AgentActionError('EKO could not delete the issue.', 500);
    if (!(data as Array<unknown> | null)?.length) {
      return { reply: `"${args.taskName}" was already removed. No changes were made.` };
    }
    await markLatestDeletedTaskActivityAsEko({ taskName: String(args.taskName), userId: user.id });
    return { reply: `Deleted "${args.taskName}" from Issues.` };
  },
};

export const TASK_WRITE_TOOLS: WriteTool[] = [
  createTask,
  setTaskStatus,
  setTaskAssignee,
  setTaskPriority,
  setTaskDue,
  deleteTask,
];
```

- [ ] **Step 6: Wire the task write tools into the registry** — edit `src/api-server/agent/tool-registry.ts`:

```ts
import type { AgentTool } from './tool-contract';
import { READ_TOOLS } from './tools/read-tools';
import { TASK_WRITE_TOOLS } from './tools/task-write-tools';

export const AGENT_TOOLS: AgentTool[] = [...READ_TOOLS, ...TASK_WRITE_TOOLS];

export function getToolById(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/api-server/agent/tools/__tests__/task-write-tools.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify no new tsc errors on touched files**

Run: `npx tsc --noEmit 2>&1 | grep -E 'agent/(errors|eko-activity|tool-registry|tools/task-write-tools)\.ts' || echo 'no task-write errors'`
Expected: `no task-write errors`.

- [ ] **Step 9: Commit**

```bash
git add src/api-server/agent/errors.ts src/api-server/agent/eko-activity.ts src/api-server/agent/tools/task-write-tools.ts src/api-server/agent/tool-registry.ts src/api-server/agent/tools/__tests__/task-write-tools.test.ts
git commit -m "feat(eko): add task write tools with activity attribution"
```

---

## Task 5: Milestone & area write tools

**Files:**
- Create: `src/api-server/agent/tools/milestone-area-write-tools.ts`
- Modify: `src/api-server/agent/tool-registry.ts`
- Test: `src/api-server/agent/tools/__tests__/milestone-area-write-tools.test.ts`

**Interfaces:**
- Produces: `MILESTONE_AREA_WRITE_TOOLS: WriteTool[]` (ids `set_milestone_health`, `set_area_status`, `set_area_progress`).
- Consumes: `entity-index` milestone/area resolvers (Task 1), `getServiceClient`, `AgentActionError`, `assertAdmin` is applied by the executor (Task 7), not here.

**This is the screenshot fix's write surface** — `set_milestone_health(milestone, health)` acts on the real stored `milestones.health` enum.

- [ ] **Step 1: Write the failing tests** — `src/api-server/agent/tools/__tests__/milestone-area-write-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MILESTONE_AREA_WRITE_TOOLS } from '../milestone-area-write-tools';
import type { ToolContext, WriteTool } from '../../tool-contract';
import type { TasksBoardData } from '@/lib/tasks-board';

function makeBoard(over: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'u1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...over,
  } as TasksBoardData;
}
function ctx(board: TasksBoardData | null): ToolContext {
  return { user: { id: 'u1', email: 'a@b.invalid' }, board, conversationId: 'c1' };
}
const tool = (id: string) => MILESTONE_AREA_WRITE_TOOLS.find((t) => t.id === id) as WriteTool;

describe('set_milestone_health stage', () => {
  it('resolves a milestone by name and validates health', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', health: 'on_track', sort_order: 0, created_at: 'x' }] as never,
    });
    const result = await tool('set_milestone_health').stage({ milestone: 'Alpha', health: 'off_track' }, ctx(board));
    expect(result).toEqual({
      ok: true,
      resolvedArgs: { milestoneId: 'm1', milestoneName: 'Alpha', health: 'off_track' },
      summary: 'Set milestone "Alpha" health to off_track',
    });
  });
  it('rejects an unknown health value', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', sort_order: 0, created_at: 'x' }] as never,
    });
    expect((await tool('set_milestone_health').stage({ milestone: 'Alpha', health: 'green' }, ctx(board))).ok).toBe(false);
  });
});

describe('set_area_status / set_area_progress stage', () => {
  it('resolves and validates area status', async () => {
    const board = makeBoard({ areas: [{ id: 'a1', name: 'Main Game', status: 'Active', progress: 10 }] as never });
    expect(await tool('set_area_status').stage({ area: 'Main Game', status: 'Complete' }, ctx(board))).toMatchObject({
      ok: true, resolvedArgs: { areaId: 'a1', status: 'Complete' },
    });
  });
  it('validates progress is 0–100', async () => {
    const board = makeBoard({ areas: [{ id: 'a1', name: 'Main Game', status: 'Active', progress: 10 }] as never });
    expect((await tool('set_area_progress').stage({ area: 'Main Game', progress: 150 }, ctx(board))).ok).toBe(false);
    expect(await tool('set_area_progress').stage({ area: 'Main Game', progress: 75 }, ctx(board))).toMatchObject({
      ok: true, resolvedArgs: { areaId: 'a1', progress: 75 },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api-server/agent/tools/__tests__/milestone-area-write-tools.test.ts`
Expected: FAIL — cannot resolve `../milestone-area-write-tools`.

- [ ] **Step 3: Implement `milestone-area-write-tools.ts`**:

```ts
import type { WriteTool, ToolContext, StageResult, CommitResult } from '../tool-contract';
import { getServiceClient } from '@/lib/supabase/service';
import type { MilestoneHealth } from '@/lib/types';
import { buildMilestoneIndex, buildAreaIndex, resolveMilestoneRef, resolveAreaRef } from '../entity-index';
import { AgentActionError } from '../errors';

const MILESTONE_HEALTHS: readonly MilestoneHealth[] = ['on_track', 'at_risk', 'off_track'];
const AREA_STATUSES = ['Active', 'Planned', 'Complete'] as const;

function asString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value.trim() : '';
}

const setMilestoneHealth: WriteTool = {
  id: 'set_milestone_health',
  gated: true,
  description:
    'Set a project milestone\'s health to on_track, at_risk, or off_track. Use this when a milestone is or is not on track. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      milestone: { type: 'string', description: 'Milestone name (exact or contained)' },
      health: { type: 'string', enum: [...MILESTONE_HEALTHS] },
    },
    required: ['milestone', 'health'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const health = asString(input, 'health') as MilestoneHealth;
    if (!MILESTONE_HEALTHS.includes(health)) {
      return { ok: false, error: `Unknown health "${input.health}". Use on_track, at_risk, or off_track.` };
    }
    const milestone = resolveMilestoneRef(asString(input, 'milestone'), buildMilestoneIndex(ctx.board));
    if (!milestone) return { ok: false, error: `Could not find milestone "${asString(input, 'milestone')}".` };
    return {
      ok: true,
      resolvedArgs: { milestoneId: milestone.id, milestoneName: milestone.name, health },
      summary: `Set milestone "${milestone.name}" health to ${health}`,
    };
  },
  async commit(args): Promise<CommitResult> {
    // milestones isn't in the generated Database types — same cast as tasks-board.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = getServiceClient() as any;
    const { error } = await service.from('milestones').update({ health: args.health }).eq('id', args.milestoneId);
    if (error) throw new AgentActionError('EKO could not update the milestone health.', 500);
    return { reply: `Set milestone "${args.milestoneName}" health to ${args.health}.` };
  },
};

const setAreaStatus: WriteTool = {
  id: 'set_area_status',
  gated: true,
  description: 'Set a game area status to Active, Planned, or Complete. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { area: { type: 'string' }, status: { type: 'string', enum: [...AREA_STATUSES] } },
    required: ['area', 'status'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const status = asString(input, 'status');
    if (!AREA_STATUSES.includes(status as (typeof AREA_STATUSES)[number])) {
      return { ok: false, error: `Unknown area status "${input.status}".` };
    }
    const area = resolveAreaRef(asString(input, 'area'), buildAreaIndex(ctx.board));
    if (!area) return { ok: false, error: `Could not find area "${asString(input, 'area')}".` };
    return {
      ok: true,
      resolvedArgs: { areaId: area.id, areaName: area.name, status },
      summary: `Set area "${area.name}" status to ${status}`,
    };
  },
  async commit(args): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('areas').update({ status: args.status } as never).eq('id', args.areaId);
    if (error) throw new AgentActionError('EKO could not update the area status.', 500);
    return { reply: `Set area "${args.areaName}" status to ${args.status}.` };
  },
};

const setAreaProgress: WriteTool = {
  id: 'set_area_progress',
  gated: true,
  description: 'Set a game area progress percent (0–100). Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { area: { type: 'string' }, progress: { type: 'number' } },
    required: ['area', 'progress'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const raw = input.progress;
    const progress = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return { ok: false, error: 'progress must be an integer between 0 and 100.' };
    }
    const area = resolveAreaRef(asString(input, 'area'), buildAreaIndex(ctx.board));
    if (!area) return { ok: false, error: `Could not find area "${asString(input, 'area')}".` };
    return {
      ok: true,
      resolvedArgs: { areaId: area.id, areaName: area.name, progress },
      summary: `Set area "${area.name}" progress to ${progress}%`,
    };
  },
  async commit(args): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('areas').update({ progress: args.progress } as never).eq('id', args.areaId);
    if (error) throw new AgentActionError('EKO could not update the area progress.', 500);
    return { reply: `Set area "${args.areaName}" progress to ${args.progress}%.` };
  },
};

export const MILESTONE_AREA_WRITE_TOOLS: WriteTool[] = [setMilestoneHealth, setAreaStatus, setAreaProgress];
```

- [ ] **Step 4: Wire into the registry** — edit `src/api-server/agent/tool-registry.ts`:

```ts
import type { AgentTool } from './tool-contract';
import { READ_TOOLS } from './tools/read-tools';
import { TASK_WRITE_TOOLS } from './tools/task-write-tools';
import { MILESTONE_AREA_WRITE_TOOLS } from './tools/milestone-area-write-tools';

export const AGENT_TOOLS: AgentTool[] = [
  ...READ_TOOLS,
  ...TASK_WRITE_TOOLS,
  ...MILESTONE_AREA_WRITE_TOOLS,
];

export function getToolById(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/api-server/agent/tools/__tests__/milestone-area-write-tools.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify no new tsc errors on touched files**

Run: `npx tsc --noEmit 2>&1 | grep -E 'agent/(tool-registry|tools/milestone-area-write-tools)\.ts' || echo 'no milestone-area errors'`
Expected: `no milestone-area errors`.

- [ ] **Step 7: Commit**

```bash
git add src/api-server/agent/tools/milestone-area-write-tools.ts src/api-server/agent/tool-registry.ts src/api-server/agent/tools/__tests__/milestone-area-write-tools.test.ts
git commit -m "feat(eko): add milestone health + area status/progress write tools"
```

---

## Task 6: The tool-use runtime (`runAgentLoop` + `createAnthropicCaller`)

**Files:**
- Create: `src/api-server/agent/runtime.ts`
- Test: `src/api-server/agent/__tests__/runtime.test.ts`

**Interfaces:**
- Produces:
  - `type AssistantBlock = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }`
  - `type AssistantMessage = { stop_reason: string; content: AssistantBlock[] }`
  - `type AnthropicToolSpec = { name: string; description: string; input_schema: ToolJsonSchema }`
  - `type ModelCaller = (req: { system: string; tools: AnthropicToolSpec[]; messages: unknown[] }) => Promise<AssistantMessage>`
  - `type StagedPending = { id: string; toolId: string; summary: string }`
  - `type RunAgentLoopResult = { text: string; pendingActions: StagedPending[]; steps: number }`
  - `runAgentLoop(params: { userMessage: string; system: string; ctx: ToolContext; tools: AgentTool[]; caller: ModelCaller; maxSteps?: number; stagePending?: (row: { conversationId: string; userId: string; toolId: string; resolvedArgs: Record<string, unknown>; summary: string }) => Promise<string> }): Promise<RunAgentLoopResult>`
  - `createAnthropicCaller(): { caller: ModelCaller; model: string }` (throws `AgentActionError` 503 if `ANTHROPIC_API_KEY` missing)
  - `EKO_AGENT_SYSTEM: string`
- Consumes: `AgentTool`/`ToolContext`/`ToolJsonSchema` from `tool-contract`, `stagePendingAction` from `pending-actions`, `AgentActionError`, `@anthropic-ai/sdk`.

- [ ] **Step 1: Write the failing tests** — `src/api-server/agent/__tests__/runtime.test.ts`. A scripted `ModelCaller` returns canned assistant turns; an in-memory `stagePending` avoids the DB. This includes the **screenshot scenario** (conditional milestone update → 2 staged writes):

```ts
import { describe, expect, it } from 'vitest';
import { runAgentLoop, type AssistantMessage, type ModelCaller } from '../runtime';
import { AGENT_TOOLS } from '../tool-registry';
import type { ToolContext } from '../tool-contract';
import type { TasksBoardData } from '@/lib/tasks-board';

function makeBoard(over: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'u1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...over,
  } as TasksBoardData;
}
function ctx(board: TasksBoardData | null): ToolContext {
  return { user: { id: 'u1', email: 'a@b.invalid' }, board, conversationId: 'c1' };
}
/** Records staged rows in memory instead of hitting Supabase. */
function memoryStager() {
  const staged: Array<Record<string, unknown>> = [];
  const stagePending = async (row: Record<string, unknown>) => {
    const id = `pa-${staged.length + 1}`;
    staged.push({ id, ...row });
    return id;
  };
  return { staged, stagePending };
}
/** Turn a fixed script of assistant messages into a ModelCaller. */
function scriptedCaller(script: AssistantMessage[]): ModelCaller {
  let turn = 0;
  return async () => script[Math.min(turn++, script.length - 1)];
}

describe('runAgentLoop', () => {
  it('runs a read tool, feeds the result back, and returns the final text', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-01-01', sort_order: 0, created_at: 'x' }] as never,
    });
    const { staged, stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'list_milestones', input: {} }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Alpha is on track.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'How is Alpha doing?', system: 'sys', ctx: ctx(board), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(result.text).toBe('Alpha is on track.');
    expect(staged).toHaveLength(0);
  });

  it('stages a write tool call as a pending action instead of executing it', async () => {
    const board = makeBoard({
      projectMilestones: [{ id: 'm1', name: 'Alpha', health: 'on_track', sort_order: 0, created_at: 'x' }] as never,
    });
    const { staged, stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'set_milestone_health', input: { milestone: 'Alpha', health: 'off_track' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Staged the milestone update for your approval.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'Mark Alpha off track', system: 'sys', ctx: ctx(board), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(result.pendingActions).toEqual([
      { id: 'pa-1', toolId: 'set_milestone_health', summary: 'Set milestone "Alpha" health to off_track' },
    ]);
    // The stager receives the raw camelCase row the runtime builds.
    expect(staged[0]).toMatchObject({ toolId: 'set_milestone_health', conversationId: 'c1', userId: 'u1' });
    expect(staged[0].resolvedArgs).toEqual({ milestoneId: 'm1', milestoneName: 'Alpha', health: 'off_track' });
  });

  it('SCREENSHOT SCENARIO: conditional milestone update stages TWO writes from one turn', async () => {
    const board = makeBoard({
      projectMilestones: [
        { id: 'm1', name: 'Alpha', health: 'on_track', target_date: '2026-01-01', sort_order: 0, created_at: 'x' },
        { id: 'm2', name: 'Beta', health: 'on_track', target_date: '2026-02-01', sort_order: 1, created_at: 'x' },
      ] as never,
    });
    const { stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'r1', name: 'list_milestones', input: {} }] },
      { stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 'w1', name: 'set_milestone_health', input: { milestone: 'Alpha', health: 'off_track' } },
        { type: 'tool_use', id: 'w2', name: 'set_milestone_health', input: { milestone: 'Beta', health: 'off_track' } },
      ] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Both milestones are overdue; staged updates for approval.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'Update the milestones if they aren\'t on track', system: 'sys', ctx: ctx(board), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(result.pendingActions).toHaveLength(2);
    expect(result.pendingActions.map((p) => p.summary)).toEqual([
      'Set milestone "Alpha" health to off_track',
      'Set milestone "Beta" health to off_track',
    ]);
  });

  it('feeds a stage error back to the model rather than crashing', async () => {
    const { staged, stagePending } = memoryStager();
    const caller = scriptedCaller([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'set_task_status', input: { task: 'ghost', status: 'Done' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'I could not find that task.' }] },
    ]);
    const result = await runAgentLoop({
      userMessage: 'move ghost to done', system: 'sys', ctx: ctx(makeBoard()), tools: AGENT_TOOLS, caller, stagePending,
    });
    expect(staged).toHaveLength(0);
    expect(result.text).toContain('could not find');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api-server/agent/__tests__/runtime.test.ts`
Expected: FAIL — cannot resolve `../runtime`.

- [ ] **Step 3: Implement `runtime.ts`**:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { AgentTool, ToolContext, ToolJsonSchema } from './tool-contract';
import { stagePendingAction } from './pending-actions';
import { AgentActionError } from './errors';

export type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

export type AssistantMessage = { stop_reason: string; content: AssistantBlock[] };

export type AnthropicToolSpec = { name: string; description: string; input_schema: ToolJsonSchema };

export type ModelCaller = (req: {
  system: string;
  tools: AnthropicToolSpec[];
  messages: unknown[];
}) => Promise<AssistantMessage>;

export type StagedPending = { id: string; toolId: string; summary: string };
export type RunAgentLoopResult = { text: string; pendingActions: StagedPending[]; steps: number };

type StagePendingFn = (row: {
  conversationId: string;
  userId: string;
  toolId: string;
  resolvedArgs: Record<string, unknown>;
  summary: string;
}) => Promise<string>;

export const EKO_AGENT_SYSTEM = [
  'You are EKO, the SEEKO Studio dashboard agent. Audience: admins. Be concise and operational.',
  'You act through tools. Use the read tools (list_tasks, list_milestones, list_areas, list_staff) to inspect current state before deciding anything — never guess at data you can look up.',
  'When the user asks you to change something, call the matching write tool. Every write tool STAGES the change for the user to approve with an Approve button; it does NOT take effect immediately.',
  'Never claim a write happened. After staging, say you have prepared it for approval.',
  'For a conditional request ("update them if they aren\'t on track"), first read the relevant state, evaluate the condition yourself, then call the write tool once per entity that meets it. You may call multiple write tools in a single turn.',
  'If a tool returns an error (unresolved entity, invalid value), ask the user a specific clarifying question instead of retrying blindly.',
  'Keep replies to one or two short sentences, plain text, no markdown.',
].join('\n');

const MAX_STEPS = 8;

export async function runAgentLoop(params: {
  userMessage: string;
  system: string;
  ctx: ToolContext;
  tools: AgentTool[];
  caller: ModelCaller;
  maxSteps?: number;
  stagePending?: StagePendingFn;
}): Promise<RunAgentLoopResult> {
  const { userMessage, system, ctx, tools, caller } = params;
  const maxSteps = params.maxSteps ?? MAX_STEPS;
  const stage = params.stagePending ?? stagePendingAction;

  const toolSpecs: AnthropicToolSpec[] = tools.map((tool) => ({
    name: tool.id,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
  const byId = new Map(tools.map((tool) => [tool.id, tool]));

  const messages: unknown[] = [{ role: 'user', content: [{ type: 'text', text: userMessage }] }];
  const pendingActions: StagedPending[] = [];
  const texts: string[] = [];
  let steps = 0;

  for (; steps < maxSteps; steps += 1) {
    const assistant = await caller({ system, tools: toolSpecs, messages });
    messages.push({ role: 'assistant', content: assistant.content });

    for (const block of assistant.content) {
      if (block.type === 'text' && block.text.trim()) texts.push(block.text.trim());
    }

    const toolUses = assistant.content.filter(
      (block): block is Extract<AssistantBlock, { type: 'tool_use' }> => block.type === 'tool_use',
    );
    if (assistant.stop_reason !== 'tool_use' || toolUses.length === 0) break;

    const results: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
    for (const use of toolUses) {
      const tool = byId.get(use.name);
      if (!tool) {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Unknown tool: ${use.name}`, is_error: true });
        continue;
      }
      if (tool.gated) {
        const outcome = await tool.stage(use.input, ctx);
        if (!outcome.ok) {
          results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.error, is_error: true });
          continue;
        }
        const id = await stage({
          conversationId: ctx.conversationId,
          userId: ctx.user.id,
          toolId: tool.id,
          resolvedArgs: outcome.resolvedArgs,
          summary: outcome.summary,
        });
        pendingActions.push({ id, toolId: tool.id, summary: outcome.summary });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `Staged for approval (id ${id}): ${outcome.summary}. Do not tell the user it is done.`,
        });
      } else {
        try {
          const output = await tool.run(use.input, ctx);
          results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(output) });
        } catch (error) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: error instanceof Error ? error.message : 'tool failed',
            is_error: true,
          });
        }
      }
    }
    messages.push({ role: 'user', content: results });
  }

  return { text: texts.join(' ').trim(), pendingActions, steps };
}

/** Default live caller. Maps SDK content blocks → our normalized AssistantMessage. */
export function createAnthropicCaller(): { caller: ModelCaller; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AgentActionError('Missing ANTHROPIC_API_KEY for EKO.', 503);
  const model = process.env.EKO_ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  const client = new Anthropic({ apiKey });

  const caller: ModelCaller = async ({ system, tools, messages }) => {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
    });
    const content: AssistantBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') content.push({ type: 'text', text: block.text });
      else if (block.type === 'tool_use') {
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }
    return { stop_reason: response.stop_reason ?? 'end_turn', content };
  };

  return { caller, model };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/api-server/agent/__tests__/runtime.test.ts`
Expected: PASS (all four cases, including the screenshot scenario).

- [ ] **Step 5: Verify no new tsc errors on the touched file**

Run: `npx tsc --noEmit 2>&1 | grep 'agent/runtime.ts' || echo 'no runtime errors'`
Expected: `no runtime errors`.

- [ ] **Step 6: Commit**

```bash
git add src/api-server/agent/runtime.ts src/api-server/agent/__tests__/runtime.test.ts
git commit -m "feat(eko): add in-server tool-use runtime with injectable model caller"
```

---

## Task 7: Wire the route to the loop; add approval-by-id; delete the prose planner

This is the cutover. `runAgentChat` drives the runtime; the approval route executes staged rows by id; the entire prose-planner, its regex reparsers, its provider routing, and the now-orphaned activity-helper copies are deleted from `agent.ts`. Server tests are updated to the new contract.

**Files:**
- Modify: `src/api-server/routes/agent.ts` (large reduction — target ~250 lines)
- Modify: `src/api-server/__tests__/app.test.ts` (swap deleted-export tests for the new contract)
- Delete: `src/api-server/routes/__tests__/agent-planner.test.ts`
- Test: `src/api-server/routes/__tests__/agent-executor.test.ts` (new — executeById lifecycle + gate)

**Interfaces:**
- `AgentChatInput` gains: `conversationId?: string`, `pendingActionIds?: string[]`.
- New `AgentChatResult` shape (replaces the old one):
  ```ts
  export type StagedPendingDTO = { id: string; toolId: string; summary: string };
  export type ExecutedActionDTO = { pendingActionId: string; ok: boolean; reply: string; target?: AgentWriteTarget };
  export type AgentChatResult = {
    reply: string;
    provider: 'anthropic';
    model: string;
    pendingActions?: StagedPendingDTO[];
    executed?: ExecutedActionDTO[];
  };
  ```
- New exported executor: `executeById(id: string, user: AuthenticatedUser): Promise<ExecutedActionDTO>`.
- `createAgentRoutes` / `createApiApp` injection seam (`agentAuthResolver`, `agentRunner`) is preserved unchanged.

- [ ] **Step 1: Write the failing executor test** — `src/api-server/routes/__tests__/agent-executor.test.ts`. It mocks the pending-actions module + the gate so no live DB is needed:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, Record<string, unknown>>();
vi.mock('../../agent/pending-actions', () => ({
  isExecutable: (status: string) => status === 'awaiting_approval',
  getPendingActionById: async (id: string) => rows.get(id) ?? null,
  markExecuting: async (id: string) => { const r = rows.get(id); if (r) r.status = 'executing'; },
  markExecuted: async (id: string) => { const r = rows.get(id); if (r) r.status = 'executed'; },
  markFailed: async (id: string, error: string) => { const r = rows.get(id); if (r) { r.status = 'failed'; r.error = error; } },
  markRejected: async (id: string) => { const r = rows.get(id); if (r) r.status = 'rejected'; },
}));

let adminOk = true;
vi.mock('../../agent/eko-activity', async (orig) => {
  const actual = await orig<typeof import('../../agent/eko-activity')>();
  return { ...actual, assertAdmin: async () => { if (!adminOk) throw new Error('Only admins can approve EKO writes.'); } };
});

// Stub the committed tool so no Supabase call happens.
vi.mock('../../agent/tool-registry', () => ({
  getToolById: (id: string) =>
    id === 'set_milestone_health'
      ? { id, gated: true, commit: async (args: Record<string, unknown>) => ({ reply: `Set milestone "${args.milestoneName}" health to ${args.health}.` }) }
      : undefined,
  AGENT_TOOLS: [],
}));

import { executeById } from '../agent';

afterEach(() => { rows.clear(); adminOk = true; });

describe('executeById', () => {
  it('commits an awaiting action and marks it executed', async () => {
    rows.set('pa-1', { id: 'pa-1', tool_id: 'set_milestone_health', status: 'awaiting_approval', resolved_args: { milestoneName: 'Alpha', health: 'off_track' } });
    const result = await executeById('pa-1', { id: 'u1', email: 'a@b.invalid' });
    expect(result).toMatchObject({ pendingActionId: 'pa-1', ok: true, reply: 'Set milestone "Alpha" health to off_track.' });
    expect(rows.get('pa-1')?.status).toBe('executed');
  });

  it('is idempotent — re-approving an executed action is a no-op', async () => {
    rows.set('pa-1', { id: 'pa-1', tool_id: 'set_milestone_health', status: 'executed', resolved_args: {} });
    const result = await executeById('pa-1', { id: 'u1', email: 'a@b.invalid' });
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/already/i);
  });

  it('refuses when the user is not an admin', async () => {
    adminOk = false;
    rows.set('pa-1', { id: 'pa-1', tool_id: 'set_milestone_health', status: 'awaiting_approval', resolved_args: {} });
    await expect(executeById('pa-1', { id: 'u1', email: 'a@b.invalid' })).rejects.toThrow(/admins/i);
    expect(rows.get('pa-1')?.status).not.toBe('executed');
  });
});
```

- [ ] **Step 2: Run the executor test to verify it fails**

Run: `npx vitest run src/api-server/routes/__tests__/agent-executor.test.ts`
Expected: FAIL — `executeById` is not exported from `../agent`.

- [ ] **Step 3: Rewrite `src/api-server/routes/agent.ts`** to this complete file (replaces ALL prior content):

```ts
import { Hono, type Context } from 'hono';
import { loadTasksBoard } from '@/lib/tasks-board';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';
import { AGENT_TOOLS, getToolById } from '../agent/tool-registry';
import type { AgentWriteTarget, WriteTool } from '../agent/tool-contract';
import { runAgentLoop, createAnthropicCaller, EKO_AGENT_SYSTEM } from '../agent/runtime';
import { AgentActionError } from '../agent/errors';
import { assertAdmin } from '../agent/eko-activity';
import {
  getPendingActionById,
  isExecutable,
  markExecuting,
  markExecuted,
  markFailed,
  markRejected,
} from '../agent/pending-actions';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;
type AgentMode = 'chat' | 'approval';
type AgentDecision = 'approve' | 'reject';

type RecentHistoryItem = { role: 'user' | 'eko' | 'action'; text: string };

export type AgentChatInput = {
  message: string;
  mode?: AgentMode;
  decision?: AgentDecision;
  conversationId?: string;
  pendingActionIds?: string[];
  clientContext?: { path?: string; title?: string; recentHistory?: RecentHistoryItem[] };
};

export type StagedPendingDTO = { id: string; toolId: string; summary: string };
export type ExecutedActionDTO = {
  pendingActionId: string;
  ok: boolean;
  reply: string;
  target?: AgentWriteTarget;
};

export type AgentChatResult = {
  reply: string;
  provider: 'anthropic';
  model: string;
  pendingActions?: StagedPendingDTO[];
  executed?: ExecutedActionDTO[];
};

type AgentRunner = (input: AgentChatInput, user: AuthenticatedUser) => Promise<AgentChatResult>;

type AgentRoutesOptions = { authResolver?: AuthResolver; agentRunner?: AgentRunner };

export function createAgentRoutes(options: AgentRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const agentRunner = options.agentRunner ?? runAgentChat;

  return new Hono().post('/agent/chat', async (c) => {
    const user = await authResolver(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const input = await parseAgentInput(c);
    if ('error' in input) return c.json({ error: input.error }, 400);

    try {
      return c.json(await agentRunner(input, user));
    } catch (error) {
      if (error instanceof AgentActionError) {
        return c.json({ error: error.message }, { status: error.status as 500 });
      }
      console.error('[hono agent] chat failed:', error);
      return c.json({ error: 'EKO failed before making changes.' }, 500);
    }
  });
}

async function parseAgentInput(c: Context): Promise<AgentChatInput | { error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: 'Invalid JSON body' };
  }
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const record = body as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  const mode = record.mode === 'approval' ? 'approval' : 'chat';
  const decision =
    record.decision === 'approve' || record.decision === 'reject' ? record.decision : undefined;
  const pendingActionIds = Array.isArray(record.pendingActionIds)
    ? record.pendingActionIds.filter((id): id is string => typeof id === 'string')
    : undefined;

  if (mode === 'approval') {
    if (!decision) return { error: 'Approval decision is required' };
    if (decision === 'approve' && (!pendingActionIds || pendingActionIds.length === 0)) {
      return { error: 'pendingActionIds are required to approve' };
    }
  } else {
    if (!message) return { error: 'Message is required' };
    if (message.length > 2000) return { error: 'Message is too long' };
  }

  return {
    message,
    mode,
    decision,
    conversationId:
      typeof record.conversationId === 'string' && record.conversationId ? record.conversationId : undefined,
    pendingActionIds,
    clientContext: parseClientContext(record.clientContext),
  };
}

function parseClientContext(value: unknown): AgentChatInput['clientContext'] {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return {
    path: typeof record.path === 'string' ? record.path : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    recentHistory: parseRecentHistory(record.recentHistory),
  };
}

function parseRecentHistory(value: unknown): RecentHistoryItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item): RecentHistoryItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const role = record.role === 'user' || record.role === 'eko' || record.role === 'action' ? record.role : null;
      const text = typeof record.text === 'string' ? record.text.trim().slice(0, 280) : '';
      if (!role || !text) return null;
      return { role, text };
    })
    .filter((item): item is RecentHistoryItem => Boolean(item))
    .slice(-6);
}

async function runAgentChat(input: AgentChatInput, user: AuthenticatedUser): Promise<AgentChatResult> {
  if (input.mode === 'approval' && input.decision) {
    return runApprovalDecision(input, user);
  }

  // Slash commands run in the tray, not the model.
  if (/^\/[a-z]+\b/i.test(input.message.trim())) {
    return {
      reply: 'That command runs in the tray, not on the server. Type /clear in the composer to reset this chat.',
      provider: 'anthropic',
      model: 'eko-local',
    };
  }

  const board = await loadTasksBoard(user).catch(() => null);
  const conversationId = input.conversationId ?? 'default';
  const { caller, model } = createAnthropicCaller();
  const loop = await runAgentLoop({
    userMessage: input.message,
    system: EKO_AGENT_SYSTEM,
    ctx: { user, board, conversationId },
    tools: AGENT_TOOLS,
    caller,
  });

  return {
    reply: loop.text || 'Done.',
    provider: 'anthropic',
    model,
    pendingActions: loop.pendingActions,
  };
}

async function runApprovalDecision(
  input: AgentChatInput,
  user: AuthenticatedUser,
): Promise<AgentChatResult> {
  if (input.decision === 'reject') {
    for (const id of input.pendingActionIds ?? []) {
      await markRejected(id).catch(() => undefined);
    }
    return { reply: 'Rejected. No dashboard changes were made.', provider: 'anthropic', model: 'eko-local' };
  }

  const executed: ExecutedActionDTO[] = [];
  for (const id of input.pendingActionIds ?? []) {
    executed.push(await executeById(id, user));
  }
  const okCount = executed.filter((e) => e.ok).length;
  const reply = okCount
    ? executed.filter((e) => e.ok).map((e) => e.reply).join(' ')
    : executed[0]?.reply ?? 'No changes were made.';

  return { reply, provider: 'anthropic', model: 'eko-local', executed };
}

/**
 * Execute one staged action by id. Idempotent on status (re-approving an
 * executed/rejected/failed row is a no-op). Gate runs on every approval.
 */
export async function executeById(id: string, user: AuthenticatedUser): Promise<ExecutedActionDTO> {
  const row = await getPendingActionById(id);
  if (!row) return { pendingActionId: id, ok: false, reply: 'That action is no longer available.' };
  if (!isExecutable(row.status)) {
    return { pendingActionId: id, ok: false, reply: `That action is already ${row.status}. No changes were made.` };
  }

  await assertAdmin(user.id);
  await markExecuting(id);

  const tool = getToolById(row.tool_id);
  if (!tool || !tool.gated) {
    await markFailed(id, `No write tool for ${row.tool_id}`);
    return { pendingActionId: id, ok: false, reply: 'EKO no longer has a matching write tool for that action.' };
  }

  try {
    const result = await (tool as WriteTool).commit(row.resolved_args, user);
    await markExecuted(id);
    return { pendingActionId: id, ok: true, reply: result.reply, target: result.target };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'EKO could not complete the action.';
    await markFailed(id, message);
    if (error instanceof AgentActionError && error.status === 403) throw error; // surface gate failures
    return { pendingActionId: id, ok: false, reply: message };
  }
}
```

**Note for the implementer:** deleting the old file wholesale removes `planLocalIssueWrite`, `answerLocalContextFollowUp`, all `parseIssue*Draft`/`executeIssue*`/`executeBulk*`/`executeTypedApproval`/`executeApprovedIssueWrite`, `withTypedIntent` + reply classifiers, `runOpenAI`/`runAnthropic` + extractors, `resolveProviderPlan`/`choosePrimaryProvider`, `buildPrompt`, `loadAgentDashboardContext`, `summarizeDocsContext`/`summarizePaymentsContext`, and the local `assertAdminUser`/`markLatest*`/`hideLatest*` copies (now living in `eko-activity.ts`). This is intended — they are the strangled prose planner.

- [ ] **Step 4: Run the executor test to verify it passes**

Run: `npx vitest run src/api-server/routes/__tests__/agent-executor.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete the obsolete planner test**

```bash
git rm src/api-server/routes/__tests__/agent-planner.test.ts
```

- [ ] **Step 6: Fix `app.test.ts`** — the two deleted-export imports break the file. Make these surgical edits:

1. Delete line 3 (`import { answerLocalContextFollowUp, planLocalIssueWrite } from '../routes/agent';`) and the `makeTask`/`makeBoard` helpers (lines ~11–32) if they become unused after step 6.2.
2. Delete every `describe`/`it` block that calls `planLocalIssueWrite(...)` or `answerLocalContextFollowUp(...)` (grep `git grep -n 'planLocalIssueWrite\|answerLocalContextFollowUp' src/api-server/__tests__/app.test.ts` to enumerate them — the delete-resolution, status/assignee/priority/due, and context-follow-up blocks).
3. Delete the two approval-mode HTTP tests that assert the old prose replies (the `'does not claim approval decisions already changed the dashboard'` block asserting `'...does not have a matching write tool for "Move Additional Props..."'` and the `'does not execute incomplete typed issue create approvals'` block) — the reply contract changed.
4. KEEP the HTTP-contract tests that use `createApiApp` injection and are still valid: health, `requires auth before running EKO` (401), `validates EKO chat payloads` (400 message required), `requires an approval decision in approval mode` (400), `never creates a new approval from a bare confirmation` (still valid — the guard is retained), `runs EKO through an injected agent runner`, and `returns a config error when EKO provider keys are missing` — but update the last one: it stubs `EKO_AGENT_PROVIDER=openai`/`OPENAI_API_KEY=''` and expects 503 `Missing OPENAI_API_KEY`. Replace it with the Anthropic equivalent (the runtime now throws `AgentActionError('Missing ANTHROPIC_API_KEY for EKO.', 503)`):

```ts
  it('returns a config error when the EKO Anthropic key is missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });
    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize tasks' }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Missing ANTHROPIC_API_KEY for EKO.' });
  });
```

5. Add one new approval-contract test proving approve requires ids:

```ts
  it('requires pendingActionIds to approve', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });
    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '', mode: 'approval', decision: 'approve' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'pendingActionIds are required to approve' });
  });
```

**Note:** the `'never creates a new approval from a bare confirmation'` test (app.test.ts:97) posts bare-confirmation messages in `mode:'chat'` and expects a fixed clarification reply from `eko-local-planner`. That guard was in the OLD `runAgentChat`. In the new file, a bare "yes" in chat mode goes to the model. Either (a) re-add a bare-confirmation guard to the new `runAgentChat` returning the same reply with `provider:'anthropic', model:'eko-local'` and update the test's expected `provider`/`model`, or (b) delete that test. **Choose (a)** — the guard is cheap insurance against a stray "yes" burning a model call, and the design keeps it. Add to `runAgentChat` right after the slash-command guard:

```ts
  if (/^\s*(?:yes|yeah|yep|ok|okay|sure|confirmed?|confirm|go ahead|proceed|do it|approve(?: it)?|approved(?: it)?|i approve)\s*[.!?]*\s*$/i.test(input.message)) {
    return {
      reply: 'Use the Approve button on the pending action, or tell EKO the specific action you want prepared. Writes stay gated until approved.',
      provider: 'anthropic',
      model: 'eko-local',
    };
  }
```

Then update that test's expected object to `provider: 'anthropic', model: 'eko-local'` and drop the `intent` field.

- [ ] **Step 7: Run the full api-server suite**

Run: `npx vitest run src/api-server`
Expected: PASS. If any test still imports a deleted export, remove that test per step 6. Do NOT weaken assertions to pass — delete obsolete tests, keep valid ones green.

- [ ] **Step 8: Verify no new tsc errors on touched files**

Run: `npx tsc --noEmit 2>&1 | grep -E 'routes/agent\.ts|__tests__/app\.test\.ts' || echo 'no agent route errors'`
Expected: `no agent route errors`.

- [ ] **Step 9: Commit**

```bash
git add src/api-server/routes/agent.ts src/api-server/__tests__/app.test.ts src/api-server/routes/__tests__/agent-executor.test.ts src/api-server/routes/__tests__/agent-planner.test.ts
git commit -m "feat(eko): drive route from tool-use loop, execute approvals by id, delete prose planner"
```

---

## Task 8: Client — mint/send conversationId, render from pendingActions, approve by id, delete inferPendingWriteDraft

The server now returns `{ reply, pendingActions?, executed? }` and keys staged actions by `conversationId`. The tray must mint a stable `conversationId`, send it every turn, render an approval card per staged pending action, approve by posting `pendingActionIds`, and stop re-inferring drafts from prose.

**Scope guard (YAGNI):** the write-details wizard (`WriteDetailsStep`, `shouldCollectWriteDetails`) stays — it is the create-issue slot-fill UI and is still valid. This task removes ONLY the prose re-inference (`inferPendingWriteDraft` and its call sites) and wires the new contract. Preserve the existing approval-card visual treatment exactly.

**Files:**
- Create: `src/lib/eko-agent-client.ts` (pure, unit-testable request/response mapping)
- Modify: `src/components/dashboard/AgentCompanion.tsx`
- Test: `src/lib/__tests__/eko-agent-client.test.ts`

**Interfaces:**
- Produces (`eko-agent-client.ts`):
  - `type EkoPendingAction = { id: string; toolId: string; summary: string }`
  - `type EkoChatResponse = { reply: string; provider?: string; model?: string; pendingActions?: EkoPendingAction[]; executed?: Array<{ pendingActionId: string; ok: boolean; reply: string; target?: EkoWriteTarget }> }`
  - `type EkoWriteTarget = { kind: 'task'; taskId: string; taskNumber?: number | null; name: string; action: string }`
  - `newConversationId(): string`
  - `firstPendingAction(response: EkoChatResponse): EkoPendingAction | null`
  - `executedTarget(response: EkoChatResponse): EkoWriteTarget | null`

- [ ] **Step 1: Write the failing tests** — `src/lib/__tests__/eko-agent-client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newConversationId, firstPendingAction, executedTarget } from '../eko-agent-client';

describe('newConversationId', () => {
  it('returns a non-empty unique-ish string', () => {
    const a = newConversationId();
    const b = newConversationId();
    expect(a).toBeTruthy();
    expect(typeof a).toBe('string');
    expect(a).not.toBe(b);
  });
});

describe('firstPendingAction', () => {
  it('returns the first staged action or null', () => {
    expect(firstPendingAction({ reply: 'x', pendingActions: [{ id: 'pa-1', toolId: 't', summary: 's' }] }))
      .toEqual({ id: 'pa-1', toolId: 't', summary: 's' });
    expect(firstPendingAction({ reply: 'x' })).toBeNull();
    expect(firstPendingAction({ reply: 'x', pendingActions: [] })).toBeNull();
  });
});

describe('executedTarget', () => {
  it('returns the first executed target with a target, else null', () => {
    expect(executedTarget({
      reply: 'x',
      executed: [{ pendingActionId: 'pa-1', ok: true, reply: 'done', target: { kind: 'task', taskId: 't1', name: 'A', action: 'status' } }],
    })).toMatchObject({ taskId: 't1' });
    expect(executedTarget({ reply: 'x', executed: [{ pendingActionId: 'pa-1', ok: true, reply: 'done' }] })).toBeNull();
    expect(executedTarget({ reply: 'x' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/eko-agent-client.test.ts`
Expected: FAIL — cannot resolve `../eko-agent-client`.

- [ ] **Step 3: Implement `src/lib/eko-agent-client.ts`**:

```ts
export type EkoPendingAction = { id: string; toolId: string; summary: string };

export type EkoWriteTarget = {
  kind: 'task';
  taskId: string;
  taskNumber?: number | null;
  name: string;
  action: string;
};

export type EkoExecutedAction = {
  pendingActionId: string;
  ok: boolean;
  reply: string;
  target?: EkoWriteTarget;
};

export type EkoChatResponse = {
  reply: string;
  provider?: string;
  model?: string;
  pendingActions?: EkoPendingAction[];
  executed?: EkoExecutedAction[];
};

/** Stable per-tray-session id used to key staged pending actions server-side. */
export function newConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `eko-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export function firstPendingAction(response: EkoChatResponse): EkoPendingAction | null {
  return response.pendingActions?.[0] ?? null;
}

export function executedTarget(response: EkoChatResponse): EkoWriteTarget | null {
  return response.executed?.find((action) => action.ok && action.target)?.target ?? null;
}
```

- [ ] **Step 4: Wire the client** — edit `src/components/dashboard/AgentCompanion.tsx`:

**4a.** Add the import (near the other `@/lib` imports, e.g. after line 18). Import only what the component calls — `firstPendingAction` is exported and unit-tested in the client lib but the component reads `response.pendingActions` directly, so importing it here would be an unused import:
```ts
import { newConversationId, executedTarget } from '@/lib/eko-agent-client';
```

**4b.** Mint a stable conversationId. Inside the component (near the other `useState`/`useRef` declarations around line 440), add:
```ts
const conversationIdRef = useRef<string>(newConversationId());
```
(If `useRef` isn't imported, add it to the existing `import { ... } from 'react'`.)

**4c.** Send it every request. In `buildApiRequest` (line 989) add `conversationId` to the returned object:
```ts
    return {
      message,
      conversationId: conversationIdRef.current,
      clientContext: {
```
and add `conversationId?: string;` to the `EkoApiRequest` type (line 63 block).

**4d.** Extend `EkoApiResponse` (line 84 block) to carry the new fields (keep existing fields for the transition; the server no longer sends `approval`, so guard on `pendingActions`):
```ts
  pendingActions?: Array<{ id: string; toolId: string; summary: string }>;
  executed?: Array<{ pendingActionId: string; ok: boolean; reply: string; target?: EkoApiResponse['target'] }>;
```

**4e.** Approve by id. In `approveAction` (line 1015), the request currently sends `mode:'approval', decision:'approve', revision`. Change it to send the staged ids from the response that opened the card. Store them when the card opens: in the prompt-send handler that sets `activeApproval`/`activeSuggestion` (around line 1382–1394), also capture the pending action ids:
```ts
        setPendingActionIds(response.pendingActions?.map((p) => p.id) ?? []);
```
Add the state near 4b: `const [pendingActionIds, setPendingActionIds] = useState<string[]>([]);`
Then in `approveAction`'s `requestEko(buildApiRequest(approvalMessage, { ... }))` call, replace the overrides with:
```ts
        buildApiRequest(approvalMessage, {
          mode: 'approval',
          decision: 'approve',
          pendingActionIds,
          suggestion: undefined,
        }),
```
Add `pendingActionIds?: string[];` to `EkoApiRequest`.

**4f.** Read the executed target from the new shape. In `approveAction`, replace the `response.intent === 'executed'` branch (lines 1048–1066) with:
```ts
      const target = executedTarget(response as unknown as import('@/lib/eko-agent-client').EkoChatResponse);
      const didExecute = (response.executed ?? []).some((e) => e.ok);
      if (didExecute) {
        emitEkoEvent({
          type: 'write-executed',
          target: target ? { id: target.taskId, taskNumber: target.taskNumber ?? undefined, name: target.name } : undefined,
        });
      }
      setWriteReceipt(target ? { target: { kind: 'task', taskId: target.taskId, taskNumber: target.taskNumber ?? null, name: target.name, action: target.action as 'create' | 'status' | 'assignee' }, reply: response.reply } : null);
```

**4g.** Render the approval card from the staged action(s). The design requires ONE card that **lists every batched write** (the screenshot case stages two milestone writes → one card naming both), so render all pending summaries, not just the first. Where the card opens from a chat response (the `createGeneratedApprovalSuggestionFromResponse` path, line 1382–1394), set the approval copy from all staged summaries:
```ts
        const staged = response.pendingActions ?? [];
        if (staged.length) {
          // One line per staged write; the card renders this as its body.
          setGeneratedApprovalCopy(staged.map((p) => `• ${p.summary}`).join('\n'));
        }
```
Keep the existing `setActiveSuggestion`/`setActiveApproval` lines; the card still renders `generatedApprovalCopy`. If the card body currently renders `generatedApprovalCopy` in a single-line element, switch that element to `whitespace-pre-line` (or map over the split lines) so the per-write bullets stack — a two-write batch must be visibly two lines. `firstPendingAction` is still exported for the single-write path and the executed-target lookup; the multi-write card uses the full array.

**4h.** Delete `inferPendingWriteDraft` and its two callers:
- Delete the whole `inferPendingWriteDraft` function (lines 372–406).
- In `getGeneratedApprovalLabel` (line 309–318), delete the `const inferred = inferPendingWriteDraft(...)` line and the `if (inferred.title) return ...` line — fall straight through to the `normalizeApprovalLabel` action logic.
- In `draftFromResponse` (line 349–357), drop the `inferred` fallback; read only from the response:
```ts
function draftFromResponse(response: EkoApiResponse, _prompt: string): PendingWriteDraft {
  return {
    title: response.approval?.draft?.title ?? '',
    status: response.approval?.draft?.status ?? '',
    priority: response.approval?.draft?.priority ?? '',
    dueDate: response.approval?.draft?.dueDate ?? '',
  };
}
```
(The server no longer sends `approval.draft`; this returns empties, which is correct — the write-details wizard collects them interactively when the user chooses to create an issue.)

**4i.** Reset conversation on `/clear`. Wherever the tray clears chat state (search for the `/clear` handler / `setChatHistory([])`), also mint a fresh id: `conversationIdRef.current = newConversationId();` and `setPendingActionIds([]);`.

- [ ] **Step 5: Run the client lib tests + a typecheck of the component**

Run: `npx vitest run src/lib/__tests__/eko-agent-client.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit 2>&1 | grep -E 'AgentCompanion\.tsx|lib/eko-agent-client\.ts' || echo 'no client errors'`
Expected: `no client errors`. (If TypeScript flags a removed reference to `inferPendingWriteDraft`, fix the remaining caller; there are exactly two.)

- [ ] **Step 6: Verify the prose-inference is gone**

Run: `git grep -n 'inferPendingWriteDraft' src/components/dashboard/AgentCompanion.tsx || echo 'inferPendingWriteDraft removed'`
Expected: `inferPendingWriteDraft removed`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/eko-agent-client.ts src/lib/__tests__/eko-agent-client.test.ts src/components/dashboard/AgentCompanion.tsx
git commit -m "feat(eko): client sends conversationId, approves staged actions by id, drops prose inference"
```

---

## Task 9: Retire the orphaned prose context + final gate

The chat path no longer dumps prose context (Task 7 removed `loadAgentDashboardContext`), which retires the double board-fetch debt (the board now loads exactly once per turn). This task confirms the orphan status of `context.ts`, removes it if fully orphaned, and runs the whole-suite + typecheck gate.

**Files:**
- Possibly delete: `src/api-server/agent/context.ts`, `src/api-server/agent/__tests__/context.test.ts`
- Verify: whole api-server + client-lib suites, tsc baseline.

- [ ] **Step 1: Confirm the board is loaded once per turn**

Run: `git grep -n 'loadTasksBoard\|buildAgentDashboardContext' src/api-server/routes/agent.ts`
Expected: exactly one `loadTasksBoard(user)` call in `runAgentChat`, and ZERO `buildAgentDashboardContext` references.

- [ ] **Step 2: Check whether `context.ts` still has any consumer**

Run: `git grep -n "agent/context'" src -- ':!*/context.ts' ':!*/context.test.ts'`
Expected: no output (nothing imports it outside its own test).

- [ ] **Step 3: If Step 2 is empty, delete the orphan**

```bash
git rm src/api-server/agent/context.ts src/api-server/agent/__tests__/context.test.ts
```
If Step 2 shows a remaining consumer, SKIP the delete and note the consumer in the progress ledger for the final review to triage.

- [ ] **Step 4: Run the full EKO + api-server + client-lib suites**

Run: `npx vitest run src/api-server src/lib/__tests__/eko-agent-client.test.ts`
Expected: PASS, no failures. Note the total count for the ledger.

- [ ] **Step 5: Confirm no NEW tsc errors introduced by the whole change**

Run: `npx tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: **45** (the pre-existing Next→Vite baseline) — or fewer. If higher, run `npx tsc --noEmit 2>&1 | grep 'error TS'` and confirm every new error is on a file this plan did NOT touch; fix any that are on touched files (`src/api-server/agent/**`, `routes/agent.ts`, `src/lib/eko-agent-client.ts`, `AgentCompanion.tsx`).

- [ ] **Step 6: Commit**

```bash
git add -u src/api-server/agent/context.ts src/api-server/agent/__tests__/context.test.ts
git commit -m "chore(eko): retire orphaned prose context builder; final gate green"
```
(If Step 3 was skipped, this commit is a no-op — skip it.)

---

## Verification / acceptance (maps to the design's acceptance criteria)

- **Screenshot scenario** — the conditional milestone update produces **one turn → two staged writes → executed by id on approval**: proven by `runtime.test.ts`'s "SCREENSHOT SCENARIO" case + `agent-executor.test.ts`'s commit case. (Fails on the old planner.)
- **All writes approval-gated end to end** — every write tool is `gated:true` (asserted in `task-write-tools.test.ts` / read-tools split); `executeById` calls `assertAdmin` on every approval; the non-admin path is proven to not execute (`agent-executor.test.ts`).
- **No prose planner** — `git grep planLocalIssueWrite executeApprovedIssueWrite src/api-server` returns nothing; `git grep inferPendingWriteDraft src/components` returns nothing.
- **Read-tools-on-demand replaces the prose dump** — `runAgentChat` loads the board once and passes it to the loop; `list_*` read tools serve the model live; `buildAgentDashboardContext` is no longer on the chat path (double-fetch debt retired).
- **Gate under migration** — scoped Vitest green + tsc count at the 45 baseline on touched files.

## Post-merge / QA notes (not implementer steps)

- **Restart the api-server** (`npm start` / the running `tsx` process) after this lands — `src/api-server/**` changed.
- **Apply the migration** `20260706000001_eko_pending_actions.sql` to the live Supabase DB (user-gated) before EKO writes can stage in production. Until applied, staging inserts fail and the loop reports the error back through the tray — no silent success.
- **Regenerate Database types** post-migration if the team wants `eko_pending_actions` typed (optional; the module uses the same untyped cast the repo already relies on for `milestones`).
- **Live e2e** (auth-walled, deferred to user QA): open the tray, ask "update the milestones if they aren't on track" on a board with overdue on_track milestones → expect one approval card listing both → approve → both `milestones.health` rows flip and a receipt appears.
