# SEEKO Visual Overhaul — Design Doc

**Date:** 2026-04-28
**Author:** Brainstormed with user (yk) + designer agent
**Status:** Approved, ready for implementation plan
**Scope:** Full visual language overhaul across all surfaces — `(auth)`, `(dashboard)`, `(investor)`, `agreement`, `invoice`, `sign`, marketing/landing
**Out of scope:** Feature changes, IA changes, motion/animation overhaul, copy rewrite

---

## 1. Why

The current SEEKO visual language is "too busy and not representative of SEEKO." Diagnosis:

- **Color noise:** 5 department colors (mint/blue/purple/amber/pink) + 4 status colors + mint brand accent + accent-glow shadows = 10+ competing color signals
- **Type voice fragmented:** Outfit + JetBrains Mono + Caveat (handwriting) — three voices, no clear hierarchy
- **Dark-only:** `#1a1a1a` base reads as "another SaaS dashboard," not "studio"
- **HeroUI defaults dominant:** Pill buttons, internal shadows, internal radii — the system inherits HeroUI's voice rather than SEEKO's
- **No system contract:** Mint hardcoded in utilities (`.interactive-surface`, `--shadow-accent-glow`, `.doc-content a`, `.selectedCell`, `.column-resize-handle`) rather than tokenized — refactoring color cascades into surprise breakages

**This isn't a re-skin. It's building a brand-grade design system that's internally consistent and scalable to surfaces that don't exist yet.** Test: would a new surface added six months from now feel like the same studio without anyone designing it from scratch?

---

## 2. Direction

