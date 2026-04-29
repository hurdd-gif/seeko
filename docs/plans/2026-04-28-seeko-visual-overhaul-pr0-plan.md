# SEEKO Visual Overhaul — PR 0 (Foundation) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the foundation of the SEEKO visual overhaul: OKLCH-defined token system in `globals.css`, `seeko-ui` wrapper scaffolding, two north-star surfaces (sign-in + task row fragment), `seeko-visual` subagent definition, and updated visual guidelines. Subsequent waves (auth, docs, investor, dashboard) are agent-driven and live in their own PRs.

**Architecture:** Two voices, one system. Editorial cream/ink language with OKLCH-defined palette, ONE accent + ONE status hue, ONE sans + ONE mono. North-stars prove the language at both poles (sparse / dense) before any other surface is touched. The `seeko-visual` agent uses the north-stars as the visual contract for every subsequent migration, with `/interface-craft critique` AND `/make-interfaces-feel-better` baked in as pre/post discipline.

**Tech Stack:** Next.js 16, React 19, HeroUI v3.0.0-beta.8, Tailwind v4 (CSS `@theme inline` config in `globals.css`), Supabase, motion/react, Vitest+jsdom for tests, Playwright MCP for screenshots.

**Reference design doc:** `docs/plans/2026-04-28-seeko-visual-overhaul-design.md`

