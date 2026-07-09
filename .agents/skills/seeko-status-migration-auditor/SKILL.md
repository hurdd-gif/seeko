---
name: seeko-status-migration-auditor
description: Audit SEEKO Studio task status migration drift. Use when changes touch tasks, task boards, task detail, investor summaries, payments based on completed tasks, Supabase migrations/types, tests, preview data, or when build/test failures mention task statuses such as Complete, Blocked, Done, Backlog, Todo, In Progress, In Review, Canceled, or Duplicate.
---

# SEEKO Status Migration Auditor

## Canonical Statuses

Use only these task statuses in app code and database writes:

```ts
Backlog
Todo
In Progress
In Review
Done
Canceled
Duplicate
```

Legacy mappings:

```ts
Complete -> Done
Blocked -> Backlog
```

Do not preserve legacy values unless reading historical activity-log text. Legacy activity strings such as `Completed`, `Blocked`, `Started`, and `Moved to review` may still exist in `activity_log.action`; distinguish those from `tasks.status`.

## Audit Workflow

1. Read `src/lib/types.ts`, `docs/supabase-schema.sql`, and relevant `supabase/migrations/*task*` files first.
2. Search app, tests, docs, preview routes, and migrations for status literals:

```bash
grep -R "Complete\\|Blocked\\|Done\\|Backlog\\|In Progress\\|In Review\\|Todo\\|Canceled\\|Duplicate" -n src docs supabase
```

3. Classify every hit:
   - `tasks.status` read/write/filter/type option: must use canonical values.
   - user-facing label: may say "Complete" only as copy, not as a persisted value.
   - `activity_log.action`: legacy strings can remain, but new writes should be deliberate.
   - tests/fixtures/preview data: must match the production enum when representing tasks.
4. Check Supabase writes specifically:
   - `.from('tasks').insert(...)`
   - `.from('tasks').update(...)`
   - server actions under `src/app/(dashboard)/actions.ts`
   - API routes under `src/app/api/**`
5. Verify payment and investor calculations after changes. Common traps:
   - completed tasks for payment requests must query `Done`, not `Complete`.
   - blocked/investor counts must intentionally define whether `Backlog` means blocked or merely unstarted.

## Output

Lead with findings that can break production. For each issue include file, line, current value, expected value, and whether it is a database write, query, UI option, fixture, or activity label.

Run `npm test -- --run` and `npm run build` if code changes are made or if the user asks whether the migration is complete.
