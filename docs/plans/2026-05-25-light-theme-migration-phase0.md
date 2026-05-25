# Light-Theme Migration — Phase 0 (LightShell Foundation) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract a single shared `LightShell` component that owns the light dashboard chrome (`overview-light` canvas + canonical `h-44` pill + shared account pill), then refactor the three existing light surfaces (`/`, `/activity`, `/tasks` board, and `/tasks/[id]`) to consume it with **zero visual change**.

**Architecture:** `LightShell` is a client component rendering the `overview-light fixed inset-0 z-40` scope, a `<header>` with the canonical pill (left) and an optional account pill / actions slot (right), and a `children` body slot each page still owns. It is parameterized (`fill`, `bordered`, `animatePill`, `headerPadding`, `navLabel`, `account`, `actions`, `activeTab`) so each current surface reproduces its present markup exactly — Phase 0 is pure extraction, NOT unification. Dark chrome (`DesktopHeader`/`TopNav`/`PageHeaderUser`/`MobileNav`) is **not touched** in Phase 0 (that's Phase 3). Migrated and un-migrated pages coexist because `LightShell` is `fixed inset-0 z-40` and covers the dark header.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 (`globals.css` `@theme inline` + `.overview-light` scope), motion/react, Vitest + React Testing Library, Playwright MCP for visual QA.

**Branch:** `feat/light-theme-migration` (already anchored).

---

## Pre-flight (do once before Task 1)

**Capture BEFORE baselines** so "zero visual change" is verifiable. Dev server runs from main repo on `localhost:3000`.

- Run: ensure `npm run dev` is up (background id may already exist).
- Use Playwright MCP to screenshot each surface at a fixed viewport (1512×900). **Save with an explicit project-tree path** — never a bare filename (a bare name resolves to the Playwright server cwd `/Volumes/CODEUSER`, the volume root, which trips a TCC disk-access revocation that kills Turbopack). Use paths under `seeko-studio/docs/plans/phase0-baselines/`:
  - `/` → `docs/plans/phase0-baselines/overview-before.png`
  - `/activity` → `docs/plans/phase0-baselines/activity-before.png`
  - `/tasks` (board view) → `docs/plans/phase0-baselines/board-before.png`
  - `/tasks` with right rail open + list view → `docs/plans/phase0-baselines/board-list-before.png`
  - Open the account dropdown on `/` → `docs/plans/phase0-baselines/account-menu-before.png`
- Commit the baselines: `git add docs/plans/phase0-baselines && git commit -m "test(phase0): capture light-surface before baselines"`

---

## Current markup reference (exact — reproduce these)

**Overview** `src/app/(dashboard)/page.tsx:91-131`
- Outer: `overview-light fixed inset-0 z-40 overflow-hidden bg-[var(--ov-bg)] antialiased` (NO `flex`)
- Header: `<header className="flex w-full items-center justify-between px-[52px] pt-6 pb-3">` — NO border, NO inner wrapper, NO `FadeRise`
- Left: plain `<nav className="flex h-[44px] items-center gap-1 rounded-full bg-white px-1.5 shadow-seeko">` (no `aria-label`), `activeTab='overview'`
- Right: `<OverviewHeaderActions … />` (10 props)
- Body `<main>` keeps `flex w-full flex-col items-center px-[52px] pt-[199px] pb-[102px]`

**Activity** `src/app/(dashboard)/activity/page.tsx:37-63`
- Outer: `overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--ov-bg)] antialiased`
- Header: `<header className="shrink-0 border-b border-black/[0.06] bg-[var(--ov-bg)]">` → `<div className="flex items-center gap-3 px-6 py-4">` → `<FadeRise y={6} delay={0.04}>` → `<nav aria-label="Sections" …>`, no active tab
- Right: none
- Body `<main className="min-h-0 flex-1 overflow-y-auto">` unchanged

**Board** `src/components/dashboard/tasks/TasksBoard.tsx:357-435`
- Outer: `overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--ov-bg)] antialiased`
- Header: `<header className="shrink-0 border-b border-black/[0.06] bg-[var(--ov-bg)]">` → `<div className="flex w-full items-center justify-between gap-3 px-[52px] pt-6 pb-3">` → `<FadeRise y={6} delay={0.04}>`(nav `aria-label="Project sections"`, `activeTab='issues'`) + `<FadeRise y={6} delay={0.08}>`(icon cluster)
- Body `<div className="flex min-h-0 flex-1">` (main + rail) unchanged

**Shared TABS (canonical):** `Overview`→`/`, `Issues`→`/tasks`, `Docs`→`/docs`. Tab markup: container `flex h-[44px] items-center gap-1 rounded-full bg-white px-1.5 shadow-seeko`; tab `flex h-[32px] items-center rounded-full px-3 text-[13.5px] font-medium leading-[18px] tracking-[-0.27px]`; active adds `bg-[#0000000d] text-[#626262]`; inactive `text-[#c5c5c5] transition-colors duration-150 ease-out hover:text-[#808080]`.

---

## LightShell contract (build in Task 1)

```tsx
// src/components/dashboard/LightShell.tsx
'use client';

export type AccountPillProps = React.ComponentProps<typeof OverviewHeaderActions>;

interface LightShellProps {
  activeTab?: 'overview' | 'issues' | 'docs'; // pill active chip; undefined = none active
  navLabel?: string;                          // <nav aria-label>; default 'Sections'
  account?: AccountPillProps;                 // when set, render shared account pill (right)
  actions?: React.ReactNode;                  // page-specific right cluster (e.g. board icons)
  fill?: boolean;                             // default false; true => outer adds 'flex flex-col'
  bordered?: boolean;                         // default false; true => header gets border-b
  animatePill?: boolean;                      // default true; wrap pill+right in FadeRise (delays 0.04 / 0.08)
  headerPadding?: string;                     // default 'px-[52px] pt-6 pb-3'
  children: React.ReactNode;
}
```

Rendering rules (must reproduce the three current headers byte-for-byte given the props each page passes):
- Outer `<div>`: `overview-light fixed inset-0 z-40 overflow-hidden bg-[var(--ov-bg)] antialiased` + (`fill ? ' flex flex-col' : ''`).
- `<header>`: `(bordered ? 'shrink-0 border-b border-black/[0.06] bg-[var(--ov-bg)]' : '')`. When `bordered` false, header has no class and the inner div carries the flex/justify; when `bordered` true, inner div carries it. (Implementation note: render the inner row div `flex w-full items-center justify-between gap-3 ${headerPadding}` always inside `<header>`; for the Overview case `bordered=false` the `<header>` element itself can be the row — but to keep ONE structure, always use `<header className={bordered?…:''}><div className="flex w-full items-center justify-between gap-3 {headerPadding}">…`. Verify against the Overview screenshot that the extra wrapper div does not change layout — it does not, because the inner div is the flex row exactly as Overview's `<header>` was.)
- Left pill: shared markup from TABS, `aria-current` from `activeTab`. Wrapped in `<FadeRise y={6} delay={0.04}>` iff `animatePill`, else bare.
- Right: if `account` → `<OverviewHeaderActions {...account} />`; else if `actions` → `{actions}`; else nothing. Wrapped in `<FadeRise y={6} delay={0.08}>` iff `animatePill` AND (account||actions).
- `{children}` after `</header>`.

Per-page invocation (zero-change):
- Overview: `<LightShell activeTab="overview" account={accountProps} animatePill={false}>` (fill=false, bordered=false defaults). `navLabel` irrelevant (Overview nav had none — default 'Sections' adds an aria-label only; confirm that adding `aria-label="Sections"` to Overview's nav is acceptable — it is an a11y improvement, no visual change).
- Activity: `<LightShell navLabel="Sections" fill bordered headerPadding="px-6 py-4">` (activeTab undefined, no account/actions).
- Board: `<LightShell activeTab="issues" navLabel="Project sections" fill bordered actions={<BoardIconCluster …/>}>`.

**Accepted micro-deltas (call out in QA, get user sign-off — do NOT silently ship):**
1. Overview's nav gains `aria-label="Sections"` (a11y only, invisible).
2. Activity keeps its `px-6 py-4` header gutter via `headerPadding` (the known inconsistency vs the family `px-[52px]` is deliberately preserved for zero-change; flag for unification in Phase 3).
If any pixel delta appears beyond these, STOP and fix before commit.

---

## Task 1: Create `LightShell` with unit tests

**Files:**
- Create: `src/components/dashboard/LightShell.tsx`
- Create: `src/components/dashboard/__tests__/LightShell.test.tsx`

**Step 1 — Write the failing test.**
```tsx
import { render, screen, within } from '@testing-library/react';
import { LightShell } from '../LightShell';

// OverviewHeaderActions pulls in dynamic()/motion; mock it to a sentinel so the
// shell test stays focused on shell structure.
vi.mock('../OverviewHeaderActions', () => ({
  OverviewHeaderActions: (p: { email: string }) => <div data-testid="account-pill">{p.email}</div>,
}));

const accountProps = {
  email: 'k@x.com', initials: 'K', isAdmin: false, unreadCount: 0,
  notifications: [], team: [], areas: [],
} as never;

describe('LightShell', () => {
  it('renders the canonical three-tab pill with correct hrefs', () => {
    render(<LightShell>body</LightShell>);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
  });

  it('marks only the activeTab link as aria-current', () => {
    render(<LightShell activeTab="issues">body</LightShell>);
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('renders no aria-current when activeTab is undefined', () => {
    render(<LightShell>body</LightShell>);
    ['Overview', 'Issues', 'Docs'].forEach((n) =>
      expect(screen.getByRole('link', { name: n })).not.toHaveAttribute('aria-current'));
  });

  it('applies navLabel to the nav', () => {
    render(<LightShell navLabel="Project sections">body</LightShell>);
    expect(screen.getByRole('navigation', { name: 'Project sections' })).toBeInTheDocument();
  });

  it('renders the account pill only when account prop is set', () => {
    const { rerender } = render(<LightShell>body</LightShell>);
    expect(screen.queryByTestId('account-pill')).not.toBeInTheDocument();
    rerender(<LightShell account={accountProps}>body</LightShell>);
    expect(screen.getByTestId('account-pill')).toHaveTextContent('k@x.com');
  });

  it('renders the actions slot when provided and no account', () => {
    render(<LightShell actions={<button>New issue</button>}>body</LightShell>);
    expect(screen.getByRole('button', { name: 'New issue' })).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<LightShell><p>page body</p></LightShell>);
    expect(screen.getByText('page body')).toBeInTheDocument();
  });
});
```

**Step 2 — Run, verify it fails.** `npm test -- LightShell` → FAIL (module not found).

**Step 3 — Implement `LightShell.tsx`** per the contract above. Define `TABS` locally (Overview/Issues/Docs). Import `FadeRise` from `@/components/motion`, `OverviewHeaderActions` from `./OverviewHeaderActions`, `Link` from `next/link`. Build pill markup from the exact tab classes in the reference. Apply the rendering rules. Default `navLabel='Sections'`, `animatePill=true`, `headerPadding='px-[52px] pt-6 pb-3'`.

**Step 4 — Run, verify pass.** `npm test -- LightShell` → PASS (7 tests).

**Step 5 — Commit.**
```bash
git add src/components/dashboard/LightShell.tsx src/components/dashboard/__tests__/LightShell.test.tsx
git commit -m "feat(dashboard): add shared LightShell chrome component"
```

---

## Task 2: Refactor Overview (`/`) onto LightShell

**Files:** Modify `src/app/(dashboard)/page.tsx` (the `return` block, ~91-131; keep `<main>…</main>` body verbatim).

**Step 1 — Replace the outer `<div>` + `<header>` + nav + `OverviewHeaderActions`** with:
```tsx
return (
  <LightShell activeTab="overview" animatePill={false} account={{ email: user.email ?? '', initials, displayName: profile?.display_name ?? undefined, avatarUrl: profile?.avatar_url ?? undefined, userId: user.id, isAdmin, unreadCount, notifications, team: team.map((m) => ({ id: m.id, display_name: m.display_name })), areas: areas.map((a) => ({ id: a.id, name: a.name })) }}>
    <main className="flex w-full flex-col items-center px-[52px] pt-[199px] pb-[102px]">
      … unchanged …
    </main>
  </LightShell>
);
```
Remove the now-unused `Link` import and inline `TABS` from `page.tsx` (TABS now lives in LightShell). Import `LightShell`.

**Step 2 — Typecheck/build.** `npm run build` (or `tsc --noEmit`) → no errors. Run `npm test` → existing suites pass.

**Step 3 — Visual QA.** Restart/confirm dev server. Playwright screenshot `/` → `docs/plans/phase0-baselines/overview-after.png` (explicit project path). Compare to `overview-before.png`: must match except the invisible `aria-label`. Also open the account menu → compare to `account-menu-before.png`. If any visible delta, STOP and fix.

**Step 4 — Commit.**
```bash
git add "src/app/(dashboard)/page.tsx" docs/plans/phase0-baselines/overview-after.png
git commit -m "refactor(overview): consume LightShell (no visual change)"
```

---

## Task 3: Refactor Activity (`/activity`) onto LightShell

**Files:** Modify `src/app/(dashboard)/activity/page.tsx` (return block 36-93; keep `<main>` body verbatim).

**Step 1 — Replace** outer `<div>` + `<header>` + `FadeRise` + nav with:
```tsx
return (
  <LightShell navLabel="Sections" fill bordered headerPadding="px-6 py-4">
    <main className="min-h-0 flex-1 overflow-y-auto">
      … unchanged …
    </main>
  </LightShell>
);
```
Remove unused `Link`, `FadeRise` (if no longer used elsewhere in the file — note the body still uses `FadeRise`, so KEEP that import), and inline `TABS`. Import `LightShell`.

**Step 2 — Typecheck + test.** `npm run build`; `npm test`.

**Step 3 — Visual QA.** Screenshot `/activity` → `docs/plans/phase0-baselines/activity-after.png`; compare to `activity-before.png`. Must match (border, px-6 gutter, pill entrance all preserved). STOP on any delta.

**Step 4 — Commit.**
```bash
git add "src/app/(dashboard)/activity/page.tsx" docs/plans/phase0-baselines/activity-after.png
git commit -m "refactor(activity): consume LightShell (no visual change)"
```

---

## Task 4: Refactor Board (`/tasks`) onto LightShell

**Files:** Modify `src/components/dashboard/tasks/TasksBoard.tsx` (357-435 header; keep body `<div className="flex min-h-0 flex-1">…` verbatim).

**Step 1 — Extract the right-side icon cluster** (lines 389-432, the `<div className="flex items-center gap-1">…`) into a local `const boardActions = (<div className="flex items-center gap-1">…</div>);` (it references `isAdmin`, `openComposer`, `filter`, `setFilter`, `team`, `pinnedVisible`, `togglePinned`, `countsByStatus`, `viewMode`, `setViewMode`, `railOpen`, `setRailOpen`, `BoardFilterPopover`, `BoardDisplayPopover`, icons — all in scope in the component body, so define `boardActions` inside the component before `return`).

**Step 2 — Replace** the outer `<div>` + `<header>` with:
```tsx
return (
  <LightShell activeTab="issues" navLabel="Project sections" fill bordered actions={boardActions}>
    <div className="flex min-h-0 flex-1">
      … board + rail, unchanged …
    </div>
  </LightShell>
);
```
Remove the inline pill `<nav>` + its `FadeRise` and the inline `TABS`/`ACTIVE_TAB` (now in LightShell). Import `LightShell`. Keep all other imports the board body needs.

**Step 3 — Typecheck + test.** `npm run build`; `npm test`.

**Step 4 — Visual QA.** Screenshots: board view → `board-after.png`; list view + rail open → `board-list-after.png`. Compare to befores. Verify the icon cluster (New issue/filter/display/view-toggle/rail-toggle) renders identically and the `delay={0.08}` entrance is preserved. STOP on delta.

**Step 5 — Commit.**
```bash
git add src/components/dashboard/tasks/TasksBoard.tsx docs/plans/phase0-baselines/board-after.png docs/plans/phase0-baselines/board-list-after.png
git commit -m "refactor(board): consume LightShell (no visual change)"
```

---

## Task 5: Handle `/tasks/[id]`

**Files:** Inspect `src/app/(dashboard)/tasks/[id]/page.tsx` first.

**Step 1 — Read it.** Determine whether it (a) renders `TasksBoard` (inherits the refactor — nothing to do, just QA), (b) renders its own `overview-light` shell, or (c) renders a dark/in-flow page.
- If (a): no code change; screenshot a task-detail URL before/after to confirm parity. Skip to Step 3.
- If (b): refactor its shell onto `LightShell` mirroring Tasks 2-4 (choose `fill`/`bordered`/`actions` to match its current header exactly; `activeTab="issues"`).
- If (c): it is effectively a dark page → **out of Phase 0 scope**; note it for Phase 1/2 and do nothing here.

**Step 2 — Typecheck + test** if changed.

**Step 3 — Visual QA** the detail route; compare before/after.

**Step 4 — Commit** (only if changed):
```bash
git add "src/app/(dashboard)/tasks/[id]/page.tsx" docs/plans/phase0-baselines/taskdetail-after.png
git commit -m "refactor(task-detail): consume LightShell (no visual change)"
```

---

## Task 6: Phase 0 wrap-up — verification + critique

**Step 1 — Full suite green.** `npm test` → all pass. `npm run build` → clean.
**Step 2 — Dead-code check.** Confirm `OverviewHeaderActions` is now imported ONLY by `LightShell` (grep). Confirm no page still inlines the pill `<nav>` markup (grep for `aria-label="Project sections"` / `bg-white px-1.5 shadow-seeko` → only `LightShell.tsx`).
**Step 3 — `/interface-craft critique`** (AFTER-hook, mandatory) on `/`, `/activity`, `/tasks` to confirm the extraction introduced no craft regressions (entrances, pill spacing, account pill).
**Step 4 — Report the two accepted micro-deltas** to the user for sign-off (Overview nav `aria-label`; Activity `px-6` gutter preserved).
**Step 5 — Update memory** `project_seeko_light_theme_migration.md`: Phase 0 done, LightShell is the canonical light chrome, account pill now lives in LightShell (note the Overview-only rule in `project_seeko_header_chrome_split` is now superseded for light pages).
**Step 6 — Do NOT start Phase 1.** Phase 1 (Settings redesign) gets its own brainstorm/design pass.

---

## Notes / guardrails

- **Do NOT touch** `DesktopHeader`, `TopNav`, `PageHeaderUser`, `MobileNav`, `PaperPageHeader`, or `TopNav.test.tsx` in Phase 0 (Phase 3).
- **Screenshots:** always explicit project-tree paths; never bare filenames (volume-root TCC hazard).
- **Edit main repo directly** (dev server runs from main); no worktree for this work (dashboard redesign is main-only by standing decision).
- **Commit cadence:** one commit per task as specified.
- The pre-existing staged `notifications/*` WIP files are unrelated — leave them staged/untouched; do not include them in Phase 0 commits (use explicit pathspecs as written).
