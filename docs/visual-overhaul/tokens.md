# SEEKO Tokens — Type, Spacing, Radius

> Companion to `palette.md`. Locked 2026-04-28 as part of PR0. Tokens here mirror what's compiled into `globals.css` `@theme inline {}`.

---

## Typography

### Families

| Token | Value | Role |
|---|---|---|
| `--font-sans` | `var(--font-outfit)` | UI + editorial body/headings |
| `--font-mono` | `var(--font-jetbrains-mono)` | code, IDs, dates, metadata |

**Killed:** `--font-handwriting` (Caveat) — eliminated. No third family.

---

### Editorial scale (sparse surfaces — sign-in, marketing, doc pages)

| Token | Size | Line-height | Tracking | Weight |
|---|---|---|---|---|
| `--text-display` | `4rem` (64px) | `1.05` | `-0.02em` | 500 |
| `--text-h1` | `3rem` (48px) | `1.1` | `-0.015em` | 500 |
| `--text-h2` | `2.25rem` (36px) | `1.15` | `-0.01em` | 500 |
| `--text-h3` | `1.5rem` (24px) | `1.25` | `-0.005em` | 500 |
| `--text-body` | `1rem` (16px) | `1.55` | `0` | 400 |
| `--text-small` | `0.875rem` (14px) | `1.5` | `0` | 400 |

### Compressed scale (dense surfaces — task rows, dashboards, tables)

| Token | Size | Line-height | Tracking | Weight |
|---|---|---|---|---|
| `--text-h1-compressed` | `1.625rem` (26px) | `1.2` | `-0.01em` | 600 |
| `--text-h2-compressed` | `1.25rem` (20px) | `1.25` | `-0.005em` | 600 |
| `--text-h3-compressed` | `1rem` (16px) | `1.3` | `0` | 600 |
| `--text-body-compressed` | `0.875rem` (14px) | `1.45` | `0` | 400 |
| `--text-small-compressed` | `0.75rem` (12px) | `1.4` | `0.005em` | 400 |

### Mono (single scale, both registers)

| Token | Size | Line-height | Tracking |
|---|---|---|---|
| `--text-mono` | `0.8125rem` (13px) | `1.5` | `0` |
| `--text-mono-compressed` | `0.6875rem` (11px) | `1.4` | `0.01em` |

**Mono usage rules:**
- Always `font-variant-numeric: tabular-nums` when displaying numbers (per `/make-interfaces-feel-better` #9)
- Uppercase for tags/labels; sentence-case for IDs and code
- Lower opacity (`text-ink/60`) for metadata, full opacity for IDs/code

---

## Spacing (4-based)

| Token | Value | Common use |
|---|---|---|
| `--space-1` | `4px` | tight inline gaps |
| `--space-2` | `8px` | input padding y, badge gap |
| `--space-3` | `12px` | input padding x, row gap (compressed) |
| `--space-4` | `16px` | row gap (editorial), card padding sm |
| `--space-6` | `24px` | section spacing (compressed) |
| `--space-8` | `32px` | section spacing (editorial), card padding lg |
| `--space-12` | `48px` | page padding x (mobile), section gap |
| `--space-16` | `64px` | page padding x (desktop) |
| `--space-24` | `96px` | hero spacing, editorial section |

---

## Border radius

| Token | Value | Role |
|---|---|---|
| `--radius-input` | `0.5rem` (8px) | inputs, selects, dropdowns |
| `--radius-card` | `0.75rem` (12px) | cards, modals, popovers |
| `--radius-pill` | `9999px` | primary CTAs, status pills |

**Concentric rule:** when nesting, child radius = `parent radius - parent padding`. Card with `--radius-card` (12px) and 16px padding → child input should use 8px (which lines up with `--radius-input`).

---

## Decisions log

- **Sans (Decision 2):** Option A — keep Outfit. Already loaded via `next/font`. Editorial register is carried by scale + weight contrast + line-height, not family identity. If the north-stars prove Outfit visibly insufficient at display sizes, revisit with Söhne or GT America (paid) as a Wave-5+ upgrade.
- **Two scales not three.** Editorial for sparse surfaces, compressed for dense data surfaces. No "marketing scale" — that's just editorial display sizing.
- **Compressed weights are heavier (600 on headings).** Smaller type needs more weight to read as hierarchy at distance.
- **Pill CTAs only on primary actions.** Secondary actions use `--radius-input` to avoid pill-overuse cliché.
- **No `--radius-button` token.** Primary buttons use `--radius-pill`, secondary buttons use `--radius-input`. Naming says intent, not shape.
- **Mono compressed has positive tracking (`0.01em`).** Tabular nums at 11px crowd; tracking restores legibility without bumping size.
