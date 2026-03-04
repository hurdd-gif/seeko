# Persona: UX / UI Designer

Load this file when working on: HeroUI v3 components, Tailwind styling, animations, visual language, design tools.

---

## Visual Language (from seeko-dashboard.jsx)

- **Background:** `#0a0a0b` (near-black)
- **Success / Coding dept:** `#6ee7b7` (emerald green)
- **Font for IDs/labels:** JetBrains Mono (monospace)
- **Font for UI text:** Outfit (sans-serif)
- **Dark mode:** always on — `className="dark"` on `<html>`

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

| Status      | Color     |
|-------------|-----------|
| Complete    | `#6ee7b7` |
| In Progress | `#fbbf24` |
| In Review   | `#93c5fd` |
| Blocked     | `#f87171` |

---

## HeroUI v3 Components

Package: `@heroui/react@beta` (v3.0.0-beta.8)
HeroUI v3 does NOT require a provider wrapper — components work standalone.
Set `className="dark"` on the `<html>` element and import `@heroui/styles` in `globals.css`.

### Primary components in use:
- `Table`, `TableHeader`, `TableColumn`, `TableBody`, `TableRow`, `TableCell` — TasksTable
- `Badge` — notification counts
- `Card`, `CardHeader`, `CardBody` — DepartmentsCard, GameAreasCard
- `Progress` — area progress bars
- `Tabs`, `Tab` — dashboard tab navigation
- `Button` — actions
- `Chip` — status labels (use `color` prop with custom className for status colors above)
- `Avatar` — team member photos

### HeroUI v3 patterns:
```tsx
// Chip for status
<Chip
  size="sm"
  className="text-xs"
  style={{ backgroundColor: STATUS_COLORS[task.status] + '20', color: STATUS_COLORS[task.status] }}
>
  {task.status}
</Chip>

// Table with HeroUI
<Table aria-label="Tasks" className="mt-4">
  <TableHeader>
    <TableColumn>NAME</TableColumn>
    <TableColumn>STATUS</TableColumn>
  </TableHeader>
  <TableBody items={tasks}>
    {(task) => (
      <TableRow key={task.id}>
        <TableCell>{task.name}</TableCell>
        <TableCell><StatusChip status={task.status} /></TableCell>
      </TableRow>
    )}
  </TableBody>
</Table>
```

---

## Animation

Timings from seeko-dashboard.jsx:
- Tab change: `fadeUp` 0.5s
- Header entrance: `fadeIn` 0.6s

```tsx
// Tailwind animation classes (add to tailwind.config.ts keyframes)
// fadeUp: opacity 0→1 + translateY 10px→0
// fadeIn: opacity 0→1
```

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

- **Data-dense layouts:** cards over tables where possible for overview; tables for detail lists
- **State handling:** always show loading, empty, and error states — never blank
- **KPI metrics at top**, detail below (StatsRow → Cards → Table pattern)
- **Avoid overloading a single view** — use tabs to layer depth
- **Categorical status:** use `Chip` or `Badge`, never raw text
- **Progress:** use `Progress` bar component with labeled percentage

---

## Component File Locations

```
src/components/dashboard/
  StatsRow.tsx       — top KPI metrics row
  DepartmentsCard.tsx — department breakdown cards
  GameAreasCard.tsx  — Dojo/Battleground/Fighting Club progress
  TasksTable.tsx     — filterable task list

src/components/notion/
  NotionRenderer.tsx  — renders Notion blocks as React JSX
```

---

## Tailwind v4 + HeroUI v3 Setup

No `tailwind.config.ts` needed. Tailwind v4 uses CSS-based configuration in `globals.css`:

```css
/* globals.css */
@import "tailwindcss";
@import "@heroui/styles";   /* HeroUI v3 CSS */

@theme inline {
  --font-sans: var(--font-outfit);
  --font-mono: var(--font-jetbrains-mono);

  /* Custom tokens */
  --animate-fade-up: fadeUp 0.5s ease-out;
  --animate-fade-in: fadeIn 0.6s ease-out;
}

@keyframes fadeUp { ... }
@keyframes fadeIn { ... }
```

Dark mode: set `class="dark"` on `<html>`. HeroUI v3 respects this class.

---

## Design References

`docs/design-references.md` — running collection of UI inspiration links, component ideas, and annotated references. Check this before starting any new screen or component design.

---

## Skill Routing Reminders

- Before any new screen/feature design: invoke `brainstorming`
- For animations: invoke `interface-craft`
- For design tokens: invoke `design-tokens`
- For QA: invoke `visual-qa`
