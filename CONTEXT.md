# CONTEXT.md — SEEKO Studio seam glossary

Domain glossary for the seams introduced/consolidated by the 2026-07-09
architecture-deepening series (`docs/plans/2026-07-09-architecture-deepening-1-6.md`,
Tasks 1–7). Future work should use these names rather than re-describing the
same anatomy from scratch — grep the seam name first.

## Task store — `src/lib/task-store.ts`

The client's only door to task mutations. `createTask`/`updateTask`/`deleteTask`
wrap `fetch` calls to `/api/tasks` (POST/PATCH/DELETE), returning a uniform
`TaskWriteResult` (`{ ok: true, data }` or `{ ok: false, error }`). It replaced
~13 direct `supabase.from('tasks')...` browser-client writes scattered across
`TaskDetail`/`TaskList`/`TasksBoard`/`InvestorAreaCard`/`TaskDetailPage`/
`PropertiesSection` — those writes silently no-op in dev because there's no
browser Supabase session there, so routing every write through the server-side
tasks repo makes them actually land regardless of environment. Same-origin
`fetch` credentials are sufficient (cookie-based auth); no explicit
`credentials` option is set.

## Tasks repo — `src/lib/tasks-repo.ts`

The server-side door to `public.tasks` for the task store and the EKO agent's
write tools. Exports `createTask`/`updateTask`/`deleteTask` (service-role
Supabase calls) plus `TASK_PATCH_COLUMNS` (the write whitelist: `name`,
`status`, `priority`, `department`, `assignee_id`, `deadline`, `area_id`,
`description`, `progress`, `bounty`) and `sanitizeTaskPatch`, which drops any
key not in that whitelist. **This is the door for client writes (via
`/api/tasks`) and EKO's write tools — it is not the only writer.** Three
server routes still write `tasks` directly, bypassing this module: `admin.ts`
(user-delete flow clears `assignee_id` on the deleted user's tasks, line
~110), `workflow.ts` (deadline-extension approval sets `deadline` on the
task, line ~227), and `tasks.ts` (handoff reassignment sets `assignee_id`,
line ~347). The write rule tracks live RLS: as of 2026-07-10 `public.tasks` writes are
staff-scoped (admin OR non-investor — `is_staff_for_rls`), enforced by the HTTP
layer (`routes/tasks.ts`) and, at the DB, by the staff INSERT/UPDATE policies.
The last direct-from-browser task write (`dashboard-actions.createTask`) was
routed through `/api/tasks` on this branch, so every client write now crosses
this door. The deploy-staged `20260710200000_tasks_api_only_writes` migration
then drops the staff INSERT/UPDATE policies, making service-role callers (this
module plus the three server routes above) the *only* writers the DB accepts;
delete stays admin-only throughout. This module itself is pure data access with
no auth opinion of its own. `createTask` does not self-sanitize
its `fields` argument (the one caller, `routes/tasks.ts`, already runs
`sanitizeTaskPatch` before calling it) — see Follow-ups.

## Invites repo — `src/lib/invites-repo.ts`

One loader (`loadInviteByToken`) behind the shared `external_signing_invites`
table, used by three sibling products that each hand-rolled the same anatomy
over it: external signing, doc sharing, invoice requests. Callers pass an
`InvitePurpose` (`'signing' | 'doc_share' | 'invoice_request'`); the seam
does token lookup, a **cross-product isolation guard enforced inside the
function** (`matchesPurpose` — a row of the wrong purpose comes back
`not_found`, never leaked to the wrong product), the shared
expire-if-past-due branch (mutates `status` to `'expired'` and returns
`expired`, best-effort), and the `revoked` short-circuit. `signing` reuses
`isLocalSigningInvite` (which also excludes DocuSign-backed rows from this
legacy/local flow). Everything that genuinely diverges between the three
products — status shaping, extra joins, session-token checks — stays in
their own veneers (`external-signing.ts`, `doc-share.ts`,
`invoice-request.ts`). `maskEmail` also lives here as a shared helper.

## Admin gate — `src/api-server/auth-utils.ts`

