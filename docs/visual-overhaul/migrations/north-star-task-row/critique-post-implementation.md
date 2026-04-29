# /interface-craft critique — North-Star B (task row)

Date: 2026-04-28
Surface: `src/app/dev/north-star-task-row/page.tsx`
Screenshot: `final.png` (1440×900 light mode)
Reference: `docs/visual-overhaul/joby-reference.md`

---

## Context

Editorial task row at the dense pole. Studio internal — 12 mock tasks with status / assignee / department / deadline. Tests whether the cream/ink/Outfit language survives data density. This is the surface that proves whether the seeko-visual agent can migrate the dashboard task list, project lists, and any other dense data view.

## First impressions

The page reads. At density. Without color carrying the information. Type weight + opacity does the status work; a single amber dot punctuates needs-attention without making "Blocked" feel alarmist. The hairline rules between rows + no enclosing card means the rows belong to the page, not to a container — Joby register honored. "tasks." lowercase headline + "9 active · 3 done" counter sets the editorial tone before the data starts. This is the discipline working.

## Visual Design

- ✓ **One color in play** — paper + ink + ink-at-opacity. Single amber dot reserved for needs-attention. No department color, no priority color, no status text.
- ✓ **Type weight as hierarchy** — active rows: `font-medium`; done rows: `font-normal text-ink/45`. The eye finds active work first; done work is present but visibly demoted without disappearing.
- ✓ **Tabular nums on dates** — "MAY 04" / "MAY 30" align as a column even with proportional sans elsewhere.
- ✓ **Hairline rules between rows, top + bottom** — list belongs to the page (no card, no border-radius enclosure).
- ✓ **Department tag in tracked uppercase Outfit** — reads as ledger metadata, not as a colored badge.
- ✓ **Monogram circles with hairline ring, no fill** — assignees identifiable but unobtrusive. Concentric radius (full circle inside hairline ring).
- ✓ **No shadow, no glow, no card.** Joby check passes.

## Interface Design

- ✓ **Active-first sort** — Done items sink to the bottom automatically. Eye finds in-flight work first.
- ✓ **Counter line ("9 active · 3 done")** — sets expectation before scanning.
- ✓ **Hover wash on rows** — `hover:bg-ink/[0.03]` quiet feedback that the row is actionable. Specifies exact transition property.
- ✓ **40×40 hit target** — row anchor wraps the whole grid with py-4 vertical padding meeting Joby's data-density spacing.
- ✓ **No status text or status badge** — status is read positionally (sort + type weight + dot), not via a redundant "In Progress" pill.

## /make-interfaces-feel-better — 16-point

| # | Detail | Status | Notes |
|---|---|---|---|
| 1 | text-balance / pretty | N/A | Single-line title, truncate. |
| 2 | Concentric radius | ✓ | Monogram is full circle inside hairline ring. |
| 3 | Animate icons contextually | N/A | No icon swaps. |
| 4 | Crispy text | ✓ | `antialiased` body. |
| 5 | Tabular nums | ✓ | Date column + counter line. |
| 6 | Interruptible animations | N/A | No animations on this surface (intentional — entrance motion distracts when scanning data). |
| 7 | Stagger entrances | N/A | No entrances. |
| 8 | Subtle exits | N/A | No exits. |
| 9 | Optical alignment | ✓ | Grid columns align cleanly (auto _1fr_ auto auto auto). |
| 10 | Shadows over borders | N/A | Hairlines are intentional for editorial register. |
| 11 | Image outlines | N/A | No images. |
| 12 | Shared layout animations | N/A | Static list. |
| 13 | Motion gestures | ✓ | Hover wash via `transition-[background-color]`. |
| Emil — exact transition props | ✓ | `transition-[background-color]`, no `transition-all`. |
| Emil — nothing scales from 0 | N/A | No scale animations. |
| Emil — ease-out | ✓ | `ease-out` on hover transition. |
| Emil — active feedback | N/A | Row click feedback is the wash; no scale needed for non-button. |

## Joby reference — would Joby do this?

| Joby principle | Status |
|---|---|
| Lowercase headline | ✓ "tasks." |
| No card / no enclosure | ✓ Rows on cream paper, hairline-ruled |
| No filled bright color | ✓ Single amber dot for status only |
| Generous whitespace | ✓ ~40% viewport blank, max-w-[64rem] constrained |
| Sentence-case copy | ✓ Active row titles |
| Em-dashes in copy | ✓ Mock task titles use em-dashes ("Investor deck v3 — narrative pass") |
| No icons | ✓ Zero icons on the surface |
| Shadows over borders | N/A* | Editorial register uses hairlines intentionally; not a violation per Joby reference |
| No badges / pills for status | ✓ Status via type weight + dot, never a pill |
| Tabular metadata uppercase | ✓ Department tag, eyebrow |

## User Context

A studio member opening this page is mid-day, mid-task, and looking for what's next on their plate. The page respects that: active work first, done work present-but-demoted, the single amber dot draws their eye to the actually-blocked items. No status pills shouting "IN PROGRESS" at every row. No department colors competing for attention. The studio's data, in the studio's voice.

## Top opportunities (already addressed inline)

1. **Amber dot legibility** — bumped from h-1.5 w-1.5 (6px) to h-2 w-2 (8px). Reads as data now.
2. **Aria-label on needs-attention dot** — added "needs attention" so screen readers carry the same info as the dot.

## Deferred (out of PR0 scope, flag for future migrations)

- **Past-due deadline signaling** — currently dates render at uniform muted ink. A row whose deadline is past-today could fade differently or get a second amber dot. Defer until real Supabase data is wired up so we can compare deadline against `new Date()`.
- **Truncated title disclosure** — long titles get `truncate`d. A real implementation should show the full title in a tooltip or expand on hover. Defer to migration PR.
- **Department abbreviation rule** — "ASSET CREATION" reads long. Future tokenized abbreviations ("ART", "CODE", "UI", "ANIM", "ASSETS") would scan faster. Token gap to flag in real migration.
- **Sort affordance** — current sort (active first, then by deadline) is implicit. A real list view needs visible sort controls (header row click). Defer.
- **Empty state** — what happens when there are zero tasks? Defer to migration.

## Verdict

**Ship.** The dense-pole north-star demonstrates the cream/ink/Outfit language works at data density without color, without enclosure, without status text. Every subsequent surface migration that touches a list view should match this contract.
