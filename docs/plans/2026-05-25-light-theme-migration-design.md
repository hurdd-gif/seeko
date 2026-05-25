# Light-Theme Migration — Design

**Date:** 2026-05-25
**Status:** Approved (foundation + sequencing); per-page redesigns each get their own pass
**Topic:** Migrate the remaining dark-chrome dashboard pages onto the light design language established on Overview / board / Activity.

---

## Problem

The dashboard is mid-migration and runs **two chromes at once**:

- **Light overlay pages** (`overview-light fixed inset-0 z-40`): Overview (`/`), Tasks board (`/tasks`, `/tasks/[id]`), Activity (`/activity`). Each renders its own light header (canonical pill + — on Overview — the light account pill) and covers the layout's dark header.
- **Dark chrome pages**: Docs, Settings, Team, Payments, External Signing, Notifications. These show the `(dashboard)/layout.tsx` `DesktopHeader` (= dark `TopNav` pill + `PageHeaderUser` account dropdown) and `MobileNav`.

The split makes the product feel like "two sites." The dark `PageHeaderUser` dropdown is currently the **only** place sign-out / account access exists.

## Goal

Every dashboard page lives in the **light design language**: `--ov-*` token canvas, canonical `h-44` pill (`Overview · Issues · Docs`), `shadow-seeko` surfaces, antialiased type, spring entrances — and a single shared account/sign-out home.

## Decisions (locked with user 2026-05-25)

1. **Depth = full per-page redesign.** Not a bulk recolor. Each page rethinks layout, hierarchy, density, and components in light mode. Each page is its own mini design cycle.
2. **Account access = one shared light account pill on every page.** `OverviewHeaderActions` is promoted into the shared shell (bell + Create + avatar + menu → Activity/Team/Settings/admin/Sign out). **This supersedes the old "account pill is Overview-only" rule**, which was explicitly a mid-migration stopgap.
3. **Structure = a shared `LightShell` component, adopted page-by-page.** Not a big-bang layout flip, not per-page copies. Migrated pages coexist with un-migrated dark pages until the last one flips.

## Scope

**In scope (dark dashboard pages):** `docs`, `settings`, `team`, `payments`, `admin/external-signing`, `notifications`.

**Refactored (no visual change):** `/`, `/activity`, `/tasks`, `/tasks/[id]` — swap their hand-rolled light shells for `LightShell`.

**Out of scope:** the `(investor)` route group (`/investor/*`) — a separate portal with its own layout. NOTE: the account dropdown links to `/investor` but no such page exists under `(dashboard)`; the live target is the `(investor)` portal. Flag/verify this link separately.

---

## Architecture — `LightShell` (Phase 0)

A single client component that is the skeleton for every dashboard page.

```tsx
<LightShell activeTab="docs" account={accountProps} title={...}>
  {/* page body */}
</LightShell>
```

**Renders:**
- `overview-light fixed inset-0 z-40` canvas — scopes `--ov-*` tokens, `bg-[var(--ov-bg)]`, antialiased. (Lifted from what Overview/Activity already do.)
- **Canonical pill** top-left: `Overview · Issues · Docs`, compact `h-44` spec; `activeTab` prop drives the active chip (`undefined` = none active, like Activity).
- **Shared account pill** top-right: `OverviewHeaderActions`, promoted out of Overview. Same on every page. Single home for sign-out.
- `<main>` content slot with the standard `px-[52px]` gutter + entrance timing; optional `title`/`header` prop for the page heading row.

**Coexistence (safety property):** `LightShell` is `fixed inset-0 z-40`, so it covers the layout's dark `DesktopHeader` exactly like Overview does today. Un-migrated pages keep working on dark chrome untouched. Migrate one page at a time; nothing breaks between.

**Mobile:** `LightShell` carries its own responsive header (pill + account pill). A page that adopts `LightShell` no longer needs the dark `MobileNav`; `MobileNav` survives only for un-migrated pages until Phase 3.

