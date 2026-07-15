# EKO @-mentions — tag issues, docs, people, areas, milestones

**Status:** proposed
**Surface:** `src/components/dashboard/AgentCompanion.tsx` (composer), `src/api-server/agent/*`, `src/api-server/routes/agent.ts`
**Branch:** `codex/eko-agent-current`

---

## 1. Why this is a correctness feature, not just an affordance

EKO already resolves entities — badly, on purpose. `src/api-server/agent/entity-index.ts` guesses
from prose:

```ts
// resolveTaskRef — longest-contained-name wins
return [...index]
  .sort((a, b) => b.name.length - a.name.length)
  .find((task) => normalized.includes(task.name.toLowerCase()));
```

That is a substring scan over the whole user message. It mis-fires on near-duplicate task names,
on a task whose name is a common word, and on any message that quotes a name it didn't mean to act
on. `parseTaskNumberRef` narrows this for `#22`, but nothing else has an escape hatch.

An @-mention is the **explicit channel**: the user picks the entity, so the server receives a real
UUID and never has to guess. The picker is the visible half; the invisible half — a resolved id
travelling with the message — is what actually makes EKO safer to hand a write to.

Frame every decision below against that: *the mention is a typed reference, and the id is the
payload.*

---

## 2. Conceptual model

An @-mention has three representations that must stay in sync:

| Where | Shape |
|---|---|
| Composer (what the user sees) | a chip: `@Investor update — July` |
| Client state | `EkoMention[]` — `{ kind, id, label, start, end }` |
| Wire / server | `mentions: [{ kind: 'task', id: uuid }]` — **a sidecar array, not embedded markers** |

**Decision: do not encode mentions inside the message string.** A marker syntax (`@[task:uuid]`)
embedded in editable prose is fragile — the user can half-delete it, paste it, or hand-type
something that looks like one — and the server would then be parsing a resolved reference out of a
string it cannot trust. A sidecar array is validated server-side against what the user is actually
allowed to see (§4), and the message stays clean prose that the model reads naturally.

### Entity kinds

| Kind | Source today | Cost |
|---|---|---|
| `task` (issue) | `board.tasks` — already loaded | free |
| `person` | `board.team` | free |
| `area` | `board.areas` | free |
| `milestone` | `board.projectMilestones` | free |
| `doc` (page/document) | **nothing — EKO cannot see docs at all** | new loader + new tool (§6) |

The four board kinds are free because `loadTasksBoard(user)` already runs on every agent turn.
Docs are the real work, and they're the half the request explicitly named — so they're in scope,
not deferred, but they land in their own phase.

### One trigger, not two

GitHub splits `#` (issues) from `@` (people). Don't. `@` opens a **single picker with grouped
results**, and typing `@214` also matches `task_number`. One trigger, one mental model. `#22` in
free prose keeps working via the existing `parseTaskNumberRef` — that's the fallback path, not a
second syntax to teach.

---

## 3. Where the mention meets the model

`runAgentChat` (`routes/agent.ts:206-232`) already has the exact seam this needs —
`formatExecutedActionsContext` folds a resolved fact block into the system prompt. Mentions follow
that precedent:

```
REFERENCED ENTITIES — the user tagged these explicitly. Use these ids. Do NOT re-resolve by name.
- task #214 "Investor update — July" (id: 9f3…, status: In Review, assignee: Dana)
- doc "Game Design Doc" (id: 4b1…)
```

Then add one line to `EKO_AGENT_SYSTEM`: *when a referenced entity is supplied, prefer its id over
name resolution.* This is the whole point — for tagged entities, `resolveTaskRef`'s
longest-contained-name heuristic is bypassed entirely.

---

## 4. Security — the load-bearing section

**(a) The picker is a new enumeration surface and MUST inherit the agent gate.**
`/api/agent/chat` runs `assertAdmin` *before payload parsing and before any mode branch* — the
comment at `routes/agent.ts:65` is explicit that the entire agent surface is admin-only. A new
`GET /api/agent/mentions` that forgets this gate hands every authenticated user — contractor,
investor — a way to enumerate every task name, doc title, and staff name in the studio. Wire it
into `createAgentRoutes` behind the same `adminCheck`, and mirror `agent-authz.test.ts` to prove
403 for a non-admin.

**(b) Docs are visibility-gated in app logic, not RLS.**
`docs` carries `restricted_department` and `granted_user_ids`, and the rules live in the loader —
not in a policy. A doc picker that runs its own service-role `from('docs').select(...)` therefore
re-implements the gate, and re-implemented gates drift. **Reuse the existing docs-index loader
path** so the visibility rules travel with the data. This is currently moot (EKO is admin-only, and
admins see every doc) — it stops being moot the day EKO opens to non-admins, which is a live
question on this repo.

**(c) Never trust a client-supplied id.**
The client can put any UUID in `mentions[]`. Re-resolve every id server-side against the same
visibility-scoped index before it reaches the prompt. An id that doesn't resolve is **dropped and
reported**, never silently honored — a forged `{kind:'task', id:<some uuid>}` must not become a
line in `REFERENCED ENTITIES` that the model then writes to.

