# Light Theme Migration — Phase 1: Team

> **For Claude:** Final Phase 1 page. Mirrors the Settings/Docs per-page cycle. Direct execution (subagent mkdir fails on /Volumes/CODEUSER) with the same discipline: baseline-first commits, file-scoped, hold invariants (tsc=190, 12-fail test baseline, notifications WIP=10), never `git add -A`.

**Goal:** Migrate `/team` (single server-component page + its admin controls) from dark chrome onto SEEKO's light language, consistent with Overview/board/Activity/Settings/Docs.

**Architecture:** Wrap the page in `LightShell` with a breadcrumb `leftSlot` (`‹ Team` → `/`), exactly like Settings. Convert dark cards → white `shadow-seeko`; strip the banned uppercase-tracked dept/Contractors eyebrows → sentence-case + inline muted count (Docs idiom); apply the approved restrained light department palette; relight badges, online dots, avatars, and the two admin controls (`DepartmentSelect`, `ContractorToggle`) + `InviteForm` via opt-in `light` props.

**Approved design decisions (user, 2026-05-26):**
- **Restrained light dept hues** (distinct per-dept identity, AA-on-white): Coding `#0a63cc` (5.7:1), Visual Art `#3f5fb5` (6.0:1), UI/UX `#6e4fc4` (5.9:1), Animation `#946a00` (4.9:1), Asset Creation `#bd3f7c` (5.3:1). Badge tints = hue/10 (amber tint uses `#b8801a`/10 wash, `#946a00` text). `#0d7aff` stays for online dot only.
- **One white card, grouped divide-y rows** (keep current IA; do NOT split into per-dept cards).

**Tech stack:** Next.js 16 RSC, React 19, Tailwind v4, motion/react, Vitest, Playwright MCP.

---

## Task 1: Add `LIGHT_DEPT_COLOR` map to lightKit

**Files:** Modify `src/components/dashboard/lightKit.ts`

Add the approved light dept text-color map + tint map. Keep dark map where it lives (page/DepartmentSelect own their dark maps).

```ts
/** Restrained AA-on-white department label colors (see phase1-team plan). */
export const LIGHT_DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-[#0a63cc]',
  'Visual Art':     'text-[#3f5fb5]',
  'UI/UX':          'text-[#6e4fc4]',
  'Animation':      'text-[#946a00]',
  'Asset Creation': 'text-[#bd3f7c]',
};
/** Matching badge backgrounds (text color + /10 tint). */
export const LIGHT_DEPT_BADGE: Record<string, string> = {
  'Coding':         'bg-[#0a63cc]/10 text-[#0a63cc]',
  'Visual Art':     'bg-[#3f5fb5]/10 text-[#3f5fb5]',
  'UI/UX':          'bg-[#6e4fc4]/10 text-[#6e4fc4]',
  'Animation':      'bg-[#b8801a]/10 text-[#946a00]',
  'Asset Creation': 'bg-[#bd3f7c]/10 text-[#bd3f7c]',
};
```

Commit: `feat(team): light department color map in lightKit`

---

## Task 2: Opt-in `light` prop on DepartmentSelect

**Files:** Modify `src/components/dashboard/DepartmentSelect.tsx`

- Add `light?: boolean` (default false). When set: pass `light` to `<Select>`, use `LIGHT_DEPT_COLOR` instead of the dark map, and swap hover tokens (`hover:border-border hover:bg-muted` → `hover:border-black/15 hover:bg-black/[0.04]`), placeholder/no-dept → `text-[#808080]`.
- Dark branch unchanged → no other consumer affected.

Verify: `npx tsc --noEmit` (no new errors). Commit: `feat(team): DepartmentSelect opt-in light prop`

---

## Task 3: Opt-in `light` prop on ContractorToggle

**Files:** Modify `src/components/dashboard/ContractorToggle.tsx`

- Add `light?: boolean`. Light trigger: `text-[#808080] hover:text-[#111]`. Light confirm modal: backdrop `bg-black/20`; panel `border-black/[0.06] bg-white shadow-seeko`; title `text-[#111]`; body `text-[#808080]`; Confirm = `bg-[#111] text-white hover:bg-[#2a2a2a]` (DIALOG_SAVE); Cancel = `DIALOG_CANCEL`; close X `text-[#9a9a9a] hover:text-[#111]`.
- Dark branch unchanged.

Verify tsc. Commit: `feat(team): ContractorToggle opt-in light prop`

---

## Task 4: Relight InviteForm

**Files:** Modify `src/components/dashboard/InviteForm.tsx`

