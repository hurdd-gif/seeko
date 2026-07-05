# SEEKO Agent Companion Design

**Status:** Draft design direction
**Goal:** Add a personal studio companion that lives at the bottom-right of the dashboard, helps admins and investors understand studio state, and requires approval before risky writes.

## Product Shape

The agent is not a full-height chat drawer. It should feel like a compact companion that stays out of the way until it has something useful to do.

Default placement:
- Bottom-right of the dashboard viewport.
- Compact dock, roughly notification-bell sized plus a short label when there is room.
- Does not cover primary dashboard content.
- Expands upward and slightly left into a small tray.

Core modes:
- **Idle:** small dock with a subtle presence dot.
- **Thinking:** dock uses a restrained Beam-style border sweep and a short status label.
- **Suggestions:** compact tray with 2-4 action rows.
- **Approval required:** tray expands to show the proposed action, risk label, and approve/edit/reject controls.
- **Run history:** compact list of recent runs and tool calls.

## Audience Model

Admins and investors both see the companion, but capabilities differ.

Admin:
- Can ask questions across tasks, docs, payments, progress, and investor status.
- Can draft changes.
- Can approve risky writes.
- Sees approval cards for writes.

Investor:
- Can ask for summaries and explanations of investor-visible data.
- Cannot create, update, or delete internal records.
- Does not see internal tool details that would expose sensitive implementation notes.

The UI should make this clear without turning it into a permissions lesson. Use small labels such as `Admin mode`, `Investor preview`, and `Write approval required`.

## Visual Direction

Use the existing SEEKO light dashboard system, but let the companion read as a distinct frosted operator surface.

References:
- Fluid Functionalism: refined hover states, compact controls, `ThinkingIndicator`, `ThinkingSteps`, `InputMessage`, `ChatMessage`, and `AskUserQuestions` patterns.
- Beam by Jakub Antalik: subtle animated border beam for active/thinking/approval states, not a decorative always-on glow.
- User screenshot reference: translucent compact task assistant, section labels, rows that reveal an inline action on hover.
- Mobbin: authenticated through `codex mcp login mobbin`, but the active MCP worker continued to return OAuth-required errors. The live implementation should be reviewed against Mobbin after restarting/refreshing the MCP worker.

Mood:
- Quiet operator, closer to a compact command surface than a chatbot.
- Frosted dark blue glass on top of the light dashboard, with one clear blue action accent and warm approval accents.
- No sci-fi console, no oversized chat panel, no floating full-screen card.

Palette:
- Canvas: `#eeeeee`
- Companion surface: translucent `#14213b` / `#13233f`
- Inner glass rows: `rgba(255,255,255,0.06-0.12)`
- Primary companion text: `rgba(255,255,255,0.9)`
- Secondary companion text: `rgba(255,255,255,0.4-0.7)`
- Accent/action: `#0d7aff`
- Waiting/approval: `#ffce52`
- Risk/reject: `#d4503e`

Typography:
- Inter, matching the current dashboard.
- 500 weight as the default.
- 12-13px meta labels.
- 14px row/chat text.
- 16-18px tray headings.
- No negative letter spacing.

## Component Anatomy

### 1. Companion Dock

Collapsed bottom-right trigger.

Content:
- Small circular or rounded-square agent mark.
- Optional short label: `Ask companion`.
- Presence dot for active state.
- Notification badge only when attention is needed.

Behavior:
- Click opens the compact tray.
- Hover reveals one-line status.
- Thinking state uses Beam-style border motion.
- Reduced motion falls back to static border and dot.

### 2. Compact Tray

Small floating tray anchored to the dock, not a drawer.

Suggested size:
- Desktop: `320-360px` wide.
- Max height: `min(520px, calc(100vh - 112px))`.
- Mobile: bottom sheet style, but still compact.

Sections:
- Header: status and audience mode.
- Suggestions: rows with icon slot, title, metadata, and optional inline action.
- Current answer or short chat thread.
- Composer or quick action row.

Interaction model:
- Rows match the screenshot reference: simple text, small icon slot, hover row highlight, inline trailing action.
- Repeated rows must use fixed icon and trailing-action slots so columns align.
- The tray should close back to the dock after completed low-risk actions unless the user pins it.

