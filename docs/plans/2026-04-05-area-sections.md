# Area Sections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `area_sections` — each area gets N named sub-sections with independent progress; `area.progress` auto-averages via DB trigger; editable in admin modal, read-only in investor modal; 5 seeded sections for Main Game.

**Architecture:** New `area_sections` table with FK to areas and a DB trigger that recalculates `area.progress` on INSERT/UPDATE/DELETE. `fetchAreas` eager-loads sections via Supabase nested select. Admin writes through new `/api/areas/[id]/sections` routes (admin-only). Frontend modals both read sections from the already-fetched `Area` object.

**Tech Stack:** Next.js 16 · React 19 · Supabase Postgres (trigger + RLS) · TypeScript · Vitest

**Design doc:** `docs/plans/2026-04-05-area-sections-design.md`

---

## Task 1: Migration — schema, trigger, RLS, seed

**Files:**
- Create: `supabase/migrations/20260405000002_area_sections.sql`

### Step 1.1: Write the migration file

Create `supabase/migrations/20260405000002_area_sections.sql`:

```sql
-- Area sections — sub-components per area with independent progress tracking.
-- area.progress auto-averages section progress via a trigger.

CREATE TABLE area_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  name        text NOT NULL,
  progress    integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_area_sections_area_id ON area_sections(area_id);

-- Recalculate area.progress as AVG of section progress when sections change.
-- Leave area.progress untouched if no sections exist (preserves manual values).
CREATE OR REPLACE FUNCTION recalc_area_progress() RETURNS TRIGGER AS $$
DECLARE
  target_area_id uuid;
  avg_progress integer;
  section_count integer;
BEGIN
  target_area_id := COALESCE(NEW.area_id, OLD.area_id);
  SELECT COUNT(*), COALESCE(ROUND(AVG(progress)), 0)::integer
    INTO section_count, avg_progress
    FROM area_sections WHERE area_id = target_area_id;

  IF section_count > 0 THEN
    UPDATE areas SET progress = avg_progress WHERE id = target_area_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER area_sections_progress_trigger
AFTER INSERT OR UPDATE OR DELETE ON area_sections
FOR EACH ROW EXECUTE FUNCTION recalc_area_progress();

-- RLS: admins can write; any authenticated user can read.
ALTER TABLE area_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "area_sections read for authenticated"
  ON area_sections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "area_sections admin insert"
  ON area_sections FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "area_sections admin update"
  ON area_sections FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "area_sections admin delete"
  ON area_sections FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Seed 5 sections for Main Game at 0% progress.
INSERT INTO area_sections (area_id, name, progress, sort_order)
SELECT id, section_name, 0, section_order
FROM areas,
  (VALUES
    ('Map Design',  0),
    ('Programming', 1),
    ('UI/UX',       2),
    ('Animations',  3),
    ('SFX/VFX',     4)
  ) AS seed(section_name, section_order)
WHERE areas.name = 'Main Game';
```

### Step 1.2: Apply the migration via Supabase MCP

Use `mcp__supabase__apply_migration` with name `area_sections` and the full SQL above (minus the file header comment).

Expected: `{"success": true}`.

### Step 1.3: Verify schema and seed

Run via `mcp__supabase__execute_sql`:

```sql
SELECT s.name, s.progress, s.sort_order, a.name AS area_name
FROM area_sections s
JOIN areas a ON a.id = s.area_id
ORDER BY s.sort_order;
```

Expected: 5 rows, all on Main Game, names `Map Design, Programming, UI/UX, Animations, SFX/VFX`, progress 0.

### Step 1.4: Verify trigger works

Run:

```sql
UPDATE area_sections SET progress = 20 WHERE name = 'Map Design' AND area_id = (SELECT id FROM areas WHERE name = 'Main Game');
SELECT name, progress FROM areas WHERE name = 'Main Game';
```

Expected: Main Game progress = 4 (AVG(20,0,0,0,0) = 4).

Then reset: `UPDATE area_sections SET progress = 0 WHERE area_id = (SELECT id FROM areas WHERE name = 'Main Game');`

Expected after reset: Main Game progress = 0.

### Step 1.5: Commit

