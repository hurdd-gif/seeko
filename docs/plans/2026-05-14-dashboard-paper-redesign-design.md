# Dashboard Root — Paper Redesign Design

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` to break this design into a bite-sized implementation plan once approved.

**Goal:** Reskin the dashboard root to match the Notion "Good evening" centered-column layout from Paper file `01KK7AC9H7M89EXWA8KD4PR99E` (frame `8O-0`), populated with SEEKO-native content.

**Architecture:** Single 900px centered column inside the existing sidebar shell. Six stacked sections separated by 40px. Two reusable structural patterns: **tile row** (Recently worked on, Quick notes) and **split panel** (Today's tasks, Next milestone, Studio progress). Game areas keeps its tile grid but adopts the new chrome.

**Tech Stack:** Next.js 16 RSC, `motion/react` storyboard, Tailwind v4 tokens, existing `fetchTasks` / `fetchAreas` data layer + two new helpers.

---

## 1. Source specs (extracted from Paper file)

Verified via `mcp__paper__get_computed_styles` and `mcp__paper__get_jsx`:

| Element | Spec |
| --- | --- |
| Container fill / text | `#F0EFED` (cream-white) |
| Muted text | `#ADA9A3` (warm gray) |
| Panel surface | `rgba(32, 32, 32, 0.9)` + `backdrop-filter: blur(48px)` |
| Panel radius | `12px` |
| Content column | `900px` wide, centered |
| Section gap | `40px` |
| Hero | system-ui `30px / 600 / 120%`, `marginTop: 64px`, `paddingInline: 80px` |
| Section eyebrow | system-ui `12px / 500 / 150%`, `#ADA9A3`, sentence case, 16×16 icon + 8px gap, marginLeft 8px, paddingBottom 14px |
| Eyebrow → content gap | `14px` |

**Sentence case only.** Never uppercase-track these eyebrows — banned per global feedback memory.

---

## 2. Page shell & tokens

- `src/app/(dashboard)/page.tsx` becomes a thin RSC that fetches data and composes sections.
- Outer wrapper: `max-w-[900px] mx-auto py-20 px-6` — the 900px column lives inside `main`, sidebar untouched.
- Section list uses `flex flex-col gap-10` (40px).
- New CSS tokens in `globals.css` `@theme inline`:
  - `--color-glass: rgba(32, 32, 32, 0.9)`
  - `--color-eyebrow: #ADA9A3` (already approximated by `--color-muted-foreground` — verify before adding)
- Body background gets a subtle radial gradient so the 48px backdrop blur actually picks up tonal variation: `bg-[radial-gradient(circle_at_top,oklch(0.14_0_0),oklch(0.10_0_0))]`. Without this the blur is a no-op.

---

## 3. Hero — `DashboardHero`

```
              Hey, Karti
```

- Single line, centered, `text-[30px] font-semibold leading-[1.2]`.
- Time-of-day greeting (existing `buildGreeting` helper already does this — reuse).
- `mt-16` (64px) above, `px-20` (80px) horizontal inside the 900 column.
- Animates fade + y20 → 0 at 0ms.

---

## 4. Recently worked on — `RecentItemsRow`

Tile row of 6 items. Each tile shows: icon (task / doc / area), 2-line title, relative date.

**Layout per tile:** 144×96, `rounded-xl`, glass surface, `p-3`, icon top-left in `#ADA9A3`, title `text-sm`, date `text-xs text-muted-foreground`.

**Row:** `flex gap-2 overflow-x-auto snap-x snap-mandatory` — real horizontal scroll on narrow viewports.

**Data:** new helper in `src/lib/supabase/data.ts`:

```ts
type RecentItem = {
  id: string;
  kind: 'task' | 'doc' | 'area';
  title: string;
  updated_at: string;
  href: string;
};
export async function fetchRecentItems(userId: string, limit = 6): Promise<RecentItem[]>;
```

Backed by a union of `tasks ORDER BY updated_at DESC` + `docs ORDER BY updated_at DESC` + `areas ORDER BY updated_at DESC` filtered to items the user has actually touched (assignee or author or last_viewer column TBD — start with `updated_by = userId OR assignee_id = userId`).

