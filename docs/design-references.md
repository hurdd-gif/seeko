# Design References & Ideas

A place to drop references, screenshots, links, and notes for UI/UX inspiration.
Use this to inform Pencil wireframes and Design Canvas explorations.

**Primary source:** [jakub.kr](https://jakub.kr/) — Jakub Kruczek's design engineering site. Full sitemap scraped 2026-03-12.

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
