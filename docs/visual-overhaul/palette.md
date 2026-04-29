# SEEKO Palette (OKLCH)

> Single source of truth for color tokens. Locked 2026-04-28 as part of PR0 (visual overhaul foundation). Any future addition lives here first; `globals.css` mirrors this doc.

## Direction

Two voices, one system. Editorial cream/ink language. **ONE accent + ONE status hue.** Light + dark are perceptual mirrors (equal L distance from the bg pole). Brand wordmark is monochrome — accent is ink-derived, not invented.

---

## Light mode (cream paper, warm deep ink)

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `oklch(0.970 0.012 85)` | bg — warm cream, not pure white |
| `--color-paper-elevated` | `oklch(0.985 0.008 85)` | popovers, modals (subtle lift) |
| `--color-ink` | `oklch(0.200 0.015 60)` | fg — warm deep ink |
| `--color-muted` | `oklch(0.500 0.012 60)` | secondary text, dept tags |
| `--color-border` | `oklch(0.880 0.010 70)` | hairline borders |
| `--color-accent` | `oklch(0.380 0.040 50)` | links, primary CTA (warm ink-derived) |
| `--color-accent-foreground` | `oklch(0.970 0.012 85)` | text on accent fill (= paper) |
| `--color-status-warning` | `oklch(0.750 0.150 75)` | amber dot for needs-attention |
| `--color-status-foreground` | `oklch(0.200 0.015 60)` | text/ink on amber (= ink) |

## Dark mode (perceptual mirror)

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `oklch(0.180 0.012 60)` | bg — warm deep ink |
| `--color-paper-elevated` | `oklch(0.220 0.012 60)` | popovers (slight lift) |
| `--color-ink` | `oklch(0.940 0.012 85)` | fg — warm cream |
| `--color-muted` | `oklch(0.650 0.010 70)` | secondary text |
| `--color-border` | `oklch(0.280 0.010 60)` | hairline borders |
| `--color-accent` | `oklch(0.780 0.040 50)` | mirror of light accent (high L) |
| `--color-accent-foreground` | `oklch(0.180 0.012 60)` | text on accent (= paper-dark) |
| `--color-status-warning` | `oklch(0.750 0.150 75)` | same amber in both modes |
| `--color-status-foreground` | `oklch(0.200 0.015 60)` | ink on amber |

---

## Contrast matrix (approx WCAG 2 ratios)

**AA min 4.5:1 body / AAA target 7:1 body.** Hairline borders not held to text contrast.

### Light
| Pair | Ratio | Level |
|---|---|---|
| ink on paper | ~12.5:1 | AAA |
| muted on paper | ~5.0:1 | AA body |
| accent on paper | ~7.5:1 | AAA body |
| paper on accent (filled CTA) | ~7.5:1 | AAA |
| ink on amber (dot/fill) | ~9.0:1 | AAA |
| border on paper | ~1.4:1 | hairline only |

### Dark
| Pair | Ratio | Level |
|---|---|---|
| ink on paper | ~12.0:1 | AAA |
| muted on paper | ~4.7:1 | AA body |
| accent on paper | ~7.0:1 | AAA body |
| paper on accent | ~7.0:1 | AAA |
| paper-dark on amber | ~9.0:1 | AAA |
| border on paper | ~1.5:1 | hairline only |

---

## Decisions log

- **Accent (Decision 1):** Option C — quiet warm ink-derived hue. `oklch(0.380 0.040 50)` light, `oklch(0.780 0.040 50)` dark. Branding assets are pure monochrome (B&W wordmark only); deriving an accent from them would be invention. Joby-purist (Option B) was viable but Option C grants links/CTAs ergonomic clickability without inventing a foreign chroma — a quiet warm slate that reads as ink with intent at viewing distance, ties to the cream paper.
- **Status hue:** warm amber `oklch(0.750 0.150 75)` — held constant across modes so a `needs-attention` dot reads identically in light and dark.
- **Two-hue split (paper 85° vs ink 60°):** prevents cream-on-charcoal "newsprint" feel; gives the system a deliberate paper-vs-ink temperature difference.
- **Muted-dark held at L=0.65 (4.7:1).** Just clears AA body. If users complain it feels weak, push to 0.68 (~5.5:1).
- **No `--color-status-success` / `--color-status-info` / `--color-status-error`.** Status reads via type weight, opacity, and (when warranted) the single amber dot. Multiple status hues would dilute the editorial register.

---

## Kill list (eliminated in PR0)

These tokens existed in the old system and are gone:
- `--color-seeko-accent` (mint `#6ee7b7`)
- `--color-dept-coding`, `--color-dept-visual-art`, `--color-dept-ui-ux`, `--color-dept-animation`, `--color-dept-asset-creation`
- `--color-status-complete`, `--color-status-progress`, `--color-status-review`, `--color-status-blocked` (4 legacy status colors)
- `--shadow-accent-glow`, `--shadow-accent-inset`
- `--font-handwriting` (Caveat)