- `Card` → `overflow-hidden rounded-2xl bg-white shadow-seeko` (via contentless wrapper or className). Trigger header: `UserPlus`/chevron → `text-[#808080]`; `CardTitle` → `text-[#111]`, `CardDescription` → `text-[#808080]`.
- Inputs → `LIGHT_INPUT`; `Label` → `text-[#808080]`; both `Select` → `light`; `Button` → `BTN_PRIMARY` (black pill).
- Result banner: success `bg-[#0d7aff]/10 text-[#0a63cc]`; error `bg-[#d4503e]/10 text-[#d4503e]`.

Verify tsc. Commit: `feat(team): light InviteForm`

---

## Task 5: Baseline-commit team/page.tsx WIP, then relight

**Files:** Modify `src/app/(dashboard)/team/page.tsx`

**Step 1 — baseline-first:** commit the existing emerald→sky umbrella WIP AS-IS:
`git commit -m "chore(team): baseline emerald->sky accent WIP" -- "src/app/(dashboard)/team/page.tsx"`
Verify `git show --stat HEAD` = only that file; `git status --porcelain | grep -c notifications` = 10.

**Step 2 — relight (clean refactor on top):**
- Wrap return in `<LightShell fill bordered leftSlot={breadcrumb}>` + scrollable `<main>` + centered `max-w-3xl px-6 py-10` body (Settings idiom). Breadcrumb = `‹ Team` → `/`. Keep page h1 "Team" + "{n} people".
- Header text `text-foreground`/`text-muted-foreground` → `text-[#111]`/`text-[#808080]`.
- `DEPT_COLOR` (local dark map) → import `LIGHT_DEPT_COLOR`/`LIGHT_DEPT_BADGE` from lightKit.
- `Card`/`CardContent` → white `rounded-2xl bg-white shadow-seeko` + `p-*`.
- **DepartmentSection label:** drop `uppercase tracking-widest`; sentence-case `text-[13px] font-medium` in the dept hue; divider `h-px bg-black/[0.06]` (HAIRLINE); count `text-[#9a9a9a]`.
- **Contractors header:** same treatment; `Globe` → `text-[#808080]`; label `text-[#808080]` (neutral, not a dept).
- **MemberRow:** `InteractiveRow` hover → light (`hover:bg-black/[0.04]`); name `text-[#111]`; role/tz `text-[#808080]`; tz dot separators `text-[#c8c8c8]`; online dot `bg-[#0d7aff]`/offline `bg-[#c8c8c8]` with `ring-white`; avatar fallback `bg-[#f4f4f4] text-[#505050]`; avatar `outline outline-1 -outline-offset-1 outline-black/[0.06]` (image-outline guideline); dept badge → `LIGHT_DEPT_BADGE`; last-seen `text-[#0a63cc]`(online)/`text-[#9a9a9a]`(offline).
- **NdaBadge:** Exempt → neutral outline `border-black/[0.08] text-[#808080]`; NDA ✓ → `border-[#0a63cc]/30 text-[#0a63cc]`; NDA Pending → `border-[#b8801a]/40 text-[#946a00]`. Lead badge → neutral outline.
- **OnlineCluster:** avatar `ring-white`; fallback `bg-[#f4f4f4] text-[#505050]`; "+N" chip `bg-black/[0.04] text-[#808080]`; "N online" `text-[#0a63cc] font-medium`.
- **EmptyState invisible-title fix:** the shared `<EmptyState>` baked `text-foreground` title is invisible on white. Replace the two `<EmptyState>` usages with a local light empty block (icon in `bg-[#f4f4f4]` circle, title `text-[#111]`, desc `text-[#808080]`) — mirror DocList's local empty state. Do NOT edit the shared component.
- `DepartmentSelect`/`ContractorToggle` calls → pass `light`.
- `InviteForm` already light (Task 4).

Verify: tsc no new; `npm test` 12-fail baseline; `git show --stat HEAD` only team/page.tsx; notifications=10.
Commit: `feat(team): migrate /team onto light LightShell + breadcrumb (Phase 1)`

---

## Task 6: QA + AFTER critique + memory

- Visual QA at 1440 + 390 (admin view): screenshots → `docs/plans/phase1-baselines/team-after*.png` (capture to /Volumes/CODEUSER root via Playwright, `mv` same-volume into tree).
- AFTER `/interface-craft` critique vs `team-before.png`: confirm eyebrows gone, white cards, dept hues legible/restrained, badges/dots/avatars light, chrome consistent with Overview/board/Settings/Docs, InviteForm + admin controls + ContractorToggle modal light. Fix trivial inline (file-scoped); surface debatable to user.
- Commit after-screenshots file-scoped.
- Memory: add "Phase 1 — Team DONE" → **Phase 1 COMPLETE** to `project_seeko_light_theme_migration.md`; update MEMORY.md pointer. Note: Phase 2 (Notifications/Payments/External Signing) is next; Phase 3 folds LightShell into layout + deletes dark chrome.

---

## Final review
Dispatch final code-quality review over the whole Team diff range, then `finishing-a-development-branch` (branch stays as-is per umbrella — user keeps it).
