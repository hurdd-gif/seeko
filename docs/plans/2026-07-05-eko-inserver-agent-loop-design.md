# EKO Agent — In-Server Tool-Use Loop (Design)

**Status:** Design — APPROVED 2026-07-05, awaiting spec review before planning
**Branch:** `codex/eko-agent-current` (EKO lives here, unmerged, mid Next→Vite migration)
**Relationship to prior docs:**
- `2026-07-05-eko-agent-state-layer-design.md` stays canonical for the *vision* (the 7 moves, the verdict "replace the core, keep the shell", the diagnosis). This doc is the *concrete approved architecture* that resolves that doc's three open decisions and defines the build.
- **Supersedes** the incremental migration slicing (that doc's steps 3–5 / the "Phase B–E" plan). This one build delivers moves 2–7 together as a single coherent agent loop.
- **Builds on Phase A** (`cbc33449..40bbd28`, landed): structured entity resolution (`src/api-server/agent/entity-index.ts`) becomes the resolver *inside* the write tools.

## Problem (grounded in a live failure)

EKO narrates instead of acting. In a real session, "Update them if they aren't on track" (ALPHA/BETA milestones marked `on_track` but 38/21 days overdue) produced **analysis prose**, not an action — because the current planner classifies the reply *text* against intent regexes, and a conditional command doesn't match a write intent, so it falls through to the answer path. A second "Update them" finally staged a write, but the approval sat in a "Revision requested / Editing" limbo. This is the "prose-as-API" anti-pattern surfacing at the **behavior** layer.

The model is already cloud (OpenAI/Anthropic APIs). The choppiness is not about where the brain runs — it's that EKO wraps the model in a brittle local prose-planner instead of a real **tool-use loop**.

## Resolved decisions

| Open decision (from the vision doc) | Resolution |
|---|---|
| Where the agent loop lives | **In-server** tool-use loop in the tsx api-server, behind an `AgentRuntime` seam (externalizable later). |
| v1 capability scope | All writes EKO does **today** (task create/status/assignee/priority/due/delete) **+ milestone & area status/progress** (the screenshot surface) + read tools. |
| PendingAction storage | **Supabase table** `eko_pending_actions` (durable, survives redeploy, multi-instance safe). |
| Provider | **Anthropic** tool-use for the loop (single provider; existing dual-routing stays only for any pure-chat path). |
| Deterministic `parseIssue*Draft` fast-paths | **Retired.** One planning path (the loop). Fully removes the prose-planner. |
| Batch approvals | One instruction touching N entities → **one** approval card; **approve-all / reject-all** in v1 (per-item toggle deferred). |
| Approval gate | `assertAdminUser` **unchanged**. Every write tool is `gated`. |

## Architecture

### The loop
```
user message
   │
   ▼
AgentRuntime.run(messages, tools)         ← Anthropic tool-use loop
   │   model emits tool calls
   │   ├─ read tool  → execute live, feed result back, iterate
   │   └─ write tool → resolve args → stage eko_pending_actions row
   │                    (status=awaiting_approval), do NOT execute
   ▼
typed response { text, pendingActions[] }  → tray renders from state
   │
   ▼ (user approves)
executeById(pendingActionId)               ← run the stored typed object
   │   status: approved → executing → executed | failed
   ▼
receipt on the EKO bus
```

### Components / file boundaries
- `src/api-server/agent/runtime.ts` — `AgentRuntime` interface + the in-server Anthropic tool-use implementation. `run(messages, tools) → { text, toolCalls, pendingActions }`. The seam that lets the loop move external later.
- `src/api-server/agent/tools/` — one file per tool domain (`tasks.ts`, `milestones.ts`, `areas.ts`, `reads.ts`). Each tool: `{ id, title, paramsSchema (zod), gated, resolveEntities, execute, describe }`. **Task/staff** tools' `resolveEntities` calls Phase A's `entity-index` (already built). **Milestone/area** resolution is NEW — add `buildMilestoneIndex`/`buildAreaIndex`/`resolve*Ref` to `entity-index.ts` following the exact same pattern (number/name → real id over `board.milestones` / `board.areas`). Do not assume the entity-index already resolves these.
- `src/api-server/agent/tool-registry.ts` — assembles the tool set; the single source the loop, the approval executor, and `EKO_CAPABILITIES` prose all read from (kills the hand-maintained capability drift).
- `src/api-server/agent/pending-actions.ts` — CRUD over `eko_pending_actions` via the service client: `stage()`, `getById()`, `markExecuting/Executed/Failed/Rejected()`. The lifecycle state machine lives here.
- `src/api-server/routes/agent.ts` — thinned: `runAgentChat` drives the runtime; the approval route calls `executeById`. Delete `executeApprovedIssueWrite(string)`, the prose reparse/summarize helpers, and the intent-regex planner.
- Client (tray, `AgentCompanion.tsx`) — render the approval card from the typed pending action + lifecycle. Delete `inferPendingWriteDraft` and reply-regex.

### Data shapes
```ts
type PendingActionStatus =
  | 'proposed' | 'needs_slots' | 'awaiting_approval'
  | 'approved' | 'executing' | 'executed' | 'rejected' | 'failed';

type PendingAction = {
  id: string;
  conversationId: string;   // stable per tray session
  userId: string;
  toolId: string;           // e.g. 'set_milestone_status'
  resolvedArgs: Record<string, unknown>; // REAL ids, post-resolution
  status: PendingActionStatus;
  error?: string;
  createdAt: string;
  executedAt?: string;
};
```

### Storage — `eko_pending_actions`
Reuses the `notes` table pattern: RLS admin-only `select`/`update`, inserts/executes via the **service role** (bypasses RLS). Columns mirror `PendingAction`; index on `(conversation_id, status)` for the tray's "current pending" lookup. Applied as one migration on the live DB.

**`conversationId` prerequisite:** the pending-action key is a stable id per tray session. Confirm during planning whether the tray already sends one; if not, the plan's first task is to have the client mint a `conversationId` (uuid on tray open) and send it with every turn, and thread it server-side. Without it, a staged action can't be matched to the approving request.

## Data flow — the screenshot, fixed
1. "Update them if they aren't on track" → runtime.
2. Model calls `list_milestones` → gets ALPHA (`on_track`, 38d overdue), BETA (`on_track`, 21d overdue).
3. Model reasons the condition is true → calls `set_milestone_status(ALPHA, …)` **and** `set_milestone_status(BETA, …)`.
4. Server resolves + stages **two** rows → returns one approval card listing both.
5. You approve → both execute **by id** → receipt. No narration, no two-step, no limbo.

## Error handling
- **Invalid tool args** (schema fail): validation error is fed back to the model as a tool result so it can correct — never a hard user-facing crash.
- **Ambiguous entity** (resolver returns candidates): tool returns a candidate list; the model asks a disambiguating question (lifecycle `needs_slots`), the pending action is NOT staged until resolved.
- **Execution failure**: `status=failed`, `error` captured, surfaced in the tray; no partial silent success.
- **Stale/duplicate approval**: `executeById` is idempotent on status — approving an already-`executed` or `rejected` action is a no-op with a clear message (guards double-execution across redeploys).
- **Gate**: every write tool checks `assertAdminUser` at execute time regardless of what the model proposed.

## Testing
- Tool `paramsSchema` validation (accept/reject fixtures).
- **Model mocked** to emit specific tool calls → assert the correct `eko_pending_actions` rows are staged with resolved real ids.
- `executeById` mutates the correct row and only that row; lifecycle transitions are legal-only.
- **Screenshot scenario as an integration test**: conditional milestone update → 2 staged writes → 1 card → approve → 2 executions by id.
- Idempotency: re-approving an executed action is a no-op.
- Gate: a non-admin path cannot execute a staged action.
- **Gate under migration**: scoped Vitest green + no NEW tsc errors on touched files (repo carries pre-existing Next→Vite tsc errors; a clean repo-wide tsc is not achievable).

## Scope (YAGNI)
- **IN (v1):** the tool set above, read-tools-on-demand, `eko_pending_actions` + lifecycle, gated batch approvals (all/none), render-from-state for the approval card, `AgentRuntime` seam.
- **OUT (later):** payments/docs/notes tools; background/long-running/resumable autonomy; the external runtime; per-item approval toggles; full transcript persistence (the tray's posted history suffices for chat context in v1).

## Verification / acceptance
- The conditional milestone update from the screenshot resolves and produces **one** approval card with both writes, executed by id on approval. (Fails today.)
- All writes remain approval-gated end to end.
- No remaining prose-planner, `executeApprovedIssueWrite(string)`, or client `inferPendingWriteDraft`.
- Read-tools-on-demand replaces the dumped prose context (also retires Phase A's double board-fetch debt).
