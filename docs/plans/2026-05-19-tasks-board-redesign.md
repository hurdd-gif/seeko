# Tasks Board Redesign

**Date:** 2026-05-19
**Status:** Active
**Supersedes:** `docs/plans/2026-03-06-tasks-redesign.md`, `docs/plans/2026-03-06-tasks-redesign-design.md`
**Reference:** Paper file `Scratchpad`, frame `TA-0` (Linear-style issue board, 1476×881)
**Branch:** `feat/dashboard-paper-redesign` (worktree `.worktrees/dashboard-paper-redesign/`)

---

## Context

The 2026-03-06 redesign ships a flat 3-column table for `/tasks` (Name / Assignees / Status). The user has chosen a complete pivot: a Linear/Height-style **board view** with one column per status, a **right rail** for properties / milestones / progress / activity, and a **"Hidden columns" rollup** for empty statuses. The Paper reference is in dark mode; this implementation uses SEEKO's existing light palette.

Two scoping decisions taken via `AskUserQuestion` on 2026-05-19:

1. **Status enum: expand to 7** — Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate. Existing `Blocked` rows migrate to `Backlog`. `Blocked` is dropped (Linear convention; Canceled covers permanent stops).
2. **Phase 1 = full port** — board + right rail (Properties + Milestones + Progress + Activity).
3. **Milestones scope** — schema + empty-state UI only. No milestone CRUD or task-linking UI this round.

---

## Design Critique (pre-implementation)

**Strengths of the Paper design**
- Column-per-status is the strongest mental model for an issue tracker — matches a designer's working state.
- ID-prefixed cards (`DIH-20`) give linkable, memorable references — better than UUIDs in chat/standup.
- "Hidden columns" rollup keeps the board scannable when most statuses are empty; novel and worth porting.
- Right rail provides context without leaving the page — keeps board overview visible while editing one task.

**Adaptations required for SEEKO**
- **Light-mode treatment**: Linear's dark cards rely on gradient overlays + 1px subtle borders to feel elevated. In light mode, default to white card on a faintly-tinted page bg (`#fafafa`) with `shadow-seeko`. No borders — shadows do the elevation job (per the project's design-references rule).
- **Column widths**: At 1075px board area ÷ 7 columns = ~150px each, which is too cramped for cards. Solution: only render columns with items + the "Hidden columns" rollup on the right. Realistic case is 3–4 visible columns → 250–340px each.
- **"Hidden columns" trigger**: Auto-collapse when count = 0. User-toggleable "Show empty ▾" affordance in the rollup header to expand them when needed (e.g., to drag a task to an empty status).
- **No drag-and-drop in Phase 1**: Status change happens via the status dot dropdown on the card. DnD is Phase 2 — adds `@dnd-kit` dep and complicates mobile.

**Watch-outs**
- The 7-status set is opinionated. `Duplicate` may rarely be used in a 5-person studio. Document the intended meaning of each status in `ux.md`.
- The Paper design shows cards with truncated dates ("Created May ..."). We need real timestamps with tabular numbers; truncation is a design tic, not a feature.
- Right rail at 400px is desktop-only. On mobile, rail becomes a bottom-sheet (reuses `MobileNotificationSheet` pattern).

---

## Phase A — Schema (one Supabase migration)

**Migration file**: `supabase/migrations/<timestamp>_tasks_board_redesign.sql`

**Steps:**

1. `list_tables` to confirm current state. Read `docs/supabase-schema.sql` for current `task_status` enum.
2. Enum migration:
   ```sql
   ALTER TYPE task_status RENAME TO task_status_old;
   CREATE TYPE task_status AS ENUM ('Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled', 'Duplicate');
   ALTER TABLE tasks ADD COLUMN status_new task_status;
   UPDATE tasks SET status_new = CASE
     WHEN status::text = 'Complete' THEN 'Done'::task_status
     WHEN status::text = 'Blocked'  THEN 'Backlog'::task_status
     ELSE status::text::task_status
   END;
   ALTER TABLE tasks DROP COLUMN status;
   ALTER TABLE tasks RENAME COLUMN status_new TO status;
   ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'Backlog';
   ALTER TABLE tasks ALTER COLUMN status SET NOT NULL;
   DROP TYPE task_status_old;
   ```
