# EKO Agent — State Layer & Smarter Harness (Design)

**Status:** Design direction — awaiting approval before planning
**Supersedes (reasoning/execution layer):** the planner internals implied by `2026-07-03-agent-companion-design.md` (that doc stays canonical for the *tray UI/product shape*; this doc defines the *agent reasoning + execution* layer it renders from)
**Branch:** `codex/eko-agent-current` (EKO is committed here, 175 commits ahead of `main`, unmerged)

## Context

A prior session shipped EKO, a dashboard companion agent, then flagged that "the latest patch improves brittle text matching but does not solve the product issue — EKO feels like an LLM with local canned planners, not a real agent." The ask: decide whether to keep the current text-routing patch or replace it with an explicit agent state layer, and — per follow-up — find a genuinely *smarter* way for the agent to work, including how context is harnessed.

**State correction:** there is no dirty working-tree "uncommitted patch" on the agent surface. `src/api-server/agent/context.ts` and `src/api-server/routes/agent.ts` are clean vs `HEAD`; the EKO feature is committed as `775f2d4 feat(eko): add dashboard agent companion`. "Uncommitted / before committing" in the handoff means **unmerged branch work**, not a pending diff. The decision is: harden-and-merge the text planner, or strangler-replace its core before this branch lands on `main`.

## Verdict

**Replace the core, keep the shell.** Do not merge the text-routing planner as the final design; do not discard the branch either. It is a safe, approval-gated, working baseline with good bones. The rot is specific and structural: **prose is the source of truth, typed state is an overlay.** Fix that inversion.

## The one-sentence diagnosis

The system serializes structured data → prose → LLM → prose → regex → structured action, and **loses information at every arrow**, then independently re-derives structured state from chat copy on *both* the server and the client.

### Evidence (grounded in current code)

- **Serialize→reparse entity resolution.** `context.ts` formats live `TasksBoardData` into a prose blob for the LLM; `routes/agent.ts:1476 parseDashboardTaskIndex` then **regex-parses that same blob back** into `#num Name (status, assigned to …)` to resolve entities. The structured data existed and was thrown away. `context.ts:147` even warns "status must stay first so parseDashboardTaskIndex keeps reading it" — two files coupled through prose word-order.
- **Truncation = silent unresolvability.** `parseDashboardTaskIndex` skips `…and N more` (line 1494). Any task past the context truncation cap **cannot be resolved at all** — ask EKO to delete `#47` on a 60-task board and it answers "couldn't match a single task," despite the task plainly existing.
- **Intent inferred from reply text.** `intent` is assigned by regexing the model's own prose (`agent.ts` tail: `isClarifyingReply`, `needsWriteDetails`, `/^ready for approval:/`).
- **Pending action reconstructed from chat copy.** "Which task to delete" is recovered by regex-matching the previous EKO chat bubble (`agent.ts:673 /\btask to delete\b/i.test(lastEkoRow.text)`), and the approval path re-parses `approval.copy` text (`executeApprovedIssueWrite(cleanAction: string)`) instead of executing a typed object.
- **Double inference.** `AgentCompanion.tsx` reads typed `response.intent`/`approval.draft` when present, but falls back to `inferPendingWriteDraft(prompt, reply)` — a **second** text-inference layer that reconstructs the write draft from chat prose on the client.
- **Registry exists only as prose.** `EKO_CAPABILITIES` (`context.ts:78`) is a hand-maintained text list with a "keep in sync with the typed tools" comment — a manual contract that drifts.

The good bones to preserve: the typed `AgentApproval`/`draft` object and `executeTypedApproval` path (the *right* pattern, already present but not primary), the `EKO_CAPABILITIES` single-source intent, graceful per-section context degradation, the EKO bus + `useEkoSpotlight` write-receipt choreography, and existing tests.

## Target architecture — the smarter harness

Make structured data the spine. Use the LLM for the two things it is uniquely good at — mapping fuzzy language onto a typed tool call (intent + slot extraction) and writing human copy — and make everything else deterministic code operating on real objects.

