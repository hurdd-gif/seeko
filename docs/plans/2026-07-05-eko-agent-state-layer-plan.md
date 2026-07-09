# EKO Agent — Structured Entity Resolution (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EKO resolve which task/person the user means from the structured `TasksBoardData` already in memory, instead of regex-reparsing the truncated prose context blob — fixing the bug where any task past the context truncation cap is unresolvable.

**Architecture:** The planning path currently resolves entities via `parseDashboardTaskIndex(dashboardContext)` / `parseStaffIndex(dashboardContext)` — regex over the same prose the server formatted for the LLM, which drops every task past the `…and N more` cap and carries no real row id. The execution path already resolves against structured `board.tasks`. Phase A introduces a pure, tested `entity-index` module (`buildTaskIndex`/`buildStaffIndex`/`resolveTaskRef`) over `TasksBoardData`, points the planning resolvers at it, and deletes the prose reparsers. The prose context stays — but only as the LLM's reading material, never as a resolution source. Real task ids now flow through the index, seeding Phase B (execute-by-id).

**Tech Stack:** TypeScript, Hono (api-server), Vitest, Supabase (service client). Server-side only; no client changes in Phase A.

## Global Constraints

- Test runner: `npm test` (Vitest). Co-locate tests under `__tests__/`.
- All EKO writes stay gated behind explicit approval — Phase A changes resolution only, never the approval gate or permission checks (`assertAdminUser`).
- The index entry shape must be a superset of what `parseDashboardTaskIndex` returned (`{ name, status?, assigneeName?, taskNumber? }`) so downstream orchestration (`parseIssueDeleteDraft`, `parseBulkAssignFromHistory`, `findRecentCreatedTask`) is source-swapped, not rewritten. New field: `id` (real `tasks.id`).
- Task-number reference grammar is preserved verbatim: `/(?:\b(?:task|issue|todo|ticket)\s*#?|#)(\d+)\b/i`.
- Board task shape (from `@/lib/types` `TaskWithAssignee`): `id: string`, `task_number?: number | null`, `name: string`, `status`, `assignee?: { display_name?: string }`. Team shape (`board.team`): `{ id: string; display_name?: string }`.
- The api-server is plain `tsx` — restart after `src/api-server/**` edits to see runtime behavior.

---

## File Structure

- **Create** `src/api-server/agent/entity-index.ts` — pure structured entity resolution over `TasksBoardData`. Owns: `TaskIndexEntry`, `StaffIndexEntry`, `buildTaskIndex`, `buildStaffIndex`, `resolveTaskRef`, `parseTaskNumberRef`. No Supabase, no Hono — unit-testable in isolation.
- **Create** `src/api-server/agent/__tests__/entity-index.test.ts` — unit tests for the module, including the truncation regression.
- **Modify** `src/api-server/routes/agent.ts` — replace prose-based task/staff resolution with the structured module; thread `board` into `planLocalIssueWrite` and the `parseIssue*Draft` family; load the board in `runAgentChat`; delete `parseDashboardTaskIndex` and `parseStaffIndex`.
- **Create** `src/api-server/routes/__tests__/agent-planner.test.ts` — planner-level test proving a delete for a task past the old truncation cap now resolves (exercises the exported `planLocalIssueWrite`).

---

### Task 1: Structured entity-index module

**Files:**
- Create: `src/api-server/agent/entity-index.ts`
- Test: `src/api-server/agent/__tests__/entity-index.test.ts`

