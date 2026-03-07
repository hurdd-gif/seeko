# Mobile Audit & Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken/unusable mobile experience across the dashboard and investor panel — layout, navigation, and visual polish.

**Architecture:** Audit-first: run impeccable `/audit` on each file in scope, triage by severity (blocking → major → minor), then fix using `/adapt`, `/polish`, and `/interface-craft` skills. Verify with `visual-qa` at 390px and 430px viewports.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 (CSS-based config in `globals.css`) · shadcn/ui · Motion (Framer Motion) · impeccable skills

---

## Known Issues (pre-audit)

These are confirmed bugs spotted during design — fix these regardless of what the audit adds:

| # | File | Issue |
|---|------|-------|
| K1 | `(dashboard)/layout.tsx` + `(investor)/layout.tsx` | `pb-[max(14rem,...)]` = ~224px bottom padding; pill nav is ~60px. Overcrowds content upward. |
| K2 | `(investor)/layout.tsx` | Missing `pt-[env(safe-area-inset-top)]` — content clips under Dynamic Island / notch |
| K3 | `Sidebar.tsx` mobile header | `background: 'rgba(0,0,0,0)'` — fully transparent header, invisible over dark content |
| K4 | `Sidebar.tsx` pill nav | 6 items (admin) × `minWidth: 44px` = 264px minimum; tight on 320px iPhone SE with padding |

---

## Phase 1: Audit

### Task 1: Audit layout wrappers

**Files:**
- Read: `src/app/(dashboard)/layout.tsx`
- Read: `src/app/(investor)/layout.tsx`

**Step 1: Run `/audit` on dashboard layout**

Invoke the `audit` impeccable skill on `src/app/(dashboard)/layout.tsx`.
Record every finding with its severity (blocking / major / minor) in a scratch list.

**Step 2: Run `/audit` on investor layout**

Invoke the `audit` impeccable skill on `src/app/(investor)/layout.tsx`.
Record findings.

**Step 3: Commit audit notes**

```bash
git add docs/plans/2026-03-06-mobile-audit-fix.md
git commit -m "docs: add mobile audit findings for layout wrappers"
```

---

### Task 2: Audit navigation components

**Files:**
- Read: `src/components/layout/Sidebar.tsx`
- Read: `src/components/layout/InvestorSidebar.tsx`

**Step 1: Run `/audit` on Sidebar**

Invoke `audit` on `src/components/layout/Sidebar.tsx`.
Focus on the mobile sections (lines 398–496): pill nav, header, portal rendering.
Record findings.

**Step 2: Run `/audit` on InvestorSidebar**

Invoke `audit` on `src/components/layout/InvestorSidebar.tsx`.
Record findings.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-06-mobile-audit-fix.md
git commit -m "docs: add mobile audit findings for navigation components"
```

---

### Task 3: Audit dashboard pages

**Files:**
- Read: `src/app/(dashboard)/page.tsx`
- Read: `src/app/(dashboard)/tasks/page.tsx`

**Step 1: Run `/audit` on overview page**

Invoke `audit` on `src/app/(dashboard)/page.tsx`.
Pay attention to: stat card grid (single col on mobile), game areas grid, tasks/activity split (`lg:grid-cols-5`).
Record findings.

**Step 2: Run `/audit` on tasks page**

Invoke `audit` on `src/app/(dashboard)/tasks/page.tsx`.
Record findings.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-06-mobile-audit-fix.md
git commit -m "docs: add mobile audit findings for dashboard pages"
```

---

### Task 4: Audit investor pages

**Files:**
- Read: `src/app/(investor)/investor/page.tsx`
- Read: `src/app/(investor)/investor/settings/page.tsx`

**Step 1: Run `/audit` on investor page**

Invoke `audit` on `src/app/(investor)/investor/page.tsx`.
Record findings.

**Step 2: Run `/audit` on investor settings**

Invoke `audit` on `src/app/(investor)/investor/settings/page.tsx`.
Record findings.

**Step 3: Triage all findings**