```bash
git add supabase/migrations/20260405000002_area_sections.sql
git commit -m "feat(db): add area_sections table with progress trigger

- New table area_sections (id, area_id, name, progress, sort_order, created_at)
- Trigger recomputes area.progress as AVG(sections.progress) on INSERT/UPDATE/DELETE
- If area has no sections, area.progress is left untouched (backwards-compatible)
- RLS: authenticated users read; admins write
- Seeded 5 sections for Main Game at 0%"
```

---

## Task 2: Types + pure progress utility (TDD)

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/area-progress.ts`
- Create: `src/lib/__tests__/area-progress.test.ts`

### Step 2.1: Add types

Append to `src/lib/types.ts` after the `Area` type:

```ts
export type AreaSection = {
  id: string;
  area_id: string;
  name: string;
  progress: number;
  sort_order: number;
  created_at: string;
};
```

Extend the `Area` type (replace the closing `};` with):

```ts
export type Area = {
  id: string;
  name: string;
  status: string;
  progress: number;
  description?: string;
  phase?: string;
  sort_order?: number;
  sections?: AreaSection[];
};
```

### Step 2.2: Write failing test for `computeAreaProgress`

Create `src/lib/__tests__/area-progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeAreaProgress } from '../area-progress';

describe('computeAreaProgress', () => {
  it('returns 0 for empty sections', () => {
    expect(computeAreaProgress([])).toBe(0);
  });

  it('returns the average, rounded to nearest integer', () => {
    expect(computeAreaProgress([{ progress: 20 }, { progress: 40 }])).toBe(30);
    expect(computeAreaProgress([{ progress: 10 }, { progress: 20 }, { progress: 30 }])).toBe(20);
    // rounding: (33 + 34) / 2 = 33.5 → 34
    expect(computeAreaProgress([{ progress: 33 }, { progress: 34 }])).toBe(34);
  });

  it('handles single section', () => {
    expect(computeAreaProgress([{ progress: 42 }])).toBe(42);
  });

  it('clamps to 0-100 even if inputs are out of range', () => {
    expect(computeAreaProgress([{ progress: 150 }])).toBe(100);
    expect(computeAreaProgress([{ progress: -20 }])).toBe(0);
  });
});
```

### Step 2.3: Run to verify failure

Run: `cd /Volumes/CODEUSER/seeko-studio && npx vitest run src/lib/__tests__/area-progress.test.ts`
Expected: FAIL — cannot import `../area-progress`.

### Step 2.4: Implement `computeAreaProgress`

Create `src/lib/area-progress.ts`:

```ts
type ProgressCarrier = { progress: number };

/**
 * Compute an area's progress as the rounded average of its sections' progress.
 * Returns 0 for an empty list. Clamps the result to 0-100.
 *
 * This mirrors the DB trigger's behavior so the client can optimistically
 * update the area progress bar as section inputs change.
 */
export function computeAreaProgress(sections: ProgressCarrier[]): number {
  if (sections.length === 0) return 0;
  const sum = sections.reduce((acc, s) => acc + s.progress, 0);
  const avg = Math.round(sum / sections.length);
  return Math.max(0, Math.min(100, avg));
}
```

### Step 2.5: Run tests

Run: `npx vitest run src/lib/__tests__/area-progress.test.ts`
Expected: 4 tests pass.

### Step 2.6: Typecheck + commit

Run: `npx tsc --noEmit` — expect no new errors (ignore pre-existing `.next/types/validator.ts` errors).

```bash
git add src/lib/types.ts src/lib/area-progress.ts src/lib/__tests__/area-progress.test.ts
git commit -m "feat(types): add AreaSection type and computeAreaProgress utility

- AreaSection type mirrors the area_sections table
- Area type extended with optional sections: AreaSection[]
- computeAreaProgress: rounded-average helper for optimistic client-side
  progress display, clamped 0-100"