**Interfaces:**
- Consumes: `TasksBoardData` from `@/lib/tasks-board`, `TaskWithAssignee` from `@/lib/types`.
- Produces:
  - `type TaskIndexEntry = { id: string; name: string; status?: string; assigneeName?: string; taskNumber?: number }`
  - `type StaffIndexEntry = { id: string; name: string }`
  - `buildTaskIndex(board: TasksBoardData | null): TaskIndexEntry[]` — one entry per `board.tasks` row, ALL rows, no truncation.
  - `buildStaffIndex(board: TasksBoardData | null): StaffIndexEntry[]` — one entry per named `board.team` member.
  - `resolveTaskRef(value: string, index: TaskIndexEntry[]): TaskIndexEntry | undefined` — number ref wins, else longest-name containment.
  - `parseTaskNumberRef(value: string): number | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/api-server/agent/__tests__/entity-index.test.ts
import { describe, expect, it } from 'vitest';
import { buildTaskIndex, buildStaffIndex, resolveTaskRef, parseTaskNumberRef } from '../entity-index';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeTask(overrides: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  return {
    id: 'task-1', task_number: 12, name: 'UI Extension',
    department: 'Coding', status: 'In Progress', priority: 'High',
    ...overrides,
  } as TaskWithAssignee;
}

function makeBoard(overrides: Partial<TasksBoardData> = {}): TasksBoardData {
  return {
    tasks: [], team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'user-1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
    ...overrides,
  } as TasksBoardData;
}

describe('buildTaskIndex', () => {
  it('maps every board task to an entry with real id, number, status, assignee', () => {
    const board = makeBoard({
      tasks: [makeTask({ id: 'abc', task_number: 22, name: 'Boss Fight', status: 'Backlog',
        assignee: { display_name: 'Mel' } as never })],
    });
    expect(buildTaskIndex(board)).toEqual([
      { id: 'abc', name: 'Boss Fight', status: 'Backlog', assigneeName: 'Mel', taskNumber: 22 },
    ]);
  });

  it('includes ALL tasks — no truncation cap (regression for prose-index #…and N more)', () => {
    const tasks = Array.from({ length: 60 }, (_, i) =>
      makeTask({ id: `t${i}`, task_number: i + 1, name: `Task ${i + 1}` }));
    const index = buildTaskIndex(makeBoard({ tasks }));
    expect(index).toHaveLength(60);
    expect(resolveTaskRef('delete task 47', index)).toMatchObject({ id: 't46', taskNumber: 47 });
  });

  it('returns [] for a null board', () => {
    expect(buildTaskIndex(null)).toEqual([]);
  });
});

describe('resolveTaskRef', () => {
  const index = [
    { id: 'a', name: 'Boss Fight', taskNumber: 22 },
    { id: 'b', name: 'Boss Fight Arena', taskNumber: 23 },
  ];
  it('prefers an explicit task number over name containment', () => {
    expect(resolveTaskRef('move #23 to done', index)).toMatchObject({ id: 'b' });
  });
  it('matches the longest task name contained in the message', () => {
    expect(resolveTaskRef('assign boss fight arena to karti', index)).toMatchObject({ id: 'b' });
  });
});

describe('parseTaskNumberRef', () => {
  it('reads task/issue/# number references, not bare numbers', () => {
    expect(parseTaskNumberRef('delete task 22')).toBe(22);
    expect(parseTaskNumberRef('#22 please')).toBe(22);
    expect(parseTaskNumberRef('due in 22 days')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api-server/agent/__tests__/entity-index.test.ts`
Expected: FAIL — `Cannot find module '../entity-index'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/api-server/agent/entity-index.ts
import type { TasksBoardData } from '@/lib/tasks-board';

export type TaskIndexEntry = {
  id: string;
  name: string;
  status?: string;
  assigneeName?: string;
  taskNumber?: number;
};

export type StaffIndexEntry = { id: string; name: string };

/** Complete, structured task index straight from the board — every task, real id, no truncation. */
export function buildTaskIndex(board: TasksBoardData | null): TaskIndexEntry[] {
  if (!board) return [];
  return board.tasks.map((task) => ({
    id: task.id,
    name: task.name,
    status: task.status ?? undefined,
    assigneeName: task.assignee?.display_name ?? undefined,
    taskNumber: typeof task.task_number === 'number' ? task.task_number : undefined,
  }));
}

export function buildStaffIndex(board: TasksBoardData | null): StaffIndexEntry[] {
  if (!board) return [];
  return board.team
    .filter((member) => member.display_name)
    .map((member) => ({ id: member.id, name: member.display_name as string }));
}

/**
 * Explicit task-number reference in a message: "task 22", "issue #22", "#22".
 * A bare number with no noun or # marker never matches — dates/quantities would false-positive.
 */
export function parseTaskNumberRef(value: string): number | null {
  const match = value.match(/(?:\b(?:task|issue|todo|ticket)\s*#?|#)(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

/** Resolve a single task from a message: unique number wins, else longest contained name. */
export function resolveTaskRef(value: string, index: TaskIndexEntry[]): TaskIndexEntry | undefined {
  const numberRef = parseTaskNumberRef(value);
  if (numberRef != null) {
    const byNumber = index.find((task) => task.taskNumber === numberRef);
    if (byNumber) return byNumber;
  }
  const normalized = value.toLowerCase();
  return [...index]
    .sort((a, b) => b.name.length - a.name.length)
    .find((task) => normalized.includes(task.name.toLowerCase()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api-server/agent/__tests__/entity-index.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/api-server/agent/entity-index.ts src/api-server/agent/__tests__/entity-index.test.ts
git commit -m "feat(eko): structured entity index over TasksBoardData"
```

