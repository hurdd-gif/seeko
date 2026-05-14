# Dashboard Root Redesign — Design Doc

**Date:** 2026-05-13
**Scope:** `src/app/(dashboard)/page.tsx` (the `/` overview page) only — layout chrome (IconRail, DesktopHeader, MobileNav, `max-w-5xl` shell) stays untouched.
**Approach:** A — "Good Evening + Right Rail" (Notion hero + Linear right-rail hybrid).

## Reference

**Paper file (canonical visual direction):**
https://app.paper.design/file/01KK7AC9H7M89EXWA8KD4PR99E/01KK7AC9H7HPGM859QCBZWWQ33

This file is the source of truth for the visual language. Every component decision below cross-references a specific artboard in that file. Re-open the file before implementation, and before any /interface-craft critique pass, to make sure the live build still matches the intent.

### Artboard → Design Decision Map

| Artboard ID | Source UI | Maps to | Section |
|---|---|---|---|
| **8O-0** | Notion "Good evening" dashboard | Hero greeting display headline + subline + sectioned body | §4 Hero |
| **TA-0** | Linear SEEKO project view | Right-rail module column (Properties / Milestones / Progress / Activity) | §6 Right rail |
| **18N-0** | Linear display options panel | Future: `/tasks` filter chip selector (out of scope for this redesign) | §12 |
| **P-0** | Parker hero | Display-size headline weight + tracking | §4 Hero |
| **5S-0**, **SP-0** | Mobbin login / magic-link | Pill CTA geometry, monospace mark restraint | §8 Tokens |
| **6D-0**, **7H-0** | Sunday wordmark / robotics nav | Restraint — no eyebrow chrome, minimal section headers | §5, §6 |
| **3R-0**, **4L-0** | Dark-mode pill tabs / toolbar | Stat pill row geometry (`--radius-pill`) | §8 Tokens |
| **2F-0** | Edge© minimal black bar | Small-caps wordmark restraint — informs what we DON'T do (banned eyebrow chrome) | §2 Constraints |
| **2V-0** | Are.na milestone card | Rail "Next milestone" tile pattern | §6.1 |
| **1D3-0** | Coinbase Base mobile drawer | Mobile rail-collapse accordion pattern | §3 Mobile |
| **1-0** | Parker top nav | Out of scope (layout chrome untouched) | §12 |

---

## 1. Goal

Replace the current Tasks + Activity + Areas stack with a sectioned dashboard that gives admins and team members a synoptic "what's happening, what to ship" view, modeled after Notion's home and Linear's project pages. The redesign borrows Notion's display headline + greeting and Linear's right-rail module pattern, while keeping SEEKO's existing data fetchers and dark theme.

## 2. Constraints

- **Layout chrome unchanged.** No new routes, no new layout components.
- **Dark theme only.** Light mode is out of scope.
- **Reuse existing data fetchers.** No new tables, no new API routes (Quick Note posts to `/api/notes` which already exists for the Telegram bot inbox).
- **Existing pill component (`StatPills`) stays.** Its visual treatment evolves; the component contract doesn't.
- **Sidebar / header / mobile-nav untouched.**
- **Pill geometry only on interactive controls.** Cards keep `--radius: 0.5rem`. New token `--radius-pill: 9999px` for buttons, toggles, badges, stat pills.
- **Eyebrow chrome banned** (small uppercase tracked labels — already a global rule).

## 3. Architecture

### Desktop (≥1024px)

```
┌───────────────────────────────────────────────────────┐
│  Hero — display greeting + subline + stat pills row   │
├──────────────────────────────────┬────────────────────┤
│                                  │  Next milestone    │
│  Tasks (your tasks list)         ├────────────────────┤
│                                  │  Studio progress   │
│                                  ├────────────────────┤
│                                  │  Recent activity   │
│                                  ├────────────────────┤
│                                  │  Quick note*       │
├──────────────────────────────────┴────────────────────┤
│  Game areas — 3-up tile row                           │
└───────────────────────────────────────────────────────┘
```

\* Admin-only.

Grid: `lg:grid-cols-[1fr_280px] lg:gap-6` for the middle row. Areas row stays full-width below.

### Mobile (<1024px)

Single column. Right-rail modules collapse and slot **between** Tasks and Areas as a stacked accordion (`<details>` for milestone/progress/quick-note, full Activity feed inline).

### Files Created

```
src/components/dashboard/
  DashboardHero.tsx          — display greeting + subline + StatPills
  DashboardRail.tsx          — wrapper providing the divide-y column
  RailNextMilestone.tsx
  RailStudioProgress.tsx
  RailRecentActivity.tsx
  RailQuickNote.tsx
```

