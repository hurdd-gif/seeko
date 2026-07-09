# Codex Security Findings - 2026-05-28

Source scan:

- Repository: `seeko-studio`
- Branch/worktree scanned: `feat/light-theme-migration` at `7a7d543`, with local uncommitted and untracked edits present
- Markdown report: `/tmp/codex-security-scans/seeko-studio/7a7d543215ab_20260528T203025Z/report.md`
- HTML report: `/tmp/codex-security-scans/seeko-studio/7a7d543215ab_20260528T203025Z/report.html`

## Findings

### SEEK-003 - High - Restricted docs are protected only after broad RLS read

Authenticated users can query document rows directly from Supabase before the application applies visibility filtering. Restricted document access should be enforced in RLS, not only in application code.

### SEEK-004 - High - Investors can read internal dashboard tables directly via RLS

Investor users appear able to read broader internal dashboard data than intended through direct Supabase queries. Investor-facing access should be narrowed at the RLS policy layer.

### SEEK-007 - High - Chat attachment authorization is broken at API and RLS layers

The chat attachment API does not verify that `comment_id` belongs to the task in the URL, and related RLS policies are broad enough to allow cross-task attachment access paths.

### SEEK-001 - Medium - External signing accepts verified invoice/doc-share tokens

The external signing endpoint updates signing records after token verification without sufficiently restricting the token purpose/template. Verified tokens from other flows may be accepted by the signing path.

### SEEK-002 - Medium - External signing send-code rotates invoice/doc-share verification codes

The send-code endpoint can rotate verification codes for token records outside the intended external signing flow because it lacks a strict purpose/template filter.

### SEEK-005 - Medium - Users can bypass password/NDA gates by updating own profile fields

Profile self-update rules allow users to change fields that are used as access gates. Those fields should be protected from normal user updates or derived from trusted server-side state.

### SEEK-006 - Medium - Authenticated users can forge activity/audit rows

Authenticated users can insert activity feed rows directly, which could allow forged audit/history entries. Activity/audit inserts should be restricted to trusted server-side paths.

### SEEK-008 - Medium - Deck notes render unsanitized HTML

Deck notes are rendered as HTML in dashboard and shared-link views without sanitization. User-controlled notes should be sanitized or rendered as text/markdown through a safe renderer.

### SEEK-009 - Medium - Authenticated users can spoof notifications

Notification APIs allow authenticated users to trigger misleading user/admin notifications. Notification creation should validate sender authority and allowed notification types.

### SEEK-010 - Medium - Invoice submission can create duplicate payments by race

Concurrent invoice submissions can create duplicate payment records. The flow needs database-level uniqueness or transactional conflict handling.

### SEEK-011 - Medium - Bug-report screenshot upload lacks file type and size controls

Bug-report screenshot uploads do not enforce file type and size constraints. The endpoint should validate MIME/content, size, and storage behavior before accepting uploads.

### SEEK-012 - Low - Self-service payment requests can leave orphaned parent payments

Self-service payment request creation can leave orphaned parent payment rows on partial failure. The operation should be made atomic or cleaned up reliably on failure.

## Follow-up Notes

- Re-run the scan on a clean, current `main` branch before treating this list as the production baseline.
- Start with the three High findings, since they affect authorization boundaries and direct database/API access.
- Review RLS policies alongside API authorization checks; several findings come from mismatches between application filtering and database-level access.
