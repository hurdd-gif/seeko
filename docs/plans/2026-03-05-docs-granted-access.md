# Docs: “Also allow access” (granted users) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let doc editors grant access to specific users who would otherwise be restricted by department (exceptions to the department lock).

**Architecture:** Add `granted_user_ids uuid[]` on `docs`. Access rule: can open = admin OR (user dept in restricted_department) OR (user id in granted_user_ids). Docs page fetches team and passes it to DocList/DocEditor; editor has “Also allow access” picker; list shows granted users and uses updated isLocked.

**Tech Stack:** Next.js App Router, Supabase (migration + API), React, existing DocList/DocEditor, Profile type.

---

## Task 1: Migration and schema docs

**Files:**
- Create: `supabase/migrations/20260305000006_docs_granted_user_ids.sql`
- Modify: `docs/supabase-schema.sql` (add column to docs table section)
- Modify: `docs/personas/ia.md` (docs table notes)

**Step 1: Create migration**

Add migration file:

```sql
-- Add granted_user_ids: users who get access even when their department is not in restricted_department
ALTER TABLE public.docs
  ADD COLUMN IF NOT EXISTS granted_user_ids uuid[] DEFAULT NULL;
```

**Step 2: Update schema doc**

In `docs/supabase-schema.sql`, in the `create table public.docs` section (around lines 97–102), add a comment and column line for the new column (the file may not have restricted_department; if so, add both for consistency). Prefer adding after `sort_order`:

```sql
  sort_order int default 0,
  granted_user_ids uuid[] default null,  -- allow specific users when doc is department-restricted
  created_at timestamptz default now()
```

(If the schema file uses a different format, match it. If `restricted_department` is only in migrations, add only `granted_user_ids` to the schema doc and note “see migrations for restricted_department and granted_user_ids”.)

**Step 3: Update IA persona**

In `docs/personas/ia.md`, in the docs table (around lines 70–78), add a row:

| granted_user_ids | uuid[] | User IDs granted access when doc is department-restricted |

**Step 4: Commit**

```bash
git add supabase/migrations/20260305000006_docs_granted_user_ids.sql docs/supabase-schema.sql docs/personas/ia.md
git commit -m "chore: add docs.granted_user_ids migration and schema docs"
```

---

## Task 2: Type and API

**Files:**
- Modify: `src/lib/types.ts` (Doc type)
- Modify: `src/app/api/docs/route.ts` (POST body)
- Modify: `src/app/api/docs/[id]/route.ts` (PATCH body)

**Step 1: Add Doc.granted_user_ids**

In `src/lib/types.ts`, in the `Doc` type (around line 47), add:

```ts
  restricted_department?: string[];
  granted_user_ids?: string[];
```

**Step 2: POST /api/docs**

In `src/app/api/docs/route.ts`, extend body destructuring and insert:

- In the destructuring: add `granted_user_ids`.
- In the `.insert()` call: add `granted_user_ids: granted_user_ids ?? null` (or normalize empty array to null).

Example:

```ts
const { title, content, sort_order, restricted_department, granted_user_ids } = body;
// ...
.insert({
  title,
  content,
  sort_order: sort_order ?? 0,
  restricted_department: restricted_department ?? null,
  granted_user_ids: (granted_user_ids?.length ? granted_user_ids : null) ?? null,
})
```

**Step 3: PATCH /api/docs/[id]**

In `src/app/api/docs/[id]/route.ts`:

- Add `granted_user_ids` to body destructuring.
- Add to `updates`: `if ('granted_user_ids' in body) updates.granted_user_ids = granted_user_ids?.length ? granted_user_ids : null;` (or equivalent).

**Step 4: Commit**

```bash
git add src/lib/types.ts src/app/api/docs/route.ts src/app/api/docs/\[id\]/route.ts
git commit -m "feat(docs): add granted_user_ids type and API support"
```

---

## Task 3: Access rule and DocList props

**Files:**
- Modify: `src/app/(dashboard)/docs/page.tsx` (fetch team, pass currentUserId and team)
- Modify: `src/components/dashboard/DocList.tsx` (props, isLocked, display granted users)

**Step 1: Docs page — fetch team and current user**

In `src/app/(dashboard)/docs/page.tsx`:

- Import `fetchTeam` from `@/lib/supabase/data`.
- In the page, fetch team: e.g. `const team = await fetchTeam().catch(() => []);`.
- Pass to DocList: `currentUserId={user?.id ?? ''}` and `team={team}`.