### 3. Thinking Steps

A small list inside the tray.

Examples:
- `Reading blocked tasks`
- `Checking investor-visible notes`
- `Drafting summary`
- `Waiting for approval`

Rules:
- Keep steps short.
- Show 2-4 visible steps.
- Use progress dots, not large spinners.
- The active step can use shimmer text or a Beam accent.

### 4. Approval Card

Appears inside the compact tray when a write is risky.

Risky actions:
- Create, update, or delete tasks.
- Change investor-visible copy.
- Send email, invite, payment, signing, or notification actions.
- Change status, deadline, priority, or owner fields.

Approval card content:
- Risk label.
- Plain-language proposed action.
- Before/after summary when relevant.
- Buttons: `Approve`, `Edit`, `Reject`.

Do not auto-submit risky writes. The model proposes; the backend validates; the user approves.

### 5. Composer

The composer should be compact and command-like.

Default placeholder:
- `Ask about tasks, investors, docs, or studio status`

Quick chips:
- `Summarize`
- `Draft update`
- `Show runs`
- `What changed?`

Avoid:
- Tall multiline chat box by default.
- Generic "How can I help you today?" copy.

## Architecture

The in-dashboard companion lives in the SEEKO backend, with the model provider behind a router.

Frontend:
- Bottom-right dock and compact tray.
- Streams agent output.
- Shows tool steps, approvals, and run history.

Backend:
- Hono API route under `src/api-server/routes/agent.ts`.
- Orchestrator under `src/api-server/agent/`.
- Provider adapters for Anthropic and OpenAI.
- Tool layer wrapping Supabase reads/writes.
- Approval gate before risky mutations.

Storage:
- `agent_threads`
- `agent_messages`
- `agent_runs`
- `agent_tool_calls`
- `agent_approvals`

Provider strategy:
- Claude Sonnet for high-value agent reasoning and multi-step studio workflows.
- OpenAI mini/nano for cheap general classification, title generation, note cleanup, and low-risk summaries.
- Keep a provider router so this decision can change without rewriting UI.

## 24/7 Behavior

The model does not run continuously. The SEEKO server runs continuously.

Triggers:
- User opens tray and sends a message.
- Background cron creates a digest draft.
- Webhook event creates a companion notification.
- Queued job needs attention.

Background work should appear as compact run rows in the tray, not as hidden magic.

## Motion

Use motion only to explain state.

Recommended patterns:
- Dock to tray: plus/menu morph or panel reveal.
- Active thinking: Beam border sweep or shimmer status.
- Approval pending: subtle warm border pulse.
- Completed write: small success check, then collapse to run receipt.
- Text/status swap: blurred text-state swap.

Accessibility:
- Respect `prefers-reduced-motion`.
- Never rely on motion alone to communicate risk or completion.

## Implementation Notes

Existing SEEKO assets to reuse:
- `src/rr-app/globals.css` light surface tokens and `payment-action-beam`.
- `src/components/dashboard/lightKit.ts` for light dashboard constants.
- Existing notification and popover patterns from dashboard components.
- Fluid Functionalism-style component references already reflected in the CSS surface/shadow tokens.

Mobbin note:
- Mobbin should be used for final visual reference review once the MCP worker picks up the OAuth login. Search terms: compact assistant panel, contextual action rows, floating bottom-right assistant, AI suggestions tray, task suggestions list.

## Open Questions

- Should the compact tray be pinnable by admins?
- Should investor mode hide run/tool details entirely or show a simplified "sources checked" list?
- Should the dock live globally in `LightShell` or only on selected dashboard routes for v1?

## Interface Feature Brainstorm — 2026-07-04

Scope: interface-level features that let EKO out of its tray. Two directions: prompts that drive the surrounding dashboard (choreography), and dashboard surfaces that hand context to EKO (handoff). Plus richer in-tray interaction and ambient states. Everything write-shaped stays behind the existing approval gate — nothing below weakens it.

### Grounding

What exists today (inventory from `src/components/dashboard/AgentCompanion.tsx`, ~2450 lines, mounted globally by `LightShell.tsx` line 118 with `userKey = account.email`):

