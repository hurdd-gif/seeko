# design-sync NOTES — SEEKO Dashboard

Project: **SEEKO Dashboard** (`97af49e3-4135-4f73-ac56-d3a408caf2d3`) · https://claude.ai/design/p/97af49e3-4135-4f73-ac56-d3a408caf2d3

## What this sync covers
- **Scope: the presentational UI-primitive layer only** — `src/components/ui/*`. SEEKO is a Next.js *app*, not a component library; the other ~165 components under `src/components/` are feature/data-coupled (next/navigation, next/link, Supabase, `'use client'`) and are intentionally excluded — they don't render standalone and aren't design-system material.
- **shape: `package`, synth-entry** — the repo has no published library build (`private: true`, no `exports`/`main`), so the converter synthesizes an entry from `srcDir`. `.d.ts` contracts are therefore weaker than a real build would give.
- The `ui/*` primitives are hand-built on `motion/react` + `class-variance-authority` (NOT Radix — the Radix packages aren't even installed). They import only `motion/react`, `@/lib/utils`, `@/lib/motion`, `lucide-react`, `cva`, `hashvatar`, `@/lib/scroll-lock`, and each other. No context providers needed.

## CSS
- `cfg.cssEntry` → `.design-sync/seeko-tailwind.css` = a **snapshot of the Vite-migration build's compiled Tailwind v4 sheet** (`dist/react-router/assets/index-<hash>.css`). It carries the baked `@theme` tokens + every utility the app uses (incl. custom `.shadow-seeko`, `.shadow-seeko-pop`, `--color-seeko-accent`).
- **Refresh recipe** (the source filename is hash-stamped and changes every build):
  `npm run migrate:web:build && cp dist/react-router/assets/index-*.css .design-sync/seeko-tailwind.css`

## Fonts
- `cfg.tokensGlob` → `.design-sync/seeko-fonts.css` supplies the brand fonts via a **Google Fonts `@import`** (Outfit / JetBrains Mono / Caveat) and defines `--font-outfit` / `--font-jetbrains-mono` / `--font-caveat` (+ `--font-sans`/`--font-mono`/`--font-handwriting`).
- Rationale: in the app these come from `next/font/google` (layout.tsx) which injects the vars + self-hosts faces at runtime — neither exists in a static bundle. Remote `@import` = real brand fonts, sanctioned `[FONT_REMOTE]`. Loads at render (needs network).

## Preview authoring conventions (`.design-sync/previews/<Name>.tsx`)
Rich previews are authored by hand (no Storybook) and graded on the absolute rubric. The recurring patterns below are deliberate — keep them on re-author, don't "fix" them:

- **Dark `Surface` wrapper is mandatory in every preview.** Preview cards render on a **white** picker cell, but the bundle theme is dark (`--color-background:#1a1a1a`, `--color-foreground:#f0f0f0`, Outfit). Each cell wraps content in a `<div>` that sets `background:var(--color-background)` + `color:var(--color-foreground)` + `font-family:var(--font-outfit)`, or the dark-on-dark component is invisible. This is convention, not a component prop.
- **`ForceVisible` for entrance-animated components.** Static screenshot capture freezes motion at frame 0, so any `motion.*` with `initial={{opacity:0,...}}` renders transparent. `ForceVisible` injects `.<cls> *{opacity:1 !important;transform:none !important;}` (the `!important` beats motion's non-important inline styles). Used by **AlertDialog** and **EmptyState** (both use `motion.div` initial-hidden). Also achievable per-component via `animated={false}` where the component supports it — **ProgressBar/AnimatedNumber** lock their fill/value that way instead.
- **Portaled overlays can't render in-cell — two escape hatches:**
  - **AlertDialog, DatePicker, EmptyState** = *full real fidelity*. AlertDialog's root is `position:fixed inset-0` (NOT portaled to `<body>`), so its real `AlertDialogContent`+sub-parts compose directly inside the Surface (skipping the fixed wrapper). DatePicker/EmptyState render real at-rest.
  - **Dialog, DropdownMenu** = *real sub-components inside a class-mirrored container*. Their real `*Content` createPortals to `<body>`, so they never land in the capture cell. Fix: hand-roll a `Panel`/`MenuPanel` div that **mirrors the real content classes** (`Dialog`: `rounded-xl border bg-popover backdrop-blur-xl shadow-xl`; `DropdownMenu`: the real `DropdownMenuContent` classes) and fill it with the **real** `DialogHeader/DialogTitle` / `DropdownMenuItem/Label/Separator` sub-components. **Caveat:** if the real `*Content` class strings change, these mirrors drift silently — re-diff against source on re-author.
- **Select has no open API.** It's monolithic (parses native `<option>` children; no `defaultOpen`/`open`, no sub-components). Exercised **at-rest** with a controlled `value`; the open menu state is not previewable. Its `light` prop *is* documented and is shown via a `LightVariant` cell.
- **Grades live at** `.design-sync/.cache/review/<Name>.grade.json` (`{"cells":{"<ExportName>":{"verdict":"good"|"needs-work","note":"…"}}}`, keys == export names exactly). All 49 cells across 20 components currently graded `good`.

## Re-sync risks (watch-list for the next run)
- **Compiled-CSS snapshot can rot.** `seeko-tailwind.css` is a point-in-time copy; if app styling/tokens change, re-run the refresh recipe before building or the bundle ships stale utilities.
- **Remote fonts need network at render.** If self-hosting is ever required, harvest the woff2 (next/font wrote them under `.next`) and switch `seeko-fonts.css` to local `@font-face`.
- **Migration off Next.js is in flight (paused).** When SEEKO lands on React+Vite, component locations and coupling change — re-scope `srcDir`/discovery and re-verify after the migration. The primitives + tokens are migration-stable; their import paths may not be.
- `EMPTY_STATE_ICONS` (empty-state.tsx) is a const, not a component — exclude via `componentSrcMap` if discovery picks it up.
