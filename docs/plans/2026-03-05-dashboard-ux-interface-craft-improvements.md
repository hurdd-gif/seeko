# Dashboard UX & Interface Craft — System-Wide Improvements

**Date:** 2026-03-05  
**Lens:** UX persona + Interface Craft (storyboard, design critique)  
**Scope:** Entire dashboard/system experience

---

## Context

SEEKO Studio is a dark-mode team dashboard: tasks, team, docs, activity, settings. Users are team members or admins; emotional context is productivity and coordination — moderate stakes, routine use with occasional deadline pressure. The system already uses FadeRise/Stagger, storyboard comments on several pages, and a consistent Card-based layout.

---

## First Impressions

The dashboard feels coherent and calm: dark surfaces, one accent (emerald), clear nav. What stands out is that **motion and empty-state care are uneven**. Some pages read like a script (Overview, Team, Docs storyboards); others use magic-number delays. Empty states range from thoughtful (DocList: icon + copy + CTA) to bare ("No activity yet."). There is no loading layer — the user gets a full paint only after server data arrives, which can feel abrupt on slower networks. The system is close to feeling intentional and polished; the gaps are in consistency and in moments that could show "uncommon care."

---

## Visual Design

| Dimension | Observation | Impact | Opportunity |
|-----------|-------------|--------|--------------|
| **Color intentionality** | Single accent (seeko green) is used consistently; department colors exist in persona (e.g. UI/UX `#c4b5fd`) but are not yet reflected in globals.css as semantic tokens. TaskList/DepartmentSelect use Tailwind classes (e.g. `text-emerald-400`, `text-violet-300`). | Slight drift between persona and implementation; theming new surfaces (e.g. filters, tags) may duplicate hex values. | Add `--color-dept-*` (or align DEPT_COLOR) to globals so one source of truth matches the persona. |
| **Typographic hierarchy** | Clear scale: h1 `text-2xl font-semibold`, subtitle `text-sm text-muted-foreground`, body/cards `text-sm`. Card titles use CardTitle (text-sm font-medium) — on Overview/Activity the custom `text-xl font-semibold` overrides. | Minor inconsistency between "section" titles (page h1) and card titles; overall hierarchy is readable. | Standardize card section titles (e.g. one CardTitle style for "section" cards) so the scale is obvious from the design system. |
| **Spacing & alignment** | Page content uses `space-y-6` or `gap-6`; main has `max-w-5xl mx-auto px-6 py-8`. Cards use CardHeader/CardContent (p-6). Consistent. | Layout feels balanced. | No change needed; maintain. |
| **Focus ring** | Ring is subtle (rgba fade) and fades in over 200ms. Applied globally to inputs, selects, buttons. | Accessible and not noisy. | Keep; consider documenting in persona as the standard. |

---

## Interface Design

| Dimension | Observation | Impact | Opportunity |
|-----------|-------------|--------|--------------|
| **Focusing mechanism** | Each page has a clear h1 + subtitle, then content. Overview leads with stats then two columns (tasks + activity). No single "start here" on Overview beyond reading order. | Acceptable for returning users; first-time users might scan without a strong anchor. | Optional: add a light visual weight to "Next up" or the first upcoming task so the eye lands there first. |
| **Progressive disclosure** | Task detail in dialog; doc content in dialog; activity is a flat list. Complexity is mostly hidden until needed. | Good. | Keep; avoid dumping more onto the first screen. |
| **Loading & feedback** | All dashboard pages are server components; data is fetched before render. There is no skeleton or loading UI. On slow networks the user sees layout shell then a sudden paint of content. Errors are caught with `.catch(() => [])` so failed fetches show empty lists with no message. | Users get no feedback during wait and no explanation when data fails. | Add a shared loading pattern (e.g. Suspense + skeleton for main content) and explicit empty/error states when fetch fails (e.g. "Couldn’t load tasks. Retry?"). |
| **Empty states** | DocList: icon (FileText) + "No documents yet" + CTA for admin. TaskList: empty state with copy and CTA for admin. Overview "No upcoming tasks", Team "No team members yet", Activity "No activity yet" are text-only. | Text-only empties feel flat; no sense of "what to do next" for non-admins in some views. | Give every empty state a consistent pattern: icon + short copy + optional CTA (or "Learn more" link) where it makes sense. |
| **Feedback & reward** | Toasts on save/delete; tour confetti on completion. Task status changes and comments are visible in Activity. | Actions are acknowledged. | Consider micro-feedback on high-value actions (e.g. task complete: brief check animation or toast with "Task completed"). |