**(d) Allowlist the picker response columns.**
Return exactly `{ id, kind, label, sublabel }`. Never spread the row. A `docs` row carries
`content`; a `tasks` row carries `description` and `bounty`. A picker that selects `*` leaks the
studio's entire body text and every bounty figure through an autocomplete dropdown. (This is the
standing repo invariant: less-trusted loaders allowlist columns, never denylist-spread.)

---

## 5. Client design

### The clipping hazard, and the decision that dissolves it

The tray root is `overflow-hidden` (`AgentCompanion.tsx:1519`). A mention popover rendered as an
absolutely-positioned sibling of the composer **will be clipped by the tray**.

Don't reach for a portal. The user has already ruled on this shape: *"capsule holds everything,
grows vertically."* The mention picker obeys the same law — it renders **in-flow inside the tray,
directly above the composer, and grows the tray**. Same conceptual model, no portal, no clipping,
no z-index fight, and it stays visually inside the object it belongs to.

### Text model: plain text + token integrity (not contentEditable)

The composer is a 32px single-line `<input>` (`AgentCompanion.tsx:2390`). Three options:

| Option | Verdict |
|---|---|
| `contentEditable` with real chip nodes | Correct, and a well-known swamp: IME, paste, caret, undo. Not worth it for v1. |
| Transparent input + mirrored painted div behind it | The right *visual* endgame — keeps native caret/IME/mobile keyboard, paints chips over matched ranges. v2. |
| **Plain text + token-integrity check** | **v1.** |

Token integrity: store each mention as `{ kind, id, label, start, end }`. On every change, verify
the stored label still sits at its offset. If the user edited into it, **drop the mention** — it
degrades to plain prose, and the server's existing fuzzy resolver still gets a shot at it. Graceful
degradation, a fraction of the complexity, and it never lies about what's tagged.

### Picker behaviour

- Opens on `@` at a word boundary; closes on Escape, on space-with-no-match, on blur.
- Grouped: Issues · Docs · People · Areas · Milestones. ~7 rows max, scrollable.
- Keyboard-first: ↑ ↓ to move, Enter/Tab to insert, Esc to dismiss. Arrow keys must not leak to
  the tray's own key handling while the picker is open.
- **Fetch the index once per tray session, filter locally.** The board index is small; a
  per-keystroke round-trip buys nothing and adds a rate-limit surface. Revisit only past a few
  thousand rows, at which point move filtering behind `?q=`.

### One expectation to get right

`@Dana` **references** Dana — it does not notify her. In every other chat product on earth, an
@-mention pings someone. If this one doesn't, the affordance has to say so (or we accept the
feature request that follows). Flag for the design pass; it's a copy/affordance call, not an
engineering one.

---

## 6. The docs gap

EKO has four read tools — `list_tasks`, `list_milestones`, `list_areas`, `list_staff`. There is no
`list_docs`, and `loadTasksBoard` does not fetch docs.

**Do not extend `loadTasksBoard` to carry docs.** It is on the hot path for the entire `/issues`
board; adding a docs query would tax every board page-load for a feature only EKO uses. Add a
separate `loadAgentDocsIndex(user)` inside the agent, called only on the agent path, returning
allowlisted `{ id, title }` through the visibility-gated loader (§4b).

Then: `buildDocIndex` in `entity-index.ts` (mirroring `buildTaskIndex`), and a `list_docs` read
tool alongside the other four.

---

## 7. Phases

**Phase 1 — server, board entities.** `mentions[]` on `AgentChatInput`; server-side id validation;
`REFERENCED ENTITIES` context block; `EKO_AGENT_SYSTEM` line; `GET /api/agent/mentions` admin-gated
and allowlisted, serving task/person/area/milestone. Proven end-to-end with a hand-built request —
no client yet.

**Phase 2 — client.** `@` trigger, in-tray picker, token-integrity text model, chips, keyboard nav.

**Phase 3 — docs.** `loadAgentDocsIndex` + `buildDocIndex` + `list_docs` tool + `doc` in the picker.

**Phase 4 — design + QA.** Mandatory per repo convention and not skippable: Mobbin references for
the mention-picker pattern, then `/interface-craft critique` and `/make-interfaces-feel-better`
**before and after**. Add a mentions specimen to `/eko-preview` (the seeded, auth-free state sheet —
it cannot reach the live agent, so it's the safe place to QA this).

## 8. Tests

- `entity-index` — mention resolves by id; unknown id dropped.
- `agent-authz` — `GET /api/agent/mentions` is 403 for a non-admin (mirror the existing suite).
- agent route — a forged UUID in `mentions[]` never reaches `REFERENCED ENTITIES`.
- picker response — asserts no `content` / `description` / `bounty` key is present.
- client — editing inside a mention label drops that mention.

Baseline is **6 pre-existing failures** (LightShell ×3, StudioHeaderActions.bell, investor-layout,
payments). Don't chase them; don't add a 7th.

## 9. Open questions for the user

1. Does `@person` ever need to actually notify? (Assumed: no — reference only.)
2. Should a tagged entity be *sticky* across turns in a conversation, or re-tagged per message?
   (Assumed: per message. Sticky is a bigger conceptual change — it makes the tray stateful about
   "what we're talking about.")
3. Are docs in v1, or is shipping the four free board kinds first the better cut?
