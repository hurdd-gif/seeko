# Persona: UX / UI Designer

Load this file when working on: components, Tailwind styling, tokens, theme, motion, icons, visual QA.

---

## Foundations

- **Components:** house components in `src/components/ui/` (shadcn-style, `class-variance-authority` + `cn()` from `src/lib/utils.ts`). No HeroUI, no component library. Check here before building anything new.
- **Styling:** Tailwind v4, configured in `src/rr-app/globals.css` (`@theme inline {}`, no `tailwind.config.ts`). Tokens are CSS variables mapped by reference, so `.dark` flips them.
- **Font:** Inter for sans and mono (`--font-sans` / `--font-mono` → `--font-inter`).
- **Accent:** `--color-seeko-accent` (+ `-ink`, `-strong`). Department colors are an AA-on-white ink ladder that flips to pastels in dark.

---

## Theme

- Three-state preference `light | dark | system` in `localStorage['seeko-theme']`; missing = system. Owned by `src/lib/theme.ts`.
- Applied as `.dark` on `<html>` so portalled surfaces (sonner, menus, dialogs) flip too.
- `index.html` has an inline pre-paint copy of the resolution. **Edit both together.**
- Dark tiers are OKLCH; never drop them toward 0.205.

---

## Token rules

- One elevation: `shadow-seeko` (`shadow-seeko-pop` for popovers one step up). Never inline a shadow.
- Toast colors only via `var(--rt-…)` (Delphi toast palette).
- Use semantic tokens, never raw color literals.
- Avatars: `@outpacelabs/avatars` with `seed = profile.id` (never initials; a falsy seed white-screens).
- No uppercase tracked eyebrows.

---

## Motion

- Library: `motion` (`motion/react`).
- Shared values: `src/lib/motion.ts` (`springs`, `TAB_PILL_SPRING`, `PANEL`, `DROPDOWN`, `MODAL`, `shellEntrance`, `rowEntrance`, …) and `src/lib/springs.ts` (`spring.fast` / `moderate`, each with an exit duration). Reuse these; no magic numbers in JSX.
- Tab indicators: `layoutId` + `TAB_PILL_SPRING`.
- Every animation honors reduced motion (the helpers take `reduce`).
- Sign-out: `EXIT_TOTAL_MS` must match the 60+240ms in `globals.css`.

---

## Icons

- Mapped through `src/lib/icon-map.tsx` (Lucide plus others). Add icons there, not as one-off imports.

---

## Layout & surfaces

- App chrome: `src/components/layout/`. Dashboard surfaces: `src/components/dashboard/`.
- Surface context/classes: `src/lib/surface-context.tsx`, `src/lib/surface-classes.ts`.
- Loading states: boneyard-js skeletons (`npm run bones`, output in `src/bones/`).
- Always show loading, empty and error states.

---

## Design references

- `.impeccable.md` (repo root, local only): design context.
- `.design-sync/NOTES.md`: claude.ai/design sync notes (canonical).
- `docs/design-references.md`: inspiration log.
- `~/.claude/interface-precedent.md`: global rulebook.

---

## QA

- Build, then check on `:8788`. Auth-free QA routes exist (`*-qa.tsx`, `/investor-preview*` in `src/rr-app/routes/`).
- Browser QA uses a headless Playwright script, not the Playwright MCP.

---

## Skill Routing Reminders

- Before and after any design change: `emil-design-engineering`, `/interface-craft critique`, `/make-interfaces-feel-better`
- Motion: `animate`, `motion-design-patterns`
- Screenshot QA: `visual-qa`, `seeko-ui-regression-reviewer`