Stagger entrance: 120ms base + 40ms per tile.

---

## 5. Today's tasks — `TodaysTasksPanel` (split panel pattern)

Why this section exists: the literal Paper frame has no task list, but SEEKO's dashboard *is* a task tool. We insert this section right after Recently worked on so the primary job-to-be-done isn't buried.

**Left half (200px):**
- Eyebrow-style "Today" pill
- Big number — count of tasks due today
- Sub: "Y in flight"
- CTA link `View all tasks →` (links to `/tasks`)

**Right half (flex-1):**
- 5 task rows, each: chevron priority icon + task name (truncate-1) + department dot + due date or status pill on the right
- Reuses the existing chevron icon system (ChevronsUp / ChevronUp / ChevronDown) from the prior redesign

**Empty state:** when no tasks due today, left half shows "All clear today." and right half lists the next 5 upcoming.

---

## 6. Next milestone — `NextMilestonePanel` (split panel pattern)

**Left half:** current phase name (large, 24/600), "X areas · Y tasks remaining", CTA `Open phase plan →`.

**Right half:** 3–4 upcoming dated milestones (date · name · area badge), most recent first.

**Data:** reuse `fetchAreas` + derive milestone rows from `area.phase` + future enhancement to add a `milestones` table (out of scope for this redesign — for now, derive from area deadlines).

---

## 7. Studio progress — `StudioProgressPanel` (split panel pattern)

**Left half:** "Pinned area" — defaults to the most-active area, can be changed via select (deferred to follow-up).

**Right half:** vertical list of all 4–6 game areas — department dot + name + progress bar + `%`.

This replaces the current `RailStudioProgress` rail module on a 1:1 content basis but in horizontal split form.

---

## 8. Game areas — `AreaTileRow`

4-tile row at 200×140. Each tile: area name (16/500), department dot, progress bar at bottom, link to area page.

Visually a wider variant of the Recently worked tile — same radius, same glass surface, same hover behavior.

---

## 9. Quick notes — `QuickNotesRow` (admin only)

3-tile row (200×140). Each tile: note body preview (`line-clamp-3`), edited timestamp, color dot if categorized. Plus a 4th "Add note" tile that opens the existing quick-note composer (we keep its modal, replace its surface).

Reuses the existing `RailQuickNote` composer logic — just rehouses it.

---

## 10. Entrance storyboard

```
   0ms   Hero
 120ms   Recently worked on  (40ms stagger across tiles)
 240ms   Today's tasks
 320ms   Next milestone
 400ms   Studio progress
 480ms   Game areas          (50ms stagger across tiles)
 560ms   Quick notes         (50ms stagger across tiles)
```

- Spring: `{ type: 'spring', visualDuration: 0.5, bounce: 0.15 }`
- Each section animates from `{ opacity: 0, y: 16 }` → `{ opacity: 1, y: 0 }`
- Hero uses `y: 20` instead of 16 (slightly bigger entrance for the headline)
- `prefers-reduced-motion: reduce` disables y + stagger, keeps opacity fade only
- TIMING object lives at the top of `page.tsx` per `/interface-craft storyboard` pattern

---

## 11. Reusable shells

Three new shared components keep this DRY:

```tsx
// src/components/dashboard/SectionEyebrow.tsx
<SectionEyebrow icon={Clock}>Recently worked on</SectionEyebrow>

// src/components/dashboard/TileRow.tsx
<TileRow eyebrow={...} stagger={40}>{tiles}</TileRow>

// src/components/dashboard/SplitPanel.tsx
<SplitPanel eyebrow={...} left={<PanelPromo .../>} right={<PanelList .../>} />
```

`PanelPromo` and `PanelList` are leaf components used inside `SplitPanel`. Glass surface (`bg-[--color-glass] backdrop-blur-[48px] rounded-xl`) lives only on `SplitPanel` and individual `Tile`s — not double-applied.

---

## 12. Files affected