---

### Task 2: Route task resolution through the structured index

**Files:**
- Modify: `src/api-server/routes/agent.ts` (`planLocalIssueWrite`, `parseIssueStatusDraft`/`AssigneeDraft`/`PriorityDraft`/`DueDateDraft`, `parseIssueDeleteDraft`, `parseBulkAssignFromHistory`, `findRecentCreatedTask`, `findTaskInContext`, `findMentionedTaskName`, `runAgentChat`, `executeApprovedIssueWrite`)
- Test: `src/api-server/routes/__tests__/agent-planner.test.ts`

**Interfaces:**
- Consumes: `buildTaskIndex`, `resolveTaskRef`, `TaskIndexEntry` from `../agent/entity-index` (Task 1).
- Produces: `planLocalIssueWrite(input: AgentChatInput, board: TasksBoardData | null): AgentChatResult | null` — signature changes from `(input, dashboardContext: string)` to `(input, board)`. The `parseIssue*Draft` family changes their second parameter from `dashboardContext: string` to `board: TasksBoardData | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/api-server/routes/__tests__/agent-planner.test.ts
import { describe, expect, it } from 'vitest';
import { planLocalIssueWrite, type AgentChatInput } from '../agent';
import type { TasksBoardData } from '@/lib/tasks-board';
import type { TaskWithAssignee } from '@/lib/types';

function makeTask(overrides: Partial<TaskWithAssignee> = {}): TaskWithAssignee {
  return { id: 'task-1', task_number: 12, name: 'UI Extension',
    department: 'Coding', status: 'In Progress', priority: 'High', ...overrides } as TaskWithAssignee;
}
function makeBoard(tasks: TaskWithAssignee[]): TasksBoardData {
  return { tasks, team: [], areas: [], projectMilestones: [], projectActivity: [],
    isAdmin: true, currentUserId: 'user-1',
    account: { email: 'a@b.invalid', initials: 'A', isAdmin: true, unreadCount: 0, notifications: [], team: [], areas: [] },
  } as TasksBoardData;
}
function chat(message: string): AgentChatInput {
  return { message, mode: 'chat' };
}

describe('planLocalIssueWrite delete resolution', () => {
  it('resolves a task by number even when it is far past the old prose truncation cap', () => {
    const tasks = Array.from({ length: 60 }, (_, i) =>
      makeTask({ id: `t${i}`, task_number: i + 1, name: `Task ${i + 1}` }));
    const result = planLocalIssueWrite(chat('delete task 47'), makeBoard(tasks));
    expect(result?.intent).toBe('approval_required');
    expect(result?.approval?.kind).toBe('issue.delete');
    expect(result?.approval?.draft?.taskNumber).toBe('47');
  });

  it('resolves a status move by name from the structured board', () => {
    const result = planLocalIssueWrite(chat('move UI Extension to Done'), makeBoard([makeTask()]));
    expect(result?.intent).toBe('approval_required');
    expect(result?.approval?.copy).toContain('Done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api-server/routes/__tests__/agent-planner.test.ts`
