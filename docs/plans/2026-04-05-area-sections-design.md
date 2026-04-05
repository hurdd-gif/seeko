# Area Sections — Design

**Date:** 2026-04-05
**Goal:** Each area can have N sub-sections with independent progress. Area progress auto-computes as the average of its sections.

## Scope

Admin-facing: add/edit/delete sections inside the area edit modal. Investor-facing: see sections as read-only rows in their area modal. Reusable across all areas; seeded on Main Game for first release.

## Schema

New table `area_sections`:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| area_id | uuid FK → areas.id | `ON DELETE CASCADE` |
| name | text NOT NULL | e.g. "Map Design" |
| progress | int NOT NULL | CHECK 0–100, default 0 |
| sort_order | int NOT NULL | default 0 |
| created_at | timestamptz | default now() |

Index on `area_id`.

## Compute — DB trigger

`area.progress` remains a denormalized int column on `areas`. A trigger recalculates it on INSERT/UPDATE/DELETE of `area_sections`:

```
IF section count > 0 for area_id THEN
  areas.progress = ROUND(AVG(area_sections.progress))
ELSE
  -- leave areas.progress untouched (backwards-compatible with manual values)
END IF
```

Edge cases:
- **First section added** → area.progress = that section's progress
- **Last section deleted** → area.progress frozen at last computed value; admin can edit manually after
- **Admin edits area.progress directly while sections exist** → allowed, but next section change overwrites it (sections are canonical)

## RLS policies

`area_sections` mirrors `areas`:
- `SELECT`: any authenticated user
- `INSERT/UPDATE/DELETE`: admins only (check via `profiles.is_admin`)

## API routes

Following existing `/api/areas/[id]` pattern:
- `POST /api/areas/[id]/sections` — create section
- `PATCH /api/areas/[id]/sections/[sectionId]` — update name/progress/sort_order
- `DELETE /api/areas/[id]/sections/[sectionId]` — delete section

Admin auth check at route level (same pattern as area update route).

## Data fetching

- Home page (areas grid): unchanged — uses `area.progress` denormalized column
- `fetchAreas()` extended to eager-load sections via Supabase nested select
- `Area` type gains `sections?: AreaSection[]`
- Admin and investor modals read sections from the already-fetched area

## Admin modal UI (DashboardAreaCard)

Replace the current Progress input with:
1. Read-only computed progress bar at top (updates live as sections edit)
2. Status + Phase grid (unchanged)
3. Sections list: each row is `name input + progress input + mini progress bar + × delete`
4. "+ Add section" button below list
5. Description (unchanged)
6. Save changes (saves all section edits + area fields in one commit)

## Investor modal UI (InvestorAreaCard)

Same visual structure, read-only:
- Static progress bar at top
- Static sections list (name + % + mini bar), no inputs, no add/delete
- Section list only renders if sections exist

## Seed data

Migration seeds 5 sections for Main Game (area_id resolved by name):
1. Map Design — 0%
2. Programming — 0%
3. UI/UX — 0%
4. Animations — 0%
5. SFX/VFX — 0%

`sort_order` 0–4 in listed order.

Fighting Club starts empty (admin adds sections manually later).

## TypeScript types

```ts
export type AreaSection = {
  id: string;
  area_id: string;
  name: string;
  progress: number;
  sort_order: number;
  created_at: string;
};

// Area extended:
export type Area = {
  // ...existing fields
  sections?: AreaSection[];
};
```

## Out of scope (YAGNI)

- Drag-to-reorder sections (v2)
- Section templates
- Section descriptions/statuses
- Weighted averaging
- Audit log / history

## Success criteria

1. Admin opens Main Game modal → sees 5 seeded sections, can edit progress inline
2. Saving section progress updates `area.progress` automatically via trigger
3. Admin can add new sections (auto-appended to end of list)
4. Admin can delete sections
5. Fighting Club (no sections) → modal shows empty sections list + Add button, `area.progress` stays manual
6. Investor sees sections read-only in their area modal
7. Home page area cards show the computed rollup progress with no changes

## Files touched

**New:**
- `supabase/migrations/<timestamp>_area_sections.sql` — table + trigger + RLS + seed
- `src/app/api/areas/[id]/sections/route.ts` — POST
- `src/app/api/areas/[id]/sections/[sectionId]/route.ts` — PATCH, DELETE

**Modified:**
- `src/lib/types.ts` — add `AreaSection` type, extend `Area`
- `src/lib/supabase/data.ts` — `fetchAreas` eager-loads sections
- `src/components/dashboard/DashboardAreaCard.tsx` — modal sections UI (editable)
- `src/components/dashboard/InvestorAreaCard.tsx` — modal sections UI (read-only)
- `docs/personas/ia.md` — document the new table

No changes to home page, tasks, or departments.