```

---

## Task 3: Eager-load sections in fetchAreas

**Files:**
- Modify: `src/lib/supabase/data.ts`

### Step 3.1: Update fetchAreas to include sections

Replace the `fetchAreas` body in `src/lib/supabase/data.ts`:

```ts
export async function fetchAreas(): Promise<Area[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('areas')
    .select('id, name, status, progress, description, phase, created_at, sort_order, sections:area_sections(id, area_id, name, progress, sort_order, created_at)')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  // Supabase returns nested arrays in insertion order; sort sections by sort_order here.
  const areas = (data ?? []) as Area[];
  for (const area of areas) {
    if (area.sections) area.sections.sort((a, b) => a.sort_order - b.sort_order);
  }
  return areas;
}
```

### Step 3.2: Verify areas page still renders

Run dev server (if not running): the existing home page should work unchanged since it only reads `area.progress`. Curl: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` — expect 200 or 307.

### Step 3.3: Typecheck + commit

Run `npx tsc --noEmit`. No new errors expected.

```bash
git add src/lib/supabase/data.ts
git commit -m "feat(data): eager-load area_sections with fetchAreas

Nested Supabase select fetches sections alongside areas. Sections sorted
client-side by sort_order (Supabase returns in insertion order). Home
page queries continue to work unchanged — only modal consumers use
sections."
```

---

## Task 4: API routes for sections CRUD

**Files:**
- Create: `src/app/api/areas/[id]/sections/route.ts` (POST)
- Create: `src/app/api/areas/[id]/sections/[sectionId]/route.ts` (PATCH, DELETE)

### Step 4.1: Shared admin-auth helper

Both routes need the same admin check. Copy it from `src/app/api/areas/[id]/route.ts` (the `getAdminSupabase` function) and inline it into each new file. (Keeping it simple — no shared module for one helper used twice.)

### Step 4.2: Create POST route

Create `src/app/api/areas/[id]/sections/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAdminSupabase() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return null;
  return supabase;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: areaId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, progress, sort_order } = body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const progressVal = typeof progress === 'number' ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
  const sortVal = typeof sort_order === 'number' ? sort_order : 0;

  const { data, error } = await supabase
    .from('area_sections')
    .insert({ area_id: areaId, name: name.trim(), progress: progressVal, sort_order: sortVal })
    .select()
    .single();

  if (error) {
    console.error('Section create error:', error);
    return NextResponse.json({ error: 'Failed to create section' }, { status: 400 });
  }
  return NextResponse.json(data);
}
```

### Step 4.3: Create PATCH + DELETE route

Create `src/app/api/areas/[id]/sections/[sectionId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAdminSupabase() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return null;
  return supabase;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const supabase = await getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { sectionId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, progress, sort_order } = body;

  const updates: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim().length > 0) updates.name = name.trim();
  if (typeof progress === 'number') updates.progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (typeof sort_order === 'number') updates.sort_order = sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('area_sections')
    .update(updates)
    .eq('id', sectionId)
    .select()
    .single();

  if (error) {
    console.error('Section update error:', error);
    return NextResponse.json({ error: 'Failed to update section' }, { status: 400 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const supabase = await getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { sectionId } = await params;
  const { error } = await supabase.from('area_sections').delete().eq('id', sectionId);

  if (error) {
    console.error('Section delete error:', error);
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

### Step 4.4: Manual smoke test

With dev server running, from the browser console while logged in as admin:

```js
// Get Main Game's id
const areas = await fetch('/api/areas').then(r => r.json()); // may not exist — skip if so
// Or: use Supabase client directly from the browser

// Create a test section
await fetch('/api/areas/<MAIN_GAME_UUID>/sections', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ name: 'Test Section', progress: 50, sort_order: 99 })
}).then(r => r.json());
```

Verify via Supabase SQL that the section was created. Then delete it to clean up:
```sql
DELETE FROM area_sections WHERE name = 'Test Section';
```

### Step 4.5: Typecheck + commit

Run `npx tsc --noEmit`. No new errors expected.

```bash
git add src/app/api/areas/[id]/sections/
git commit -m "feat(api): add CRUD endpoints for area_sections

- POST /api/areas/[id]/sections — create section
- PATCH /api/areas/[id]/sections/[sectionId] — update name/progress/sort_order
- DELETE /api/areas/[id]/sections/[sectionId] — delete section

