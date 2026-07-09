---
name: seeko-supabase-mutation-reviewer
description: Review SEEKO Studio Supabase writes and authorization boundaries. Use when code touches create/update/delete operations, server actions, API routes, service-role clients, RLS-sensitive tables, invite/auth flows, payments, passkeys, external signing, task mutations, docs access, or when reviewing security and data integrity.
---

# SEEKO Supabase Mutation Reviewer

## Context

SEEKO uses Supabase Auth and Postgres. Reads commonly live in `src/lib/supabase/data.ts`. Mutations are split across server actions, API routes, and client components. Prefer explicit server-side authorization for admin/payment/security-sensitive writes even when RLS also exists.

## Audit Workflow

1. Search for writes:

```bash
grep -R "\\.insert\\|\\.update\\|\\.delete\\|\\.upsert\\|rpc(" -n src
```

2. Classify each mutation:
   - public user action
   - authenticated user self-service
   - admin-only
   - investor-only
   - service-role/admin operation
   - external token-based action
3. Verify placement:
   - client component writes are acceptable only for low-risk user-owned changes protected by RLS.
   - admin/payment/auth/invite/passkey/external-signing writes should go through a server action or API route.
   - service-role writes must stay server-only and must never depend on client-supplied authorization claims alone.
4. Check each mutation for:
   - authenticated user retrieval with `supabase.auth.getUser()`
   - profile/role check where needed
   - input validation and enum/date bounds
   - scoped `.eq(...)` filters that prevent broad updates/deletes
   - error handling and rollback for optimistic UI
   - path revalidation or `router.refresh()` if server-rendered data changes
5. For task/status mutations, also use `seeko-status-migration-auditor`.

## Output

For each risky mutation, report file, line, table, operation, current trust boundary, expected trust boundary, and the minimum fix.

Call out cases where RLS might save the database but the app still has poor UX or unclear authorization behavior.