Expected: FAIL — `planLocalIssueWrite` still expects a `dashboardContext` string; the 60-task delete returns `null`/`clarification` because the current prose path can't be fed a board (type error or unresolved).

- [ ] **Step 3: Rewrite the resolution internals to consume `board`**

In `src/api-server/routes/agent.ts`, add the import at the top:

```ts
import { buildTaskIndex, resolveTaskRef, type TaskIndexEntry } from '../agent/entity-index';
```

Replace `findTaskInContext` (lines ~1462-1474) so it resolves from the board index:

```ts
function findTaskInContext(value: string, board: TasksBoardData | null) {
  return resolveTaskRef(value, buildTaskIndex(board));
}
```

Update `findMentionedTaskName` (line ~1442) to pass the board through:

```ts
function findMentionedTaskName(value: string, board: TasksBoardData | null) {
  return findTaskInContext(value, board)?.name;
}
```

Change the four draft parsers (lines ~1106-1143) to take `board` instead of `dashboardContext`. They already delegate task lookup to `findTaskInContext`/`findMentionedTaskName` and staff lookup to `parseStaffFromText` (staff moves to Task 3). Only the parameter type and the forwarded argument change, e.g.:

```ts
function parseIssueStatusDraft(value: string, board: TasksBoardData | null): IssueWriteDraft | null {
  const status = parseTaskStatus(value);
  const taskName = findMentionedTaskName(value, board);
  if (!status || !taskName) return null;
  return { taskName, status };
}
```

Apply the same `dashboardContext: string` → `board: TasksBoardData | null` change to `parseIssueAssigneeDraft`, `parseIssuePriorityDraft`, `parseIssueDueDateDraft`, forwarding `board` to their `findMentionedTaskName`/`findTaskInContext` calls (staff calls stay as-is until Task 3).

Change `parseIssueDeleteDraft` (line ~1176) and `findRecentCreatedTask` (line ~1256) to build the index from the board:

```ts
function parseIssueDeleteDraft(
  value: string,
  board: TasksBoardData | null,
  recentHistory?: RecentHistoryItem[],
): IssueDeleteResolution | null {
  if (!/\b(?:delete|remove)\b/i.test(value)) return null;
  if (/\b(?:delete|remove)\s+(?:the\s+|its\s+)?(?:assignee|status|priority|due date|deadline|label|milestone|comment|description)\b/i.test(value)) {
    return null;
  }
  const tasks = buildTaskIndex(board);
  // …remainder of the existing body is UNCHANGED (it already operates on `tasks`).
```

```ts
function findRecentCreatedTask(
  recentHistory: RecentHistoryItem[] | undefined,
  tasks: TaskIndexEntry[],
) {
  // …body UNCHANGED.
}
```

Change `parseBulkAssignFromHistory` (line ~1144) to build the index from the board (staff still via `parseStaffFromText` until Task 3):

```ts
function parseBulkAssignFromHistory(
  value: string,
  board: TasksBoardData | null,
  recentHistory?: RecentHistoryItem[],
): { assigneeName: string; tasks: Array<{ name: string; taskNumber: number }> } | null {
  if (!/\b(assign|reassign|give)\b/i.test(value)) return null;
  if (!/\b(?:them(?:\s+all)?|these|those|all of them|everything listed|all \d+)\b/i.test(value)) return null;
  const staff = parseStaffFromText(value, board);
  if (!staff || !recentHistory?.length) return null;
  const index = buildTaskIndex(board);
  // …remainder UNCHANGED (operates on `index`).
```

Change `planLocalIssueWrite` (line 538) signature and internal calls from `dashboardContext` to `board`:

```ts
export function planLocalIssueWrite(input: AgentChatInput, board: TasksBoardData | null): AgentChatResult | null {
  if (input.mode === 'approval') return null;
  const message = input.message.trim();
  const createDraft = parseIssueCreateDraft(message); // create parses the message only — unchanged
  // …
  const statusDraft = parseIssueStatusDraft(message, board);
  // …assignee/priority/dueDate drafts: pass `board`…
  const bulkAssign = parseBulkAssignFromHistory(message, board, input.clientContext?.recentHistory);
  // …
  const deleteResolution = parseIssueDeleteDraft(message, board, recentHistory);
  // …the `lastEkoRow` slot-fill branch calls parseIssueDeleteDraft(`delete ${message}`, board, recentHistory)
}
```

