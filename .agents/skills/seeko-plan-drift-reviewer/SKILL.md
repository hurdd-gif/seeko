---
name: seeko-plan-drift-reviewer
description: Compare SEEKO Studio implementation against docs/plans and identify plan drift. Use when finishing feature phases, reviewing large changes, continuing old work, reconciling design plans with code, or when files under docs/plans, dashboard, tasks, investor, payments, inbox, docs, team, or light-theme migration are involved.
---

# SEEKO Plan Drift Reviewer

## Workflow

1. Identify the relevant plan by topic and date in `docs/plans/`.
2. Read only the matching plan and design companion when present, for example:
   - `*-tasks-board-redesign.md`
   - `*-light-theme-migration-*.md`
   - `*-investor-panel-redesign*.md`
   - `*-new-inbox-component*.md`
3. Inspect changed files with:

```bash
git diff --name-only
git diff --stat
```

4. Compare implementation to plan requirements:
   - required user flows
   - data/schema changes
   - permission boundaries
   - design tokens/theme direction
   - responsive and reduced-motion requirements
   - named components expected to be removed or replaced
   - tests or QA artifacts the plan called for
5. Classify deviations:
   - beneficial change
   - harmless implementation detail
   - incomplete task
   - plan made obsolete by later work
   - regression or contradiction

## Output

Start with required fixes, then plan updates. If a plan is stale, recommend updating or superseding the plan rather than forcing code to match obsolete text.

Include the plan file path and the implementation file path for every finding.
