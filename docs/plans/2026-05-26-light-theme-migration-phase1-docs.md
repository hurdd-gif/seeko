# Light-Theme Migration — Phase 1 / Docs (Implementation Plan)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task (fresh implementer subagent per task + spec review + code-quality review between tasks).

**Goal:** Migrate `/docs` — list surface, chrome, and every dialog — from dark chrome onto SEEKO's light design language, matching the already-shipped Settings page.

**Architecture:** Wrap the page in `<LightShell activeTab="docs">`; relight `DocList` into grouped white `shadow-seeko` cards with `divide-y` rows; give `Dialog` an opt-in `light` prop and relight all doc/deck dialogs; scope a light doc-prose variant in `globals.css`. Reuse the Settings style kits via a new shared `lightKit.ts` module.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme inline` — tokens bake at build, so relight via per-element className overrides, NOT runtime token overrides), motion/react, Vitest, Playwright MCP.

**Design doc:** `docs/plans/2026-05-26-light-theme-migration-phase1-docs-design.md` (read it for locked decisions + token/kit reference).

---

## Cross-cutting rules (apply to EVERY task)

- Branch `feat/light-theme-migration` (already checked out). **File-scoped commits only:** `git commit -m "msg" -- <exact paths>`. **NEVER** `git add -A` / `git add .`.
- **Baseline-first** on any file that is already `M`/`??` vs HEAD (`DocList.tsx`, `DocEditor.tsx`, `DepartmentSelect.tsx`, `globals.css`): FIRST commit the existing WIP as-is with an honest `chore(...)` message, THEN make the relight a clean separate commit on top. `-m` must precede the `--` pathspec; untracked files need `git add <path>` before `git commit -- <path>`.
- After EVERY commit: `git show --stat HEAD` (confirm only intended files), `git status --short | grep -c notifications` **must print 10**, and confirm no `.env`/secrets staged.
- Dev server runs from main repo `/Volumes/CODEUSER/seeko-studio`. We ARE in main. No worktree.
- Light tokens/kits/idioms: see design doc. Card = `overflow-hidden rounded-2xl bg-white shadow-seeko`; hairline = `h-px bg-black/[0.06]`.
- Playwright screenshots → `docs/plans/phase1-baselines/` ONLY (cross-volume cp triggers a TCC revocation that kills Turbopack).
- No uppercase-tracked eyebrows anywhere (banned).

---

## Task 1: Shared light kit module + `Dialog` light prop

**Files:**
- Create: `src/components/dashboard/lightKit.ts`
- Modify: `src/components/dashboard/SettingsPanel.tsx` (replace inlined kit consts with imports; ZERO visual change)
- Modify: `src/components/ui/dialog.tsx` (add `light?: boolean`)
- Test: `src/components/ui/__tests__/dialog.test.tsx` (create or extend)

**Step 1 — Extract kits.** Create `lightKit.ts` exporting the exact strings currently at the top of `SettingsPanel.tsx`:
```ts
export const LIGHT_INPUT = 'border border-black/[0.08] bg-white text-[#2a2a2a] placeholder:text-[#b3b3b3] rounded-lg focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30';
export const BTN_BASE = 'rounded-full px-4 h-9 text-[13px] font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]';
export const BTN_PRIMARY = `${BTN_BASE} bg-[#111] text-white hover:bg-[#2a2a2a]`;
export const BTN_SECONDARY = `${BTN_BASE} bg-[#f4f4f4] text-[#2a2a2a] hover:bg-[#ececec]`;
export const CARD_TITLE = 'text-[15px] font-semibold text-[#111]';
export const CARD_DESC = 'text-[13px] text-[#808080]';
export const HAIRLINE = 'h-px bg-black/[0.06]';
```
Verify against the real current values in `SettingsPanel.tsx` (lines ~33-41) and copy them VERBATIM — do not retype from memory.

**Step 2 — Rewire Settings.** In `SettingsPanel.tsx`, delete the inlined consts and `import { LIGHT_INPUT, BTN_BASE, BTN_PRIMARY, BTN_SECONDARY, CARD_TITLE, CARD_DESC, HAIRLINE } from './lightKit';`. Nothing else changes.

**Step 3 — Verify Settings unchanged.** `npx tsc --noEmit` (no new errors). Then Playwright screenshot `/settings` at 1440px → compare to `docs/plans/phase1-baselines/settings-after.png` — must be visually identical (this is a pure refactor).

**Step 4 — Dialog `light` prop.** Add `light?: boolean` to `DialogProps` (default `false`). When `light`:
- backdrop `bg-black/50 backdrop-blur-sm` → `bg-black/20 backdrop-blur-sm`
- panel `border-white/[0.08] bg-popover backdrop-blur-xl backdrop-saturate-150` → `border-black/[0.06] bg-white` (drop the dark glass; keep `shadow-xl` or use shadow-seeko-pop)
- close + expand buttons `hover:bg-white/[0.06]` → `hover:bg-black/[0.04]`, icon color dark (`text-[#505050]`)
- mobile drag handle `bg-white/20` → `bg-black/15`
- header border (`DialogHeader` `border-white/[0.06]`) → needs light variant; accept an optional prop or rely on the parent passing a light className. Simplest: have `DialogHeader` read a context flag OR pass `light` down. **Chosen:** thread `light` via a React context (`DialogLightContext`) set by `Dialog`, consumed by `DialogHeader` and `DialogTitle` (title color stays `text-[#111]` in light). Footer border + scrollbar colors likewise flip under `light`.
- `DialogTitle` text `text-foreground` → `text-[#111]` when light.

Use `cn()` last-wins; gate each dark/light pair on the `light` flag. Do NOT change default (dark) rendering for the 10+ existing call sites.

**Step 5 — Tests.** Vitest (globals, no import-from-vitest in this repo's convention). Add: (a) `Dialog` with `light` renders panel with `bg-white` and not `bg-popover`; (b) without `light` still renders `bg-popover` (dark default intact); (c) `DialogTitle` under a light `Dialog` carries the light title color. Render via existing test utils; assert on className presence.

**Step 6 — Commit.** `git commit -m "feat(dialog): opt-in light prop + extract shared lightKit" -- src/components/dashboard/lightKit.ts src/components/dashboard/SettingsPanel.tsx src/components/ui/dialog.tsx src/components/ui/__tests__/dialog.test.tsx`. Run post-commit verification (notifications=10).

---

## Task 2: Relight `DocList` list surface

**Files:** Modify `src/components/dashboard/DocList.tsx`; Modify `src/app/(dashboard)/docs/page.tsx`.

**Step 1 — Baseline-first.** `DocList.tsx` is `M` (emerald→sky swap WIP). Commit it as-is FIRST: `git commit -m "chore(docs): share-status sky tint (WIP baseline)" -- src/components/dashboard/DocList.tsx`. Verify notifications=10.

**Step 2 — Chrome.** Wrap the page in `LightShell`. `docs/page.tsx` currently renders `<div className="space-y-6">` with an h1/subtitle + `<DocList>`. Move the chrome into `LightShell` with `activeTab="docs" fill bordered` (match the board's usage in `TasksBoard.tsx`). Keep the "Documents" h1 + "Team documents, specs, and shared resources." subtitle inside a scrollable `<main className="min-h-0 flex-1 overflow-y-auto">` + centered body (`mx-auto w-full max-w-5xl px-6 py-8` — match the dark page's max width feel, but verify against Settings' `max-w-3xl`; Docs is wider, use `max-w-5xl`). The h1 uses `text-[var(--ov-heading)]`, subtitle `text-[var(--ov-text)]`. Preserve the existing FadeRise storyboard (heading 0ms, subtitle 80ms, list 160ms).

**Step 3 — Tab toggle** (Documents/Decks/Shared segmented control): relight from `bg-secondary/50` + `bg-card`/`text-foreground` to a light segmented control — track `bg-black/[0.04]`, active pill `bg-white shadow-seeko text-[#111]`, inactive `text-[#808080] hover:text-[#111]`. Counts use `tabular-nums text-[#9a9a9a]`.

**Step 4 — Search + FilterPill row.** Search `Input` → add the `LIGHT_INPUT` kit (import from `lightKit`); search icon `text-[#9a9a9a]`. `FilterPill` (the `Department` dropdown trigger): drop `uppercase tracking-wide`; active `border-black/[0.08] bg-[#f4f4f4] text-[#111]`, idle `border-black/[0.08] text-[#808080] hover:text-[#111]`. The dropdown menu (`DropdownMenuContent`) portals — verify it renders light; if it's dark, relight via the menu's className (or note for a follow-up; the menu primitive may need a light pass like Select did).

**Step 5 — Grouped cards with divide-y rows (core layout change).** Replace per-doc `Card` wrappers. For each department group render ONE `<section className="overflow-hidden rounded-2xl bg-white shadow-seeko">`. Group header becomes a row INSIDE the card top (or a label above the card — choose label-above for clarity: sentence-case `text-[13px] font-medium text-[#808080]` + count `tabular-nums text-[#9a9a9a]`, NO uppercase/tracking, no full-width hairline rule — the card edge is the divider). Inside the card, render each doc as a `divide-y divide-black/[0.06]` row:
- row: `flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-black/[0.02] cursor-pointer`
- icon container `size-9 rounded-md bg-[#f4f4f4]`, icon `text-[#505050]` (FileText/Presentation)
- title `text-[14px] font-medium text-[#111]`; preview `text-[13px] text-[#808080] line-clamp-2`
- recency dot → `bg-[#0d7aff]`; "Updated" badge → light chip `bg-[#0d7aff]/10 text-[#0d7aff]`; dept badges → `bg-black/[0.04] text-[#808080]`
- timestamp `text-[12px] text-[#9a9a9a] tabular-nums`
- admin edit/delete buttons: `text-[#9a9a9a] hover:bg-black/[0.04] hover:text-[#505050]` (edit), `hover:bg-[#d4503e]/10 hover:text-[#d4503e]` (delete); keep `opacity-0 group-hover:opacity-100`.
- Deck thumbnail rows keep the 16/9 image but with `outline outline-1 -outline-offset-1 outline-black/[0.06]` (image-outline principle).
Preserve the `Stagger`/`StaggerItem` entrance and `HoverCard` semantics (HoverCard lift may be dropped now that rows live in a card — implementer's judgment; if kept, ensure it doesn't double-shadow).

**Step 6 — Restricted group + empty/search-empty states.** "Restricted" locked group: same label treatment (sentence-case, no uppercase); locked rows in a white card, `Lock` icon `text-[#b3b3b3]`, title `text-[#9a9a9a]`. `EmptyState` and "No documents match…" text: `text-[#808080]` (note: `EmptyState`'s baked `text-foreground` title renders near-invisible on white — known shared-component issue from Settings; if it shows, pass a light title color or flag it, do not silently leave invisible).

**Step 7 — Shared-links admin view** (`viewMode === 'shared'`): relight the link `Card`s into the white-card-with-rows idiom; `SHARE_STATUS_COLORS` → light chips (pending `bg-amber-500/10 text-amber-600`, verified `bg-[#0d7aff]/10 text-[#0d7aff]`, expired `bg-black/[0.04] text-[#808080]`, revoked `bg-[#d4503e]/10 text-[#d4503e]`); action buttons + inline deadline editor (DatePicker) relit; the "Update" button uses `BTN_PRIMARY` or accent; "Cancel" ghost light.

**Step 8 — Verify + commit.** `npx tsc --noEmit` (no new). Playwright `/docs` 1440px + mobile → `docs/plans/phase1-baselines/docs-list-after.png`; 0 console errors. `git commit -m "feat(docs): migrate DocList list surface onto LightShell light language" -- src/components/dashboard/DocList.tsx "src/app/(dashboard)/docs/page.tsx"`. Verify notifications=10.

---

## Task 3: Relight read dialog + `DocContent` prose

**Files:** Modify `src/components/dashboard/DocList.tsx` (the read `Dialog` JSX); Modify `src/app/globals.css` (scoped light prose).

**Step 1 — Baseline-first globals.** `globals.css` is `M` (137-line WIP). Commit as-is FIRST: `git commit -m "chore(styles): in-progress globals WIP baseline" -- src/app/globals.css`. Verify notifications=10. (Skim the diff first to write a more honest message if the WIP has an obvious theme.)

**Step 2 — Read dialog.** In `DocList.tsx`, the read `Dialog` (`open={!!selected}`) + the edit/new/deck dialogs: pass `light` to each `Dialog`. Relight the read dialog's header icon container (`bg-secondary`→`bg-[#f4f4f4]`, icon `text-[#505050]`), the empty-content state (icon tile `bg-[#f4f4f4]`, "No content yet" `text-[#111]`, sub `text-[#808080]`, "Edit document" link `text-[#0d7aff]`), and the Share action button in the toolbar (`hover:bg-white/[0.06]`→`hover:bg-black/[0.04]`, icon dark).

**Step 3 — Light prose scope.** In `globals.css`, ADD `.overview-light` -scoped overrides (do NOT edit the base `.doc-content*` rules — external dark viewers depend on them):
```css
.overview-light .doc-content,
.overview-light .doc-content-body,
.overview-light .doc-content article { color: #2a2a2a; }
.overview-light .doc-content p { color: rgba(40,40,40,0.85); }
.overview-light .doc-content strong,
.overview-light .doc-content h1,
.overview-light .doc-content h2,
.overview-light .doc-content h3 { color: #111; }
.overview-light .doc-content li::marker { color: #9a9a9a; }
.overview-light .doc-content code { background: rgba(0,0,0,0.05); color: #2a2a2a; }
.overview-light .doc-content hr { border-color: rgba(0,0,0,0.08); }
.overview-light .doc-content table { border-color: rgba(0,0,0,0.08); }
.overview-light .doc-content th { background: rgba(0,0,0,0.04); color: #111; border-color: rgba(0,0,0,0.08); }
.overview-light .doc-content td { color: rgba(40,40,40,0.85); border-color: rgba(0,0,0,0.08); }
```
Links keep `--color-seeko-accent` (#0d7aff — fine on light). The read dialog content is inside the page's `.overview-light` scope (Dialog renders inline), so these apply. **Verify** the scope actually reaches the dialog content; if not (e.g. dialog mounts outside the scope), add a `.doc-content-light` class on the read body wrapper and key the overrides off that instead.

**Step 4 — Verify + commit.** Playwright: open a text doc with rich content (tables/lists/code) in the read dialog → screenshot, confirm light prose, legible. `git commit -m "feat(docs): light read dialog + scoped light doc prose" -- src/components/dashboard/DocList.tsx src/app/globals.css`. notifications=10.

---

## Task 4: Relight `DocEditor` + `DeckEditor` + `DepartmentSelect`

**Files:** Modify `DocEditor.tsx` (baseline-first — `M`), `DeckEditor.tsx`, `DepartmentSelect.tsx` (baseline-first — `M`).

**Step 1 — Baseline-first.** Commit `DocEditor.tsx` and `DepartmentSelect.tsx` WIP as-is: `git commit -m "chore(docs): editor/dept accent sky swap (WIP baseline)" -- src/components/dashboard/DocEditor.tsx src/components/dashboard/DepartmentSelect.tsx`. notifications=10.

**Step 2 — DocEditor (Tiptap).** `prose prose-invert` → `prose` (light); editor surface `bg-card border-border` → `bg-white border-black/[0.08]`. Toolbar: container `bg-secondary/40 border-border`→`bg-[#f9f9f9] border-black/[0.06]`; ToolbarButton inactive `text-muted-foreground hover:bg-secondary hover:text-foreground`→`text-[#808080] hover:bg-black/[0.04] hover:text-[#111]`, active `bg-foreground text-background`→`bg-[#111] text-white`. ImagePopover `border-border bg-card`→`border-black/[0.08] bg-white`, its tab buttons + URL input relit (`LIGHT_INPUT`). Department-restrict button `border-border text-muted-foreground`→light; the inline status icon color is already `#0d7aff` (WIP). Bottom action bar `border-border bg-card`→light; Save uses `BTN_PRIMARY`, Cancel `BTN_SECONDARY`, Delete restrained red `#d4503e`.

**Step 3 — DeckEditor.** Description textarea `border-border bg-card text-foreground placeholder:text-muted-foreground`→`LIGHT_INPUT`. Dept-restrict buttons, granted-users container (`bg-secondary/50`→`bg-[#f4f4f4]`, names `text-[#111]`, remove `text-[#9a9a9a]`), orientation toggle (active `bg-[#111] text-white`, inactive `text-[#808080]`), bottom action bar — all light. PDF/file upload dropzone: light dashed border `border-black/15 bg-[#f9f9f9] hover:bg-[#f4f4f4]`, text `text-[#808080]`.

**Step 4 — DepartmentSelect.** Container hover `hover:border-border hover:bg-muted`→`hover:border-black/[0.08] hover:bg-black/[0.04]`. Ensure the underlying `Select` is passed `light` (the prop added for Settings) so the portaled dropdown is light. Dept color tags: on white, bump tints for contrast where needed (audit `text-blue-300`/`text-violet-300`/`text-pink-300` — likely → `-500/-600`); Coding already `text-sky-400`→ consider `sky-600`. Visual-compare.

**Step 5 — Verify + commit.** tsc clean; Playwright open New Document editor + New Deck editor → screenshots, 0 console errors. `git commit -m "feat(docs): light DocEditor, DeckEditor, DepartmentSelect" -- src/components/dashboard/DocEditor.tsx src/components/dashboard/DeckEditor.tsx src/components/dashboard/DepartmentSelect.tsx`. notifications=10.

---

## Task 5: Relight `DeckViewer` + `DocShareDialog` + `DocDeleteConfirm`

**Files:** Modify `DeckViewer.tsx`, `DocShareDialog.tsx`, `DocDeleteConfirm.tsx`.

**Step 1 — DeckViewer (in-dialog stage = neutral light).** Vertical + horizontal canvas `backgroundColor: 'oklch(0.13 0 0)'` → `#f4f4f4`. Overlay controls flip dark-on-light: fullscreen button `text-white/70 bg-black/50`→`text-[#505050] bg-white/80 hover:text-[#111]`; nav arrows `bg-black/40 text-white/80`→`bg-white/80 text-[#505050] hover:bg-white`; page-count `text-muted-foreground/60`→`text-[#9a9a9a]`; notes container `border-border/50 bg-card/50`→`border-black/[0.06] bg-[#f9f9f9]`, note text `text-[#505050]`; dot indicators active `bg-[#111]`, inactive `bg-black/20 hover:bg-black/40`; overlay gradient `from-black/60`→`from-black/10` (or drop). **Fullscreen backdrop** (`#000`, the dark top scrim): keep dark for true-fullscreen presentation OR make light-neutral — implementer's call, but be consistent; default to keeping fullscreen darker since it's a distinct presentation context (per design doc note).

**Step 2 — DocShareDialog.** Pass `light` to its `Dialog`. Labels `text-muted-foreground`→`text-[#808080]`. Expires button `border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground`→light. Submit `bg-seeko-accent text-black`→keep accent (it's the primary action; `bg-[#0d7aff] text-white` reads better on light — switch text to white) OR `BTN_PRIMARY`; pick the accent for "share" affordance, white text. Inputs/Select → `LIGHT_INPUT` / `light` Select. DatePicker popover → light (verify; relight if dark). Security badge icon `text-muted-foreground/40`→`text-[#b3b3b3]`.

**Step 3 — DocDeleteConfirm.** Container `border-destructive/40 bg-destructive/10`→`border-[#d4503e]/30 bg-[#d4503e]/5`; text `text-foreground`→`text-[#111]`; confirm button restrained red `bg-[#d4503e] text-white hover:bg-[#c04535]`; cancel `BTN_SECONDARY`.

**Step 4 — Verify + commit.** Playwright: open a deck in viewer, open share dialog, trigger a delete confirm → screenshots, 0 console errors. `git commit -m "feat(docs): light DeckViewer, DocShareDialog, DocDeleteConfirm" -- src/components/dashboard/DeckViewer.tsx src/components/dashboard/DocShareDialog.tsx src/components/dashboard/DocDeleteConfirm.tsx`. notifications=10.

---

## Task 6: QA + AFTER critique + memory

**Files:** none (verification + docs/memory).

**Step 1 — Full suite.** `npm test` (confirm failures unchanged from the 12-fail baseline); `npx tsc --noEmit` (no NEW errors vs 190 baseline).
**Step 2 — Visual QA matrix** (Playwright, 1440px + 390px mobile, screenshots → `docs/plans/phase1-baselines/`): list (all groups, divide-y rows), tab toggle across Documents/Decks/Shared, search + filter active, read dialog (doc with tables/lists/code), deck read (DeckViewer light stage), DocEditor, DeckEditor, DocShareDialog, DocDeleteConfirm, locked/Restricted group, empty + search-empty states. 0 console errors on each.
**Step 3 — AFTER critique.** Run `/interface-craft` critique on `docs/plans/phase1-baselines/docs-list-after.png` (and dialog shots) vs `docs-before-recompiled.png`: confirm eyebrows gone, light cards, chrome consistent with Overview/board/Settings; surface residual craft issues (spacing rhythm, row padding, hover/focus, badge contrast on white, deck-stage legibility). Fix trivial findings inline (file-scoped commit); surface anything debatable to the user.
**Step 4 — Commit QA + update memory.** Commit the AFTER screenshots: `git commit -m "docs(docs): phase 1 after-baselines + QA" -- docs/plans/phase1-baselines/`. Update `memory/project_seeko_light_theme_migration.md` (add "Phase 1 — Docs DONE" section: git chain, grouped-card layout, Dialog `light` prop, lightKit module, scoped light prose, deck light stage, dept-color contrast bumps, "Next in Phase 1: Team") and the MEMORY.md pointer. notifications=10.

---

## Final review

After all tasks: dispatch a final code-quality reviewer over the whole Docs diff range, then `superpowers:finishing-a-development-branch` (the user controls merge/PR — likely "keep as-is" given the branch carries the broader redesign).