**New**
- `src/components/dashboard/SectionEyebrow.tsx`
- `src/components/dashboard/TileRow.tsx`
- `src/components/dashboard/Tile.tsx`
- `src/components/dashboard/SplitPanel.tsx`
- `src/components/dashboard/PanelPromo.tsx`
- `src/components/dashboard/PanelList.tsx`
- `src/components/dashboard/DashboardHero.tsx`
- `src/components/dashboard/RecentItemsRow.tsx`
- `src/components/dashboard/TodaysTasksPanel.tsx`
- `src/components/dashboard/NextMilestonePanel.tsx`
- `src/components/dashboard/StudioProgressPanel.tsx`
- `src/components/dashboard/AreaTileRow.tsx`
- `src/components/dashboard/QuickNotesRow.tsx`

**Modified**
- `src/app/(dashboard)/page.tsx` — rewrite as thin composer
- `src/lib/supabase/data.ts` — add `fetchRecentItems`, `fetchTodayTasks`
- `src/app/globals.css` — add `--color-glass`, radial-gradient body bg

**Retired (deleted after migration)**
- `src/components/dashboard/DashboardRail.tsx`
- `src/components/dashboard/RailNextMilestone.tsx`
- `src/components/dashboard/RailStudioProgress.tsx`
- `src/components/dashboard/RailRecentActivity.tsx`
- `src/components/dashboard/RailQuickNote.tsx` (composer logic moves into `QuickNotesRow`)
- Stat pills row component (whatever name in current `page.tsx`)

---

## 13. What changes from the prior redesign

| Before (current `feat/studio-agents`) | After (this redesign) |
| --- | --- |
| Hero "Hey, [name]" + time greeting | Same hero — kept |
| Stat pills row with digit pop-in | **Removed.** "Recently worked on" carries the at-a-glance role. |
| Your Tasks list with chevron priority | **Folded into Today's tasks panel** (top 5 only). Full list at `/tasks`. |
| 4-module right rail (Milestone / Progress / Activity / Quick Note) | **Rail gone.** Content promoted into Next milestone, Studio progress, Recently worked on, Quick notes — each becomes a full-width section in the centered column. |
| Game Areas grid | **Kept**, restyled to tile-row pattern. |

---

## 14. Risks & open questions

1. **Backdrop blur over flat near-black is a no-op.** Adding the radial-gradient body bg is required for the panel surfaces to read as "glass" rather than "slightly lighter rectangle". Confirm appetite for this BG change.
2. **Recent items query.** Need to confirm the schema supports `last_viewed_at` on tasks/docs/areas, or we go with `updated_at` (simpler, less precise).
3. **No right rail = empty viewport space on ≥1440px monitors.** The 900px centered column will leave large dead zones. Is that the desired aesthetic (very Notion), or should we widen to 1100–1200px? Notion's actual home is also ~900px — committing to 900.
4. **Sidebar still exists.** Confirm the 900px column lives inside `main` (after sidebar) — not the full viewport. Sidebar width ~240px on desktop → effective max-page-width is sidebar + 900 = ~1140px with breathing room on the right.
5. **Quick notes admin-only.** Carrying that gate forward from the existing rail.

---

## 15. Success criteria

- Dashboard root visually matches the Paper 8O-0 frame's structure and typographic system, with SEEKO content.
- Eyebrows are sentence case, 12/500/150%, in muted gray — no uppercase tracking anywhere.
- Section gap is exactly 40px end-to-end (no double-gap from inner panel padding).
- All 7 sections animate in via the TIMING storyboard at the top of `page.tsx`.
- `prefers-reduced-motion` removes y + stagger.
- `npm run build` and `npm test` pass.
- Post-implementation `/interface-craft critique` finds zero structural issues.

---

## 16. Out of scope

- Sidebar redesign
- `/tasks`, `/areas`, `/docs` page redesigns
- Mobile single-column layout (will be a follow-up — `lg:` breakpoint only for this pass)
- New `milestones` table (Next milestone derives from area phases + deadlines for now)
- Last-viewed tracking (Recent items uses `updated_at` for v1)
