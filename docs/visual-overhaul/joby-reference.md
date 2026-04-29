# Joby Aviation — Design Reference

> Source: https://www.jobyaviation.com (analyzed 2026-04-28)
> Purpose: spiritual anchor for SEEKO Studio's editorial cream/ink language. Match the discipline, translate the register from aerospace to creative studio.

---

## 1. Register & mood

**Aspirational, forward-looking, premium.** Innovation + sustainability + possibility, but warm — never dystopian. "Skip traffic. Time to fly." anchors emotional positioning: liberation from mundane constraints.

**Feeling:** clean confidence, minimal friction, future-ready but grounded. The site doesn't try to impress you with chrome — it impresses with restraint and photography.

**Translation to SEEKO:** the SAME restraint, but slightly warmer. We're a creative game studio, not aerospace — the discipline is identical, the temperature one click warmer (cream paper, not pure white; ink with hint of warmth, not pure charcoal).

---

## 2. Color

| Role | Joby | SEEKO equivalent |
|---|---|---|
| Background | `#FFFFFF` / near-white `#FAFAFA` | `oklch(0.970 0.012 85)` — cream paper, warmer |
| Text | dark charcoal ~`#1A1A1A` | `oklch(0.200 0.015 60)` — warm deep ink |
| Accent | sky cyan ~`#00A8E8` (sparse) | `oklch(0.380 0.040 50)` — warm ink-derived (more restrained than Joby's cyan) |
| Hairlines | light gray ~`#E5E5E5` | `oklch(0.880 0.010 70)` |

### How Joby uses color
- **Chroma comes from photography**, not from UI. Sky blues, aircraft silver, urban warmth — NOT from buttons or cards.
- **CTAs have NO fill color.** They're text-based with optional underline (see §5).
- **No gradients, no glow, no decorative color.** Color carries information, not decoration.

### How SEEKO inherits this
- Cream paper + ink + the single warm-ink accent are the entire UI palette
- ANY chroma beyond that comes from photography or illustration assets — never from UI components
- Tokens in `palette.md` are already aligned with this discipline

---

## 3. Typography

### Joby's stack
- **Single sans family.** Likely a custom or modern grotesque (system stack `-apple-system, BlinkMacSystemFont` plausible). No serif. Two weights at most.
- **Lowercase predominates in headlines.** "Skip traffic. Time to fly." — not "Skip Traffic. Time to Fly." This is Joby's strongest typographic signature.
- **Title Case for section titles** ("Experience Highlights").
- **Sentence case for buttons** ("Discover the Experience").
- **Small caps reserved for tiny labels/badges** ("Coming soon", weight 500–600).

### Joby's scale (approx, as observed)
| Role | Size | Weight | Notes |
|---|---|---|---|
| Hero headline | 48–64px | 400–500 | lowercase, sentence-cased |
| Section header | 32–40px | 400–500 | sentence or Title Case |
| Body copy | 16–18px | 400 | line-height ~1.6–1.8 (generous) |
| Metadata / dates | 12–14px | 400 | light gray color |
| Labels / badges | 12px | 500–600 | UPPERCASE, sparingly |

### SEEKO translation (already locked in `tokens.md`)
- **Outfit** as the single family — geometric humanist, OK to carry editorial register
- **Match Joby's lowercase rule** for editorial headlines. The current "Welcome back." should become "welcome back." — sentence-case lowercase with period.
- Editorial scale already matches Joby (display 4rem ≈ 64px, h1 3rem ≈ 48px, body 1rem = 16px)
- **Body line-height should be ≥1.55** (currently `--text-body` line-height isn't tokenized; in component CSS use `leading-relaxed` for body, ~1.6).
- Tracking: minimal-to-none (Joby doesn't lean on letter-spacing). Headlines: `-0.02em` tightening as we have. Body: 0. Uppercase metadata: 0.16–0.18em.

### Key typographic details to copy
- **Em-dashes in copy.** "Skip town, let's fly" — not commas. Use em-dash for list separation, ranges, parenthetical asides.
- **No italics** — weight contrast over style variation.
- **No quotes** prominently displayed — quotes appear only when needed and sparingly.
- **Periods at the end of editorial headlines** ("Skip traffic.") — declarative, not interrogative.

---

## 4. Layout & spacing

### Joby's structure
- **12-column grid** desktop, single column mobile
- **Macro padding** (section edges): 40–80px desktop
- **Micro padding** (inside components): 16–24px
- **Vertical rhythm:** ~60px gaps between major sections
- **Max content width:** ~1200–1400px
- **Whitespace ratio:** ~40% of viewport on desktop — content occupies 60%, whitespace 40%

### Pattern
- Hero is **full-bleed**, no padding, no margin
- Content sections are **constrained, centered** with generous side padding
- Image+text pairings **alternate** (image left, then image right, etc.)
- Navigation is **fixed/sticky** at top

### SEEKO translation
- Spacing tokens already cover this scale: `--space-12` (48px), `--space-16` (64px), `--space-24` (96px)
- For sign-in: page padding should be `px-8 sm:px-12 lg:px-16` (32px → 48px → 64px) — matches Joby's 40–80px range
- Vertical rhythm: 64px (`space-16`) between major editorial blocks; 24px (`space-6`) between related elements; 48px (`space-12`) for section separation
- **Generous whitespace is correct** — 40% empty viewport is the target, not the bug

---

## 5. Component vocabulary

### Buttons / CTAs — THIS IS WHERE WE'RE WRONG
**Joby's buttons are text-based, NOT filled pills.**

- Style: text + underline, OR text + subtle border. **No fills.**
- Examples: "Discover the Experience," "Explore," "View all News"
- Hover: underline appears or color shift
- No rounded corners, no pill shapes
- Sentence case

**SEEKO action:** the current `seeko-ui/Button` has a `variant="primary"` with **filled ink + pill** which is a *brand* button, not a Joby-register button. We need either:
- (a) New `variant="link"` — text + animated underline, no fill — for editorial surfaces
- (b) Reframe the existing `variant="ghost"` as the Joby-register CTA

The pill primary stays in the system for high-emphasis dashboard actions, but the **editorial sign-in must use the text-CTA pattern**. This was a mismatched primitive choice on my part.

### Inputs
- Joby has minimal form usage (only the email signup at footer)
- Style: minimal — text input with hairline border-bottom (likely), submit on the right
- Our `seeko-ui/Input` (full hairline ring + 14px radius) is already restrained; could be simplified to **bottom-border-only** for true Joby register

### Navigation
- Top: logo (left), menu (right), no chrome, no shadows
- Footer: grouped sections (Discover / Explore / Connect)

### Cards / containers
- **None.** Joby has zero card-based UI. Content flows as full-width image + text pairs in flat sections. No elevation, no enclosed boxes.
- **SEEKO action:** stay disciplined about card usage — don't reach for `seeko-ui/Card` on editorial surfaces.

---

## 6. Motion

### Joby
- **Restrained.** No flashy entrance animations.
- Animated logo (`.webp` sequence)
- Scroll-driven image reveal (likely opacity/translate on scroll into view)
- Probable hover: underline animation, color shift
- Page transitions: subtle fade or slide

### SEEKO inherits
- **No entrance animations on form chrome** (inputs, button)
- **Subtle entrance on chrome elements is OK** (masthead rule sweeping in, headline fade-up) — but ALL guarded by `prefers-reduced-motion`
- **GSAP is the right tool** for any complex motion (already wired up)
- **No bounce, no spring overshoot** for editorial register — power2/power3 ease curves only

---

## 7. Imagery

- Full-width or near-full-width framing
- Cool-toned (blues, cyans in skies); muted ground/urban
- Consistent color temperature across all hero images
- Photography is the **primary visual asset** — illustration and iconography are minimal/absent

### SEEKO action
- For sign-in we currently have NO photography. Two paths:
  - **Path A — pure ink-on-paper editorial.** No imagery. Type does all the work. Honors the wordmark's hand-lettered character. *Recommended for sign-in.*
  - **Path B — single hero photograph.** A SEEKO-relevant image (studio space, work-in-progress shot, character art). High commitment — must be *good* or it cheapens the register.

For PR0 sign-in: **Path A.**

---

## 8. What Joby DOES NOT do (anti-patterns to avoid)

| ❌ Joby never | Why it matters |
|---|---|
| Drop shadows | Flat aesthetic — depth from spacing, not light |
| Gradients | Solid colors only, photography for chroma |
| Borders/frames around images | Images bleed into whitespace |
| Card-based UI with elevation | Flat sections, full-width or constrained |
| Filled bright button colors | Text-based CTAs |
| Dense iconography | Photography + text only |
| Big load animations | Restraint > flashiness |
| Testimonials / social proof widgets | Not their voice |
| Decorative flourishes | Pure functional minimalism |

**Every item on this list is a discipline SEEKO inherits verbatim.** When in doubt: would Joby do this? If no, don't.

---

## 9. Typographic micro-details

| Detail | Joby | SEEKO action |
|---|---|---|
| Headline case | lowercase, sentence-cased ("skip traffic.") | **Switch our headline to lowercase** |
| Section titles | Title Case ("Experience Highlights") | Match |
| Buttons | Sentence case ("Discover the Experience") | Match |
| Legal/metadata | lowercase | Match |
| Em-dashes | yes, for list separation and asides | Use freely |
| Periods on headlines | yes ("Skip traffic.") | Already do |
| Quotes | absent or sparing | Avoid |
| Italics | not detected | Avoid |
| All-caps | tiny labels only ("Coming soon", weight 500–600) | Match — uppercase only for 11–12px metadata, 500–600 weight, 0.16–0.18em tracking |

---

## 10. Quantified observations

- **Color count:** 3–4 core (white, dark gray, accent ~ sky blue, hairline gray)
- **Typography families:** 1
- **CTA style repeat count:** identical pattern used 8+ times
- **Whitespace:** ~40% of viewport on desktop
- **Information density:** low; breathing room prioritized
- **Component reuse:** very high (DRY visual vocabulary)

---

## SEEKO sign-in — direction informed by this study

Concrete changes our current sign-in needs to match Joby's register:

1. **Headline lowercase.** "welcome back." not "Welcome back." (still period-terminated, declarative).
2. **CTA becomes text-based.** Replace the filled-ink pill with `text-link` style — Outfit at body weight, ink color, animated underline on hover. The pill primary stays in the system for non-editorial use only.
3. **No "N° 01 · TEAM SIGN-IN" masthead chrome.** Joby doesn't do issue numbers / edition labels. Drop it.
4. **No rules across the top.** Joby doesn't decorate with hairlines as content separators. Drop the masthead rule.
5. **Wordmark scale considered.** Joby's logo is small (top-left of nav). Our wordmark scaled to h-32 (the agent's draft) is too loud — should be small and deliberate (~32px) at top-left, OR the page goes wordmark-less and uses type alone.
6. **Single editorial column** rather than two-column masthead split. Joby's content sections are constrained-and-centered, alternating image/text. For a sign-in (no photography), single-column constrained max-w-md with high vertical rhythm.
7. **Generous body line-height** (≥1.55) for any supporting copy.
8. **Em-dashes in copy** where appropriate.
9. **No additional "Returning member" / "Internal · Invite-only" / edition labels.** Joby doesn't decorate. Sign in is sign in.
10. **No card around the form.** Form fields sit directly on cream paper.

This is the visual contract going forward. Every surface migration the `seeko-visual` agent does should pass the question: *would Joby do this?* — and reject anything that fails.
