# Light-Theme Migration — Phase 1 / Docs (Design)

> Part of [[project_seeko_light_theme_migration]]. Settings is DONE; Docs is the second Phase 1 page, Team is third.

**Date:** 2026-05-26
**Branch:** `feat/light-theme-migration`
**Scope decision (user):** migrate **everything** — the `/docs` list surface, chrome, AND every dialog (read view, `DocContent` prose, `DeckViewer`, `DocEditor`, `DeckEditor`, `DocShareDialog`, `DocDeleteConfirm`).

---

## BEFORE state (critique summary)

`/docs` is the one **primary-nav** tab still on dark chrome (`DesktopHeader` `#212020` pill on `#1a1a1a` body) after Overview/Tasks/Activity moved to `LightShell`. Findings:

- **Structural:** chrome mismatch (jarring dark flash when navigating from light pages); **banned uppercase-tracked eyebrows** on group headers (`SHARED`/`ANIMATION`/`ASSET CREATION`) and the `DEPARTMENT` filter pill.
- **Visual:** dark shadcn `Card`; dark form controls (search, filter, tab toggle); `text-foreground`/`text-muted-foreground` (baked-dark) throughout; dark recency dot / badges / share-status colors / locked rows.
- **Behavioral:** dark card hover; **all** modal flows (read, editors, deck viewer, share, delete) are dark.

BEFORE baseline screenshot: `docs/plans/phase1-baselines/docs-before-recompiled.png`.

---

## Locked decisions

1. **Chrome = `<LightShell activeTab="docs" fill bordered>`** — keeps the pill nav (Docs is a primary destination), unlike Settings' breadcrumb leaf. Covers the dark `DesktopHeader` like the board does.
2. **No uppercase eyebrows** — group headers ("Shared", department names, "Restricted") and the Department filter drop `uppercase tracking-*`, become sentence-case at the standard muted weight.
3. **Shared light kit module** — extract the kits currently inlined at the top of `SettingsPanel.tsx` (`LIGHT_INPUT`, `BTN_BASE`/`BTN_PRIMARY`/`BTN_SECONDARY`, `CARD_TITLE`/`CARD_DESC`, `HAIRLINE`) into `src/components/dashboard/lightKit.ts`; both Settings and Docs import from it (DRY). Settings must render byte-for-byte identically after the extraction.
4. **List layout = grouped cards with divide-y rows** — one white `rounded-2xl shadow-seeko` card per department group; documents become `divide-y` rows inside (calmer, denser, Linear/Settings-like; fewer floating shadows than per-doc cards). The "Restricted" group and the admin "Shared links" view follow the same card-with-rows idiom.
5. **`Dialog` gains an opt-in `light?: boolean` prop** — mirrors the `Select` `light` prop pattern from Settings. Relights the parts `contentClassName` can't reach: backdrop (`bg-black/50`→soft light scrim), panel (`bg-popover`+`border-white/[0.08]`→`bg-white`+light hairline), close/expand buttons (`hover:bg-white/[0.06]`→`hover:bg-black/[0.04]`), header border, mobile drag handle, scrollbar. Default `false` → all other call sites unaffected. The Dialog renders **inline** (no portal — verified), so it sits inside the `.overview-light` scope, but because Tailwind v4 bakes tokens at build time the relight is still per-element via the `light` prop, not runtime token override.
6. **Doc prose = scoped light variant** — add `.overview-light .doc-content-body` (and `.overview-light .doc-content`) overrides in `globals.css` rather than editing the shared base rules, so the external dark share/sign viewers (`/invoice`, `/sign`) keep their dark prose. Flip the literal `rgba(240,240,240,0.85)` body/table text and the `--color-foreground/muted/border` references to light equivalents only within the light scope.
7. **Deck viewer stage = neutral light** — replace the near-black `oklch(0.13 0 0)` slide canvas with a light-neutral stage (`#f4f4f4`-ish); overlay controls flip from `text-white`/`bg-black/*` to dark-on-light. Fullscreen mode may keep a darker backdrop (full-screen presentation is its own context) — implementer's call, but the in-dialog stage is light.

---

## Token / kit reference (from Settings, now shared)

```
LIGHT_INPUT   border border-black/[0.08] bg-white text-[#2a2a2a] placeholder:text-[#b3b3b3] rounded-lg focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30
BTN_BASE      rounded-full px-4 h-9 text-[13px] font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]
BTN_PRIMARY   ${BTN_BASE} bg-[#111] text-white hover:bg-[#2a2a2a]
BTN_SECONDARY ${BTN_BASE} bg-[#f4f4f4] text-[#2a2a2a] hover:bg-[#ececec]
CARD_TITLE    text-[15px] font-semibold text-[#111]
CARD_DESC     text-[13px] text-[#808080]
HAIRLINE      h-px bg-black/[0.06]
```

Light surface tokens (`.overview-light` scope, already in `globals.css`): `--ov-bg:#eeeeee`, `--ov-heading:#111`, `--ov-text:#505050`, `--ov-muted:#808080`, `--ov-faint:#9a9a9a`, `--ov-hairline`, `shadow-seeko`, `shadow-seeko-pop`. Card idiom: `overflow-hidden rounded-2xl bg-white shadow-seeko`.

Department accent colors stay as-is (already swapped emerald→sky in the working-tree WIP: Coding `text-sky-400`). On white, audit each dept color for contrast and darken the tint a step where needed (e.g. `sky-400`→`sky-600`) — visual-compare, not blind.

---

## Git discipline

- Branch `feat/light-theme-migration`. **File-scoped commits only** (`git commit -m "…" -- <paths>`); **never** `git add -A`/`.`.
- **Baseline-first** on every file carrying pre-existing WIP: `DocList.tsx` / `DocEditor.tsx` / `DepartmentSelect.tsx` (trivial emerald→sky swaps) and `globals.css` (137-line WIP). Commit the WIP as-is under an honest `chore(...)` message, THEN the clean relight on top.
- After every commit verify: `git show --stat HEAD`, `git status --short | grep -c notifications` **must stay 10**, no `.env`/secrets staged.

## Verification

- `npm test` (record pre-existing 12 fail / baseline), `npx tsc --noEmit` (baseline 190 — no NEW errors).
- Playwright visual QA at 1440px + mobile: list, each group card, search/filter, read dialog (doc + deck), editor, deck editor, share, delete, locked rows, empty states. Screenshots to `docs/plans/phase1-baselines/` (project tree only — TCC hazard).
- Mandatory `/interface-craft` AFTER critique vs the BEFORE baseline.
