# New Inbox Component — "Pure Account-Menu" Rebuild — Design Doc

**Date:** 2026-05-18
**Scope:** The Inbox notification dropdown only — `NotificationBell` + its desktop dropdown / mobile bottom sheet, plus a new purpose-built row. Architecture, data layer, realtime, and the three surfaces (desktop dropdown, mobile sheet, live toasts) are **unchanged**.
**Approach:** Purpose-built `InboxRow` + slimmed panels, modeled 1:1 on the SEEKO account-menu popover (`OverviewHeaderActions`). Net new-file count: zero (1 created, 2 deleted).

## Reference

The visual + behavioral source of truth is the **account-menu popover** rendered by `src/components/dashboard/OverviewHeaderActions.tsx` (the pill beside the Inbox bell on Overview). The new Inbox must be visually and behaviorally indistinguishable from it as a list.

| Account-menu element | Maps to | Inbox decision |
|---|---|---|
| `PopoverLink` row (`whileHover x:2`, `SNAPPY`, `px-4 py-3`, `rounded-2xl`, `hover:bg-[#0000000a]`) | Notification row | `InboxRow` inner `motion.button` mirrors it exactly |
| Popover shell (`absolute right-0 top-full mt-[9px] rounded-[20px]` + layered shadow) | Desktop panel | `DesktopNotificationPanel` shell kept exactly as-is (Phase A) |
| `#0d0d0d` / `#808080` type ramp | Row title / meta | Unread `font-medium text-[#0d0d0d]`, read `text-[#808080]` |
| No chips, no dots, quiet glyphs | Row leading icon | Per-kind lucide glyph `size-5 text-[#808080]` on the left |

## 1. Goal

The Inbox dropdown was a port of a dark stacked-panel that has been restyled + repositioned over several passes. The user asked 3× for a **new, purpose-built component**. Brainstorming pinned the motivation to **visual design + interaction model only** — architecture and the three surfaces are fine and stay. The new Inbox should read as a faithful account-menu list: strip the swipe/drag machinery, the hover-reveal X, the colored KIND chips, and the `+N` duplicate stacking — everything that made it a "card" rather than a menu row.

## 2. Constraints / Locked Decisions (from brainstorming)

- **Interaction = pure account-menu.** Row = `motion.button`, `whileHover={{x:2}}` `transition={SNAPPY}`, click → mark read + navigate + close. No swipe, no per-row X, no stacking. "Mark all read" stays in the header only.
- **Icons.** Drop the colored chip. Per-kind lucide glyph as a quiet `size-5 text-[#808080]` icon on the **left**.
- **Unread.** Bold title weight only (`font-medium text-[#0d0d0d]` unread vs `text-[#808080]` read). No dot, no bg wash.
- **Grouping.** Keep "Today / Yesterday / Earlier" labels (sentence-case `#808080`, hairline above each group except the first) but a **flat list** inside each — every notification is its own row (drop `collapseNotifications`).
- **Empty state.** Keep as-is (`CheckCircle2 size-8 text-[#0000001f]` + "You're all caught up").
- **Mobile.** Keep the existing bottom-sheet shell; new rows inside, no swipe.
- **Keep.** Header + Mark all read, per-row body line, per-row timestamp, live-toast suppress-while-open.

### Do NOT regress