### Files Modified

```
src/app/(dashboard)/page.tsx — rewired with new components, motion storyboard
src/app/globals.css          — adds --radius-pill, --digit-* tokens
```

### Files Removed / Inlined

```
src/components/dashboard/ActivityFeed.tsx
  → content moves to RailRecentActivity (top 3 items only)
```

The full `/activity` page (separate route) keeps `ActivityFeed` as a component if it's used there; the dashboard-root usage is removed. Verify with grep before deletion.

## 4. Hero

```
text-4xl md:text-5xl font-medium tracking-tight text-balance
"Good evening, karti"   (or morning/afternoon based on hour)

text-sm text-muted-foreground mt-1
"2 blocked, 3 due this week."   (existing buildGreeting() output)

StatPills row — small, pill-radius, with hover micro
```

`buildGreeting()` from the current file is reused as-is. The time-of-day prefix is computed from `new Date().getHours()`:
- 5–11 → "Good morning"
- 12–17 → "Good afternoon"
- 18–4 → "Good evening"

`firstName` falls back to "there" if `display_name` is null.

## 5. Main column — Tasks

`<section>` (no Card chrome — same flatten approach as investor panel Direction B):

```tsx
<section>
  <header className="mb-3">
    <h3 className="text-lg font-semibold">Your Tasks</h3>
    {earliestDeadline && (
      <p className="text-xs text-muted-foreground tabular-nums">…</p>
    )}
  </header>
  <UpcomingTasks tasks={upcoming} team={team} docs={docs} … />
  <ViewAllLink href="/tasks" label="View all tasks" />
</section>
```

Width: `lg:col-span-1` of the 2-col grid (the 1fr side). On mobile, full width.

## 6. Right rail modules

Single divide-y column with no individual card chrome — the rail reads as one continuous surface (Linear pattern):

```tsx
<aside className="divide-y divide-border/60 border border-border/60 rounded-lg overflow-hidden">
  <RailNextMilestone area={…} />
  <RailStudioProgress areas={…} />
  <RailRecentActivity items={activityItems.slice(0, 3)} />
  {isAdmin && <RailQuickNote />}
</aside>
```

Each module = `px-4 py-3.5`, tight vertical rhythm, no internal borders.

### 6.1 RailNextMilestone

Soonest `area.target_date`:

```
NEXT MILESTONE
Main Game · Beta              4 mo
Sep 15
```

- Title row: `text-xs text-muted-foreground` label, area name + phase `text-sm font-medium`
- Right-aligned `tabular-nums` months-out value
- Below: short formatted date `text-xs text-muted-foreground`
- Mirrors the investor panel KPI math (no new logic — extract to `lib/areas.ts` if not already there)

Empty state ("No target dates set") if no areas have `target_date`.

### 6.2 RailStudioProgress

Aggregate progress across all areas:

```
STUDIO PROGRESS
████████████░░░░░░  48%
3 active areas
```

- Thin progress bar (3px tall), `bg-[--color-seeko-accent]` fill, `bg-muted` track, full pill radius
- `tabular-nums` percent, `text-sm font-medium`
- Subline: count of `areas.filter(a => a.status === 'Active').length`

### 6.3 RailRecentActivity

Top 3 items from `fetchActivity(5)` (page already fetches 5; rail takes the first 3):

- Same `ActivityFeedItem` row component as today
- Smaller padding (`gap-2.5` instead of `gap-3`)
- Footer link: `View all` → `/activity` (hidden for contractors)

### 6.4 RailQuickNote (admin-only)

```
QUICK NOTE
[ Drop a thought…           ↵ ]
```

- Single-line input + enter-to-submit (no separate button)
- POSTs to `/api/notes` (existing endpoint used by Telegram bot for the Studio Agents inbox)
- Optimistic clear on submit; toast on error
- `notes.source = 'web'`, `created_by = current user`

If non-admin user, the module is not rendered (no auth check in the component — page-level conditional).

## 7. Motion

```
ENTRANCE STORYBOARD (page load)

    0ms   hero greeting + subline fade-rise (y 20 → 0)
   80ms   stat pills row staggers in (0.04s each)
  200ms   tasks section fade-rise (y 16 → 0)
  300ms   right-rail cascade (4 modules, 0.06s stagger)
  500ms   game areas section — whileInView, once, margin "-100px"
  550ms   area tiles stagger (0.05s each)

SPRINGS

  smooth (cards, sections):   { type: "spring", stiffness: 300, damping: 25 }
  snappy (pills, buttons):    { type: "spring", stiffness: 500, damping: 30 }

MICRO-INTERACTIONS

  stat pill:    whileHover { scale: 1.02 }, whileTap { scale: 0.98 }, snappy
  rail module:  no transform; subtle bg highlight on hover (bg-muted/40)

MID-SESSION STATE CHANGES

  stat pill count change → transitions-dev "number pop-in" (CSS tokens):
    --digit-dur: 500ms
    --digit-distance: 8px
    --digit-stagger: 70ms
    --digit-blur: 2px

ACCESSIBILITY

  prefers-reduced-motion:
    - All Motion stagger and y disabled (opacity-only)
    - Number pop-in falls back to instant set
    - No looping, no parallax
```