Review every finding across Tasks 1–4. Tag each:
- `[BLOCKING]` — clips, overflow, missing insets, broken layout
- `[MAJOR]` — tap targets < 44px, unreadable type, broken density
- `[MINOR]` — spacing, color, polish

Add the tagged list as an "Audit Findings" section at the bottom of this plan file.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-06-mobile-audit-fix.md
git commit -m "docs: complete mobile audit triage"
```

---

## Phase 2: Fix Blocking Issues

### Task 5: Fix bottom padding in layout wrappers

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx:43`
- Modify: `src/app/(investor)/layout.tsx:29`

**Context:** The pill nav is approximately 60px tall + `env(safe-area-inset-bottom)`.
The current `14rem` (~224px) leaves a massive dead zone. Target: ~5rem (80px) base,
plus safe-area-inset-bottom. This gives ~20px breathing room above the nav.

**Step 1: Fix dashboard layout bottom padding**

In `src/app/(dashboard)/layout.tsx`, find line 43:
```tsx
<div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-[max(14rem,calc(14rem+env(safe-area-inset-bottom)))] md:pb-8">
```

Change the `pb-*` class to:
```tsx
<div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-[max(5rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-8">
```

**Step 2: Fix investor layout bottom padding**

In `src/app/(investor)/layout.tsx`, find line 29, same pattern. Apply the same change:
```tsx
<div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-[max(5rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-8">
```

**Step 3: Verify visually**

Run `npm run dev`, open on mobile (or browser DevTools at 390px).
Confirm the last content item on the overview page is not excessively pushed up.
The pill nav should sit just below the last visible content with ~20px clearance.

**Step 4: Commit**

```bash
git add src/app/(dashboard)/layout.tsx src/app/(investor)/layout.tsx
git commit -m "fix(mobile): reduce excessive bottom padding in layout wrappers"
```

---

### Task 6: Fix investor layout missing safe-area top inset

**Files:**
- Modify: `src/app/(investor)/layout.tsx:28`

**Context:** Dashboard layout has `pt-[env(safe-area-inset-top)]` on `<main>` (line 42).
Investor layout has `pt-0` — content will clip under notch/Dynamic Island on iPhone.

**Step 1: Read the file**

Read `src/app/(investor)/layout.tsx` to confirm current line 28 value.

**Step 2: Fix the pt-0**

Find `pt-0` on the `<main>` element and replace with:
```tsx
pt-[env(safe-area-inset-top)]
```

So the main element reads:
```tsx
<main className="flex-1 min-w-0 overflow-visible pt-[env(safe-area-inset-top)] md:pt-0 md:overflow-auto">
```

**Step 3: Verify**

In DevTools, enable iPhone 14 Pro device frame. Confirm investor page title is not clipped by Dynamic Island.

**Step 4: Commit**

```bash
git add src/app/(investor)/layout.tsx
git commit -m "fix(mobile): add safe-area-inset-top to investor layout main"
```

---

### Task 7: Fix transparent mobile header

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (~line 407)

**Context:** The mobile header `<header>` has `background: 'rgba(0,0,0,0)'` and `backdropFilter: 'none'` when rendered into the `#dashboard-mobile-header-slot`. This means it's invisible over page content.

**Step 1: Read Sidebar.tsx lines 398–435**

Read the mobile header portal section to confirm current background styles.

**Step 2: Run `/adapt` on the mobile header section**

Invoke the `adapt` impeccable skill focused on the mobile `<header>` element (lines 405–433 in Sidebar.tsx). This will surface correct background/blur treatment for a sticky mobile header over dark content.

**Step 3: Apply the fix**

The header needs a semi-transparent dark background + blur when it floats over content.
Replace the inline style on `<header>`:

```tsx
style={useHeaderSlot ? {
  background: 'rgba(14, 14, 14, 0.85)',
  backdropFilter: 'saturate(180%) blur(12px)',
  WebkitBackdropFilter: 'saturate(180%) blur(12px)',
} : { background: 'rgba(0,0,0,0)', backdropFilter: 'none' }}
```

Also add a `border-b border-border/30` class to the header className string.

