---
name: seeko-preview-route-keeper
description: Keep SEEKO Studio dev-only preview routes compiling and aligned with live UI. Use when changing investor previews, dashboard previews, seeded QA pages, component exports/imports, renamed components, visual QA routes, or when `next build` reports missing modules from preview routes such as `/investor-preview`.
---

# SEEKO Preview Route Keeper

## Workflow

1. Find preview and QA routes:

```bash
find src/app -maxdepth 3 -type f | grep -E "preview|playground|qa"
```

2. Compare each preview route against its live page or component source. Examples:
   - `src/app/investor-preview/page.tsx`
   - `src/app/(investor)/investor/page.tsx`
3. Verify imports match actual case-sensitive filenames and named exports.
4. Ensure preview routes still compile even if they 404 in production. App Router analyzes them during build.
5. Keep seed data compatible with current types and database enums.
6. If a preview duplicates an obsolete live design, either update it to the live component set or remove the route intentionally.

## Common SEEKO Traps

- `InvestorKPIStrip` file/export casing must match exactly.
- Removed components must not remain imported by preview routes.
- Seed task statuses must use the current `TaskStatus` enum.
- Preview pages should not depend on auth or live Supabase data unless explicitly designed for that.

## Output

Report preview-route drift as build risk first, design drift second. Include exact missing imports, stale component names, obsolete props, and seed data mismatches.
