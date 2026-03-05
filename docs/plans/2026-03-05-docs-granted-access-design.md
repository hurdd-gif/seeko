# Docs: “Also allow access” (granted users) — Design

**Date:** 2026-03-05

## Goal

Allow doc editors to **grant access** to specific users who would otherwise be restricted by department. Department restriction remains the base rule; the granted list adds exceptions (e.g. “Coding only, but also @Alice from Visual Art”).

## Access rule

- User can open a doc if **any** of:
  - They are an **admin**, or
  - Their department is in `restricted_department` (when that array is non-empty), or
  - Their user id is in **`granted_user_ids`** (exceptions to the department lock).
- When `restricted_department` is null/empty, the doc is open to everyone; `granted_user_ids` only matters when there is a department restriction (it adds people who would otherwise be locked out).

## Schema

- **Table:** `docs`
- **New column:** `granted_user_ids uuid[]` default null.
- No FK constraint to `profiles(id)` for simplicity (avoids cascade/delete issues); optional later.
- **Types:** Update `Doc` in `src/lib/types.ts`: `granted_user_ids?: string[]`.

## API

- **POST /api/docs** and **PATCH /api/docs/[id]**: Accept `granted_user_ids` (array of UUID strings or null). Persist as-is; store null when array is empty.

## UI

### Doc editor

- **Label:** “Also allow access:” (only meaningful when department restriction is set; we can show it always for consistency).
- **Control:** Multi-select of team members: e.g. a `<Select>` to “Add someone…” and chips for selected users with remove. Team list comes from `fetchTeam()`; pass `team` into the doc editor from the docs page.

### Doc list / cards

- **Locked card:** If doc has department restriction and user is locked, show existing “Restricted to: [depts]” text. (No need to mention granted users on the locked card.)
- **Unlocked card:** When showing “Restricted to: Coding only” badges, optionally show “+ 2 allowed” or “Also: @Alice, @Bob” when `granted_user_ids` is non-empty (so admins see who was granted access).
- **Access logic:** Use the single rule above in `isLocked`: locked = not admin and (restricted_department non-empty and user dept not in it and user id not in granted_user_ids).

## Data flow

- **Docs page:** Fetch `docs`, `profile`, and **`team`** (for picker and resolving names). Pass `team` and `currentUserId` (user.id) to `DocList`.
- **DocList:** Accept `team` and `currentUserId`; pass `team` to `DocEditor`. Update `isLocked(d)` to include “or user id in d.granted_user_ids”.
- **DocEditor:** Accept optional `team`; “Also allow access” picker and state; include `granted_user_ids` in save payload.

## Out of scope

- RLS policy changes: access control remains in app logic (doc list and any read API that might be added). No change to Supabase RLS for docs.
- Notifications when someone is granted access (future).