---

## Consistency & Conventions

| Dimension | Observation | Impact | Opportunity |
|-----------|-------------|--------|--------------|
| **Animation storyboard** | Overview uses a TIMING object (seconds) and `delay(TIMING.x)`; Docs uses TIMING + `delay(ms/1000)`. Tasks/Activity use raw decimals (0, 0.08, 0.16) and no TIMING const. Team uses raw decimals with a storyboard comment. | Hard to tune globally; storyboard values are not single source of truth everywhere. | Adopt one pattern: e.g. TIMING in ms at top of each page, FadeRise/Stagger use `delay={TIMING.xyz / 1000}`. Align with interface-craft storyboard pattern (all delays in one TIMING object, no magic numbers in JSX). |
| **Page structure** | All pages: title block (FadeRise 0, 0.08) then content (FadeRise with y). Consistent. | Good. | Keep; document as the standard page entrance in persona or a short "Dashboard pages" doc. |
| **Component reuse** | Cards, Badges, Buttons, Inputs, Selects are shared. Empty states are not a shared component. | Empty states will drift in copy and layout. | Introduce a small EmptyState component (icon, title, description?, action?) and use it on Overview, Team, Activity, Tasks, Docs where appropriate. |

---

## User Context

- **State of mind:** Returning users want to scan quickly; new users need orientation. Admins need to manage tasks/team/docs without friction.
- **Emotional fit:** The dark, calm palette and clear nav support focus. The main gap is trust during load and when something fails — silent empty lists after an error can feel broken rather than "nothing here yet."
- **Uncommon care:** Loading skeletons, clear error states, and consistent empty states (with icon + next step) would signal that the system is built with care. Aligning motion to a single storyboard convention would make the product feel more intentional and easier to evolve.

---

## Top Opportunities (Prioritized)

1. **Add loading and error handling for dashboard content**  
   Use Suspense + a shared skeleton (or minimal placeholder) for the main content area so users see progress; when a fetch fails, show an explicit error state with retry instead of an empty list.

2. **Unify empty states with a single pattern**  
   Create an `EmptyState` component (icon, title, optional description, optional CTA) and use it on Overview (no upcoming tasks), Team (no members/contractors), Activity (no activity), and Tasks/Docs where applicable, so every empty view feels intentional and actionable.

3. **Make animation timing a single source of truth per page**  
   On every dashboard page, define a TIMING object (ms) and a storyboard comment at the top; use `delay={TIMING.x / 1000}` in FadeRise/Stagger so all delays live in one place and match the interface-craft storyboard pattern.

4. **Align design tokens with the UX persona**  
   Add department color tokens to globals (or a single DEPT_COLOR map backed by CSS vars) so department colors match the persona and are reusable for filters, tags, and future UI.

5. **Standardize card section titles**  
   Decide one pattern for "section" card titles (e.g. Overview "Upcoming Tasks", Activity "Activity Feed") and apply it consistently so CardTitle usage is predictable and the type scale is clear.

---

## Suggested Next Steps

- **Quick wins:** (3) TIMING + storyboard on Tasks and Activity; (5) card title audit.
- **Medium:** (2) EmptyState component and rollout; (4) department tokens in globals.
- **Larger:** (1) Suspense + skeletons and error states for dashboard data.

This plan can be executed incrementally; each item improves either consistency (storyboard, tokens, card titles), trust (loading/error), or clarity (empty states).
