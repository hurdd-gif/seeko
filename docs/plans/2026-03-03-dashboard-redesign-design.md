# Dashboard Redesign Design

**Date:** 2026-03-03
**Reference:** `/Users/user/Downloads/b_mR6QCGZfaIg-1772590204787` (shadcn/ui dashboard template)
**Scope:** All 5 dashboard pages + sidebar/layout

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Component library | Swap HeroUI → shadcn/ui | Exact 1:1 match with reference design patterns |
| Theme | Dark-only | Consistent with seeko brand, no `next-themes` complexity |
| Department colors | Single emerald accent | Cleaner, more editorial; neutral badges everywhere |
| Migration strategy | Shell-first | Sidebar + tokens first, then pages incrementally |
| Fonts | Keep Outfit + JetBrains Mono | Already match reference aesthetic |

---

## Design Tokens (globals.css)

Replace existing globals.css with OKLCH-based CSS variable system. Dark-only — no `.dark` class needed.

```css
:root {
  /* Surfaces */
  --background:         oklch(0.10 0 0);   /* near-black (#0a0a0b) */
  --foreground:         oklch(0.95 0 0);   /* off-white */
  --card:               oklch(0.14 0 0);   /* card surface */
  --card-foreground:    oklch(0.95 0 0);
  --border:             oklch(0.22 0 0);   /* subtle dividers */
  --input:              oklch(0.22 0 0);
  --muted:              oklch(0.18 0 0);   /* secondary surface */
  --muted-foreground:   oklch(0.49 0 0);   /* secondary text */

  /* Interactive */
  --primary:            oklch(0.95 0 0);   /* buttons, primary CTA */
  --primary-foreground: oklch(0.10 0 0);
  --secondary:          oklch(0.18 0 0);   /* badge bg */
  --secondary-foreground: oklch(0.95 0 0);
  --accent:             oklch(0.18 0 0);   /* hover states */
  --accent-foreground:  oklch(0.95 0 0);
  --ring:               oklch(0.95 0 0);   /* focus ring */

  /* Seeko accent — emerald */
  --seeko-accent:       #6ee7b7;

  /* Status (for task status dots only — no badges) */
  --status-complete:    #6ee7b7;
  --status-progress:    #fbbf24;
  --status-review:      #93c5fd;
  --status-blocked:     #f87171;

  /* Border radius (from reference) */
  --radius:     0.5rem;
  --radius-sm:  0.25rem;
  --radius-md:  0.375rem;
  --radius-lg:  0.5rem;
  --radius-xl:  0.75rem;

  /* Sidebar */
  --sidebar:              oklch(0.12 0 0);
  --sidebar-foreground:   oklch(0.95 0 0);
  --sidebar-accent:       oklch(0.18 0 0);
  --sidebar-border:       oklch(0.22 0 0);
}
```

Remove: `@import "@heroui/styles"`, all HeroUI-related CSS.
Add: shadcn base styles, Tailwind v4 `@theme inline {}` block with above tokens.

---

## Layout & Sidebar

### Desktop Sidebar (240px, fixed, full-height)

```
┌────────────────────────┐
│  SEEKO  [logo]  Studio │  ← brand name, Outfit font
│ ────────────────────── │
│  ⊞ Overview            │  ← active: bg-sidebar-accent, left emerald bar
│  ☑ Tasks               │
│  ⬡ Areas               │
│  ⚑ Team                │
│  ☰ Docs                │
│                        │
│ ────────────────────── │
│  user@example.com      │  ← text-xs muted-foreground
│  [Logout]              │  ← ghost button, text-xs
└────────────────────────┘
```

**Icons (Lucide):** LayoutDashboard · CheckSquare · Map · Users · FileText
**Active state:** `bg-sidebar-accent` background + `text-foreground`
**Inactive:** `text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50`

### Mobile (< 768px)

Fixed 56px header:
- Left: SEEKO logo + wordmark
- Right: Menu button → opens Sheet drawer (w-64, same nav items)

### Main Content Area

```
max-w-5xl mx-auto px-6 py-8
```

---

## Overview Page (`/`)

Server component. Fetches all tasks + areas on load.

```
┌──────────────────────────────────────────────────────┐
│ Overview                           Studio dashboard   │
│ ────────────────────────────────────────────────────  │
│  [Total] [Completed] [In Progress] [Blocked]          │  ← 4-col stat grid (Card each)
│ ────────────────────────────────────────────────────  │
│  Departments             │  Game Areas                │  ← 3/2 col split
│  ─────────────────────── │  ───────────────────────── │
│  Coding        [12]      │  Dojo         ████░░  68%  │
│  Visual Art    [8]       │  Battleground ██░░░░  40%  │
│  UI/UX         [5]       │  Fighting Club███████  92% │
│  Animation     [3]       │                            │
│  Asset         [6]       │                            │
│ ────────────────────────────────────────────────────  │
│  Recent Tasks                                         │  ← full-width
│  Task name   Dept  Status    Priority  Deadline       │
│  ...                                                  │
└──────────────────────────────────────────────────────┘
```