**Step 2: DocList — props and isLocked**

In `src/components/dashboard/DocList.tsx`:

- Add to `DocListProps`: `currentUserId?: string;` and `team?: Pick<Profile, 'id' | 'display_name'>[];` (or `Profile[]` if you prefer).
- Destructure `currentUserId` and `team` in the component.
- Update `isLocked(d)` to:
  - `const hasDeptRestriction = !!d.restricted_department?.length;`
  - `const inDept = hasDeptRestriction && d.restricted_department!.includes(userDepartment ?? '');`
  - `const granted = !!d.granted_user_ids?.length && d.granted_user_ids.includes(currentUserId ?? '');`
  - `return !isAdmin && hasDeptRestriction && !inDept && !granted;`
- Pass `team` to `DocEditor`: `<DocEditor ... team={team} />`.

**Step 3: DocList — show “Also: @Name” when granted users exist**

On the unlocked doc card (and optionally on the locked card subtitle), when `doc.granted_user_ids?.length` is true, resolve names from `team` and show e.g. “Also: @Alice, @Bob” (or “+ N allowed”). Use `team.filter(p => doc.granted_user_ids?.includes(p.id)).map(p => p.display_name ?? 'Unknown')` and format as desired.

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/docs/page.tsx src/components/dashboard/DocList.tsx
git commit -m "feat(docs): access rule for granted_user_ids and show granted users on cards"
```

---

## Task 4: DocEditor — “Also allow access” picker

**Files:**
- Modify: `src/components/dashboard/DocEditor.tsx` (state, UI, save payload)

**Step 1: DocEditor props and state**

In `src/components/dashboard/DocEditor.tsx`:

- Add to props: `team?: Pick<Profile, 'id' | 'display_name'>[];` (or `Profile[]`).
- Add state: `const [grantedIds, setGrantedIds] = useState<string[]>(doc?.granted_user_ids ?? []);`
- Initialize from `doc?.granted_user_ids` when `doc` is provided.

**Step 2: “Also allow access” UI**

Below the “Restrict to: [departments]” block, add a section “Also allow access:”:

- A `<Select>` (or similar) with placeholder “Add someone…” and options = `team.filter(p => !grantedIds.includes(p.id))` (display name as label, value = id). On change, add selected id to `grantedIds` and clear the select.
- Display selected users as chips (or badges): for each id in `grantedIds`, show display name from `team` and a remove button that removes that id from `grantedIds`.
- If `team` is empty or undefined, show nothing or “No team members” so the section doesn’t break.

**Step 3: Save payload**

In `handleSave`, add to the request body:

`granted_user_ids: grantedIds.length > 0 ? grantedIds : null`

Ensure POST and PATCH receive this (already done in Task 2).

**Step 4: Commit**

```bash
git add src/components/dashboard/DocEditor.tsx
git commit -m "feat(docs): Also allow access picker in DocEditor"
```

---

## Task 5: Verification and docs persona

**Files:**
- Modify: `docs/personas/ia.md` (Data Access / fetchDocs note if needed)
- Manual: Run app, create doc with department restriction, add granted user, log in as that user and confirm access; confirm non-granted user still locked.

**Step 1: Run migration (if using local Supabase)**

If you use local Supabase: `npx supabase db push` or apply the migration via Supabase dashboard SQL editor.

**Step 2: Manual test**

- As admin: create or edit a doc, set “Restrict to: Coding”, add one user from another department in “Also allow access”, save.
- As that user: open Docs, confirm the doc is not locked and can be opened.
- As another user (same non-Coding department, not granted): confirm the doc is locked.
- As a Coding user: confirm the doc is not locked.

**Step 3: Update IA persona if needed**

In `docs/personas/ia.md`, under “Data Access” or “RLS”, add a note that doc access is enforced in app logic using `restricted_department` and `granted_user_ids` (no RLS change).

**Step 4: Commit**

```bash
git add docs/personas/ia.md
git commit -m "docs: note doc access rule (granted_user_ids) in IA persona"
```

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-03-05-docs-granted-access.md`.

**Two execution options:**

1. **Subagent-driven (this session)** — I implement task-by-task in this session, with review between tasks.
2. **Parallel session (separate)** — You open a new session (e.g. in a worktree), use the executing-plans skill, and run through the plan with checkpoints.

Which approach do you want?