**Endgame (Phase 3):** when the last page adopts `LightShell`, fold it into `(dashboard)/layout.tsx`, delete `DesktopHeader` / `TopNav` / `PageHeaderUser` / `MobileNav` / dead `PaperPageHeader`, and update `TopNav.test.tsx` → a `LightShell`/pill test.

---

## Sequencing

| Phase | Theme | Work |
|-------|-------|------|
| **0** | Foundation | Build `LightShell`; refactor `/`, `/activity`, `/tasks`, `/tasks/[id]` onto it with **zero visual change** (proves the abstraction against pages whose correct look is known). |
| **1** | Member-facing | **Settings → Docs → Team** (simple → complex). Settings establishes light form/control patterns; Team (heaviest: 382 lines, inline components, department colors) goes last once patterns exist. |
| **2** | Admin / utility | **Notifications → Payments → External Signing**. Lower traffic, follow Phase 1. |
| **3** | Collapse | Fold `LightShell` into `layout.tsx`; delete dark chrome components; update tests. |

## Per-page redesign process (Phases 1–2)

Each page is its own mini-cycle, not a bulk recolor:

1. `/interface-craft critique` the current dark page (mandatory before-hook).
2. Brainstorm the page's intent/signature (interface-design skill: who/what/feel; reject defaults).
3. Design → user approval → implement on `LightShell`.
4. `/interface-craft critique` after + visual QA against the light family.
5. Ship as its own reviewable increment.

This design doc fully specs **Phase 0**; each page gets its own short design pass when reached, so we don't design six pages blind up front.

---

## Design language reference (the target)

- **Canvas / tokens:** `.overview-light` scope in `globals.css` (`--ov-bg #eeeeee`, `--ov-heading`, `--ov-text`, `--ov-muted`, `--ov-panel`, `--ov-chip-bg`, priority colors, `--ov-shadow-panel/-row`).
- **Elevation:** `--shadow-seeko` (global) for all light bars/popovers/cards — never re-inline.
- **Pill:** `flex h-[44px] items-center gap-1 rounded-full bg-white px-1.5 shadow-seeko`; tab `h-[32px] rounded-full px-3 text-[13.5px] font-medium leading-[18px] tracking-[-0.27px]`; active `bg-[#0000000d] text-[#626262]`, inactive `text-[#c5c5c5] hover:text-[#808080]`.
- **Account pill:** `OverviewHeaderActions` — `w-[244px] h-[44px]` container; dropdown `w-[244px] rounded-[20px] shadow-seeko`, staggered `rowEntrance`.
- **Motion:** `FadeRise` (spring `smooth`), staggered delays (0 / 80 / 160 / 240ms), reduced-motion respected.
- **Craft hooks (every page):** `emil-design-eng` + `make-interfaces-feel-better` baseline; concentric radius; tabular-nums on data; `:active` feedback; exact transition props; no uppercase-tracked eyebrows.

## Testing

- Phase 0: `LightShell` renders pill + account pill; `activeTab` sets `aria-current`; covers dark header. Existing light pages render unchanged (visual QA screenshots in project tree).
- Each page: unit tests for any extracted components; visual QA before/after.
- Phase 3: replace `TopNav.test.tsx` assertions (currently assert dark `Tasks`/`Activity` labels) with `LightShell` pill tests.

## Risks / open items

- **Git state:** repo is currently in **detached HEAD** at `4a40e01` with foreign staged changes (`NotificationBell.tsx`, `DesktopNotificationPanel.tsx`). Resolve branch before committing migration work (one feature → one branch).
- **`/investor` dropdown link** targets a page that doesn't exist under `(dashboard)`; verify it resolves to the `(investor)` portal or fix the link.
- **Activity reachability from board:** unchanged by this migration (still via the account dropdown, now present on all pages — which actually *resolves* the prior board gap once the shared account pill lands).
