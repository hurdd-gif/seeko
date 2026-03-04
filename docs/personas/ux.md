# Persona: UX / UI Designer

Load this file when working on: shadcn/ui components, Tailwind styling, animations, visual language, design tools.

---

## Visual Language

- **Background:** `oklch(0.10 0 0)` (near-black)
- **Success / Coding dept:** `#6ee7b7` (emerald green — `--color-seeko-accent`)
- **Font for IDs/labels:** JetBrains Mono (monospace)
- **Font for UI text:** Outfit (sans-serif)
- **Dark mode:** always on — OKLCH token system in `globals.css`

---

## Department Color Map

| Department     | Color     |
|----------------|-----------|
| Coding         | `#6ee7b7` |
| Visual Art     | `#93c5fd` |
| UI/UX          | `#c4b5fd` |
| Animation      | `#fbbf24` |
| Asset Creation | `#f9a8d4` |

---

## Status Color Map

| Status      | Color     | CSS Variable               |
|-------------|-----------|----------------------------|
| Complete    | `#6ee7b7` | `--color-status-complete`  |
| In Progress | `#fbbf24` | `--color-status-progress`  |
| In Review   | `#93c5fd` | `--color-status-review`    |
| Blocked     | `#f87171` | `--color-status-blocked`   |

---

## shadcn/ui Components

All components live in `src/components/ui/` and use the `cn()` utility from `src/lib/utils.ts`.

### Components in use:

| Component    | File                        | Usage                                |
|--------------|-----------------------------|--------------------------------------|
| Card         | `src/components/ui/card.tsx` | Page sections, stat cards, list wrappers |
| Badge        | `src/components/ui/badge.tsx` | Status labels, department tags, priority |
| Button       | `src/components/ui/button.tsx` | Actions, sign out                   |
| Avatar       | `src/components/ui/avatar.tsx` | Team member initials                |
| Input        | `src/components/ui/input.tsx` | Search fields                       |
| Select       | `src/components/ui/select.tsx` | Status filter dropdown              |
| Separator    | `src/components/ui/separator.tsx` | Visual dividers                  |

### Pattern examples:
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
  </CardHeader>
  <CardContent>
    <Badge variant="secondary">Label</Badge>
  </CardContent>
</Card>
```

### Badge variants:
- `default` — primary bg
- `secondary` — muted bg (department tags)
- `outline` — bordered (status, phase labels)
- `destructive` — red (high priority)

---

## Animation

Timings from seeko-dashboard.jsx:
- Tab change: `fadeUp` 0.5s
- Header entrance: `fadeIn` 0.6s

For complex motion: invoke `interface-craft` skill before implementing.
For motion patterns: invoke `motion-design-patterns` skill.

---

## Design Tool Order

1. **Pencil MCP** — wireframe / layout sketch (`.pen` files)
2. **Design Canvas** (`/playground`) — code variations, component exploration
3. **Figma MCP** — hi-fi prototypes, design tokens, final specs
4. **visual-qa** — screenshot QA against design intent

---

## ui-design-brain Data Dashboard Conventions

- **Data-dense layouts:** cards over tables where possible for overview; divide-y lists for detail
- **State handling:** always show loading, empty, and error states — never blank
- **KPI metrics at top**, detail below (StatCard grid → Cards → divide-y list pattern)
- **Avoid overloading a single view** — use tabs to layer depth
- **Categorical status:** use `Badge` or status dots, never raw text
- **Progress:** use custom progress bar with `--color-seeko-accent`

---

## Component File Locations

```
src/components/ui/
  card.tsx          — Card, CardHeader, CardTitle, CardContent
  badge.tsx         — Badge with variant system
  button.tsx        — Button with variant/size system
  avatar.tsx        — Avatar, AvatarFallback
  input.tsx         — Input field
  select.tsx        — Native select wrapper
  separator.tsx     — Horizontal/vertical divider

src/components/layout/
  Sidebar.tsx       — client component, usePathname, Lucide icons

src/components/dashboard/
  TaskList.tsx      — client component, search/filter task list

src/components/notion/
  NotionRenderer.tsx — renders Notion blocks as React JSX
```

---

## Tailwind v4 + shadcn/ui Setup

No `tailwind.config.ts` needed. Tailwind v4 uses CSS-based configuration in `globals.css`:

```css
@import "tailwindcss";

@theme inline {
  --color-background:        oklch(0.10 0 0);
  --color-foreground:        oklch(0.95 0 0);
  --color-card:              oklch(0.14 0 0);
  --color-card-foreground:   oklch(0.95 0 0);
  --color-border:            oklch(0.22 0 0);
  --color-muted:             oklch(0.18 0 0);
  --color-muted-foreground:  oklch(0.49 0 0);
  --color-secondary:         oklch(0.18 0 0);
  --color-primary:           oklch(0.95 0 0);
  --color-sidebar:           oklch(0.12 0 0);
  --color-seeko-accent:      #6ee7b7;
  /* ... see globals.css for full token list */

  --font-sans: var(--font-outfit);
  --font-mono: var(--font-jetbrains-mono);
  --radius: 0.5rem;
}
```

Tailwind v4 maps `--color-*` variables to `bg-*`, `text-*`, `border-*` utilities automatically.

---

## Design References

`docs/design-references.md` — running collection of UI inspiration links, component ideas, and annotated references. Check this before starting any new screen or component design.

---

## Skill Routing Reminders

- Before any new screen/feature design: invoke `brainstorming`
- For animations: invoke `interface-craft`
- For design tokens: invoke `design-tokens`
- For QA: invoke `visual-qa`