**Working directory:** Main repo at `/Volumes/CODEUSER/seeko-studio` on a feature branch (NOT a worktree — per user's protocol, dev server runs from main, and worktree sync rules add risk for a foundational visual change).

---

## Pre-flight Decisions

Before any task runs, resolve the three open questions from design doc Section 9. These are decisions the user makes with the model's help, not steps an executor performs blindly.

**Decision 1 — Brand accent hue.** Three options:
- (a) Derive from SEEKO branding assets at `~/Desktop/SEEKO_Assets/branding/` (assets present: `3DSeeko.png`, `BlackSeeko.png`, `WhiteSeeko.png`, `S.png`)
- (b) "No accent" Joby-purist — ink IS the accent
- (c) Quiet ink-derived hue (e.g., `oklch(45% 0.04 260)` deep slate — feels like ink with intent)

**Decision 2 — Sans family.** Two options:
- (a) Keep **Outfit** (already loaded via `next/font`), use it more confidently at editorial scale
- (b) Swap to a more editorial sans (Geist, Inter Display, Söhne, GT America) — adds vendor cost but may better match Joby register

**Decision 3 — `seeko-ui` wrapper depth in PR 0.** Two options:
- (a) **Minimum primitive coverage** — Button, Input, Card, Tabs (enough for both north-stars). Defer Select, Dialog, Dropdown, etc. to migration PRs as encountered.
- (b) Full coverage upfront — every primitive in `src/components/ui/` gets a wrapper. Heavier PR 0, lighter migrations.

**Recommend (a) for all three** unless user signals otherwise. Tasks below assume (a).

---

## Task 0: Branch + design-doc commit

**Files:**
- No code changes; git operations only

**Step 1: Create feature branch**

```bash
git checkout -b feat/visual-overhaul-pr0
```

**Step 2: Stage and commit the design doc**

```bash
git add docs/plans/2026-04-28-seeko-visual-overhaul-design.md docs/plans/2026-04-28-seeko-visual-overhaul-pr0-plan.md
git commit -m "docs: SEEKO visual overhaul design + PR0 plan"
```

**Step 3: Verify branch + clean tree**

Run: `git status`
Expected: `On branch feat/visual-overhaul-pr0` and `nothing to commit, working tree clean`

---

## Task 1: Audit current globals.css for token surface area

**Files:**
- Read-only: `src/app/globals.css`

**Step 1: Map every mint reference**

Run: `grep -n "6ee7b7\|seeko-accent\|accent-glow\|accent-inset\|interactive-surface\|column-resize-handle\|selectedCell\|doc-content a" src/app/globals.css`

Expected: list of line numbers covering all hardcoded mint usage. Save the list to a scratch buffer — Task 5 strips them all.

**Step 2: Map every department color reference**

Run: `grep -rn "dept-coding\|dept-visual-art\|dept-ui-ux\|dept-animation\|dept-asset-creation" src/`

Expected: list of token + usage references. Save — Task 5 strips these too.

**Step 3: Map every hardcoded hex in src/**

Run: `grep -rEn "#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b" src/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v node_modules | wc -l`

Expected: a number. This is our baseline — success criterion is reducing this to zero outside `globals.css` and intentional illustrations by end of Wave 5. PR 0 won't hit zero, but track the number.

**Step 4: No commit (read-only audit)**

---

## Task 2: Derive OKLCH palette via /oklch-skill + /color-expert

**Files:**
- Will produce: a palette doc at `docs/visual-overhaul/palette.md` (created in Task 3)

**Step 1: Invoke /oklch-skill**

Use `Skill` tool with `oklch-skill`. Input: target a cream-paper light mode + warm-deep-ink dark mode, ONE brand accent (per Decision 1), ONE warning hue (warm amber for status). Tailwind v4 native OKLCH support required. Light + dark must be perceptual mirrors.

**Step 2: Invoke /color-expert**

Use `Skill` tool with `color-expert`. Input: validate the OKLCH palette from Step 1 — naming, perceptual matching, accessibility contrast (WCAG AA minimum body 4.5:1, AAA target 7:1 for body text), ramp generation if needed for hairline borders / muted text steps. If accent not yet decided (Decision 1), pull candidate hues from `~/Desktop/SEEKO_Assets/branding/3DSeeko.png` and `BlackSeeko.png`.

**Step 3: Lock final palette values**

Output expected: ~12-16 OKLCH values covering:
- Paper, ink, paper-dark, ink-dark
- Border (hairline) light + dark
- Muted text light + dark
- Accent (single brand) + accent-foreground
- Status warning + status-foreground
- Optional: subtle elevation tint for popovers/modals
- Document contrast ratios for each pair

**Step 4: No commit yet** — palette doc is written in Task 3.

---

## Task 3: Write palette doc + visual-overhaul directory scaffolding

**Files:**
- Create: `docs/visual-overhaul/palette.md`
- Create: `docs/visual-overhaul/migrations/.gitkeep`

**Step 1: Create directory**

```bash
mkdir -p docs/visual-overhaul/migrations
touch docs/visual-overhaul/migrations/.gitkeep
```

**Step 2: Write palette.md**

Document format:
```markdown
# SEEKO Palette (OKLCH)

## Light mode
- `--color-paper: oklch(...)` — bg, contrast vs ink: X:1
- `--color-ink: oklch(...)` — fg
... (continue for every token)

## Dark mode
... (mirror)

## Contrast matrix
| Pair | Ratio | WCAG |
| ink on paper | 12.4:1 | AAA |
... (every meaningful pair)

## Decisions log
- Accent chosen: (a/b/c per Decision 1) — reasoning
- Status hue: warm amber, oklch(...) — chosen for warmth, distinct from accent
```

**Step 3: Commit**

```bash
git add docs/visual-overhaul/palette.md docs/visual-overhaul/migrations/.gitkeep
git commit -m "docs(visual-overhaul): OKLCH palette + migration directory"
```

---

## Task 4: Derive type + spacing tokens via /design-tokens

**Files:**
- Append to: `docs/visual-overhaul/palette.md` (rename to `tokens.md` if scope grows)

**Step 1: Invoke /design-tokens**

Use `Skill` tool with `design-tokens`. Input:
- Sans family per Decision 2
- Mono: JetBrains Mono
- Two type scales: editorial + compressed (per design doc Section 3.2 table)
- Spacing scale: derive 4-based scale (4, 8, 12, 16, 24, 32, 48, 64, 96)
- Border radius: 0.5rem inputs, 0.75rem cards, full pill on primary CTAs

**Step 2: Lock final values**

Output: type scale (display, h1-h3, body, small, mono) at editorial + compressed sizes with precise line-heights and tracking; spacing tokens; radius tokens.

**Step 3: Append to docs/visual-overhaul/palette.md (or create tokens.md)**

Document with the same Decision-log format as palette.

**Step 4: Commit**

```bash
git add docs/visual-overhaul/
git commit -m "docs(visual-overhaul): type + spacing tokens"
```

---

## Task 5: Rewrite globals.css — clean token cut

**Files:**
- Modify: `src/app/globals.css` (full rewrite of `@theme inline {}` block + utilities)

**Step 1: Write a Vitest contract test FIRST**

Create: `src/__tests__/visual/globals-contract.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf-8');

describe('globals.css token contract', () => {
  it('contains zero mint hex references', () => {
    expect(css).not.toMatch(/#6ee7b7/i);
  });

  it('contains zero department color tokens', () => {
    expect(css).not.toMatch(/--color-dept-/);
  });

  it('contains zero seeko-accent token', () => {
    expect(css).not.toMatch(/--color-seeko-accent/);
  });

  it('contains zero accent-glow shadows', () => {
    expect(css).not.toMatch(/--shadow-accent-(glow|inset)/);
  });

  it('uses OKLCH for color tokens', () => {
    const colorTokenLines = css.match(/--color-[a-z-]+:\s*[^;]+/g) ?? [];
    const hexCount = colorTokenLines.filter(line => /#[0-9a-f]{3,6}/i.test(line)).length;
    expect(hexCount).toBe(0);
  });

  it('declares paper + ink tokens', () => {
    expect(css).toMatch(/--color-paper:\s*oklch\(/);
    expect(css).toMatch(/--color-ink:\s*oklch\(/);
  });
});
```

**Step 2: Run the test — confirm it fails**

Run: `npm test -- globals-contract`
Expected: FAIL — current globals.css has mint, dept colors, accent-glow.

**Step 3: Rewrite `src/app/globals.css` `@theme inline {}` block**

Replace entire block with OKLCH tokens from `docs/visual-overhaul/palette.md`. Structure:
- Paper / ink (light + dark via `[data-theme="dark"]` selector)
- Border / muted / accent / status tokens
- Type tokens (`--font-sans`, `--font-mono` only — drop `--font-handwriting`)
- Editorial type scale (`--text-display`, `--text-h1`, ...)
- Compressed type scale (`--text-h1-compressed`, ...)
- Spacing (`--space-*`)
- Radius (`--radius-input`, `--radius-card`, `--radius-pill`)

**Step 4: Strip mint references from utilities**

Remove or rewrite (cream-appropriate replacements):
- `.interactive-surface` — replace with neutral hairline-border hover, no glow
- `--shadow-accent-glow`, `--shadow-accent-inset` — delete
- `.column-resize-handle` — restyle with ink at low opacity
- `.selectedCell` — restyle with ink at low opacity
- `.doc-content a` — replace mint with accent token

**Step 5: Strip Caveat font import**

Remove from `src/app/layout.tsx` if loaded there. Remove `--font-handwriting` from `globals.css`.

**Step 6: Re-run the contract test**

Run: `npm test -- globals-contract`
Expected: PASS all six assertions.

**Step 7: Run typecheck + build to catch import breakage**

Run: `npx tsc --noEmit`
Expected: zero errors. If errors reference `font-handwriting` or `dept-*` or `seeko-accent`, fix call sites (will be addressed more thoroughly in Wave 1+; for PR 0 scope just unblock typecheck).

**Step 8: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/__tests__/visual/globals-contract.test.ts
git commit -m "feat(globals): OKLCH token contract, strip mint + dept colors"
```

---

## Task 6: Re-derive .doc-read-body Tiptap prose styles

**Files:**
- Modify: `src/app/globals.css` (the `.doc-read-body` block, currently lines ~144-325)

**Step 1: Read current `.doc-read-body` block**

Use `Read` tool on `src/app/globals.css` lines 144-325. Catalog every hardcoded color, font weight, spacing decision.

**Step 2: Rewrite using new tokens**

Replace every hardcoded value with token references:
- Body text → `var(--color-ink)` at 85% via `color-mix(in oklch, var(--color-ink) 85%, transparent)`
- Headings → editorial type scale tokens
- Links → `var(--color-accent)`
- Code/mono → `var(--font-mono)` + paper-tinted background
- Quotes → ink at lower opacity, hairline left border

**Step 3: Visual smoke test**

Open the dev server, navigate to any surface that renders Tiptap content (likely an agreement or doc page). Verify prose renders with cream paper + ink, no mint links, readable hierarchy.

**Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(prose): re-derive .doc-read-body with new tokens"
```

---

## Task 7: seeko-ui wrapper layer scaffolding

**Files:**
- Create: `src/components/seeko-ui/index.ts`
- Create: `src/components/seeko-ui/Button.tsx`
- Create: `src/components/seeko-ui/Input.tsx`
- Create: `src/components/seeko-ui/Card.tsx`
- Create: `src/components/seeko-ui/Tabs.tsx`
- Create: `src/__tests__/visual/seeko-ui.test.tsx`

**Step 1: Write failing render tests for each primitive**

In `src/__tests__/visual/seeko-ui.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Button, Input, Card, Tabs } from '@/components/seeko-ui';

describe('seeko-ui primitives', () => {
  it('Button renders with editorial pill class', () => {
    const { container } = render(<Button>Continue</Button>);
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.className).toMatch(/rounded-/);
  });

  it('Input renders with hairline border, no fill', () => {
    const { container } = render(<Input placeholder="Email" />);
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
  });

  it('Card renders with hairline border, no shadow', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toBeTruthy();
  });

  it('Tabs renders', () => {
    const { container } = render(
      <Tabs items={[{ key: 'a', label: 'A', content: 'A' }]} />
    );
    expect(container.firstChild).toBeTruthy();
  });
});
```

**Step 2: Run — confirm fail**

Run: `npm test -- seeko-ui`
Expected: FAIL — modules don't exist.

**Step 3: Implement each primitive**

For each primitive: wrap the corresponding HeroUI component, override defaults to match editorial language. Example for Button:

```tsx
// src/components/seeko-ui/Button.tsx
import { Button as HeroButton, ButtonProps } from '@heroui/button';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SeekoButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const Button = forwardRef<HTMLButtonElement, SeekoButtonProps>(
  ({ variant = 'primary', className, children, ...props }, ref) => {
    return (
      <HeroButton
        ref={ref}
        radius="full"
        className={cn(
          'font-sans transition-[background-color,opacity,scale] active:scale-[0.96]',
          variant === 'primary' && 'bg-ink text-paper hover:opacity-90',
          variant === 'secondary' && 'bg-transparent text-ink ring-1 ring-ink/10 hover:bg-ink/[0.03]',
          variant === 'ghost' && 'bg-transparent text-ink hover:bg-ink/[0.03]',
          className
        )}
        {...props}
      >
        {children}
      </HeroButton>
    );
  }
);
Button.displayName = 'Button';
```

Apply analogous wrapping for Input, Card, Tabs. Each wrapper:
- Removes default HeroUI shadow
- Applies hairline border using token (`ring-1 ring-ink/10`)
- Specifies exact transition properties (never `all` — per `/make-interfaces-feel-better`)
- Uses scale-on-press `0.96` on Button
- Uses tokens, never hex

Export barrel:
```tsx
// src/components/seeko-ui/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Card } from './Card';
export { Tabs } from './Tabs';
```

**Step 4: Run tests — confirm pass**

Run: `npm test -- seeko-ui`
Expected: PASS all four.

**Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

**Step 6: Commit**

```bash
git add src/components/seeko-ui src/__tests__/visual/seeko-ui.test.tsx
git commit -m "feat(seeko-ui): scaffold Button, Input, Card, Tabs wrappers"
```

---

## Task 8: Build North-Star A — Sign-in

**Files:**
- Modify: `src/app/(auth)/sign-in/page.tsx` (current path; verify with `find src/app -type d -name 'sign-in'` first)

**Step 1: Verify the sign-in route path**

Run: `find src/app -type d -name '*sign*' -o -name '*login*' 2>/dev/null`
Expected: identifies the actual route file.

**Step 2: Read current sign-in page**

Use `Read` tool on the identified file. Catalog: layout structure, form logic, what to preserve (auth flow, validation, error handling) vs what to restyle (everything visual).

**Step 3: Rewrite to north-star spec**

Per design doc Section 4.1:
- Cream paper full-bleed (`bg-paper min-h-dvh`)
- Ink wordmark top-center (use `~/Desktop/SEEKO_Assets/branding/BlackSeeko.png` for light, `WhiteSeeko.png` for dark — copy assets to `public/branding/` first if not already there)
- Single editorial headline ("Welcome back" or copy from existing) at `text-display` size, balanced wrap
- Two inputs (email, password) using `seeko-ui/Input` — hairline border, no fill, generous vertical rhythm
- One pill primary CTA using `seeko-ui/Button variant="primary"`
- Mono build/version metadata in corner (`text-mono opacity-50`)
- Zero color outside cream/ink/accent contract
- Reduced-motion respected: any entrance animation guarded with `usePrefersReducedMotion`

**Step 4: Copy branding assets to public/**

```bash
mkdir -p public/branding
cp ~/Desktop/SEEKO_Assets/branding/BlackSeeko.png public/branding/wordmark-light.png
cp ~/Desktop/SEEKO_Assets/branding/WhiteSeeko.png public/branding/wordmark-dark.png
```

**Step 5: Verify in browser**

Navigate to http://localhost:3000/sign-in (or the verified path).
Visual check: cream paper, ink wordmark, editorial type, hairline inputs, pill CTA, no mint, no avatar bubbles.

**Step 6: Commit**

```bash
git add src/app/(auth)/sign-in public/branding
git commit -m "feat(north-star-a): editorial sign-in surface"
```

---

## Task 9: Run /interface-craft critique on North-Star A

**Files:**
- Create: `docs/visual-overhaul/migrations/north-star-signin/critique-pre-implementation.md` (skip — done before in Task 1 audit)
- Create: `docs/visual-overhaul/migrations/north-star-signin/critique-post-implementation.md`

**Step 1: Capture screenshot of current state**

Use Playwright MCP: navigate to /sign-in, screenshot at 1440x900. Save to `docs/visual-overhaul/migrations/north-star-signin/post-build.png`.

**Step 2: Invoke /interface-craft critique**

Use `Skill` tool with `interface-craft`, args: `critique`. Input: the screenshot + URL. Capture all findings (structural, behavioral, visual) with severity tags.

**Step 3: Save findings**

Write findings to `docs/visual-overhaul/migrations/north-star-signin/critique-post-implementation.md` with format:
```markdown
# /interface-craft critique — North-Star A (sign-in)
Date: YYYY-MM-DD
## Structural
- [severity] finding
## Behavioral
- ...
## Visual
- ...
```

**Step 4: Invoke /make-interfaces-feel-better review**

Use `Skill` tool with `make-interfaces-feel-better`. Run the 16-point checklist against the surface. Capture findings.

Append findings to same critique file under `## /make-interfaces-feel-better checklist`.

**Step 5: Commit critique findings**

```bash
git add docs/visual-overhaul/migrations/north-star-signin
git commit -m "docs(north-star-a): post-build critique findings"
```

---

## Task 10: Address North-Star A critique findings

**Files:**
- Modify: surfaces flagged in Task 9 critique

**Step 1: Triage findings by severity**

Structural > behavioral > visual. Address all P0 (structural) and P1 (significant). Defer P2 (nit) only if scope demands.

**Step 2: Implement fixes one at a time**

For each finding: make the change, verify in browser, mark addressed in critique doc.

**Step 3: Re-screenshot**

Save updated screenshot to `docs/visual-overhaul/migrations/north-star-signin/final.png`.

**Step 4: Commit**

```bash
git add src/app/(auth)/sign-in docs/visual-overhaul/migrations/north-star-signin
git commit -m "fix(north-star-a): address critique findings"
```

---

## Task 11: Build North-Star B — Task row at /dev/north-star-task-row

**Files:**
- Create: `src/app/dev/north-star-task-row/page.tsx`

**Step 1: Survey existing task row**

Run: `find src/components -name 'TaskList*' -o -name 'TaskRow*' -o -name 'TaskItem*' 2>/dev/null`
Use `Read` on the identified files to catalog current row structure (title, status, assignee, deadline, department).

**Step 2: Build isolated route**

Create `src/app/dev/north-star-task-row/page.tsx` rendering ~10 mock task rows in cream-paper layout:

```tsx
// pseudocode
const mockTasks = [
  { id: 'T-001', title: 'Refactor onboarding flow', status: 'active', assignee: 'YK', dept: 'UI', deadline: '2026-05-12' },
  { id: 'T-002', title: 'Investor deck v3', status: 'needs-attention', assignee: 'MR', dept: 'RND', deadline: '2026-05-04' },
  { id: 'T-003', title: 'Sign-in copy review', status: 'done', assignee: 'JL', dept: 'UI', deadline: '2026-04-28' },
  // ...
];

export default function NorthStarTaskRow() {
  return (
    <main className="bg-paper min-h-dvh px-12 py-16">
      <h1 className="text-h1-compressed mb-8">Tasks</h1>
      <div className="divide-y divide-ink/10">
        {mockTasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
    </main>
  );
}
```

**Step 3: Implement TaskRow with compressed scale**

Per design doc Section 4.2:
- Hairline rule between rows, no card containers
- Title: `text-body-compressed font-medium` (active) / `font-regular text-ink/50` (done)
- Status: amber dot ONLY for `needs-attention`; nothing for active or done
- Department: small uppercase mono tag, no color (`text-mono uppercase tracking-wider text-ink/60`)
- Assignee: hairline-circle monogram (`w-6 h-6 rounded-full ring-1 ring-ink/15 flex items-center justify-center text-mono text-[10px]`)
- Deadline: mono date right-aligned

Rules:
- Tabular nums on dates (per `/make-interfaces-feel-better` #9)
- 40×40 hit area on the row click target
- No `transition: all`
- Concentric radius respected on monogram circle

**Step 4: Verify in browser**

Navigate to http://localhost:3000/dev/north-star-task-row.
Visual check: dense but not crowded, status reads via type weight, single amber dot stands out, mono dates feel like data.

**Step 5: Commit**

```bash
git add src/app/dev/north-star-task-row
git commit -m "feat(north-star-b): editorial task row at /dev route"
```

---

## Task 12: Run critique passes on North-Star B

**Files:**
- Create: `docs/visual-overhaul/migrations/north-star-task-row/critique-post-implementation.md`

**Step 1: Screenshot at 1440x900 + 1024x768 + mobile (375)**

Capture three viewport screenshots via Playwright MCP. Density behavior matters at all three.

**Step 2: Invoke /interface-craft critique**

Same flow as Task 9. Capture findings.

**Step 3: Invoke /make-interfaces-feel-better review**

Run the 16-point checklist. Pay special attention to: tabular nums on dates, concentric radius on monograms, no `transition: all`, hit area on rows.

**Step 4: Save findings + commit**

```bash
git add docs/visual-overhaul/migrations/north-star-task-row
git commit -m "docs(north-star-b): post-build critique findings"
```

---

## Task 13: Address North-Star B critique findings

Mirror Task 10 — triage by severity, fix iteratively, screenshot final, commit.

```bash
git add src/app/dev/north-star-task-row docs/visual-overhaul/migrations/north-star-task-row
git commit -m "fix(north-star-b): address critique findings"
```

---

## Task 14: Verify dark-mode toggle on both north-stars

**Files:**
- Verify: `src/components/ThemeProvider.tsx` or equivalent (path TBD)

**Step 1: Locate theme toggle infrastructure**

Run: `grep -rn "next-themes\|ThemeProvider\|data-theme\|useTheme" src/ | head -20`

If a toggle exists: use it. If not: stub `next-themes` in `src/app/layout.tsx` and add a temporary `<ThemeToggle />` to the dev route for verification.

**Step 2: Toggle to dark on both north-stars**

Navigate to /sign-in and /dev/north-star-task-row. Toggle dark. Screenshot each.

**Step 3: Verify**

- Paper → deep ink, ink → warm cream, hairlines visible, accent + amber survive translation
- No flash of unstyled content
- No surface that "breaks" in dark
- Contrast still meets AA

**Step 4: Save dark-mode screenshots**

```bash
docs/visual-overhaul/north-star-signin-dark.png
docs/visual-overhaul/north-star-task-row-dark.png
```

**Step 5: Fix any dark-mode bugs**

Likely: hairline ring colors that didn't switch, hardcoded `text-ink` that should be tokenized.

**Step 6: Commit**

```bash
git add src/ docs/visual-overhaul
git commit -m "feat(theme): verify dark-mode on north-stars"
```

---

## Task 15: Capture canonical north-star screenshots

**Files:**
- Create: `docs/visual-overhaul/north-star-signin.png` (1440x900 light)
- Create: `docs/visual-overhaul/north-star-signin-dark.png`
- Create: `docs/visual-overhaul/north-star-task-row.png`
- Create: `docs/visual-overhaul/north-star-task-row-dark.png`

**Step 1: Capture finals**

Use Playwright MCP at 1440x900 for both surfaces in both modes.

**Step 2: Commit**

```bash
git add docs/visual-overhaul/*.png
git commit -m "docs(visual-overhaul): canonical north-star screenshots"
```

---

## Task 16: Write seeko-visual subagent definition

**Files:**
- Create: `.claude/agents/seeko-visual.md`

**Step 1: Author the agent definition**

Per design doc Section 5. Required frontmatter + body:

```markdown
---
name: seeko-visual
description: Migrates one SEEKO surface at a time from legacy dark/department-color system to the editorial cream/ink language. Matches the north-stars; does not invent direction. Runs /interface-craft critique AND /make-interfaces-feel-better before AND after every migration.
model: sonnet
tools: Read, Edit, Write, Bash, Skill, mcp__playwright__browser_navigate, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_snapshot
---

# seeko-visual

You migrate ONE surface at a time from the legacy SEEKO visual system to the editorial cream/ink language defined in:
- `docs/plans/2026-04-28-seeko-visual-overhaul-design.md` (design doc)
- `docs/visual-overhaul/palette.md` (token contract)
- `docs/visual-overhaul/north-star-signin.png` (sparse pole reference)
- `docs/visual-overhaul/north-star-task-row.png` (dense pole reference)
- Joby Aviation (https://www.jobyaviation.com) is the spiritual anchor.

## Hard discipline (every invocation, non-negotiable)

1. Read design doc + palette + both north-star screenshots BEFORE touching the surface.
2. Run `/interface-craft critique` on the current surface. Save findings.
3. Run `/make-interfaces-feel-better` review (16-point checklist). Save findings.
4. Migrate the surface to match the north-stars. Use `seeko-ui` wrapper components where HeroUI defaults fight editorial intent. Use `seeko-ui/*` for Button/Input/Card/Tabs; if you need a primitive that doesn't exist, FLAG IT — do not invent.
5. Run `/interface-craft critique` AFTER. Save findings.
6. Run `/make-interfaces-feel-better` review AFTER. Save findings.
7. Capture before/after screenshots in light + dark modes. Save under `docs/visual-overhaul/migrations/<surface-name>/`.
8. Verify dark-mode toggle on the surface — no surface-specific bugs.
9. Stage changes; do NOT commit, do NOT merge. User reviews and commits.
10. Report: what migrated, critique deltas, any token additions needed (FLAGGED, not added), any new seeko-ui wrappers needed (FLAGGED, not built).

## Hard constraints

- Never reintroduce mint (#6ee7b7), department colors, or any legacy status color other than the new amber.
- Never add new tokens without flagging in your report.
- Never invent a third type scale — use editorial OR compressed.
- Never use `transition: all`.
- Never bypass the critique passes, even on small changes.
- Never migrate more than one surface per invocation.
- Always verify both light + dark modes before reporting done.
- Always respect reduced-motion; never animate entrances on dense surfaces.

## Output format

Your final message must include:
- Surface migrated: <path>
- Files changed: <list>
- Pre-critique findings: <count by severity>
- Post-critique findings: <count by severity, deltas>
- New tokens needed (flagged): <list or "none">
- New seeko-ui wrappers needed (flagged): <list or "none">
- Dark mode verified: yes/no
- Screenshots saved to: <path>
- Ready for user review.
```

**Step 2: Commit**

```bash
git add .claude/agents/seeko-visual.md
git commit -m "feat(agents): seeko-visual migration agent"
```

---

## Task 17: Update docs/visual-guidelines.md

**Files:**
- Modify: `docs/visual-guidelines.md`

**Step 1: Read current visual-guidelines.md**

Capture what's there. Some content may still be relevant, much will be obsoleted.

**Step 2: Rewrite to reflect shipped reality**

Sections:
1. **System overview** — editorial + craft, two voices one system, Joby reference
2. **Color** — OKLCH palette (link to `docs/visual-overhaul/palette.md`), one accent + one status, kill list
3. **Type** — sans + mono, editorial + compressed scales (link to tokens.md)
4. **Geometry** — pill buttons, hairline borders, no shadows, concentric radius
5. **Motion** — spring-first, reduced-motion, no entrances on dense surfaces
6. **North-stars** — link both screenshots, brief explanation
7. **Adding a new surface** — invoke `seeko-visual` agent, here's the pattern
8. **Anti-patterns** — what we explicitly don't do (mint, glow, dept colors, cards-in-cards, etc.)
9. **References** — link design doc, palette doc, /interface-craft, /make-interfaces-feel-better

**Step 3: Commit**

```bash
git add docs/visual-guidelines.md
git commit -m "docs(visual-guidelines): update to reflect PR0 shipped system"
```

---

## Task 18: Final verification — grep checks + accessibility

**Step 1: Verify mint is gone from src/**

Run: `grep -rEn "#6ee7b7|seeko-accent|accent-glow|accent-inset" src/ | grep -v __tests__`
Expected: zero matches (the test file references are fine).

**Step 2: Verify department colors are gone**

Run: `grep -rEn "dept-coding|dept-visual-art|dept-ui-ux|dept-animation|dept-asset-creation" src/ | grep -v __tests__`
Expected: zero matches.

**Step 3: Verify Caveat is gone**

Run: `grep -rn "Caveat\|font-handwriting\|font-caveat" src/`
Expected: zero matches.

**Step 4: Verify hex hardcoding hasn't INCREASED**

Run the same hex grep from Task 1 Step 3. Compare to baseline. Expected: number is lower or stable. (Full elimination is Wave 5.)

**Step 5: Run full test suite**

Run: `npm test`
Expected: all pass (globals contract + seeko-ui + any existing tests).

**Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

**Step 7: Run build**

Run: `npm run build`
Expected: builds clean.

**Step 8: Manual a11y check on both north-stars**

- Tab through every interactive element — visible focus ring on each
- Hit `:active` state on every button — `scale(0.96)` feedback
- Verify reduced-motion: set OS to reduce motion, reload — no entrance animations
- Run a contrast checker (e.g., dev-tools or `axe-core` browser extension) on both north-stars in both modes — AA minimum on all text

**Step 9: Commit any final fixes**

```bash
git add -p
git commit -m "fix: PR0 final verification fixes"
```

(Skip if no fixes needed.)

---

## Task 19: Open PR with full context

**Files:**
- No code changes; PR creation only.

**Step 1: Push branch**

```bash
git push -u origin feat/visual-overhaul-pr0
```

**Step 2: Create PR**

```bash
gh pr create --title "Visual overhaul PR 0 — foundation + north-stars + agent" --body "$(cat <<'EOF'
## Summary
- New OKLCH-defined color system (cream paper / warm ink, light + dark mirrors)
- ONE brand accent + ONE status hue; mint, 5 department colors, 4 legacy status colors, Caveat font all eliminated
- ONE sans + ONE mono with editorial + compressed type scales
- `seeko-ui` wrapper layer (Button, Input, Card, Tabs) — editorial defaults
- North-Star A: sign-in (sparse / editorial pole)
- North-Star B: task row at `/dev/north-star-task-row` (dense / utilitarian pole)
- `.doc-read-body` Tiptap prose styles re-derived from new tokens
- `seeko-visual` subagent for per-surface migrations in subsequent waves
- Updated `docs/visual-guidelines.md` to reflect shipped system

## Test plan
- [ ] `npm test` passes (globals contract + seeko-ui)
- [ ] `npx tsc --noEmit` zero errors
- [ ] `npm run build` clean
- [ ] Visit /sign-in — confirm cream paper, ink wordmark, editorial type, hairline inputs
- [ ] Visit /dev/north-star-task-row — confirm compressed scale, status-by-type, mono dates
- [ ] Toggle dark mode on both — verify no visual regressions
- [ ] Tab-through both surfaces — visible focus rings
- [ ] Click any button — `scale(0.96)` press feedback
- [ ] Set reduced-motion in OS — no entrance animations on dense surface
- [ ] Run axe / Lighthouse on both surfaces in both modes — AA contrast minimum

## References
- Design doc: `docs/plans/2026-04-28-seeko-visual-overhaul-design.md`
- Plan: `docs/plans/2026-04-28-seeko-visual-overhaul-pr0-plan.md`
- Palette: `docs/visual-overhaul/palette.md`
- North-stars: `docs/visual-overhaul/north-star-*.png`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Return PR URL to user**

---

## Post-PR-0 — Wave 1 starts

Once PR 0 merges, every subsequent surface is one PR via:

```
Agent({
  subagent_type: "seeko-visual",
  prompt: "Migrate src/app/(auth)/sign-up to match the north-stars."
})
```

Migration order per design doc Section 6:
- Wave 1: sign-up, onboarding, set-password
- Wave 2: agreement, invoice, sign
- Wave 3: (investor)/*
- Wave 4: (dashboard) shell, task views, project views, Tiptap docs, settings
- Wave 5: cleanup, final critique sweep, visual-guidelines reconciliation

---

## Plan complete.

Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review code between tasks, fast iteration. Use this if you want tight oversight.

**2. Parallel Session (separate)** — Open a new session in this repo, hand it `superpowers:executing-plans`, batch execution with checkpoints. Use this if you want to step away while it runs.

Which approach?