- `NotificationBell` wrapper stays a plain non-positioned `<div>` (panel anchors to the header pill's outer `.relative`, matching the account menu).
- `DesktopNotificationPanel` stays `absolute right-0 top-full mt-[9px] w-[400px]` with the exact `rounded-[20px]` + `shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.10)]`.
- Mobile sheet stays portaled with drag-dismiss + scroll lock.
- `NotificationBell` public props unchanged → 3 consumers untouched.
- The separate pre-existing dual-header on Overview is OUT OF SCOPE.

## 3. File-by-File Changes

### Create
- **`src/components/dashboard/notifications/InboxRow.tsx`** — props `{ notification, group, index, stagger, onTap }` (no `onDismiss/onMarkRead/hideClose/noPadding`). Outer `motion.div`: `initial={{opacity:0,y:8}}` → `animate={{opacity:1,y:0}}`, `exit={{opacity:0}}`, `transition={{ ...d.card.spring, delay: index*stagger }}`, no `layout`. Inner `motion.button`: `whileHover={{x:2}}` `transition={SNAPPY}`, class mirrors `PopoverLink`: `flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[#0000000a]`. Left glyph `(KIND_CONFIG[kind] ?? KIND_CONFIG.comment_reply).icon` → `size-5 text-[#808080] shrink-0 mt-px` (ignore `cfg.bg/className`). Title `text-[14px] leading-snug tracking-[-0.28px]` (`font-medium text-[#0d0d0d]` unread / `text-[#808080]` read); optional body `text-xs mt-0.5 line-clamp-2 text-[#808080]`; timestamp `text-[11px] mt-1 text-[#808080]` via `formatTime(created_at, group)`. No `useState`, no motion values, no pointer effects.

### Modify
- **`notifications/utils.ts`** — add `groupNotificationsFlat(notifications): GroupedNotification[]`: bucket by `getTimeGroup`, preserve input order, emit in `['Today','Yesterday','Earlier']` order, omit empty groups, map each 1:1 to `DisplayNotification {…, count:1, ids:[id]}` — no `children`, no merge. Keep `formatTime/getTimeGroup/groupNotifications/collapseNotifications` intact.
- **`NotificationBell.tsx`** — `grouped` memo → `groupNotificationsFlat`; drop `onDismiss`/`onMarkRead` props to both panels; delete now-dead `swipeMarkRead`/`dismissNotification`. Keep `markOneRead/markAllRead/handleNotificationTap`, realtime channel, plain wrapper `<div>`, scroll-lock + suppress-toast effects.
- **`DesktopNotificationPanel.tsx`** — import `InboxRow`; drop `onDismiss/onMarkRead`; replace `.flatMap(... count>1 ...)` with plain `group.items.map(...)`; keep running `rowIndex`, `AnimatePresence mode="popLayout"`, group label + `gi>0` hairline, panel anchoring/shadow/spring and empty state EXACTLY as-is; `stagger={d.panel.rowStagger}`.
- **`MobileNotificationSheet.tsx`** — same row swap + flatten + prop-drop; keep the entire sheet shell (backdrop, `SHEET_SPRING`, `drag="y"`, `onDragEnd` dismiss, scroll lock, drag handle, header X = sheet close, hairline, group labels, empty state); `stagger={MOBILE_ROW_STAGGER}`.
- **`notifications/index.ts`** — remove `NotificationCard` + `NotificationStack` exports, add `InboxRow`.

### Delete
- `src/components/dashboard/notifications/NotificationCard.tsx`
- `src/components/dashboard/notifications/NotificationStack.tsx`

### Untouched (no-regress)
`types.ts`, `constants.ts`, `DialContext.tsx`, `BellToggle.tsx`, `LiveToast*`, all 3 consumers, `BellToggle.test.tsx`.

## 4. TDD: Flat-Grouping Util

Util change is behavior → test first.

1. **(red)** `notifications/__tests__/utils.test.ts`: (1) 3 same-kind/same-title items same day → 1 group "Today", **3 items**, all `count===1`, `children` undefined; (2) mixed days → groups `['Today','Yesterday','Earlier']`, input order preserved within "Today". `npm test` → confirm red.
2. **(green)** Implement `groupNotificationsFlat`; `npm test` → green.

Presentational `InboxRow` and panel/sheet shells are CSS/motion → TDD-exempt.

## 5. Implementation Order

1. red test → 2. `groupNotificationsFlat` green → 3. create `InboxRow` → 4. rewrite `DesktopNotificationPanel` rows → 5. rewrite `MobileNotificationSheet` rows → 6. wire `NotificationBell` (memo + prop drop + dead-code delete) → 7. update barrel → 8. delete `NotificationCard`/`NotificationStack` → 9. `npx tsc --noEmit` → 10. `npm test` → 11. visual QA + `/interface-craft critique`.

## 6. Verification

**Static:** `npm test` all green (new `utils.test.ts` + unaffected `BellToggle.test.tsx`). `npx tsc --noEmit` — no new errors outside `*.test.tsx` (pre-existing TS2582/TS2304 in test files from missing vitest globals is the documented benign baseline — do not "fix"). `grep -rn "NotificationCard\|NotificationStack" src` → zero hits.

**Runtime (dev server `localhost:3000`, existing `ykartix@gmail.com` session):** open Inbox + account menu on Overview, screenshot both; verify identical radius, shadow, `px-4 py-3` rhythm, `mx-4 h-px bg-[#0000000d]` hairline, `#0d0d0d`/`#808080` ramp, `whileHover x:2` feel, `mt-[9px]` anchor. Per-row: left `size-5 #808080` glyph (no chip), unread bold / read gray, no dot, no X, drag does nothing, date labels + hairlines, every notification its own row (no `+N`). Click → de-bolds + navigates + closes; header "Mark all read" clears all; empty state correct. Mobile width → bottom sheet drag-dismiss/backdrop/scroll-lock, pure rows. Live toast suppressed while open. Smoke `PageHeaderUser` (dark) + `MobileNav` bell still mounts/opens.

## 7. Out of Scope

- The pre-existing Overview dual-header artifact.
- Moving static spring/stagger values out of `DialContext.tsx`.
- Any data-layer, realtime, or routing change.
- Light/dark theme work beyond the existing account-menu language.

## 8. Rollout

Lands on the existing `feat/dashboard-paper-redesign` feature branch (Overview/dashboard paper-redesign line; owned by `.worktrees/dashboard-paper-redesign`). No new worktree — this is a sub-task of that feature, not a separate one. Easily revertible: 1 file added, 2 deleted, 4 modified.

---

*Next step: invoke `writing-plans` skill to produce the bite-sized implementation plan.*