1. **Capability/tool registry (executable, single source).** One typed registry entry per tool: `{ id, title, paramsSchema (zod), permission, gated, resolveEntities, execute, describe }`. It drives the three consumers that currently drift independently: the LLM tool schema (function-calling), planner dispatch, and the approval executor. `EKO_CAPABILITIES` prose is *generated from* the registry.
2. **Function-calling, not "Ready for approval:" prose.** The LLM emits a structured tool call (`issue.update {taskRef, status}`), never a sentence that both tiers regex. Prose becomes purely the chat bubble — cosmetic, never load-bearing. Deletes the reply-regex family as the *primary* contract.
3. **Entity resolution against live structured data.** Resolve `taskRef` → real task id/number from the `TasksBoardData` already in hand: number-exact → name-exact → name-fuzzy → ambiguous-candidate-list. A deterministic resolver returning candidates, not a regex over a truncated prose index. Kills the truncation failure and gives real ambiguity UX.
4. **PendingAction as a durable, first-class object.** `{ id, conversationId, toolId, resolvedArgs (real entity ids), status, createdAt }`, stored server-side. Approval executes *this object by id* — never re-parses `copy`. Slot-fill follow-ups ("22", "the one we just made") **mutate the pending object**, not scan `lastEkoRow.text`.
5. **Explicit lifecycle state machine.** `proposed → needs_slots → awaiting_approval → approved → executing → executed | rejected | failed`, with legal transitions. `intent` stops being inferred from reply text and *becomes* the pending action's actual current state, emitted to the client.
6. **Durable intent memory.** A conversation/session store (Supabase table keyed by conversation) holding the pending action, the last-referenced entity (for "it"/"that one"), and open slots — replacing the fragile `recentHistory` prose array re-scanned each turn.
7. **UI renders from agent state.** The tray renders the approval card from the typed pending-action + lifecycle (over the response + EKO bus). Delete `inferPendingWriteDraft` and reply-regex on the client. Correct-by-construction.

### Contextual harnessing (the explicit ask)

Context assembly becomes retrieval-shaped and budget-aware instead of "dump a blob and hope":

- The **authoritative** structured board stays server-side for resolution; the LLM never needs the exhaustive prose index because it no longer does resolution — code does. So **truncating the model's view is a display concern, never a correctness concern.**
- Ground references with stable ids (task numbers): the model says `#22`, code maps `#22 → uuid` from live data. No prose round-trip.
- Context is **layered**: capabilities (from registry) + a small, relevance-ranked slice of live state (only entities plausibly in play this turn) + the conversation's pending-action state. Sized to the turn, not the whole board.

## Keep vs replace — the line

| Replace (prose-as-API core) | Keep (good shell) |
|---|---|
| `parseDashboardTaskIndex` as resolution source | typed `AgentApproval`/`draft` + `executeTypedApproval` |
| reply-regex intent derivation | `EKO_CAPABILITIES` intent (promote prose → registry) |
| `executeApprovedIssueWrite(string)` text path | graceful per-section context degradation |
| `lastEkoRow.text` pending recovery | EKO bus + `useEkoSpotlight` receipt choreography |
| client `inferPendingWriteDraft` | existing tests (extend, don't delete) |

The local `parseIssue*Draft` regex parsers **survive only as optional deterministic fast-paths** that emit the *same* tool objects (so "move X to Done" can skip a model round-trip) — never as the primary contract.

## Migration (strangler, TDD, each step independently shippable)

1. **Registry + function-calling** for the write path; generate `EKO_CAPABILITIES` from the registry. LLM emits tool calls; prose goes cosmetic.
2. **Structured entity resolver** from `TasksBoardData`; route planner + executor through it; drop `parseDashboardTaskIndex` as the resolution source. (First step that fixes the truncation bug — good acceptance test.)
3. **PendingAction + lifecycle**; approval executes by id; delete the `executeApprovedIssueWrite(string)` text path.
4. **Durable conversation memory**; follow-ups mutate the pending object; retire `recentHistory` re-scans.
5. **Client renders from typed state**; delete `inferPendingWriteDraft` / reply-regex in `AgentCompanion.tsx`.

Every step keeps the branch safe (all writes stay approval-gated throughout) and is covered by tests before merge.

## Acceptance / verification

- **Regression that must pass:** on a board larger than the context truncation cap, "delete task #<N past the cap>" resolves and produces an approval card. (Fails today.)
- Each migration step ships with Vitest coverage extending `agent/__tests__/context.test.ts` and new route tests.
- End-to-end: drive the tray against a seeded board — create / status / assign / priority / due / delete — and confirm the approval card renders from the typed pending action, and execution mutates the correct row by id.

## Open decisions (for the plan stage)

1. **Appetite:** full state-layer migration (steps 1–5) vs. strangler-lite (steps 2–3 only — kill the two worst offenders now, defer registry/lifecycle).
2. **Pending-action storage:** Supabase table vs. in-memory/session store (branch is mid Next→Vite migration; the api-server is plain tsx).
3. **Provider:** keep the OpenAI/Anthropic dual-provider routing, and does function-calling change the default-provider heuristic (`choosePrimaryProvider`)?
