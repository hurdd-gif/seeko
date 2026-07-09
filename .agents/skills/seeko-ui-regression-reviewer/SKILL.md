---
name: seeko-ui-regression-reviewer
description: Review SEEKO Studio UI changes for visual regressions. Use when changing dashboard, tasks board, investor panel, inbox/notifications, payments, docs, team/settings, light-theme migration, motion, Tailwind classes, responsive layout, screenshots, or when the user asks for visual QA or polish.
---

# SEEKO UI Regression Reviewer

## Review Workflow

1. Load `docs/personas/ux.md` if available.
2. Inspect changed components and CSS:

```bash
git diff -- src/components src/app src/lib/motion.ts src/app/globals.css
```

3. If a local dev server is available, inspect key routes in browser and capture screenshots for desktop and mobile widths.
4. Check the UI against SEEKO conventions:
   - dense operational UI, not marketing-style cards
   - no nested cards
   - stable dimensions for boards, rails, popovers, icon buttons, and counters
   - text does not overflow or overlap on mobile
   - reduced-motion paths exist for significant animations
   - light-theme surfaces use project tokens rather than one-off dark leftovers
   - hover/focus/active states are present for interactive controls
   - empty/loading/error states still exist after removing skeletons
5. For screenshots, inspect actual pixels rather than relying on intent. Call out visible layout issues first.

## High-Risk SEEKO Areas

- task board rail width/selection behavior
- notification popovers and mobile sheets
- investor summary cards and preview routes
- payments/passkey gates
- settings/team/docs during light-theme migration

## Output

Use severity labels:

- Critical: unusable route, hidden control, overlapping content, unreadable text
- Important: responsive break, wrong theme, inaccessible interaction, missing state
- Polish: spacing, hierarchy, animation tuning

Include viewport size when reporting screenshot findings.
