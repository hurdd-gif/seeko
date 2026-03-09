---
name: pr
description: Push current changes as a PR to main. Use when the user says "/pr" or "make a PR" or "push a PR".
user_invocable: true
---

# Push PR to Main

Commit all current changes and create a GitHub PR targeting `main`.

## Steps

1. **Check state** — Run `git status` and `git diff` (staged + unstaged) to see what changed. If there are no changes, tell the user "Nothing to push" and stop.

2. **Stage files** — Add all modified/new files that are relevant. Never stage `.env*`, credentials, or secrets. Use specific file paths, not `git add -A`.

3. **Commit** — Write a concise commit message summarizing the changes. End with:
   ```
   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
   Use a HEREDOC for the message. If already on a feature branch with new commits and nothing unstaged, skip this step.

4. **Branch** — If on `main`, create a new branch first (`feat/<short-description>` or `fix/<short-description>`). If already on a feature branch, stay on it.

5. **Push** — `git push -u origin <branch>`. If the branch already tracks remote and is up to date, skip.

6. **Create PR** — Use `gh pr create`:
   - Title: short, under 70 characters
   - Body format:
     ```
     ## Summary
     - bullet points of what changed

     ## Test plan
     - [ ] verification steps

     🤖 Generated with [Claude Code](https://claude.com/claude-code)
     ```
   - Base: `main`
   - Use a HEREDOC for the body.

7. **Report** — Print the PR URL.

## Rules

- NEVER force push
- NEVER push to main directly
- NEVER stage secrets or .env files
- If a pre-commit hook fails, fix the issue and retry — do NOT skip hooks
- If there's an existing open PR for this branch, just push the new commit and report the existing PR URL instead of creating a duplicate