- Dock with `AgentIconState`: `idle | thinking | working | finished | permission | error`, plus `DotMatrixAgentLoader`.
- Personalized suggestions (top 2 of a localStorage-stats sort), chat history (localStorage, capped), workflow trace steps.
- Approval card with `Approve / Edit / Reject`, `ApprovalStatus` incl. `editing`, and a write-details stepper (`title → status → priority → dueDate → review`) for `issue.create` drafts.
- API: one Hono route, `POST /agent/chat` (`src/api-server/routes/agent.ts`), request `mode: 'chat' | 'approval'` with `context.recentHistory`; response `intent: answer | clarification | details_needed | approval_required | executed | rejected` and a structured `approval { kind, title, copy, draft }`.
- Error state with `retryFailedAction`, composer with quick chips.
- Critically: **there is no channel from EKO to the rest of the dashboard.** The component is a leaf. Every choreography idea below needs one shared primitive first (see Idea 1).

Mobbin references studied (cited per idea below): [Indeed — AI recommendation review](https://mobbin.com/screens/b2164443-6d0d-4e10-860d-847b70faf4ca) (per-section Approve/Reject with the original version collapsed beneath — before/after without a modal), [Vercel — Review Change](https://mobbin.com/screens/56371ade-be8a-45d7-89a2-b1a3a7ca7db0) (staged-change receipt rows: actor, change, timestamp), [ElevenLabs — Review Changes](https://mobbin.com/screens/ff16450b-9de9-4c60-8738-770be8df0a5c) (published-vs-current diff before Publish), [Google AI Studio — agent run rows](https://mobbin.com/screens/49e01595-2276-4807-b04a-5033023adad6) ("Ran for 46s", View changes / Restore checkpoints), [Notion — selection AI menu](https://mobbin.com/screens/789e9836-c03b-4fb7-a80e-85a38e06d857) and [Obvious — inline AI actions on highlighted text](https://mobbin.com/screens/25c52872-5e51-45a6-ba86-ad1c39482917) (contextual Ask-AI on a selection, not a global chat), [Langdock — composer context chips](https://mobbin.com/screens/e8b4319b-3d79-4dcd-b49f-7370ccf89b29) (attached object rendered as a removable chip above the input), [Claude — inline structured options](https://mobbin.com/screens/34aa9592-2138-4be6-95f6-4aa7410e9bb9) (numbered pickable options inside the reply), [Juicebox](https://mobbin.com/screens/2af813bf-0129-45d1-81ed-069edee76e16) / [Laravel Cloud — command palettes](https://mobbin.com/screens/e9d5f1b5-4760-4ef6-971f-08f4fea7a9f4) (grouped "Go to…" action rows, keyboard hints footer), [Zoho CRM — Ask Zia action pill](https://mobbin.com/screens/e35d3450-b33e-4a26-8274-d859854688f3) (detected intent shown as a pill in the composer), [Stitch — collapsed agent log](https://mobbin.com/screens/465a40f8-1af9-4969-90a8-aa5a6dbefd7e).

### Cluster A — Agent → dashboard choreography

**1. The EKO bus + spotlight primitive (foundation).**
A tiny pub/sub context (`ekoBus` in `src/lib/`, provider in `LightShell`) that carries typed events both ways: `spotlight(taskId)`, `navigate(path, filters)`, `openDrawer(taskId | draft)`, `askEko(contextRef)`. The visible half is the spotlight: any component that renders a task row/card subscribes; on `spotlight`, the page scrolls the element into view and plays a one-shot ring — a `box-shadow` pulse in `#0d7aff` at 20% alpha swelling from the card's own radius (concentric, matched radius), 2 pulses, ~1.2s total, then a lingering 1px accent outline that fades over 3s. Reduced motion: no pulse, just the static outline. Nothing about EKO's tray changes; this is the pipe everything else flows through.
*Quiet-operator fit:* invisible until invoked; the highlight is a pointing finger, not a fireworks show.
*Implementation:* React context + `useSyncExternalStore` or a plain event emitter; a `useEkoSpotlight(id)` hook on board cards / ledger rows; `LightShell` already wraps every page so the provider costs nothing. **Effort: S.** No write risk (read/navigate only).

**2. Post-write receipt that deep-links to the changed row.**
After an `executed` intent, the approval card collapses (measured-height morph, per the seamless-positioning rule) into a one-line receipt: success check, "Moved DIH-142 to In Review", timestamp, and a trailing `→` affordance. Clicking it fires `navigate` + `spotlight` on the changed task. Receipts accumulate in run history. Reference: Vercel's Review Change rows — actor + change + time in one line, no card-in-card.
*Quiet-operator fit:* the write's consequence becomes visible in the workspace itself, not narrated in prose. Closes the loop the charter's "collapse to run receipt" motion note already promised.
*Implementation:* the `executed` response already carries the approval `kind` and draft; add the target id to the response payload in `agent.ts`; receipt row reuses the suggestion-row anatomy (fixed icon slot, trailing action slot). **Effort: S.** Write risk: none new — it reports a write that was already approved.

**3. Live diff preview on the actual card ("show me what changes").**
While an approval is pending, the approval card grows a ghost link: "Preview on board". Clicking it navigates to the task and renders the *proposed* state directly on the real card: changed fields show new value in `#0d7aff`, old value struck at 40% alpha beneath, and the card wears a dashed `#ffce52` outline meaning "staged, not real". The tray stays open (pinned for the duration); Approve commits and the outline resolves to the receipt spotlight; Reject/Escape reverts instantly. References: ElevenLabs' published-vs-current diff and Indeed's approve-with-original-collapsed — both show the change in situ before commitment.
*Quiet-operator fit:* this is the single highest-trust move available — the user approves what they can *see*, in the exact place it will land. The approval palette (`#ffce52` staged, `#0d7aff` new) already encodes the semantics.
*Implementation:* board card accepts an optional `stagedDraft` prop via the EKO bus; approval card publishes `previewDraft(taskId, draft)` / `clearPreview()`. Purely client-side — no API change; the draft already exists in `activeApproval.draft`. **Effort: M/L.** Write risk: none — preview is render-only; the commit path is unchanged and still gated.

**4. Prompt-driven drawer open + prefill.**
"Draft a task for the shader bug" → EKO answers with `details_needed`, but instead of the five-step in-tray stepper, the reply offers "Open in drawer →": the real task drawer opens prefilled with EKO's draft, every EKO-set field tinted with a faint `#ffce52` left-edge tick until the user touches or confirms it. Saving routes the payload back through the approval intent (the drawer's save button reads "Request via EKO" in this mode), so the gate is preserved. The tray minimizes to the dock with a `permission` badge while the drawer is up.
*Quiet-operator fit:* the seed example, literally — EKO borrows the dashboard's own editing surface instead of rebuilding a worse form inside 340px. The stepper stays for quick single-field writes; the drawer takes multi-field drafts.
*Implementation:* `openDrawer(draft)` on the EKO bus; task drawer gains a `draftSource: 'eko'` mode; on save, call `requestEko` with `mode: 'approval'` instead of the normal mutation. **Effort: M.** Write risk: the drawer must never call the direct mutation path in EKO mode — enforce in the drawer's submit handler, not just in props; server still validates via the existing gate.

