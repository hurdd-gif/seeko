# Sidebar Icon Rail Redesign — Design

**Goal:** Replace the full-width desktop sidebar with a minimal floating icon rail to reduce visual distraction while keeping navigation fast.

**Scope:** Desktop only. Mobile (header + bottom tab bar) stays unchanged.

---

## Layout

- **Left side:** Floating icon rail, ~48px wide, ~8px margin from left edge, vertically positioned near top
- **Rail shape:** `rounded-xl`, `bg-card` (`oklch(0.14 0 0)`), `border border-white/[0.06]`, subtle shadow
- **Content area:** Takes remaining width, same as current (minus the sidebar width savings)
- **Mobile:** Untouched — keeps existing header + bottom tab bar

## Rail Contents (top to bottom)

1. **SEEKO logo** — small `seeko-s.png`, acts as home link (Overview `/`)
2. **Subtle separator** — 1px line or gap
3. **Core nav icons:**
   - Overview — LayoutDashboard
   - Tasks — CheckSquare
   - Docs — FileText
   - Activity — Activity
4. **Admin separator** (admins only) — subtle gap
5. **Payments** (admins only) — DollarSign

Total: 4-5 icons. Compact and scannable.

## Interactions

- **Click** → navigates to page immediately (no panel, no intermediate state)
- **Hover** → tooltip appears to the right with page name
- **Active state** → icon turns `text-seeko-accent` (#6ee7b7), subtle pill-shaped background highlight animated with `layoutId`
- **Hover micro-interaction** → `whileHover: { scale: 1.1 }`, `whileTap: { scale: 0.9 }`

## User Controls (Page Headers)

Move avatar + notifications out of sidebar, into each page's existing header:

- **Right side of page header:** notification bell + avatar
- **Avatar click** → popover with:
  - Display name + email
  - Settings link
  - Team link (moved from rail — secondary nav)
  - External Signing link (admin only)
  - Investor Panel link (admin only)
  - Sign Out (with existing confirmation flow)
- **NotificationBell** → existing component, repositioned

## Motion Design

| Element | Pattern | Spring Config | Details |
|---------|---------|---------------|---------|
| Rail mount | Fade + slide | smooth (stiffness: 300, damping: 25) | `opacity: 0, x: -8` → `opacity: 1, x: 0` |
| Active indicator | Shared layout (`layoutId="nav-active"`) | snappy (stiffness: 500, damping: 30) | Pill slides between icons on navigate |
| Icon hover | whileHover + whileTap | snappy (stiffness: 500, damping: 30) | `scale: 1.1` hover, `scale: 0.9` tap |
| Tooltip | Fade + offset | snappy | `opacity: 0, x: -4, scale: 0.95` → full |
| Avatar popover | AnimatePresence + scale | smooth (stiffness: 300, damping: 25) | Scale from origin point |
| Notification badge | Bouncy entrance | bouncy (stiffness: 400, damping: 15) | Scale bounce on count change |

**No motion on:** navigation clicks, idle states. Content first, motion as feedback only.

## What Gets Removed

- 240px expanded sidebar state (no more expand/collapse)
- Sidebar user section (avatar, name, email, settings, sign out)
- Chevron toggle button
- Team nav item from primary nav (moves to avatar popover)
- External Signing and Investor nav items from primary nav (move to avatar popover)

## What Stays

- Mobile header + bottom tab bar — untouched
- All existing pages and routes — no URL changes
- Command palette (Cmd+K) — power-user nav shortcut
- Tour integration — step IDs move to new rail icons
- Haptics feedback on interactions

## Visual Reference

- Rail aesthetic: similar to VS Code activity bar but floating with rounded corners
- User controls: similar to Linear's page-header approach
- Tooltip style: reuse existing sidebar tooltip spring config
- Overall: `oklch(0.14 0 0)` card on `oklch(0.10 0 0)` background, `border-white/[0.06]`

## Risk / Watch-outs

- **Tour integration:** Onboarding tour targets sidebar nav items by ID. Rail icons need the same IDs or tour steps need updating.
- **Keyboard nav:** Ensure rail icons are focusable and arrow-key navigable for accessibility.
- **Large monitors:** Rail should not feel lost on ultrawide screens. The floating treatment + subtle border/shadow should provide enough visual weight.
- **Admin items in popover:** External Signing and Investor links become 2 clicks instead of 1. Acceptable since they're used infrequently; Cmd+K remains the fast path.