In `runAgentChat` (lines ~271-274), load the board alongside the prose context and pass it to the planner:

```ts
const providers = resolveProviderPlan(input);
const dashboardContext = await loadAgentDashboardContext(_user);
const board = await loadTasksBoard(_user).catch(() => null);
const localWritePlan = planLocalIssueWrite(input, board);
if (localWritePlan) return localWritePlan;
```

In `executeApprovedIssueWrite` (lines ~731-748) the draft re-parsers now take `board` (already in scope) instead of `dashboardContext`:

```ts
const statusDraft = parseIssueStatusDraft(action, board);
// …assignee/priority/dueDate: pass `board`.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api-server/routes/__tests__/agent-planner.test.ts src/api-server/agent/__tests__`
Expected: PASS. Then `npx tsc --noEmit` — expected: no type errors (all `dashboardContext`→`board` call sites updated).

- [ ] **Step 5: Commit**

```bash
git add src/api-server/routes/agent.ts src/api-server/routes/__tests__/agent-planner.test.ts
git commit -m "fix(eko): resolve task refs from structured board, not truncated prose"
```

---

### Task 3: Route staff resolution through the structured index

**Files:**
- Modify: `src/api-server/routes/agent.ts` (`parseStaffFromText`, `findStaffInContext`, and the callers threading `board`)
- Test: extend `src/api-server/routes/__tests__/agent-planner.test.ts`

**Interfaces:**
- Consumes: `buildStaffIndex`, `type StaffIndexEntry` from `../agent/entity-index`.
- Produces: `parseStaffFromText(value: string, board: TasksBoardData | null)` and `findStaffInContext(value: string, board: TasksBoardData | null)` — second param changes from `dashboardContext: string` to `board`.

- [ ] **Step 1: Write the failing test** (append to `agent-planner.test.ts`)

```ts
describe('planLocalIssueWrite assignee resolution', () => {
  it('resolves an assignee from the structured team roster', () => {
    const board = makeBoard([makeTask({ name: 'Boss Fight', task_number: 22 })]);
    board.team = [{ id: 'p-9', display_name: 'Karti' } as never];
    const result = planLocalIssueWrite(chat('assign Boss Fight to Karti'), board);
    expect(result?.intent).toBe('approval_required');
    expect(result?.approval?.copy).toContain('Karti');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api-server/routes/__tests__/agent-planner.test.ts -t "assignee resolution"`
Expected: FAIL — `parseStaffFromText` still reads the prose `dashboardContext` and returns nothing for a board input.

- [ ] **Step 3: Rewrite staff resolution to use the structured index**

Add to the entity-index import in `agent.ts`: `buildStaffIndex`. Replace `parseStaffFromText` (line ~1521) and `findStaffInContext` (line ~1528):

```ts
function parseStaffFromText(value: string, board: TasksBoardData | null) {
  const normalized = value.toLowerCase();
  return buildStaffIndex(board)
    .sort((a, b) => b.name.length - a.name.length)
    .find((member) => normalized.includes(member.name.toLowerCase()));
}

function findStaffInContext(value: string, board: TasksBoardData | null) {
  return parseStaffFromText(value, board);
}
```

