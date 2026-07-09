---
name: seeko-repo-hygiene
description: Audit SEEKO Studio working tree hygiene before commits, PRs, handoff, or branch cleanup. Use when git status is noisy, generated agent/tool folders appear, screenshots or QA artifacts accumulate, files are deleted/renamed, package-lock changes exist, or the user asks what should be committed or ignored.
---

# SEEKO Repo Hygiene

## Workflow

1. Inspect the tree:

```bash
git status --short
git diff --stat
git diff --cached --stat
```

2. Classify changes:
   - app/source changes
   - tests
   - migrations/schema/docs
   - generated screenshots/QA artifacts
   - local tool state
   - dependency lockfile changes
   - deletions/renames
3. Check `.gitignore` for local tool directories and generated files. Common candidates:
   - `.adal/`, `.augment/`, `.codebuddy/`, `.continue/`, `.crush/`, `.goose/`, `.kiro/`, `.playwright-mcp/`, `.playwright-qa/`, `.qwen/`, `.roo/`, `.windsurf/`
   - local screenshots used for QA
   - transient worktrees
4. Do not delete user files without explicit permission. Recommend ignore rules or cleanup separately.
5. For package changes, confirm the dependency change is intentional and that `package.json` and `package-lock.json` agree.
6. Before commit/PR, pair this skill with `seeko-build-gate`.

## Output

Group by recommended action:

- Commit
- Ignore
- Leave untracked
- Ask user
- Investigate before commit

Call out any deleted files that are still imported, any added files missing tests, and any generated artifacts mixed into feature changes.