**Stat cards:** `<Card>` with `text-3xl font-bold` value + `text-sm text-muted-foreground` label
**Departments:** `<Card>` with rows, each: `text-sm name` + `<Badge variant="secondary">count</Badge>`
**Areas:** `<Card>` with rows, each: name + percentage + emerald `<progress>` bar
**Recent Tasks:** `<Card>` with `p-0`, divider rows — status dot (colored) + name + dept badge + priority badge + deadline

---

## Tasks Page (`/tasks`)

Client component (for search/filter interactivity).

```
┌──────────────────────────────────────────────────────┐
│ My Tasks                                              │
│ [🔍 Search tasks...]           [Status ▾]            │
│ ────────────────────────────────────────────────────  │
│ ○  Task name        [Dept]  [Status]  [Priority]  Date│
│ ●  Task name        [Dept]  [Status]  [Priority]  Date│
│ ...                                                   │
└──────────────────────────────────────────────────────┘
```

- `<Input className="pl-9">` with Search Lucide icon
- `<Select>` for status filter (All / Complete / In Progress / In Review / Blocked)
- Rows: status colored dot indicator · task name · `<Badge variant="secondary">dept</Badge>` · `<Badge variant="outline">status</Badge>` · `<Badge variant="outline">priority</Badge>` · date text
- Empty state: centered icon + "No tasks found" message

---

## Areas Page (`/areas`)

Server component.

```
┌──────────────────────────────────────────────────────┐
│ Game Areas                                            │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│ │ Dojo         │ │ Battleground │ │Fighting Club │  │
│ │ [Alpha]      │ │ [Beta]       │ │ [Launch]     │  │
│ │              │ │              │ │              │  │
│ │ Description  │ │ Description  │ │ Description  │  │
│ │              │ │              │ │              │  │
│ │ ████░░  68%  │ │ ██░░░░  40%  │ │ ███████  92% │  │
│ └──────────────┘ └──────────────┘ └──────────────┘  │
└──────────────────────────────────────────────────────┘
```

- 1 → 3 column responsive grid
- `<Card>` each: title + `<Badge variant="outline">phase</Badge>` + description + progress bar
- Progress bar: `div` with `bg-[var(--seeko-accent)]` fill, `bg-secondary` track

---

## Team Page (`/team`)

Server component.

```
┌──────────────────────────────────────────────────────┐
│ Team                                                  │
│ ┌────────────────────────────────────────────────┐   │
│ │  [JD]  Jane Doe         [Coding]    ↗ Notion   │   │
│ │ ──────────────────────────────────────────────  │   │
│ │  [MS]  Mike Smith       [UI/UX]     ↗ Notion   │   │
│ │ ──────────────────────────────────────────────  │   │
│ │  ...                                           │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

- `<Card>` with `p-0`, `divide-y divide-border`
- Each row: `<Avatar>` with initials (bg-secondary) + `text-sm` name + `<Badge variant="secondary">role</Badge>` + external Notion link (ExternalLink icon, ghost button)

---

## Docs Page (`/docs`)

Server component.

```
┌──────────────────────────────────────────────────────┐
│ Docs                                                  │
│ ┌────────────────────────────────────────────────┐   │
│ │  📄  Document Title        [tag] [tag]    ↗    │   │
│ │      Last updated 2 days ago                   │   │
│ │ ──────────────────────────────────────────────  │   │
│ │  🔗  Link Title            [tag]          ↗    │   │
│ │      Last updated 1 week ago                   │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

- `<Card>` with `p-0`, `divide-y`
- Row: Lucide icon (FileText/Link/Sheet by type) + title + `<Badge variant="outline">tag</Badge>` list + ExternalLink button
- Subtext: `text-xs text-muted-foreground` relative date

---

## shadcn/ui Components to Install

```bash
npx shadcn@latest init
npx shadcn@latest add card badge button input select avatar separator
```

Additional:
- `components/ui/progress.tsx` — custom (div-based, emerald fill)
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)

Remove from project:
- `@heroui/react` and all HeroUI imports
- Custom `STATUS_COLORS`, `DEPT_COLORS`, `PRIORITY_COLORS` maps → replaced by badge variants + status dot tokens

---

## File Change Summary

| File | Action |
|---|---|
| `src/app/globals.css` | Replace with OKLCH token system + shadcn base |
| `src/app/(dashboard)/layout.tsx` | Rewrite: 240px sidebar + mobile sheet nav |
| `src/app/(dashboard)/page.tsx` | Rewrite: 4-stat grid + dept/areas split + tasks table |
| `src/app/(dashboard)/tasks/page.tsx` | Rewrite: search + filter + task rows |
| `src/app/(dashboard)/areas/page.tsx` | Rewrite: 3-col card grid with progress |
| `src/app/(dashboard)/team/page.tsx` | Rewrite: avatar list card |
| `src/app/(dashboard)/docs/page.tsx` | Rewrite: doc list card |
| `src/components/dashboard/*` | Delete all — replaced by inline page components |
| `src/components/ui/*` | Add shadcn/ui components |
| `src/lib/utils.ts` | Add `cn()` helper |
| `package.json` | Add shadcn deps, remove @heroui/react |

---

## Non-Goals

- Light mode support
- Recharts / data visualization charts
- Notifications, Settings, or Activity pages (not in seeko's nav)
- New Notion API routes (data layer unchanged)
