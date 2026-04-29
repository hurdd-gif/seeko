# SEEKO Visual Guidelines

> Status: PR0 foundation shipped 2026-04-29. This is the contract every surface migration follows. The `seeko-visual` agent is the executor; this doc is the spec.

---

## 1. System overview

Two voices, one system. Editorial cream-paper-and-ink language with **ONE accent** + **ONE status hue**, **ONE sans family** (no mono brand face), and **ONE composition discipline**: less is more.

**Spiritual anchor:** Joby Aviation (https://www.jobyaviation.com). Quiet, editorial, restraint over decoration. See `docs/visual-overhaul/joby-reference.md` for the full study.

The system has two poles:
- **Sparse / editorial** — sign-in, marketing, doc pages. Headline does the work. North-star: `docs/visual-overhaul/north-star-signin.png`.
- **Dense / utilitarian** — task lists, dashboards, data tables. Hairline rules between rows; no enclosure; status by type weight. North-star: `docs/visual-overhaul/north-star-task-row.png`.

Every surface answers: *would Joby do this?* If no or unsure → default to less.

---

## 2. Color

Locked palette: `docs/visual-overhaul/palette.md`. OKLCH-defined, light + dark perceptual mirrors.

| Role | Light | Dark (deferred) |
|---|---|---|
| `--color-paper` | `oklch(0.970 0.012 85)` | `oklch(0.180 0.012 60)` |
| `--color-ink` | `oklch(0.200 0.015 60)` | `oklch(0.940 0.012 85)` |
| `--color-accent` | `oklch(0.380 0.040 50)` | `oklch(0.780 0.040 50)` |
| `--color-status-warning` | `oklch(0.750 0.150 75)` | (same) |
| `--color-border` | `oklch(0.880 0.010 70)` | `oklch(0.280 0.010 60)` |
| `--color-muted` | `oklch(0.500 0.012 60)` | `oklch(0.650 0.010 70)` |

**Accent only on links + primary CTAs.** **Warning only on the needs-attention dot.** No other UI chroma.

### Kill list (banned, never reintroduce)
- Mint `#6ee7b7` and `--color-seeko-accent`
- All 5 department color tokens (`--color-dept-*`)
- All 4 legacy status color tokens (`--color-status-complete/progress/review/blocked`)
- All shadow-glow tokens (`--shadow-accent-glow`, `--shadow-accent-inset`)

---

## 3. Type

Locked tokens: `docs/visual-overhaul/tokens.md`.

**One brand face:** **Geist** (Vercel, free, via `next/font/google`). Closest free analog to Joby's proprietary JobySans. No mono brand face. Code blocks (`<code>`, `<pre>`) fall back to system `ui-monospace` — structural necessity for code, not a brand face.

### Editorial scale (sparse surfaces)
| Token | Size | Use |
|---|---|---|
| `--text-display` | 4rem (64px) | hero |
| `--text-h1` | 3rem (48px) | page headline |
| `--text-body` | 1rem (16px) | body |
| `--text-small` | 0.875rem (14px) | captions, sentence-form supporting copy |

### Compressed scale (dense surfaces)
| Token | Size | Use |
|---|---|---|
| `--text-h1-compressed` | 1.625rem (26px) | dashboard section title |
| `--text-body-compressed` | 0.875rem (14px) | row title in data tables |

### Type discipline (the rules)
- **Lowercase headlines** — "welcome back.", "tasks." Period-terminated. Declarative, not interrogative.
- **Sentence-case body** — never UPPERCASE. Acronyms (UI, API, NDA) keep their case.
- **No uppercase-tracked anything.** Banned: eyebrows ("STUDIO · LEDGER"), form labels ("EMAIL"), department tags ("VISUAL ART"), date displays ("MAY 04"), footer marks ("SEEKO STUDIO — INTERNAL"). Reads as generic AI chrome.
- **Tabular nums on data:** `font-variant-numeric: tabular-nums` on any numeric column.
- **Em-dashes in copy** where appropriate (Joby uses these freely).
- **Optical alignment** on display headlines: `text-indent: -0.04em` on h1s to align visual left edge with body text below.
- **Body line-height ≥ 1.55** for readability.

---

## 4. Geometry

| Token | Value | Use |
|---|---|---|
| `--radius-input` | 0.5rem (8px) | inputs, selects |
| `--radius-card` | 0.75rem (12px) | cards (use sparingly) |
| `--radius-pill` | 9999px | primary CTAs only |

- **Hairline borders, no shadows** for editorial surfaces. Joby is flat.
- **Concentric radius:** child radius = parent radius − parent padding.
- **No card around content** for editorial register. Hairline rules between rows; no enclosure.

---

## 5. Motion

- **GSAP** for timeline-heavy, scroll-driven, SVG, sequenced motion. Setup at `src/lib/gsap.ts` — all plugins registered (incl. SplitText, DrawSVG, MorphSVG, ScrollSmoother, CustomEase). Bonus plugins vendored at `vendor/gsap-bonus/`.
- **motion/react** for component-state and gesture-driven animation tied to React render cycles.
- **Spring-first** when motion is interactive; **`power2.out` / `power3.out`** when motion is sequenced.
- **No bounce, no overshoot** on editorial surfaces.
- **No entrance animation on form chrome or dense data rows** — distracts during the high-cognitive-load act of typing or scanning.
- **Subtle entrance on chrome elements OK** if guarded by `prefers-reduced-motion`.
- **Specify exact transition properties.** Never `transition: all`.

---

## 6. North-stars

These are the visual contract. Every surface migration matches their register.

- **Sparse pole:** `/login` → `src/app/(auth)/login/page.tsx`. Screenshot: `docs/visual-overhaul/north-star-signin.png`.
- **Dense pole:** `/dev/north-star-task-row` → `src/app/dev/north-star-task-row/page.tsx`. Screenshot: `docs/visual-overhaul/north-star-task-row.png`.

The dev route is dev-only (proxy gates it on `NODE_ENV === 'development'`).

---

## 7. Adding a new surface

1. Don't migrate ad hoc. Use the `seeko-visual` agent:
   ```
   Agent({
     subagent_type: "seeko-visual",
     prompt: "Migrate src/app/(auth)/sign-up to match the north-stars."
   })
   ```
2. The agent reads the contract, runs `/interface-craft critique` + `/make-interfaces-feel-better` BEFORE and AFTER, applies the migration, screenshots both states, and reports.
3. Token gaps and missing primitives are FLAGGED, not invented. Review the report; you decide what gets added to the system.
4. The agent stages changes; you commit.

---

## 8. seeko-ui primitives

Located at `src/components/seeko-ui/`. Editorial defaults baked in.

| Component | Variants | Notes |
|---|---|---|
| `Button` | `primary` (filled ink pill), `secondary` (hairline ring), `ghost` (transparent), `link` (text + animated underline) | `link` is the Joby-register CTA. Pill primary stays for non-editorial surfaces. |
| `Input` | — | Hairline ring, transparent fill, ring-2 focus, 14px radius |
| `Card` | — | Hairline border, 12px radius, no shadow. Use sparingly — most editorial layouts shouldn't enclose content. |
| `Tabs` | — | Hairline underline indicator (1.5px), accessible (role="tab"/"tablist"/"tabpanel" + aria-selected) |

Add new primitives only when an existing surface needs them. Flag through the agent; don't pre-build.

---

## 9. Anti-patterns (what we explicitly don't do)

- ❌ Mint, department colors, multiple status hues, glow shadows
- ❌ Mono brand face (system `ui-monospace` is OK in code blocks only)
- ❌ Card-in-card, glassmorphism, frosted backdrop
- ❌ Filled bright pill CTAs in editorial register
- ❌ Uppercase-tracked metadata, eyebrows, footer marks (banned, AI-aesthetic)
- ❌ Status pills, status badges, status-text-as-decoration
- ❌ `transition: all`, scale-from-0 entrances, `ease-in` (use `ease-out` or springs)
- ❌ Department abbreviations in CAPS (use sentence case: "Code", "Art", "Anim")
- ❌ Date format in CAPS ("MAY 04") — use sentence case ("May 04")
- ❌ Bounce, elastic easing, overshoot on editorial register
- ❌ Generic AI aesthetics (cyan-on-dark, purple gradients, cards-stacked-on-cards)

---

## 10. References

- **Joby reference (study):** `docs/visual-overhaul/joby-reference.md`
- **Original design doc:** `docs/plans/2026-04-28-seeko-visual-overhaul-design.md`
- **Palette:** `docs/visual-overhaul/palette.md`
- **Tokens:** `docs/visual-overhaul/tokens.md`
- **Migration history:** `docs/visual-overhaul/migrations/`
- **Critique frameworks:** `/interface-craft critique`, `/make-interfaces-feel-better`
- **Design lens:** `designer` subagent (always invoke before making design choices, not after)
- **Migration agent:** `seeko-visual` (`.claude/agents/seeko-visual.md`)
