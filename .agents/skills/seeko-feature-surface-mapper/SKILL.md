---
name: seeko-feature-surface-mapper
description: Map SEEKO Studio feature blast radius before code changes. Use when starting or scoping a feature, bugfix, Linear item, or plan that may touch routes, React components, Hono API routes, Supabase tables, migrations, generated types, tests, docs, payments, investor views, onboarding, inbox, tasks, or shared UI.
---

# SEEKO Feature Surface Mapper

## Purpose

Use this skill before implementation when the risky part is not the code change itself, but knowing every SEEKO surface that must move together.

## Workflow

1. Confirm the project root is `/Volumes/CODEUSER/seeko-studio`.
2. Read `CLAUDE.md`, `package.json`, and any matching `docs/plans/*<topic>*` files.
3. Identify the product surface:
   - tasks and task detail
   - investor dashboard or investor routes
   - payments, refunds, payment requests, or passkey gate
   - docs, sharing, agreement, or external signing
   - inbox, notifications, activity, or header bell
   - onboarding, invite codes, team, or settings
   - shared layout, motion, UI kit, or theme
4. Search by feature nouns and route names across the source tree:

```bash
find src/rr-app/routes src/components src/lib src/api-server supabase docs -type f | sort
grep -R "<feature-term>" -n src docs supabase
```

5. Build a surface map before editing:
   - Frontend routes in `src/rr-app/routes/`
   - Route clients in `src/rr-app/clients/`
   - Components in `src/components/`
   - Domain helpers and indexes in `src/lib/`
   - Hono API routes in `src/api-server/routes/`
   - Supabase migrations in `supabase/migrations/`
   - Generated DB types in `src/lib/supabase/database.types.ts`
   - Vitest coverage in `src/**/__tests__` and `src/__tests__`
   - Plans, screenshots, and QA notes in `docs/plans/` and `docs/qa/`
6. Check for cross-surface contracts:
   - route path and API endpoint names
   - enum values and status names
   - role and access distinctions
   - notification kinds and activity log actions
   - generated PDF or signing payload shapes
   - seeded preview/QA route data
7. Recommend the smallest implementation slice that preserves a coherent user flow.

## Output

Return a concise implementation map:

- **Primary files:** files that likely need edits.
- **Dependent files:** tests, docs, generated types, previews, or migrations that may need updates.
- **Contracts to preserve:** roles, statuses, API payloads, RLS assumptions, notification kinds, and UI states.
- **Suggested verification:** targeted tests first, then `npm test -- --run` and `npm run build` when code changes are made.

If a requested change is ambiguous, name the missing product decision before proposing code edits.