`requireUser`/`requireAdmin`/`requireAdminVia`/`isAdminUser` — the only
module that reads `profiles.is_admin` for admin-only authorization.
`requireUser` resolves the authenticated user plus `isAdmin`/`isInvestor`
flags (dev-bypass short-circuits to an admin dev user); `requireAdmin` layers
a 403 on top. `requireAdminVia` is the DI seam for route modules that inject
their own `authResolver` instead of `requireUser`'s cookie-bound Supabase
client (used where routes need to support token-only auth in tests) — it
still reads the admin flag via the service client so it works regardless of
how the user was resolved. `isAdminUser(userId)` is the sole
`profiles.is_admin` check for callers that only have a userId and no `Context`
to run an `authResolver` against — currently only `agent/eko-activity.ts`'s
`assertAdmin`. Two deliberate exceptions live outside this module:
`workflow.ts`'s admin-OR-investor gate (`/investor/export-summary`, checks
`profile.is_investor || profile.is_admin` inline) and
`payments-auth.ts`'s passkey/cookie-client gates (`requireHonoPaymentsAdminToken`/
`requireHonoPaymentsViewerToken`/`getHonoPaymentsAuth`), which layer a
payments-JWT-cookie check on top of the admin flag and don't go through
`auth-utils` at all.

## View state — `src/rr-app/load-view.ts` + `src/lib/access-error.ts`

`loadView<T>(url, errorMessage)` is the shared "fetch a view, map HTTP status
to an access state" anatomy repeated across Paper route loaders: 401 →
`{ status: 'unauthorized' }`, 403 → `{ status: 'forbidden' }`, 404 →
`{ status: 'not_found' }`, other non-ok → thrown `Response`, ok → `{ status:
'ready', data }` (parsed JSON). It replaced ~16 copies of the same four
branches; each route still owns its own status-union alias (`ViewState<X>`)
and bespoke `RouteContent` switch/JSX. `AccessError` (in `access-error.ts`)
is the matching server-side error class — one class replacing ~10
near-identical `*AccessError` classes that every lib loader (dashboard,
tasks, team, investor, docs, contractor, onboarding,
external-signing-admin) used to define for itself. `reason` (`'unauthorized'
| 'forbidden' | 'profile_not_found' | 'not_found'`) drives the HTTP status via
`accessErrorStatus`; `message` defaults to `reason` but can be overridden
where a route's wire JSON body carries a more specific literal (e.g.
`investor_forbidden`, `not_admin`, `admin_required`) while still bucketing
into the same 401/403/404. Four loaders intentionally keep bespoke anatomy
instead of adopting `loadView`/`ViewState`: agreement, investor-layout,
payments, and external-signing-admin — their access logic diverges enough
(multi-step token/session checks, non-uniform status shaping) that forcing
them onto the generic would cost more than it saves.

## Realtime seam — `src/lib/realtime.ts`

`subscribeToTable(client, channelName, specs)` is the one seam for Supabase
`postgres_changes` subscriptions. The invariant it owns: the realtime socket's
auth token is set (`client.realtime.setAuth(session.access_token)`) **before**
the channel subscribes — a channel that joins as anon is silently filtered to
zero rows by RLS. This was previously re-derived per call site and lost in 2
of 3 call sites; now every call site gets it for free by going through this
function. Returns an unsubscribe/cleanup callback that no-ops if already
disposed.

## Router adapter — `src/lib/react-router-adapters.tsx`

The only sanctioned reader of `UNSAFE_DataRouterContext` outside
`react-router` itself. `useDataRouter()` returns the active data router (or
`null` under a plain `<MemoryRouter>` in tests, which has no data router).
This module also hosts the other Next.js-shaped compatibility shims used
across the Vite port: `Link`/`Image`/`usePathname`/`useSearchParams`/`dynamic`,
and `useRouter()`, whose `refresh()` calls `dataRouter?.router.revalidate()`
as the data-router equivalent of Next's `router.refresh()` (re-runs the
active route's loaders in place, no full reload).

## EKO staged writes

EKO's write tools never commit directly. A write tool call **stages** a row
in `eko_pending_actions` describing the intended mutation; only
`executeById` (in `src/api-server/routes/agent.ts`) commits it, and
`executeById` gates on `assertAdmin(user.id)` (`src/api-server/agent/eko-activity.ts`,
itself backed by `auth-utils.ts`'s `isAdminUser`) before running the single
commit. This is the invariant that lets the admin see a staged action and
explicitly Approve/Deny it before anything actually writes — the distinction
between "staged" and `status = 'executed'` in `eko_pending_actions` is load-bearing
for both the approval UI and the executed-action narration EKO reads back
into its own context on later turns.
