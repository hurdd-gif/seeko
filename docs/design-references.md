# Design References & Ideas

A place to drop references, screenshots, links, and notes for UI/UX inspiration.
Use this to inform Pencil wireframes and Design Canvas explorations.

**Primary source:** [jakub.kr](https://jakub.kr/) — Jakub Kruczek's design engineering site. Full sitemap scraped 2026-03-12.

---

## Portal Light — Token Baseline (Paper 27P-0)

> **Canonical white-canvas design system.** Extracted 2026-07-05 from Paper file
> `SK_DB`, frame `27P-0` — the Phantom-style sign-in reference
> ([link](https://app.paper.design/file/01KSQVTCXRWVYD4DSR5YFANJHB/1-0/27P-0)).
> This is the source of truth for every **pure-white** surface: `/login`,
> `/contractor`, the external-signing ceremony, and payments-access. It is
> **distinct from** `.overview-light` (the `#eeeeee` editor ground, `--ov-*`).
> Machine tokens live in `src/rr-app/globals.css` (`--color-ink-*`,
> `--radius-sheet/-control`, `--shadow-float`). Design new portal components
> against this table, not by eyeballing a screenshot.

**Two reconciliations from the raw Paper values (both deliberate, both encoded):**
1. **Weight → single 500.** The app resolves every `font-weight` to 500 Inter
   (`globals.css:61-66`). The reference's 400-body / 600-heading contrast does
   **not** survive into the app — so hierarchy is carried by **size + color, never weight.**
2. **Contrast → AA floor.** The reference's muted grays fail WCAG AA for body
   copy (`#b4b4b4` ≈ 2:1, `#969696` ≈ 2.7:1). They are reserved for
   decorative / large / non-essential text. Real instructional copy uses
   `#686868` (4.9:1) or darker — the same fix `lightKit.LIGHT_RECIPIENT_MUTED`
   already ships.

### Ink ramp (text on white)

| Token (`--color-*`) | Hex | Contrast | Use |
|---|---|---|---|
| `ink-strong` | `#2a2a2a` | 13.6:1 | Strongest body — list-row titles |
| `ink` | `#3a3a3a` | 10.5:1 | Control labels (ref button text) |
| `ink-heading` | `#454545` | 8.1:1 | Page H1 (supersedes ref card-heading `#515151` for AA) |
| `ink-mark` | `#525252` | — | Brand-mark circle **ground only** (ref avatar bg) |
| `ink-muted-strong` | `#686868` | 4.9:1 | **AA floor** — top-bar labels + any real muted copy |
| `ink-muted` | `#808080` | 3.5:1 | Meta / status (AA-large or UI graphics only) |
| `ink-faint` | `#969696` | 2.7:1 | Footer, sublines (decorative / large only) |
| `ink-faintest` | `#b3b3b3` | 2.0:1 | "No deadline", hints (decorative only) |
| `ink-ghost` | `#c4c4c4` | — | Graphic only — counts, chevrons, status dots |

### Surface · radius · elevation

| Token | Value | Use |
|---|---|---|
| `--color-surface-1` | `#ffffff` | Canvas + card fill |
| `--color-control-fill` | `#f1f1f1` | Button / segment fill (ref 28C) |
| `--color-hairline` | `#e8e8e8` @ 75% | Card border (ref 282 `#E8E8E8BF`) |
| `--radius-sheet` | `8px` | Cards / grouped surfaces — sheets read **tighter than their controls** |
| `--radius-control` | `16px` | Buttons / interactive fills at the reference's **48px** height (ref 28C). Scale the radius **down with control height** to hold the same corner *appearance* — a 36px button uses `rounded-xl` (12px); 16px on 36px reads as an accidental pill. |
| `--radius-pill` | full | Avatars, pills (ref avatar 285) |
| `--shadow-float` | `0 10px 20px #d1d1d126` | Hero / auth / modal cards — **pairs with** the hairline border |
| `--shadow-seeko` | ring + `0 1px 2px` | Dense stacked lists (flatter than float) |

> **Elevation rule:** the reference lifts its *one* hero card with `shadow-float`
> **and** a hairline border together (not shadow-instead-of-border). Reserve that
> for genuine hero cards; a page full of stacked surfaces uses the flatter
> `shadow-seeko` so the stack doesn't turn into soup.

### Type scale (Inter, weight 500 throughout)

| Role | Size / line-height / tracking | Color |
|---|---|---|
| Card / page heading | `22px` / `24px` / `-0.02em` | `ink-heading` |
| Body | `16px` / `19px` / `0` | `ink-muted-strong` (never the ref's faint `#b4b4b4` for real copy) |
| Control label | `16px` / `19px` | `ink` |
| Label / footer | `14px` / `17px` | `ink-faint` |

### Layout rhythm (extracted spacing)

- Column max-width **620px**; card inner padding **40px** block / **24px** inline.
- Vertical gaps: avatar→heading **24px**, heading→description **8px**, card→footer **32px**, button-group **8px**.
- Control height **48px**, inline padding **16px**, icon gap **8px**.

### Breadcrumb deliverable steps — component tokens

> **First component vocabulary built ON the baseline above.** Extracted 2026-07-05
> from the step-model prototype — now folded into the canonical `/contractor/qa`
> preview and the live `/contractor` route (`StepNode`, `DeliverableSteps`,
> `StepDeliverableTimeline`; derivation in `src/lib/contractor-steps.ts`). It is the worked example of how portal
> components should read: **one hairline spine, grouping by heading + margin
> (never a card frame), state carried by node fill + a matching trailing label,
> focus carried by department color — hierarchy from size + color, never weight.**

**Spine + grouping** — one continuous line, nodes straddle it, content clears it:

| Element | Class / value | Note |
|---|---|---|
| Spine | `relative ml-1.5 border-l border-hairline` | **One** line, full height — the only structural stroke on the page |
| Group stack | `<section class="space-y-8 pb-9">` | 32px between deliverables, 36px before the Timeline zone |
| Content inset | `pl-6` (everything) | Clears the spine so text never collides with a node |
| Node offset | focal `-left-[6px]`, other `-left-[5px]` | Straddles the 1px spine so the fill reads *on* the line |
| Group heading | `text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint` | The **only** new-group signal — no top-level "Deliverables" header |
| Rollup (M-of-N / status) | `text-[11px] tabular-nums text-ink-ghost`, right-aligned | Summary of the group's focal step; derived, never stored |
| Empty group | `text-[13px] text-ink-faintest` "No steps yet" | Decorative-faint tier is fine here (non-essential) |

**Node = state.** Fill color is the semantic carrier; a matching trailing label repeats it as text (never color-only):

| Rendered state | Node glyph | Fill / accent | Trailing label |
|---|---|---|---|
| `active` (focal) | `size-3` filled | **department hex** — Coding `#0a63cc` · Visual Art `#3f5fb5` · UI/UX `#6e4fc4` · Animation `#b8801a` · Asset Creation `#bd3f7c` (fallback `#b8801a`) | due date, `ink-ghost`; **step name in dept color** = the one focus |
| `pending-review` | `size-2.5` filled | review blue `#3f5fb5` | "In review", `#3f5fb5` |
| `missed` | `size-2.5` filled | overdue red `#d4503e` | ⚠ `size-3` + "N days overdue", `#d4503e` |
| `done` | `size-2.5` ring + `size-1` center dot | `ink-ghost` `#c4c4c4` ring/dot | date + ✓ `Check size-3.5` in success green `#15803d` |
| `upcoming` | `size-2.5` hollow ring | none (hairline ring) | date, `ink-ghost` |

**Motion** (all reduced-motion-guarded):

| Move | Token | Rule |
|---|---|---|
| Focal node entrance | `initial scale:0.6 → 1`, `springs.snappy` (spring **500 / 30**) | Nothing scales from 0 — 0.6 floor (emil) |
| Node fill change (advance) | `background-color 200ms cubic-bezier(0.23,1,0.32,1)` | Specify the property, strong ease-out, never `all` |
| Advance button press | `active:scale-[0.99]`, `transition-transform 150ms ease-out`; focus ring `ring-[#0d7aff]/40` | Every pressable gives `:active` feedback |
| Compaction expand | `.animate-timeline-enter` (400ms, opacity+`translateY(8px)`+`blur(4px)`), per-row `animationDelay: i*60ms` | Blur masks the crossfade; stagger reveals the cluster |

**Advance affordance:** a focal step whose stored state is `pending` renders as a
`<button aria-label="Submit {name} for review">`; a missed (overdue) focal step
**still advances** (canAdvance = focal ∧ pending). An `in_review` focal shows no
button. The submit is optimistic (flip to In review, revert + inline `#d4503e`
error on failure).

---

## Components

### Timeline / Roadmap
- **Source:** https://x.com/morphindev/status/2028758806646116502
- **Notes:** Timeline component — useful for roadmapping milestones and phases. Could work as an alternative to progress bars for multi-stage workflows.

### Task Cards
- **Source:** https://x.com/jshguo/status/2028743751640993914
- **Notes:** Tasks component — useful for different to-do cards, calendar, monthly task.

### Component Gallery
- **Source:** https://component.gallery/components/
- **Notes:** Component knowledge — a gallery to understand the different variables that go into web design. Useful for knowledge about components and when/how to use them.

### Animated Sign-In Dialog
- **Source:** [jakub.kr/components/sign-in-dialog](https://jakub.kr/components/sign-in-dialog)
- **Notes:** Multi-step dialog with animated height transitions using `useMeasure` (react-use-measure). Height animates via `ResizeObserver` — avoids animating to/from `auto`. Content transitions use `AnimatePresence mode="wait"` with directional slide. Morphing tab component for auth method switching. Applicable to any multi-step dialog or modal with dynamic content.
- **Key technique:**
  ```tsx
  const [ref, bounds] = useMeasure({ offsetSize: true });
  <motion.div animate={{ height: bounds.height }} className="overflow-hidden will-change-transform">
    <div ref={ref}>{content}</div>
  </motion.div>
  ```

### Animated Input Field
- **Source:** [jakub.kr/components/input-field](https://jakub.kr/components/input-field)
- **Notes:** Focus glow + label animation on input fields using CSS and Motion. Applicable to any form with text inputs.

### Animated Icons
- **Source:** [jakub.kr/components/animating-icons](https://jakub.kr/components/animating-icons)
- **Notes:** Contextual icon swap with opacity + scale + blur transition. Three variants: no animation, opacity-only, full (opacity + scale + blur). CSS and Motion implementations. Applicable to copy/check toggles, status icon changes, loading→complete states.

### Infinite Card Stack
- **Source:** [jakub.kr/work/infinite-card-stack](https://jakub.kr/work/infinite-card-stack)
- **Notes:** Swipeable/animated card stack with peek at next cards. Could work for notifications, onboarding, or content browsing.

### Carousel
- **Source:** [jakub.kr/components/carousel](https://jakub.kr/components/carousel)
- **Notes:** Animated carousel component. Useful for slide previews, image galleries, or testimonials.

### Outline Orbit
- **Source:** [jakub.kr/components/outline-orbit](https://jakub.kr/components/outline-orbit)
- **Notes:** Animated outline orbit effect. Decorative — could work for loading states or empty states.

### Image Preview
- **Source:** [jakub.kr/components/image-preview](https://jakub.kr/components/image-preview)
- **Notes:** Animated image preview/lightbox. Applicable to: deck slide viewer, deliverable attachments, comment image attachments.

---

## Pages

### Clip Path Buttons
- **Source:** [jakub.kr/work/clip-path-buttons](https://jakub.kr/work/clip-path-buttons)
- **Notes:** Creative button shapes using CSS clip-path. Experimental — could work for playful or unconventional UI elements.

### Using AI as a Design Engineer
- **Source:** [jakub.kr/work/using-ai-as-a-design-engineer](https://jakub.kr/work/using-ai-as-a-design-engineer)
- **Notes:** Workflow insights on using AI tools for design engineering. Reference for AI-assisted design workflows.

---

## Visual Guidelines

- **Source:** [Jakub Kruczek — Details That Make Interfaces Feel Better](https://jakub.kr/writing/details-that-make-interfaces-feel-better)
- **Local doc:** `docs/visual-guidelines.md`
- **Notes:** 13 principles for interface polish — text wrapping, concentric border radius, contextual icon animation, antialiased text, tabular numbers, interruptible animations, staggered entrances, subtle exits, optical alignment, shadows over borders, image outlines, shared layout animations, motion gestures. **Mandatory baseline for all UI work.**

---

## Animations & Motion

### Shared Layout Animations
- **Source:** [jakub.kr/work/shared-layout-animations](https://jakub.kr/work/shared-layout-animations)
- **Local doc:** `docs/visual-guidelines.md` (Section 12)
- **Notes:** FLIP-based `layoutId` patterns — tab indicators, card→modal, filter transitions. Keep `layoutId` components outside `AnimatePresence`. Common applications: sidebar active indicators, tab bars, mobile nav.

### Motion Gestures
- **Source:** [jakub.kr/work/motion-gestures](https://jakub.kr/work/motion-gestures)
- **Local doc:** `docs/visual-guidelines.md` (Section 13)
- **Notes:** Six gesture types (hover, tap, drag, pan, focus, inView). Springs over easing for all gestures. Compositor-thread performance. Keyboard accessibility built in. Common applications: buttons, filter pills, list rows, interactive cards.

### Drag Gesture (Deep Dive)
- **Source:** [jakub.kr/work/drag-gesture](https://jakub.kr/work/drag-gesture)
- **Notes:** Detailed drag implementation — `dragConstraints`, `dragElastic`, `dragSnapToOrigin`. Applicable to: swipe-to-dismiss, bottom sheet drag, reorderable lists.

### SVG Path Length Animations
- **Source:** [jakub.kr/work/path-length](https://jakub.kr/work/path-length)
- **Notes:** `pathLength` animation for SVG stroke drawing effects. Could work for progress indicators, loading animations, or onboarding illustrations.

---

## Color / Theming

### OKLCH Colors
- **Source:** [jakub.kr/components/oklch-colors](https://jakub.kr/components/oklch-colors)
- **Notes:** Deep dive into OKLCH color space. Useful for projects using OKLCH theme tokens. Reference for expanding palettes or creating derived colors.

### Understanding Gradients
- **Source:** [jakub.kr/work/gradients](https://jakub.kr/work/gradients)
- **Notes:** Gradient techniques and color interpolation. Useful for creating richer background effects or accent gradients.

---

## Shadows & Depth

### Shadows Instead of Borders
- **Source:** [jakub.kr/work/shadows](https://jakub.kr/work/shadows)
- **Notes:** Triple-layer composite shadows for cards instead of flat borders. Shadows adapt to any background via transparency. Hover state uses same structure with stronger opacity. Transition via `transition-[box-shadow]`.
- **Dark mode shadow example:**
  ```css
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 4px 16px rgba(0, 0, 0, 0.1);
  ```

### Concentric Border Radius (Deep Dive)
- **Source:** [jakub.kr/work/concentric-border-radius](https://jakub.kr/work/concentric-border-radius)
- **Notes:** Extended article on the `outer = inner + padding` formula. Inherited from industrial design (watch bezels, product enclosures). Apple added `.concentric` to SwiftUI. **Audit opportunity:** Check all nested card/container relationships for mismatched radii.

---

## Performance & CSS

### will-change in CSS
- **Source:** [jakub.kr/components/will-change-in-css](https://jakub.kr/components/will-change-in-css)
- **Notes:** When and how to use `will-change` for GPU layer promotion. Only apply to elements that actually animate — overuse wastes memory.

### CSS Pattern Backgrounds
- **Source:** [jakub.kr/components/pattern](https://jakub.kr/components/pattern)
- **Notes:** CSS-only pattern backgrounds. Could work for empty states or subtle page backgrounds.

### Shader Playground
- **Source:** [jakub.kr/work/shader-playground](https://jakub.kr/work/shader-playground)
- **Notes:** Dithering shader effects. Experimental — could be interesting for stylized visual elements or texture effects.

---

## Typography

### Typography Principles (Obys Agency)
- **Source:** [typographyprinciples.obys.agency](https://typographyprinciples.obys.agency/)
- **Notes:** Interactive design education series covering font selection, line-height & tracking, font pairing, alignment, and typographic contrast. Scraped 2026-03-12.
- **Local doc:** `docs/visual-guidelines.md` (Sections 1, 15–19)
- **Key principles:**
  - Choose 1–2 fonts per project based on context/industry/emotion
  - Paragraph text: line-height 120–130%, tracking -1% to +1%
  - Display headings: line-height 90–100%, tracking -6% to 0%
  - Font pairs: combine serif + sans-serif using contrast, proportions, and detail matching
  - Left-align 80% of the time for readability; center only for short headings
  - Limit to 2–4 font sizes with large steps between them (e.g. 90/60/30/14pt)
  - Avoid small differences in font size — go bold or go home

### Text Wrapping
- **Principle:** Use `text-wrap: balance` on headings to prevent orphaned words.
- **Tailwind:** `text-balance` class (Tailwind v4)
- **Audit opportunity:** Apply to all card titles, section headings, and empty state descriptions.