**5. Filter choreography.**
"Show blocked high-priority coding tasks" → intent `answer` with a `filters` payload; EKO navigates to the board and applies the filters. The board's existing filter pills animate in with a 30ms stagger (enter only; exit is a plain fade), and EKO's reply collapses to a receipt row: "Filtered Issues — 3 filters · 4 tasks" with a one-tap "Clear". Keyboard-initiated invocations (via Idea 8's ⌘K entry) skip the stagger entirely.
*Quiet-operator fit:* EKO manipulates the same controls the user would, in view — no hidden query state, fully reversible with one tap.
*Implementation:* `navigate(path, filters)` bus event; board filter state likely already lives in a hook — add an external setter; server adds an optional `filters` field to the response. **Effort: S/M.** No write risk.

**6. Undo window on executed writes.**
Every receipt row (Idea 2) carries a 20-second "Undo" affordance with a thin draining progress hairline (tabular-nums countdown in the tooltip, `#d4503e` only in the final 5s). Undo issues the compensating write (status back, assignee back), which was computed and authorized *at approval time* — so undo itself needs no second approval. After 20s the affordance fades (opacity only) and the change is settled; undo remains possible via run history but re-enters the approval gate there. Reference: Google AI Studio's checkpoint "Restore".
*Quiet-operator fit:* forgiveness beats confirmation friction; it makes Approve feel safe to press, which is the whole economy of an approval-gated agent.
*Implementation:* `agent.ts` computes `inverse` alongside the write at approval commit and stores it on the run row; the client shows the window. Needs the `agent_runs` storage from the Architecture section. **Effort: M.** Write risk: the inverse must be validated server-side at *undo* time too (record may have changed since — reject with a clear "task changed since, review in history" state rather than blind-writing).

### Cluster B — Dashboard → agent context handoff

**7. "Ask EKO" hover affordance on task cards and ledger rows.**
Hovering a board card (or a /docs, /payments row) reveals a small ghost icon button in the existing hover-action cluster. Clicking opens the tray with a context chip already attached (Idea 9's anatomy) and focus in the composer — no prompt sent yet; the user says what they want about *this* object. References: Notion's selection AI menu and Obvious's inline actions — Ask-AI lives where the content is, not in a global chat.
*Quiet-operator fit:* zero pixels until hover; it converts "describe the task to the agent" into "point at it", which is the correct mental model for a workspace agent.
*Implementation:* one shared `AskEkoButton` component; fires `askEko({ type: 'task', id })` on the bus; tray opens (reuse `openCompanion()`) and pushes the chip. Must respect optical alignment of the row's existing accessory spine. **Effort: S/M.** No write risk (context only).

**8. ⌘K and right-click entries.**
The command palette gains a grouped "EKO" section: "Ask EKO about this page", "Ask EKO about selected task", "Show recent EKO runs". Context-menu on a task card gets "Ask EKO…" beneath the existing quick actions. Per the animation-frequency rule, keyboard-initiated tray opens render *instantly* — no dock-to-tray morph, no entrance stagger. References: Juicebox and Laravel Cloud palettes (grouped action rows, shortcut hints footer).
*Quiet-operator fit:* power-user path with zero ceremony; the agent behaves like any other command, not a destination.
*Implementation:* palette items fire the same `askEko` bus events; add an `instant` flag to `openCompanion()` that skips entrance motion. **Effort: S.** No write risk.

**9. Context chips in the composer (drag a task into the tray).**
The composer accepts attached objects rendered as removable chips above the input — task chips (DIH-nnn + status dot), doc chips, page chips. Chips arrive three ways: the hover affordance (7), ⌘K (8), or drag-and-drop — dragging a board card over the dock scales the dock to 1.03 with a "Drop to ask" label swap (blur text-swap, per the motion section), and on drop the tray opens with the chip seated. Chips serialize into `EkoApiRequest.context` so the server scopes retrieval. Reference: Langdock's attached-file chip anatomy.
*Quiet-operator fit:* context becomes a visible, editable noun instead of prose the user has to type; chips are the tray's native grammar for "about this".
*Implementation:* extend `EkoApiRequest.context` with `refs: Array<{type, id}>`; chip row sits between history and composer using the measured-height morph the tray already needs; HTML drag events on board cards + a drop target on the dock. **Effort: M.** No write risk; investor mode simply never renders chips for objects the user can't read (server re-checks anyway).

**10. Selection-scoped prompts (batch handoff).**
When the board supports multi-select, the floating selection pill ("4 selected") gains an "Ask EKO" trailing action. The tray opens with a single collapsed chip — "4 tasks" — expandable to the list. Prompts like "move these to In Review" produce a plan-of-action (Idea 13) rather than four separate approvals.
*Quiet-operator fit:* meets the user at an existing selection gesture; batch intent without batch typing.
*Implementation:* rides entirely on 9 + 13; selection state → `askEko({type:'tasks', ids})`. **Effort: M** (assuming multi-select exists; **L** if it doesn't). Write risk: batch writes multiply blast radius — cap plan size, and per-step gating (13) is mandatory for mixed-risk batches.

**11. Page-context chip (ambient scope).**
The composer always shows one faint, removable chip naming the current surface — "Issues · filtered: Blocked" or "Payments". EKO answers scoped to it by default; removing it widens scope to the whole studio. Reference: Zoho's Ask Zia composer pill, which surfaces detected intent as a visible, correctable object.
*Quiet-operator fit:* makes EKO's context visible and falsifiable in one glance — the opposite of hidden-magic scoping. Cheap trust.
*Implementation:* `usePathname` + current filter state (from Idea 5's setter) → default chip; serializes into the same `context.refs`. **Effort: S.** No write risk.

### Cluster C — Richer in-tray interaction

**12. Structured controls inside the approval card.**
Replace free-text Edit for common fields with the dashboard's own control vocabulary rendered inline: a status segmented control using the canonical sliding tab-pill (`TAB_PILL_SPRING`, unique `layoutId`), a date stepper with tabular-nums, an assignee row of avatar buttons. The write-details stepper collapses from five screens to one card for simple drafts. Changing a control updates the plain-language proposal line live (blur text-swap). Reference: Claude's numbered pickable options inside a reply — structure in the answer, not a form modal.
*Quiet-operator fit:* editing a proposal should cost one tap, not a wizard; reusing board controls keeps EKO inside the product's visual system instead of inventing agent-flavored inputs.
*Implementation:* the draft shape (`title/status/priority/dueDate`) already exists; swap the stepper's per-step screens for inline controls; `priorityEdgeClass` hints this direction already exists for priority. **Effort: M.** Write risk: none new — edits still land in the same gated draft.

**13. Plan-of-action checklist with per-step gating.**
For multi-step intents ("close out the alpha milestone"), EKO responds with a plan: 2–6 rows, each with a state dot (queued → running → done, reusing Gusto-style dot statuses) and its own gate. Low-risk reads auto-run; each risky write shows a compact per-row Approve. An "Approve remaining (2)" header action exists only when all remaining steps are same-kind. Progress is the row dots — no progress bar. Reference: Indeed's per-section Approve/Reject inside one review surface.
*Quiet-operator fit:* the charter's "background work appears as compact run rows, not hidden magic" — this is that, applied to foreground plans. Keeps multi-step agency legible and interruptible.
*Implementation:* new response intent `plan` with `steps[]` in `agent.ts`; each approved step round-trips through the existing `mode: 'approval'` path; tray renders rows with fixed icon/trailing slots. **Effort: L.** Write risk: the largest surface here — every step must be individually validated server-side; a plan must halt (not skip) on a rejected step; cap steps; never allow "Approve remaining" to span kinds (e.g. task edits + payment actions).

**14. Streaming answers with a live trace.**
Token-stream replies (SSE from the Hono route) with the workflow trace steps flipping to checks as tools finish — active step gets shimmer text, done steps get a quiet check, per the Thinking Steps spec. The composer's send button becomes Stop during a stream.
*Quiet-operator fit:* perceived speed is the cheapest politeness; a 6-second silent wait reads as broken, the same 6 seconds with visible progress reads as working.
*Implementation:* `agent.ts` switches to a streamed response for `mode: 'chat'`; client swaps `requestEko` for an EventSource reader; trace steps already exist as `workflowSteps`. **Effort: M.** No write risk (streams never carry writes; approval intents still arrive as complete objects).

**15. Pinned tray + run history segment.**
A pin toggle in the tray header (answers the charter's open question: yes, admins can pin). Pinned, the tray stays open across low-risk completions and page navigation — necessary for diff preview (3) and plans (13). Next to it, a two-segment control (sliding pill) — "Chat / Runs". Runs lists recent runs as receipt rows: kind icon, one-line summary, duration in tabular-nums ("4.2s"), and View/Undo trailing actions. Reference: Google AI Studio's run rows and Stitch's collapsed agent log.
*Quiet-operator fit:* history is accountability, and accountability is what makes a write-capable agent tolerable. Investor mode shows the simplified "sources checked" variant (settling the other open question: simplified, not hidden).
*Implementation:* pin = local state + skip `closeCompanion()` on complete; Runs reads `agent_runs` once that table lands (localStorage `chatHistory` as interim). **Effort: M.** No write risk beyond Undo (see 6).

### Cluster D — Ambient / proactive states

**16. Attention badge with a stated reason.**
Background checks (server cron, per the 24/7 section) can mark the dock: a single small `#ffce52` badge — never a count, never red unless something failed. Hovering the dock shows the one-line reason ("3 high-priority tasks unassigned for 5+ days"). Opening the tray leads with a finding card: the claim, a "Show me →" spotlight link (rides Idea 1), and one suggested action that — if taken — enters the normal approval flow. Findings expire; the badge never nags twice about the same finding.
*Quiet-operator fit:* proactive but not chatty — one badge, one reason, one suggested action, and the reason is always inspectable before the tray is even opened. The anti-Clippy.
*Implementation:* cron writes findings to a table; dock polls with the existing notification cadence; finding card reuses suggestion-row anatomy. **Effort: M/L.** Write risk: findings must be read-only claims; any remediation goes through the standard gate. Rate-limit to avoid alert fatigue (max 1 active finding badge).

**17. Morning digest card.**
First tray open of the day shows a compact digest at the top of suggestions: 3–4 delta lines since last visit ("2 tasks done · 1 new blocked · payment DIH-88 paid"), each line a spotlight link. Dismiss collapses it (measured-height morph) and it stays gone until tomorrow. Investor variant shows only investor-visible deltas.
*Quiet-operator fit:* answers "what changed?" — already a composer quick chip — before it's asked, in four lines, once a day. No push, no email, no modal.
*Implementation:* cheap server aggregation over `activity_log` (the table and `dedupeActivity` already exist for /activity); client gates on a `lastDigestSeen` timestamp per `userKey`. **Effort: M.** No write risk.

**18. Working-in-background dock state.**
When a plan (13) or long tool run continues after the user closes the tray, the dock's `working` state persists with a micro progress arc around the mark (stroke, not a spinner face), and completion flips it to `finished` with the receipt waiting on next open. If a step hits a gate while closed, the dock shows the `permission` state it already has, in `#ffce52`.
*Quiet-operator fit:* lets the user leave — the agent shouldn't hold the tray hostage to finish work; state is legible at dock size.
*Implementation:* the `AgentIconState` machine already has `working/finished/permission`; this only adds persistence when `open === false` plus the arc. **Effort: S.** No write risk (gates still require opening the tray to approve).

### Ranked Top 5 and build order

| # | Idea | Why it wins |
|---|------|-------------|
| 1 | **EKO bus + spotlight + post-write receipt** (Ideas 1+2 as one unit) | The shared primitive every other idea rides on, and it immediately fixes today's real gap: approved writes vanish into prose. Smallest effort, largest unlock. |
| 2 | **"Ask EKO" hover affordance + context chips** (7+9) | Opens the reverse channel. Pointing beats describing; chips become the tray's context grammar for everything later (selection, page scope, drag). |
| 3 | **Live diff preview on the card** (3) | The trust centerpiece — approve what you can see, where it lands. Purely client-side; the draft data already exists. |
| 4 | **Prompt-driven drawer prefill** (4) | The seed example. Retires the weakest current UI (five-step in-tray stepper) for multi-field writes by borrowing the dashboard's own editing surface. |
| 5 | **Structured approval controls** (12) | Makes Edit a one-tap act inside the tray for the simple cases the drawer would be overkill for. Reuses `TAB_PILL_SPRING` and board control vocabulary. |

**Build order:** 1 → 2 → 3 → 4 → 5, then Idea 15 (pin + runs) before any Cluster D work — ambient features are only trustworthy once history and receipts exist. Idea 13 (plans) waits for 15.

**Do this next: the EKO bus + spotlight + receipt unit.** It is S-effort, zero-risk (no new write paths), and it is the infrastructure decision — a typed event channel between `AgentCompanion` and the pages `LightShell` already wraps. Every other idea on this list (preview, drawer prefill, filters, hover handoff, digest links) is a producer or consumer of that bus. Shipping it as the receipt-deep-link feature means the plumbing arrives wearing a user-visible improvement: the first time EKO changes a task, the user watches the board answer back.