Update `parseIssueAssigneeDraft` and any other caller to forward `board` to `parseStaffFromText`/`findStaffInContext`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api-server/routes/__tests__` then `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/api-server/routes/agent.ts src/api-server/routes/__tests__/agent-planner.test.ts
git commit -m "fix(eko): resolve staff refs from structured roster"
```

---

### Task 4: Delete the prose reparsers

**Files:**
- Modify: `src/api-server/routes/agent.ts` (remove `parseDashboardTaskIndex`, `parseStaffIndex`, and any now-orphaned prose plumbing)

**Interfaces:**
- Consumes: nothing new.
- Produces: no exported surface change. `dashboardContext` remains only as the LLM prompt input (`buildPrompt`, `answerLocalContextFollowUp`) — never a resolution source.

- [ ] **Step 1: Prove the reparsers are unreferenced**

Run: `grep -nE 'parseDashboardTaskIndex|parseStaffIndex' src/api-server/routes/agent.ts`
Expected: matches ONLY on the function definitions themselves (all call sites removed in Tasks 2–3). If any call site remains, fix it before deleting.

- [ ] **Step 2: Delete the definitions**

Remove the `parseDashboardTaskIndex` function (lines ~1476-1509) and `parseStaffIndex` (its definition below `findStaffInContext`). Keep `parseTaskNumberRef` only if `agent.ts` still references it directly; otherwise import it from `entity-index` (it is exported there).

- [ ] **Step 3: Verify the whole suite + types**

Run: `npm test` then `npx tsc --noEmit`
Expected: PASS, no type errors, no unused-symbol errors.

- [ ] **Step 4: Manual end-to-end verification**

Restart the api-server (plain `tsx`), open the dashboard tray, and on a board with more tasks than the context cap:
- "delete task <a high number past the cap>" → approval card appears for the correct task (previously "couldn't match").
- "move <task name> to Done", "assign <task> to <person>" → correct approval cards.
Confirm each approval still executes and mutates the correct row.

- [ ] **Step 5: Commit**

```bash
git add src/api-server/routes/agent.ts
git commit -m "refactor(eko): remove prose-reparse entity resolvers"
```

---

## Follow-on phases (separate plans, after Phase A lands)

Per the strangler design (`2026-07-05-eko-agent-state-layer-design.md`), each ships and reviews on its own:

- **Phase B — Execute-by-id / PendingAction (minimal):** carry the resolved real `id` from the index into the approval `draft`; approval executes by id instead of re-matching `draft.taskName` against the board. Removes the `executeApprovedIssueWrite(action: string)` text-reparse path. *Open decision to resolve first: PendingAction storage (Supabase table vs. session store) given the in-flight Next→Vite migration.*
- **Phase C — Capability/tool registry (executable):** promote `EKO_CAPABILITIES` prose to a typed registry that generates the LLM tool schema, planner dispatch, and executor from one source.
- **Phase D — Function-calling + lifecycle state machine:** LLM emits structured tool calls; `intent` becomes the pending action's real lifecycle state, not a reply-text regex.
- **Phase E — Client renders from typed state:** delete `inferPendingWriteDraft` and reply-regex in `AgentCompanion.tsx`; the tray renders the approval card from the typed pending action.

---

## Self-Review

**Spec coverage (design → plan):** Structured entity resolution (design move 3) → Tasks 1–4. Fixes the truncation acceptance test (design "Acceptance") → Task 1 Step 1 (unit) + Task 2 Step 1 (planner) + Task 4 Step 4 (e2e). Real ids flow through the index to seed execute-by-id (design move 4 / Phase B) → `TaskIndexEntry.id` in Task 1. Moves 1–2, 4–7 are explicitly deferred to Phases B–E with their own plans — intentional, per strangler scope discipline.

**Placeholder scan:** No TBD/TODO. Every code step shows real code. The "remainder UNCHANGED" notes point at existing verbatim bodies that operate on the `tasks`/`index` local, which the step rebinds to the structured source — not a placeholder, a deliberate source-swap that leaves the algorithm intact.

**Type consistency:** `TaskIndexEntry` (Task 1) is the exact type consumed by `resolveTaskRef`, `parseIssueDeleteDraft`, and `findRecentCreatedTask` (Task 2). `planLocalIssueWrite(input, board)` signature is consistent across `runAgentChat` (caller) and the test. `parseIssue*Draft(value, board)` and `parseStaffFromText(value, board)` share the `board: TasksBoardData | null` second-param shape after Tasks 2–3. `buildStaffIndex` entry `{ id, name }` matches `parseStaffFromText`'s usage.