**Reference:** Joby Aviation (https://www.jobyaviation.com) — editorial + craft.

**Locked decisions:**

| Dimension | Decision |
|---|---|
| **Mood** | Editorial + craft. Studio, not SaaS. Calm, considered, intentional. |
| **Mode** | Light-first (cream paper). Dark mode available via toggle, secondary citizen. |
| **Architecture** | Two voices, one system. Marketing/auth/document surfaces lean fully editorial. Dashboard inherits the *tokens* but stays information-dense. |
| **Color contract** | ONE brand accent + ONE status hue (warning/needs-attention). Status communicated via type weight and position; color used sparingly. Department colors **killed**. |
| **Color foundation** | OKLCH-defined palette (not hex). Light + dark mirrors derived through gamut + contrast math. WCAG AA minimum. |
| **Type** | ONE sans (display → body) + ONE mono (metadata only). Drop Caveat. Two type scales: editorial (sparse surfaces) + compressed (dashboard). |
| **Geometry** | Pill buttons (full radius for primary CTAs, 0.5rem for inputs/cards). Hairline rules instead of cards-in-cards. |
| **Shadows** | Removed entirely or replaced with single very subtle elevation token. Shadows-over-borders principle from `/make-interfaces-feel-better`. |
| **Motion** | Spring-first per global rules. Reduced-motion respected. No entrance animations on dense surfaces. |

**Anti-patterns to avoid:** AI color palette (cyan-on-dark, purple gradients), cards-in-cards, glassmorphism, bounce/elastic easing, generic SaaS aesthetic.

---

## 3. Visual Language Spec

### 3.1 Color (OKLCH)

To be derived in PR 0 via `/oklch-skill` + `/color-expert`. Provisional anchors:

- **Paper (light bg):** warm cream, ~`oklch(96% 0.012 90)` — derived precisely in PR 0
- **Ink (light fg):** near-black, ~`oklch(20% 0.005 0)`
- **Paper (dark bg):** deep ink, ~`oklch(18% 0.005 60)` (slightly warm)
- **Ink (dark fg):** warm cream, ~`oklch(92% 0.012 90)`
- **Accent (brand):** TBD — candidate sources: SEEKO branding assets at `~/Desktop/SEEKO_Assets/branding/`, or a quiet ink-derived hue. May be "no accent" Joby-style if branding supports it.
- **Status (single):** warm amber `~oklch(70% 0.13 60)` for needs-attention only.
- **Border:** hairline, ink at 8% opacity (light) / cream at 8% opacity (dark)

**Contrast targets:**
- Body text on paper: ≥ 7:1 (AAA)
- UI text on paper: ≥ 4.5:1 (AA)
- Borders: ≥ 1.5:1 against paper (decorative threshold)

**Killed in same PR:** mint `#6ee7b7`, all 5 department colors, all 4 status colors except the new amber, accent-glow shadows. Clean cut. Zero orphan references in `src/`.

### 3.2 Type

- **Sans:** ONE confident editorial sans. Candidate retained: **Outfit** (already loaded, geometric+humanist). Alternate candidates if Outfit feels insufficient: Geist, Inter Display, GT America, Söhne. Decision in PR 0 after rendering north-star at scale.
- **Mono:** **JetBrains Mono** (already loaded). Used for: dates, IDs, code, version strings, dashboard metadata.
- **Dropped:** Caveat (handwriting). Zero references in `src/`.

**Two scales:**

| Step | Editorial (marketing/auth/docs) | Compressed (dashboard) |
|---|---|---|
| Display | 4.5rem / 1.05 | — |
| H1 | 3rem / 1.1 | 1.5rem / 1.2 |
| H2 | 2rem / 1.15 | 1.25rem / 1.25 |
| H3 | 1.375rem / 1.3 | 1.0625rem / 1.35 |
| Body | 1.0625rem / 1.55 | 0.875rem / 1.5 |
| Small | 0.875rem / 1.5 | 0.8125rem / 1.4 |
| Mono | 0.8125rem / 1.4 | 0.75rem / 1.4 |

Final values calibrated in PR 0 against north-stars.

### 3.3 Geometry

- **Pill buttons:** primary CTA full radius. Secondary 0.5rem.
- **Inputs:** 0.5rem radius, hairline border, no background fill (let paper show through)
- **Cards:** mostly killed in favor of hairline rules; where retained, 0.75rem radius
- **Concentric radius rule:** outer = inner + padding (per `/make-interfaces-feel-better`)
- **Hit areas:** 40×40px minimum on all interactive elements

### 3.4 Shadows

- **Default:** none. Hairline borders carry separation.
- **Elevated surfaces only:** single layered shadow token (popovers, modals).
- **Accent-glow shadow REMOVED.**

### 3.5 Motion

- Spring-first via `motion/react` (already in repo)
- Reduced-motion respected
- No entrance animations on dense surfaces (per saved global feedback)
- Scale-on-press: `scale(0.96)` on click per `/make-interfaces-feel-better`
- Icon animations: opacity + scale + blur per `/make-interfaces-feel-better`
- Never `transition: all`

---

## 4. Two North-Stars

The system is proven against TWO reference surfaces, not one. Both shipped in PR 0 before any other surface is touched.

### 4.1 North-Star A — Sign-in (`src/app/(auth)/sign-in`)
*Sparse / editorial pole.*

- Cream paper full-bleed, ink wordmark top-center
- Single editorial headline at display size — anchors brand voice
- Two inputs, hairline borders, no card containers, generous vertical rhythm
- One pill primary CTA, ink-on-cream
- Mono metadata for build/version corner text
- Zero color outside cream/ink contract

**Proves:** type voice, button language, input language, paper feel, top-nav language.

### 4.2 North-Star B — Task row fragment (isolated route from `src/components/dashboard/TaskList.tsx`)
*Dense / utilitarian pole.*

- Same cream paper, same ink, **compressed type scale**
- Hairline rules between rows (no card containers)
- Status communicated via:
  - Type weight on title (active = medium, done = regular @ 50% ink)
  - Position/group (done items collapse below)
  - Single amber dot or label *only* when status = needs-attention
- Department = small uppercase mono tag, no color (`RND` / `UI` / `ANIM`)
- Assignee = text label or hairline-circle monogram (no avatar bubble)
- Deadline = mono date

**Proves:** how editorial language survives density, compressed scale, no-color-by-default contract on dense data, status-by-type strategy.

**Built in isolated route under `/dev/north-star-task-row` so we can iterate without rebuilding the full dashboard.**

---

## 5. The `seeko-visual` Subagent

**Location:** `.claude/agents/seeko-visual.md`
**Model:** Sonnet
**Scope:** Migrates one surface at a time from legacy → editorial cream/ink language. Does not invent direction; matches the north-stars.

**Hard-coded references in agent definition:**
- Path to `globals.css` (token contract)
- Paths to north-star screenshots: `docs/visual-overhaul/north-star-signin.png`, `docs/visual-overhaul/north-star-task-row.png`
- Path to this design doc
- Path to `docs/visual-guidelines.md`
- Joby URL as spiritual anchor

**Hard-coded discipline (non-negotiable):**
1. Run `/interface-craft critique` BEFORE touching surface. Capture findings.
2. Run `/make-interfaces-feel-better` review BEFORE touching surface. Capture findings.
3. Migrate surface to match north-stars. Use `seeko-ui` wrapper layer where HeroUI fights editorial.
4. Run `/interface-craft critique` AFTER. Capture findings.
5. Run `/make-interfaces-feel-better` review AFTER. Capture findings.
6. Visual diff: before/after screenshots saved under `docs/visual-overhaul/migrations/<surface>/`.
7. Verify dark-mode toggle on migrated surface.
8. Verify 16-point `/make-interfaces-feel-better` checklist (concentric radius, optical alignment, tabular nums, scale-on-press, 40×40 hit areas, no `transition: all`, etc.)
9. Report: surface migrated, critique deltas, any token additions needed, any HeroUI overrides added.
10. Stage changes; do NOT commit or merge — user reviews and merges.

**Hard constraints:**
- Never add new tokens without flagging — token system is the contract
- Never reintroduce mint, department colors, or killed status colors
- Never skip critique passes
- Never migrate more than one surface per invocation
- Use compressed scale on dense surfaces — never invent a third scale
- Always verify both modes (light + dark) before reporting done

**Tools granted:** Read, Edit, Write, Bash, Playwright MCP for screenshots, Skill (for `/interface-craft critique` and `/make-interfaces-feel-better`).

**Invocation pattern:**
```
Agent({
  subagent_type: "seeko-visual",
  prompt: "Migrate src/app/(auth)/onboarding to match the north-stars."
})
```

---

## 6. Migration Order

PR 0 ships the foundation. After that, each wave is one PR per surface (or tight grouping) via the agent.

### PR 0 — Foundation (this design's deliverable)
1. `/oklch-skill` + `/color-expert` → palette derivation
2. `/design-tokens` → derive contrast/type/spacing scales + dark-mode mirrors
3. Rewrite `src/app/globals.css` tokens (clean cut, mint stripped, including `--shadow-accent-glow`, `--shadow-accent-inset`, `.interactive-surface`, `.doc-content a`, `.selectedCell`, `.column-resize-handle`)
4. Re-derive `.doc-read-body` Tiptap prose styles (designer flagged as hidden second design system at `globals.css:144-325`)
5. Build `seeko-ui` wrapper layer scaffolding
6. Build North-Star A (sign-in)
7. Build North-Star B (task row fragment) at `/dev/north-star-task-row`
8. `/interface-craft critique` + `/make-interfaces-feel-better` pass on both
9. Write `seeko-visual` agent definition
10. Update `docs/visual-guidelines.md`
11. Capture north-star screenshots to `docs/visual-overhaul/`

### Wave 1 — Auth surfaces (sparse, brand-defining)
- `(auth)/sign-in` — *shipped in PR 0*
- `(auth)/sign-up`
- `(auth)/onboarding`
- `set-password`

### Wave 2 — Document surfaces (editorial pole, brand-critical)
- `agreement`
- `invoice`
- `sign`

### Wave 3 — Investor portal
- `(investor)/*`

### Wave 4 — Dashboard (dense, system-stressing)
- `(dashboard)` shell
- Task list / task views (full view, north-star fragment becomes the contract)
- Project views
- Tiptap doc surface (full prose re-derivation)
- Settings, profile, remaining pages

### Wave 5 — Polish & cleanup
- Strip dead tokens, dead components, dead imports
- Final `/interface-craft critique` + `/make-interfaces-feel-better` pass on every surface
- Verify dark-mode toggle everywhere
- Update `docs/visual-guidelines.md` to reflect shipped reality

---

## 7. Success Criteria

The overhaul is **done** when all of the following are observably true.

### Systemic consistency
- Every surface reads as the same studio. No surface looks like a different product.
- Tokens in `globals.css` are the single source of truth. Zero `#[0-9a-f]{3,6}` matches in `src/` outside intentional illustrations.
- Mint, all 5 department colors, all 4 legacy status colors, Caveat font: zero references in `src/`.
- Type uses exactly two families: one sans, one mono.
- Editorial + compressed type scales are tokenized. Every `text-*` utility maps to a defined step.

### Color system
- Color system is **OKLCH-defined**. No hex values in tokens.
- Documented contrast ratios meeting WCAG AA on both light and dark.
- Light + dark are mirrors derived through math, not eyeballed.

### Scalability
- A new dev given this design doc + visual-guidelines + the `seeko-visual` agent can build a brand-new surface that passes critique on first review.
- `seeko-ui` wrapper layer covers every HeroUI primitive used in the app. Editorial defaults are path of least resistance.
- Dark mode toggle works on every surface. No dark-mode-only bugs.
- `docs/visual-guidelines.md` reflects shipped reality, not aspiration.

### Brand voice
- Editorial-craft register on marketing/auth/document surfaces (calm, considered, studio, intentional) — not SaaS register.
- Dashboard reads as same brand as marketing, doing different work.

### Process discipline
- Every migration PR has before/after screenshots and recorded `/interface-craft critique` + `/make-interfaces-feel-better` passes.
- No PR merged that introduced an off-contract token without documented reason.
- Reduced-motion respected; no entrance animations on dense surfaces.
- WCAG AA on cream/ink contract. All interactive elements have visible focus + `:active` feedback.
- 16-point `/make-interfaces-feel-better` checklist passes on every shipped surface.

### Anti-criteria (NOT done by)
- Pixel-perfect match to Joby (spiritual reference, not target)
- Every existing feature redesigned (visual language only — no feature changes)
- Animation overhaul (own future pass)

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| HeroUI v3 beta defaults fight editorial language | `seeko-ui` wrapper layer in PR 0; per-component overrides |
| `.doc-read-body` Tiptap prose is a hidden second system | Re-derived from scratch in PR 0 (called out, not a freebie) |
| Editorial type eats 30–40% more vertical space → dashboard too tall | Compressed type scale tokenized in PR 0; tested via north-star B |
| Agent drifts across sessions | Re-reads contract every invocation; references are file-pinned |
| Orphan mint references after token rewrite | Same-PR clean cut; grep-verified zero matches as success criterion |
| Dark mode bugs surface late | Dark-mode toggle verified per-surface in agent's discipline checklist |
| Brand accent decision blocks PR 0 | "No accent, ink-only" Joby-purist option is a valid fallback if SEEKO branding doesn't yield a clear hue |

---

## 9. Open Questions (resolved before PR 0 work begins)

1. **Brand accent hue** — derive from SEEKO branding assets at `~/Desktop/SEEKO_Assets/branding/`, or commit to "no accent" Joby-purist?
2. **Sans family** — keep Outfit or swap to a more editorial sans? Decided after rendering north-star at scale.
3. **`seeko-ui` wrapper depth** — minimum primitive coverage for PR 0 (Button, Input, Tabs, Card)? Full coverage deferred?

---

## 10. References

- **Joby Aviation** (spiritual anchor) — https://www.jobyaviation.com
- **`/interface-craft`** (Josh Puckett) — mandatory critique hook, before AND after every change
- **`/make-interfaces-feel-better`** — 16-point craft checklist, mandatory hook
- **`/oklch-skill`** — color-system foundation
- **`/color-expert`** — palette + contrast methodology
- **`/design-tokens`** — type, spacing, contrast derivation
- **`~/.claude/design-references.md`** — global 13 visual principles
- **`docs/visual-guidelines.md`** — SEEKO-specific (to be updated in PR 0)
- **SEEKO branding assets** — `~/Desktop/SEEKO_Assets/branding/`

---

## 11. Next Step

Hand off to `writing-plans` skill to create a detailed PR 0 implementation plan covering: palette derivation, token rewrite, `seeko-ui` scaffolding, two north-stars, agent definition, screenshot capture, and visual-guidelines update.
