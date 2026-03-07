# Mobile Audit & Fix — Design Doc

**Date:** 2026-03-06
**Scope:** Dashboard + Investor experience on mobile
**Approach:** Audit-first (Option A) — surface all issues before writing code

---

## Problem

The mobile dashboard experience is broken/unusable across three dimensions:
- **Content layout** — cards, grids, and spacing not tuned for small screens
- **Navigation** — mobile pill nav and header have structural/visual issues
- **Visual polish** — typography, spacing, color feel rough on mobile

---

## Audit Targets

| File | Owns |
|------|------|
| `src/components/layout/Sidebar.tsx` | Mobile pill nav + top header |
| `src/components/layout/InvestorSidebar.tsx` | Investor mobile nav |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout wrapper |
| `src/app/(dashboard)/page.tsx` | Overview — stat cards, areas, tasks/activity |
| `src/app/(dashboard)/tasks/page.tsx` | Task list |
| `src/app/(investor)/layout.tsx` | Investor layout wrapper |
| `src/app/(investor)/investor/page.tsx` | Investor dashboard |
| `src/app/(investor)/investor/settings/page.tsx` | Investor settings |

---

## Known Issues (pre-audit signal)

- `pb-[max(14rem,calc(14rem+env(safe-area-inset-bottom)))]` — 14rem (~224px) bottom padding is excessive for a ~60px pill nav; pushes content down unnecessarily
- `(investor)/layout.tsx` missing `pt-[env(safe-area-inset-top)]` present in dashboard layout — content may clip under notch/island
- Mobile header has no background or blur — may be invisible over dark content
- Pill nav with 6 items (admin view adds Investor) at `minWidth: 44px` each is ~264px minimum, tight on 320px (iPhone SE)

---

## Fix Workflow

### Step 1 — Audit (`/audit`)
Run impeccable `/audit` on each file in scope. Output: severity-rated issue list covering:
- Responsive breakpoints
- Tap target sizes (minimum 44x44px)
- Overflow and clipping
- Safe-area inset handling
- Spacing density
- Typography legibility on small screens

### Step 2 — Triage
Tag every issue by severity:
- **Blocking** — clipping, overflow, missing safe-area insets, broken layout
- **Major** — tap targets too small, density too high/low, unreadable type
- **Minor** — spacing inconsistency, visual polish

Fix blocking issues first, then major, then minor.

### Step 3 — Fix (impeccable + interface-craft)
| Concern | Skill |
|---------|-------|
| Responsive layout, safe-area insets, mobile density | `/adapt` |
| Typography legibility, spacing consistency | `/polish` |
| Nav micro-interactions, tap springs, active pill motion | `/interface-craft` |

### Step 4 — Verify (`visual-qa`)
Screenshot key screens at 390px (iPhone 14) and 430px (iPhone 14 Pro Max) viewports. Check against design intent.

---

## Success Criteria

- No content clips under notch, home indicator, or pill nav
- All tap targets >= 44x44px
- Bottom padding scales correctly with pill nav height + safe-area
- Mobile header visible over all page backgrounds
- Pill nav fits 6 items on 320px screen without overflow
- Investor layout has correct top safe-area inset
- Visual consistency with desktop dark theme

---

## Implementation Plan

Saved separately via `writing-plans` skill.