3. `tasks` additions:
   ```sql
   ALTER TABLE tasks ADD COLUMN task_number BIGINT;
   CREATE SEQUENCE task_number_seq;
   UPDATE tasks SET task_number = nextval('task_number_seq');
   ALTER TABLE tasks ALTER COLUMN task_number SET DEFAULT nextval('task_number_seq');
   ALTER TABLE tasks ALTER COLUMN task_number SET NOT NULL;
   CREATE UNIQUE INDEX tasks_task_number_idx ON tasks (task_number);

   ALTER TABLE tasks ADD COLUMN progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100);
   ```
4. `milestones` table (schema only this round):
   ```sql
   CREATE TABLE milestones (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     target_date DATE,
     area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
     sort_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE task_milestone (
     task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
     PRIMARY KEY (task_id, milestone_id)
   );
   ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
   ALTER TABLE task_milestone ENABLE ROW LEVEL SECURITY;
   -- RLS: any authenticated user can SELECT; admin can INSERT/UPDATE/DELETE
   ```
5. **Extend existing `activity_log`** + triggers (decision 2026-05-19: `activity_log` already exists with `task_id`/`doc_id` FKs and 14 rows; reuse rather than fork).
   ```sql
   CREATE TYPE task_activity_kind AS ENUM ('created', 'status_changed', 'assignee_changed', 'milestone_linked', 'milestone_unlinked', 'progress_changed');
   ALTER TABLE activity_log
     ADD COLUMN kind         task_activity_kind,  -- nullable; legacy rows have NULL
     ADD COLUMN before_value JSONB,
     ADD COLUMN after_value  JSONB;
   CREATE INDEX activity_log_task_id_created_at_idx
     ON activity_log (task_id, created_at DESC)
     WHERE task_id IS NOT NULL;
   -- Trigger AFTER INSERT on tasks → activity_log row (kind='created')
   -- Trigger AFTER UPDATE on tasks → one row per changed field (status/assignee/progress)
   -- Trigger AFTER INSERT/DELETE on task_milestone → milestone_linked/unlinked rows
   -- All trigger functions SECURITY DEFINER so they can insert regardless of RLS context
   ```
6. Update `docs/supabase-schema.sql` and `docs/personas/ia.md` to match.

**Acceptance**: `npx tsc --noEmit` clean after `src/lib/types.ts` updated; existing test fixtures pass.

---

## Phase B — Board UI

**New components** (all under `src/components/dashboard/tasks/`):

| File | Responsibility |
|---|---|
| `TasksBoard.tsx` | Top-level: fetches grouped tasks, lays out columns + hidden rollup + rail |
| `TasksBoardColumn.tsx` | One status column: header (icon + name + count + ⋯ + `+`), card list |
| `TaskCard.tsx` | One card: ID label, assignee avatar, status dot + title, optional label chip, created date |
| `HiddenColumnsStack.tsx` | Rollup of empty statuses, with `Show empty ▾` toggle |
| `StatusDot.tsx` | Shared status indicator (icon + color) used in column header, card, dropdown |

**Light palette mapping (in `docs/personas/ux.md`)**:

| Status | Icon (lucide) | Dot color | Used elsewhere |
|---|---|---|---|
| Backlog | `Circle` (dashed) | `#a3a3a3` (neutral-400) | — |
| Todo | `Circle` | `#93c5fd` (blue-300) | — |
| In Progress | `Loader2`-style or pie | `#fbbf24` | `--color-status-progress` (existing) |
| In Review | `Eye` | `#93c5fd` | `--color-status-review` (existing) |
| Done | `CheckCircle2` | `#0d7aff` | `--color-seeko-accent` (existing) |
| Canceled | `XCircle` | `#a3a3a3` | — |
| Duplicate | `Copy` | `#a3a3a3` | — |

**Page wiring**: `src/app/(dashboard)/tasks/page.tsx` swaps `TaskList` for `TasksBoard`. `TaskList` stays in the repo as the list-view fallback for Phase D (board/list toggle).

**Card spec** (light mode):
- `bg-white rounded-xl shadow-seeko p-3 flex flex-col gap-2`
- Hover: `whileHover={{ y: -2 }}` with `springs.snappy`
- Click: opens task in rail (or full-screen on mobile)
- ID label: `text-[11px] text-[#808080] tabular-nums` → `DIH-{task_number}`
- Title row: `[StatusDot] [title] [...truncate]`

**Acceptance**: visit `/tasks`, see board, click card → rail opens (Phase C dependency, so this lands in a placeholder until C ships).

---

## Phase C — Right rail (400px)

**New components**:

| File | Responsibility |
|---|---|
| `TaskDetailRail.tsx` | 400px right panel, owns selected-task state |
| `RailSection.tsx` | Collapsible accordion shell (chevron + title, animates open/close) |
| `PropertiesSection.tsx` | Priority / department / area / assignee / deadline (all from existing schema; uses existing dropdown UI vocabulary) |
| `MilestonesSection.tsx` | **Empty state only** this round: "Add milestones to organize work…" copy |
| `ProgressSection.tsx` | Read-only progress bar bound to `tasks.progress`; admin can edit via popover |
| `ActivitySection.tsx` | Last N events from `activity_log` filtered by `task_id` (10 default; "See all" expands) |

**Motion**: reuse `shellEntrance` for section open/close; respect `useReducedMotion()`.

**Empty rail (no task selected)**: project-level view — project name, total task count, milestones overview (empty state), last 5 activity entries.

**Acceptance**: selecting a card opens rail; all 4 sections render; Activity shows real data sourced from triggers in Phase A.

---

## Phase D — Top chrome

**New**: `src/components/dashboard/tasks/TasksTopChrome.tsx`

- Tabs (Overview / Activity / Issues) via `?tab=` search param — no new routes
- Issues = the board (default)
- Overview = project-level summary (placeholder card this round)
- Activity = the project's full `task_activity` feed
- Right-side icons: filter (dropdown of department/priority/assignee), settings (column visibility), view-toggle (board ⇄ list)

**Acceptance**: tabs switch without route change; filter persists in URL; view-toggle flips between `TasksBoard` and existing `TaskList`.

---

## Phase E — Polish + critique

1. Animations: column headers stagger in with `rowEntrance`; cards stagger inside columns.
2. Mobile: stack columns vertically below `md`; rail becomes bottom-sheet (reuse `MobileNotificationSheet` pattern).
3. A11y: keyboard nav between cards, arrow keys move selection, `Enter` opens rail, `Esc` closes.
4. **/interface-craft critique** — required AFTER pass before merge. Compare implementation against `TA-0` screenshot.
5. Visual QA: `mcp__paper__get_screenshot` on implemented `/tasks` vs `TA-0` side-by-side.

---

## Files Affected

**New**
- `supabase/migrations/<timestamp>_tasks_board_redesign.sql`
- `src/components/dashboard/tasks/TasksBoard.tsx`
- `src/components/dashboard/tasks/TasksBoardColumn.tsx`
- `src/components/dashboard/tasks/TaskCard.tsx`
- `src/components/dashboard/tasks/HiddenColumnsStack.tsx`
- `src/components/dashboard/tasks/StatusDot.tsx`
- `src/components/dashboard/tasks/TaskDetailRail.tsx`
- `src/components/dashboard/tasks/RailSection.tsx`
- `src/components/dashboard/tasks/PropertiesSection.tsx`
- `src/components/dashboard/tasks/MilestonesSection.tsx`
- `src/components/dashboard/tasks/ProgressSection.tsx`
- `src/components/dashboard/tasks/ActivitySection.tsx`
- `src/components/dashboard/tasks/TasksTopChrome.tsx`

**Modified**
- `src/lib/types.ts` — new `TaskStatus` values, `Milestone`, `TaskActivity` types
- `src/app/(dashboard)/tasks/page.tsx` — render `TasksBoard`, also fetch milestones + recent activity
- `src/lib/supabase/data.ts` — add `fetchMilestones`, `fetchTaskActivity` (reads activity_log filtered by task_id), expand `fetchTasks` to include `task_number`
- `docs/supabase-schema.sql` — new tables + enum
- `docs/personas/ia.md` — schema docs
- `docs/personas/ux.md` — new 7-status color map

**Superseded** (add a header note pointing to this plan)
- `docs/plans/2026-03-06-tasks-redesign.md`
- `docs/plans/2026-03-06-tasks-redesign-design.md`

---

## Verification

- `npx tsc --noEmit` clean
- `npx vitest run` — new unit tests for status-mapping + hidden-columns logic
- Manual: `/tasks` renders board; click card → rail opens; status dropdown changes status + writes `task_activity` row; "Hidden columns" rollup shows correct counts; mobile shows stacked columns
- **/interface-craft critique** pass against Paper `TA-0` (mandatory hook per CLAUDE.md)
- `mcp__paper__get_screenshot` side-by-side with a screenshot of the local `/tasks` page

---

## Open follow-ups (out of scope this round)

- Milestone CRUD UI (modal + linking from task rail)
- DnD between columns (`@dnd-kit/sortable` + autosave status)
- Bulk operations (multi-select, bulk status change, bulk assign)
- Filter persistence across sessions (currently URL-only)
- Activity dedup (group "X changed status 3 times in 5 min" into one event)