**Step 4: Verify**

Load the overview page on mobile. Scroll down — the header should remain visible and legible over all content.

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "fix(mobile): add background blur to mobile header"
```

---

### Task 8: Fix pill nav overflow on small screens

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (MOBILE_PILL constants, ~lines 59–70)

**Context:** Admin users see 6 nav items. At `itemMinWidth: 44`, `itemPaddingX: 8`, `pillPaddingX: 4`, `itemGap: 4`:
Total = 6×44 + 5×4 + 2×4 = 264 + 20 + 8 = 292px — overflows 320px screen.

**Step 1: Recalculate to fit 320px**

Target: fit within `calc(100vw - 24px)` = 296px on 320px screen.
Solve for itemMinWidth with 6 items:
`(296 - 2×4 - 5×4) / 6` = `(296 - 8 - 20) / 6` = `268 / 6` ≈ 44px — exactly at limit.

The pill itself is `w-max` inside `max-w-[calc(100vw-24px)]`, so it will wrap if it exceeds the container.
The real fix: reduce `itemPaddingX` to 6 and `itemMinWidth` to 40. This gives:
`6×40 + 5×4 + 2×4` = `240 + 20 + 8` = 268px — comfortably within 296px.

**Step 2: Update MOBILE_PILL constants**

```ts
const MOBILE_PILL = {
  pillPaddingX: 4,
  pillPaddingY: 5,
  itemGap: 4,
  itemPaddingX: 6,      // was 8
  itemPaddingY: 8,
  itemMinWidth: 40,     // was 44
  iconLabelGap: 2,
  tapScale: 0.94,
  tapSpring: { type: 'spring' as const, stiffness: 450, damping: 28 },
  activeSlideSpring: { type: 'spring' as const, stiffness: 380, damping: 30 },
};
```

**Step 3: Verify at 320px**

DevTools → iPhone SE (375px, but test at 320px too). Confirm all 6 nav items are visible without horizontal scroll. Confirm labels are readable at 10px.

**Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "fix(mobile): reduce pill nav item width to fit 6 items on small screens"
```

---

## Phase 3: Fix Major Issues (from audit)

### Task 9: Apply `/adapt` to overview page

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Step 1: Run `/adapt` on the overview page**

Invoke the `adapt` impeccable skill on `src/app/(dashboard)/page.tsx`.
Focus areas: stat card grid density, game areas grid, tasks/activity two-column layout.

The stat cards currently go `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. On mobile that's 4 tall cards. Consider `grid-cols-2` as the mobile default so stats are scannable at a glance.

**Step 2: Apply adapt recommendations**

Implement the changes surfaced by the skill. Typical expected changes:
- `grid-cols-1` → `grid-cols-2` for stat cards on mobile (4 cards → 2×2 grid)
- Reduce card padding on mobile if flagged
- `gap-4` may need to be `gap-3` on mobile

**Step 3: Verify**

Check overview at 390px. Confirm stat cards read as a compact 2×2 grid, not 4 stacked tall cards.

**Step 4: Commit**

```bash
git add src/app/(dashboard)/page.tsx
git commit -m "fix(mobile): adapt overview page layout for small screens"
```

---

### Task 10: Apply `/adapt` to investor page

**Files:**
- Modify: `src/app/(investor)/investor/page.tsx`

**Step 1: Run `/adapt` on investor page**

Invoke the `adapt` impeccable skill on `src/app/(investor)/investor/page.tsx`.
Focus: game areas grid, recent tasks + this week split.

**Step 2: Apply recommendations**

Implement changes from the skill.

**Step 3: Commit**

```bash
git add src/app/(investor)/investor/page.tsx
git commit -m "fix(mobile): adapt investor page layout for small screens"
```

---

### Task 11: Apply `/adapt` to tasks page

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

**Step 1: Read the tasks page**

Read `src/app/(dashboard)/tasks/page.tsx` to understand current layout.

**Step 2: Run `/adapt`**

Invoke the `adapt` impeccable skill on the tasks page.

**Step 3: Apply recommendations**

Implement changes.

**Step 4: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "fix(mobile): adapt tasks page layout for small screens"
```

