# Overview dashboard improvements

Follow-up to interface-craft design critique. Improves hierarchy, focus, and consistency on the Overview page.

## Goals

1. **One visual focus** — Accent used for a single primary metric (Open Tasks) so the eye lands on "what to do next."
2. **Typographic hierarchy** — Page title (2xl) > section titles (xl) > body (sm/xs).
3. **Unified cards** — Game Areas tiles use the same `Card` component as the rest of the dashboard.
4. **Primary stat emphasis** — Open Tasks is the lead metric; Completed/Team/Docs are secondary.
5. **Tighter copy** — Hero one line; remove redundant Activity description; keep "All caught up" as reward.

## Implementation

- **Overview page** (`src/app/(dashboard)/page.tsx`):
  - Stats: accent only on Open Tasks value; remove accent from Completed. Optionally Open Tasks value `text-3xl`, others `text-2xl`.
  - Section card titles (Game Areas, Upcoming Tasks, Recent Activity): `text-xl font-semibold text-foreground`.
  - Remove accent from "Upcoming Tasks" card title (use default/muted or foreground).
  - Game Areas: render each area in `<Card><CardContent>...</CardContent></Card>` instead of custom `rounded-lg border` div.
  - Hero subtitle: "Here's what's happening." (or keep welcome + one line). Recent Activity: CardDescription minimal or "Latest actions."
  - When `openTasks === 0`, hero can show a positive line (e.g. "You're all caught up.") as reward.

No changes to layout, sidebar, or other pages. Motion storyboard unchanged.

## Done

- [x] Plan added
- [x] One focus: accent on Open Tasks only; primary stat larger (text-3xl); removed from Completed and Upcoming Tasks title
- [x] Section titles: Game Areas, Upcoming Tasks, Recent Activity use `text-xl font-semibold text-foreground`
- [x] Game Areas tiles use `<Card><CardContent>`; area progress % label uses muted-foreground (bar fill stays accent)
- [x] Hero: "Here's what's happening." / "You're all caught up." when no open tasks; Activity description "Latest actions."