Implementation uses `motion/react` (`FadeRise`, `Stagger`, `StaggerItem` — existing components) for the entrance, and a CSS class `t-number` (transitions-dev pattern) on stat pill counts for state-change pops.

## 8. Tokens

Added to `src/app/globals.css` `@theme inline` block:

```css
--radius-pill: 9999px;

/* transitions-dev number pop-in */
--digit-dur: 500ms;
--digit-distance: 8px;
--digit-stagger: 70ms;
--digit-blur: 2px;
--digit-ease: cubic-bezier(0.34, 1.45, 0.64, 1);
--digit-dir-x: 0;
--digit-dir-y: 1;
```

No existing tokens are changed.

## 9. Data flow

`page.tsx` fetches in parallel (unchanged from current):

```ts
const [tasks, areas, team, docs, activity] = await Promise.all([
  isAdmin ? fetchAllTasksWithAssignees() : fetchTasks(user.id),
  fetchAreas(),
  fetchTeam(),
  fetchDocs(),
  fetchActivity(5),
]);
```

New derived values:
- `nextMilestoneArea` — `areas.reduce((acc, a) => …)` for soonest `target_date` (already done in investor panel — extract to `lib/areas.ts:soonestArea(areas)`).
- `avgAreaProgress` — already computed as `avgProgress`.
- `activeAreaCount` — `areas.filter(a => a.status === 'Active').length`.

Quick Note POST handled client-side in `RailQuickNote` (uses existing browser supabase client + RLS, or `/api/notes` route — pick whichever the Telegram inbox uses).

## 10. Empty / loading / error states

| Surface | Empty | Error |
|---|---|---|
| Hero stat pills | All zero counts render normally | n/a |
| Tasks section | Existing "You're all caught up" empty state | "Failed to load" inline |
| Next milestone | "No target dates set" with muted icon | hidden |
| Studio progress | "No active areas" | hidden |
| Recent activity | "No recent activity" | hidden |
| Quick note | placeholder text always present | toast on POST fail |
| Game areas | Section hidden if `areas.length === 0` | n/a |

Loading: `loading.tsx` already exists at `(dashboard)/loading.tsx` — no new skeleton needed unless visual QA flags a flash.

## 11. Testing

**Vitest** (`src/components/dashboard/__tests__/`):
- `DashboardHero.test.tsx` — 3 greeting variants (morning / afternoon / evening), firstName fallback
- `RailNextMilestone.test.tsx` — populated state, no-target-date state
- `RailStudioProgress.test.tsx` — avg math, 0-area state, 100% state
- `RailRecentActivity.test.tsx` — populated, empty, contractor hidden footer
- `RailQuickNote.test.tsx` — submit clears input, error keeps input, non-admin skipped at page level (not in component test)

**Visual QA:** `/interface-craft critique` BEFORE implementation against this doc, and AFTER against the live route. Per standing rule, neither step is optional. Each critique pass should cross-reference the [Paper file](https://app.paper.design/file/01KK7AC9H7M89EXWA8KD4PR99E/01KK7AC9H7HPGM859QCBZWWQ33) — use the artboard map above to verify the live build still matches the intended source artboard for each section.

**Manual smoke checks:**
1. Mobile (<1024px) — rail collapses, areas don't overlap, no horizontal scroll
2. Admin view shows Quick Note, contractor view doesn't
3. Stat pill counts change via task status update → number pop-in fires
4. `prefers-reduced-motion` → no stagger, no y, opacity-only

## 12. Out of scope

- Light mode pass
- Sidebar / IconRail / DesktopHeader changes
- Mobile nav redesign
- New routes (no Linear-style display options panel for `/tasks` yet — separate plan)
- Horizontal card rows (Notion "Recently visited" pattern — separate plan if added later)
- View toggles (My Day / Studio / Activity — would only happen under Approach C, which we rejected)

## 13. Rollout

Single PR, no feature flag — the page swap is contained and easily revertible via git. Branch: `dashboard-root-redesign`. New worktree per the user's one-feature-one-branch rule.

---

*Next step: invoke `writing-plans` skill to produce the bite-sized implementation plan.*