All routes admin-only via profiles.is_admin check. Progress clamped
0-100; name trimmed and required non-empty."
```

---

## Task 5: Admin modal — editable sections list

**Files:**
- Modify: `src/components/dashboard/DashboardAreaCard.tsx`

### Step 5.1: Understand current modal structure

Read lines 120-205 of `src/components/dashboard/DashboardAreaCard.tsx` to understand the existing state, save handler, and render. The modal has: title + phase badge, Progress input+bar, Status+Phase selects, Description textarea, Save button.

### Step 5.2: Add sections state + handlers

In `DashboardAreaCard`, replace the existing `progress` state handling:
- Remove the `progress` state input binding (progress becomes read-only computed)
- Add state: `sections: AreaSection[]` initialized from `area.sections ?? []`
- Add state: `pendingSections: Array<AreaSection | NewSection>` where `NewSection = { _tempId, name, progress, sort_order }`
- Add `editedProgress = computeAreaProgress(pendingSections)` memoized
- Add handlers:
  - `addSection()` — append a new blank section to pendingSections with _tempId
  - `updateSection(idx, patch)` — update one section's name/progress
  - `deleteSection(idx)` — remove from pendingSections
  - `saveSections()` — diff pendingSections vs area.sections, POST new, PATCH changed, DELETE removed

### Step 5.3: Render sections UI

Between the Status/Phase grid and Description textarea, insert:

```tsx
{/* Sections */}
<div className="mb-5">
  <div className="flex items-center justify-between mb-2">
    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sections</span>
    <button
      type="button"
      onClick={addSection}
      className="text-xs text-seeko-accent hover:text-seeko-accent/80 transition-[color]"
    >
      + Add section
    </button>
  </div>
  {pendingSections.length > 0 ? (
    <ul className="space-y-2">
      {pendingSections.map((section, idx) => (
        <li key={'id' in section ? section.id : section._tempId} className="flex items-center gap-2">
          <input
            type="text"
            value={section.name}
            onChange={(e) => updateSection(idx, { name: e.target.value })}
            placeholder="Section name"
            className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent/40"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={section.progress}
            onChange={(e) => updateSection(idx, { progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className="w-14 rounded-md border border-border bg-card px-2 py-1 text-right text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-xs text-muted-foreground w-3">%</span>
          <button
            type="button"
            onClick={() => deleteSection(idx)}
            aria-label={`Delete section ${section.name || 'untitled'}`}
            className="rounded p-1 text-muted-foreground hover:text-destructive transition-[color]"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-xs text-muted-foreground/60">No sections yet. Add one to decompose progress.</p>
  )}
</div>
```

### Step 5.4: Update Progress bar at top to use `editedProgress`

Change the progress value passed to `ProgressBar` from `progress` (state) to `editedProgress` (computed from pendingSections, falling back to `area.progress` if pendingSections is empty).

Logic:
```ts
const displayProgress = pendingSections.length > 0 ? computeAreaProgress(pendingSections) : area.progress;
```

Replace the progress number input with read-only span showing `displayProgress`.

### Step 5.5: Wire up save handler

Rewrite the save handler to:
1. Save area fields (status, phase, description) via existing PATCH /api/areas/[id]
2. For each new section (has `_tempId`): POST /api/areas/[id]/sections
3. For each changed section (has `id`, and differs from original): PATCH
4. For each deleted section (was in original, not in pendingSections): DELETE

Invalidate/refetch on success — the existing code likely calls `router.refresh()` or a refetch callback; follow the existing pattern.

### Step 5.6: Manual verification

1. Open dev server, log in as admin
2. Click Main Game card → modal opens
3. Should see 5 seeded sections with 0% each
4. Change Map Design to 50 → top progress bar should show 10% (50/5)
5. Click "+ Add section" → new empty row appears
6. Type name, progress → top bar recalcs
7. Click × on a section → row disappears, top bar recalcs
8. Click Save → modal closes, home page card shows updated rollup
9. Re-open modal → changes persisted

### Step 5.7: Commit

```bash
git add src/components/dashboard/DashboardAreaCard.tsx
git commit -m "feat(admin): editable sections in area edit modal

- Sections list with inline name + progress inputs
- Add/delete rows with live-computed area progress at top
- Save handler diffs local vs server state: POST new, PATCH changed, DELETE removed
- Progress bar at top is now read-only, computed from sections via
  computeAreaProgress (falls back to area.progress when no sections)"
```

---

## Task 6: Investor modal — read-only sections

**Files:**
- Modify: `src/components/dashboard/InvestorAreaCard.tsx`

### Step 6.1: Read current modal structure

Read `src/components/dashboard/InvestorAreaCard.tsx` to understand its modal layout. The investor modal shows area details read-only.

### Step 6.2: Add sections display block

In the investor modal (after the progress bar, before any tasks list), add:

```tsx
{area.sections && area.sections.length > 0 && (
  <div className="mb-5">
    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Sections</span>
    <ul className="space-y-2">
      {area.sections.map((section) => (
        <li key={section.id} className="flex items-center gap-3">
          <span className="flex-1 text-xs text-foreground">{section.name}</span>
          <span className="text-xs font-mono tabular-nums text-muted-foreground w-10 text-right">{section.progress}%</span>
          <div className="w-24 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-seeko-accent"
              style={{ width: `${section.progress}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  </div>
)}
```

Only renders if sections exist (Fighting Club shows nothing).

### Step 6.3: Manual verification

1. Log in as investor (or use admin with investor view)
2. Visit `/investor` or wherever InvestorAreaCard renders
3. Click Main Game card → modal shows 5 sections with progress bars (read-only)
4. Click Fighting Club (no sections) → modal shows NO sections block (just the existing fields)

### Step 6.4: Commit

```bash
git add src/components/dashboard/InvestorAreaCard.tsx
git commit -m "feat(investor): read-only sections list in area modal

Renders each section with name + % + mini progress bar when the area
has sections. Hidden for areas without sections."
```

---

## Task 7: Docs + verification

**Files:**
- Modify: `docs/personas/ia.md`

### Step 7.1: Update the IA persona

Add a new table section after the `areas` definition in `docs/personas/ia.md`:

```markdown
### 3b. area_sections

| Column     | Type       | Notes                                 |
|------------|------------|---------------------------------------|
| id         | uuid (PK)  | Auto-generated                        |
| area_id    | uuid (FK)  | → areas.id, cascade delete            |
| name       | text       | e.g., "Map Design"                    |
| progress   | int        | 0-100, CHECK constrained              |
| sort_order | int        | Display order within an area          |
| created_at | timestamptz|                                       |

**Trigger:** `area_sections_progress_trigger` recalculates `areas.progress`
as the rounded AVG of its sections on INSERT/UPDATE/DELETE. If an area
has zero sections, `areas.progress` is not touched (manual value preserved).
```

Also update the Content Hierarchy diagram to show `area_sections` under `areas`.

### Step 7.2: Run full verification

```bash
cd /Volumes/CODEUSER/seeko-studio
npx vitest run 2>&1 | tail -6     # all tests pass
npx tsc --noEmit 2>&1 | grep -v "\.next/types/validator"  # no new errors
```

### Step 7.3: Acceptance checklist

Manually verify:
- [ ] Admin can open Main Game modal and see 5 seeded sections
- [ ] Editing section progress updates the top progress bar live (before save)
- [ ] Saving persists changes — reload confirms
- [ ] Adding a new section appends it; saving persists
- [ ] Deleting a section removes it; saving persists
- [ ] Home page card shows computed area.progress after saves
- [ ] Fighting Club modal (no sections) still works and shows empty sections list + Add button
- [ ] Investor modal shows read-only sections for Main Game, nothing for Fighting Club
- [ ] Fighting Club area.progress unchanged after sections added to Main Game

### Step 7.4: Commit

```bash
git add docs/personas/ia.md
git commit -m "docs(ia): document area_sections table and progress trigger"
```

---

## Summary

- **7 tasks**, each committable independently
- **4 TDD tests** for `computeAreaProgress`
- **1 migration** (schema + trigger + RLS + seed)
- **3 new API routes** (admin-only CRUD)
- **2 modal UI updates** (admin editable, investor read-only)
- **No changes to home page** — uses denormalized `area.progress`
