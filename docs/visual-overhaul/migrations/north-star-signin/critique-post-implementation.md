# /interface-craft critique — North-Star A (sign-in)

Date: 2026-04-28
Surface: `src/app/(auth)/login/page.tsx`
Screenshot: `post-build.png` (1440×900 light mode)

---

## Context

Sign-in page for SEEKO Studio — an internal team workspace (game studio + investor portal). Target user is a returning team member or invited contractor; emotional context is routine and frictionless. The surface should feel like the threshold of a well-edited document, not a "product."

## First Impressions

The cream-paper-and-ink language reads. The headline carries weight. The single ink pill CTA is decisive. But the wordmark feels accidental — it's there, small, lonely at the top, with a wide air gap below before the headline kicks in. That gap reads as un-composed rather than intentional. Once the eye drops to the headline, the form column sits center-of-page but the headline is left-aligned within that column, creating an offset against the page-centered wordmark above. The composition is *almost* right but its spine isn't straight.

## Visual Design

- **Wordmark too small** — At ~28px tall on a 1440 viewport, the wordmark reads as a placeholder, not a brand statement. The page has chosen "editorial document" as its register; an editorial cover doesn't whisper its title at 28px. Should be 56–72px to anchor the composition.

- **Headline ↔ wordmark axis mismatch** — Wordmark is page-centered; the form column (max-w-[26rem]) is also page-centered; but `text-balance` left-aligns the headline within that column, so the visual axis of "Welcome back." sits left of the wordmark axis. Either center the headline or move both to a shared left edge.

- **Input ring color drift** — `ring-1 ring-ink/15` derives the hairline from ink at 15% opacity. We have a `--color-border` token (`oklch(0.880 0.010 70)`) that exists for exactly this purpose. The current ring reads slightly darker than a true hairline at 1440×900. Switch to the border token.

- **Focus ring too prominent** — `ring-2 ring-ink/60` on the focused password input reads as a hard black box rather than a quiet "I'm here." 40% opacity or 1px at higher opacity would feel more editorial.

- **Mono label tracking insufficient** — `tracking-[0.08em]` on uppercase 11px mono almost reads as proper-case. Uppercase mono needs 0.10–0.14em; design tokens spec said 0.01em (general mono) but uppercase-mono is a special case. Bump labels to 0.12em.

- **Active tab indicator thickness** — Active indicator is `h-px` (1px) sitting on top of a `border-b border-ink/10` (also 1px). The same line weight makes the indicator feel hesitant. Bump to 1.5px or 2px to read decisively.

## Interface Design

- **Vertical rhythm** — Top of page → wordmark (pt-12) → ~280px empty → headline → form. The empty space reads as accidental. Tighten: pt-16 wordmark, then `flex-1` push content into the *upper* third with shorter gap below the wordmark, not the middle.

- **Continue CTA full-width** — The button is the same width as the inputs. That makes it feel like a 4th input. Editorial register: primary CTA usually narrower than input row, or has clear margin reserved on left/right. `max-w-xs mx-auto` would let the type weight do the work, not the button width.

- **No focusing mechanism above the fold** — On first paint, the wordmark is too small to anchor; the headline is below the visual center. The eye lands on the empty top half, then has to scan down. A bigger wordmark + tighter top spacing would give the page an immediate anchor point.

## Consistency & Conventions

- **Button press feedback** ✓ — `active:scale-[0.97]` from the seeko-ui Button primitive.
- **Tab `aria-selected`** ✓ — accessible, working.
- **No `transition: all`** ✓ — exact property lists used everywhere.
- **Concentric radius** ✓ — input 8px, button pill, no nested mismatch on this surface.
- **No image outline on wordmark** — per the 13 details, images on matching-tone backgrounds need a 1px outline at low opacity to give definition. The dark wordmark on cream paper has an antialiased edge that reads slightly soft.

## User Context

A team member arriving here is in transit — they've clicked a bookmark, they want to be inside the app. The page should respect that by being unmissable but unfussy. Right now the headline does that work; the wordmark doesn't. Fixing the top of the page is the highest-impact change for someone who lives in this surface daily — they should feel "home" the moment it paints, not "where's the brand?"

---

## /make-interfaces-feel-better — 16-point checklist

| # | Detail | Status | Notes |
|---|---|---|---|
| 1 | text-wrap balance/pretty | ✓ | `text-balance` on headline. |
| 2 | Concentric border radius | ✓ | Input 8px, pill 9999px. No nested mismatch. |
| 3 | Animate icons contextually | N/A | No icon swaps on this surface. |
| 4 | Crispy text (antialiased) | ✓ | `antialiased` on body, smoothing in globals.css. |
| 5 | Tabular numbers | ✓ | Footer mono has `tabular-nums`. |
| 6 | Interruptible animations | N/A | No animations (intentional sparse register). |
| 7 | Stagger entrances | N/A | No entrances (intentional). |
| 8 | Subtle exits | N/A | No exits. |
| 9 | Optical alignment | **✗** | Headline left-aligned within centered column ≠ centered wordmark axis. |
| 10 | Shadows over borders | N/A* | Visual language uses hairlines intentionally — NOT a violation. |
| 11 | Image outlines | **✗** | Wordmark `<Image>` lacks subtle outline. |
| 12 | Shared layout animations | N/A | No element transitions. |
| 13 | Motion gestures | ✓ | Button `active:scale-[0.97]`. Tabs hover via opacity, no scale (acceptable). |
| Emil — exact transition props | ✓ | All transitions specify exact properties. |
| Emil — nothing scales from 0 | N/A | No entrances. |
| Emil — ease-out over ease-in | ✓ | `ease-out` everywhere. |
| Emil — active feedback | ✓ | Button has it. |

---

## Top Opportunities (ranked by impact)

1. **Wordmark to 56–72px tall + tighten top air gap** — biggest "feels off" fix. Brand-anchored composition.
2. **Center the headline (`text-center`)** — straightens the spine.
3. **Switch input ring to `--color-border` token** — true hairline.
4. **Tighten focus ring (`ring-1 ring-ink/40` or accent at low chroma)** — quieter focus signal.
5. **Active tab indicator to 1.5–2px height** — decisive vs. hesitant.
6. **Mono label tracking to 0.12em** — true uppercase mono spacing.
7. **Continue CTA `max-w-xs mx-auto`** — narrower, type weight does the work.
8. **Wordmark `<Image>` with `outline-1 outline-ink/8 -outline-offset-1`** — definition on cream.
