---
name: seeko-build-gate
description: Run and triage SEEKO Studio verification. Use before claiming work is complete, before commits or PRs, after dependency/schema/task-status changes, after deleting/renaming components, or when the user asks whether the repo builds, tests pass, CI is likely green, or what is broken.
---

# SEEKO Build Gate

## Workflow

1. Confirm project root is `/Volumes/CODEUSER/seeko-studio`.
2. Inspect `package.json` scripts and current git status.
3. Run verification in this order unless the user asks for a narrower check:

```bash
npm test -- --run
npm run build
```

4. If build fails on Google font fetches in a restricted sandbox, separate that environment issue from local compile errors. Missing modules, TypeScript errors, bad imports, and route errors are still actionable.
5. If tests fail, group by root cause rather than listing every assertion.
6. Do not call the work complete while either command has actionable local failures.

## Triage Priorities

Report in this order:

1. Build blockers that prevent `next build`.
2. Runtime/security/auth failures.
3. Test failures indicating component/API behavior drift.
4. Test failures caused by stale mocks or accessibility-label expectations.
5. Environmental issues such as blocked network font downloads.

## Output

Use concise findings with file links and command results. Include:

- exact command run
- pass/fail result
- highest-leverage next fix
- whether failures are local code defects, stale tests, or environment constraints

When the user asks for fixes, address build blockers before cosmetic or snapshot-style failures.