---

## Phase 4: Polish

### Task 12: Apply `/polish` to nav components

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/InvestorSidebar.tsx`

**Step 1: Run `/polish` on mobile nav sections**

Invoke the `polish` impeccable skill on the mobile sections of `Sidebar.tsx` (header + pill nav).
Apply the same to `InvestorSidebar.tsx`.

Look for: label font-size legibility, icon/label alignment, active state contrast, pill container visual weight.

**Step 2: Apply polish recommendations**

Implement changes.

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/InvestorSidebar.tsx
git commit -m "polish(mobile): refine nav header and pill nav visual quality"
```

---

### Task 13: Apply `/polish` to overview and investor pages

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/app/(investor)/investor/page.tsx`

**Step 1: Run `/polish` on overview**

Invoke `polish` on `src/app/(dashboard)/page.tsx`. Apply changes.

**Step 2: Run `/polish` on investor page**

Invoke `polish` on `src/app/(investor)/investor/page.tsx`. Apply changes.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/page.tsx src/app/(investor)/investor/page.tsx
git commit -m "polish(mobile): refine overview and investor page visual quality"
```

---

## Phase 5: Motion & Interaction

### Task 14: Apply `/interface-craft` to mobile nav interactions

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Run `/interface-craft` on the mobile pill nav**

Invoke the `interface-craft` skill on the mobile pill nav section of `Sidebar.tsx` (lines ~452–490).
Focus: tap spring feel, active pill slide animation, icon/label micro-animation on switch.

**Step 2: Tune the active pill layoutId animation**

The active pill background uses `layoutId="mobile-nav"` but there's no `<motion.div>` rendering the active background — only the `<Link>` changes color. The active state currently has no sliding indicator.

If `/interface-craft` recommends adding a sliding background:

```tsx
{isActive && (
  <motion.div
    layoutId="mobile-pill-active"
    className="absolute inset-0 rounded-full bg-white/8"
    transition={MOBILE_PILL.activeSlideSpring}
  />
)}
```

Add this inside the `<Link>` (make Link `relative`).

**Step 3: Verify feel**

On mobile, tap between nav items. The active state should slide smoothly, not just recolor. Tapping should have a subtle spring scale.

**Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(mobile): add sliding active indicator to mobile pill nav"
```

---

## Phase 6: Verify

### Task 15: Visual QA at mobile viewports

**Step 1: Run `visual-qa` on key screens**

Invoke the `visual-qa` skill. Check each screen at:
- 390×844 (iPhone 14)
- 430×932 (iPhone 14 Pro Max)
- 375×667 (iPhone SE)

Screens to check:
1. Overview (`/`)
2. Tasks (`/tasks`)
3. Investor Panel (`/investor`)
4. Investor Settings (`/investor/settings`)

**Step 2: Check against success criteria**

- [ ] No content clips under notch or pill nav
- [ ] All tap targets >= 44×44px
- [ ] Bottom padding leaves ~20px above pill nav
- [ ] Mobile header visible over all backgrounds
- [ ] Pill nav fits 6 items on 375px without horizontal scroll
- [ ] Investor top safe-area inset working
- [ ] Dark theme consistent across all screens

**Step 3: Fix any remaining issues found in QA**

Fix inline — commit after each fix with `fix(mobile-qa): ...` prefix.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix(mobile): complete mobile audit and polish pass"
```

---

## Audit Findings

_(Populate this section after running Tasks 1–4)_

| # | File | Finding | Severity |
|---|------|---------|----------|
| - | - | TBD after audit | - |

---

## Reference

- Design doc: `docs/plans/2026-03-06-mobile-audit-fix-design.md`
- Impeccable skills: `audit`, `adapt`, `polish`, `interface-craft`
- Visual QA skill: `visual-qa`
- Tailwind v4 config: `src/app/globals.css` (`@theme inline {}` block)
- Safe-area usage: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`
- Motion library: `motion/react` (Framer Motion)
