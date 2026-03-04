# Maintenance Agent

A subagent invoked when the codebase changes significantly. Its job: keep CLAUDE.md and persona files accurate.

---

## Triggers — Invoke when:

- New npm dependency added (check if it changes persona routing)
- Notion DB schema changes (update `docs/personas/ia.md`)
- New MCP configured (update CLAUDE.md Routing: MCPs table)
- New skill discovered or installed (update CLAUDE.md Routing: Skills table)
- Render config changes (update `docs/personas/devops.md`)
- Stack version bumps (HeroUI, Next.js, Supabase)
- New route group or page added to `src/app/`
- New component directory added to `src/components/`

---

## Agent Tasks

1. Read current `CLAUDE.md` and all files in `docs/personas/`
2. Read `package.json` for current dependencies and versions
3. Read `render.yaml` for current deployment config
4. Diff against actual project structure using `ls src/` and `ls src/app/`
5. Update only what has changed — do not rewrite stable sections
6. Before updating any file, confirm the existing file covers a different scope — never duplicate
7. Commit with message: `chore: sync agent protocol [maintenance]`

---

## Rules

- **Never duplicate content** across persona files or CLAUDE.md
- **Update in place** — find the relevant section and change it, don't append
- **Minimal diffs** — one logical change per section
- **Verify before updating** — read the target file before editing
- **Stack versions belong in devops.md** — not in CLAUDE.md

---

## What Each File Owns

| File                        | Owns                                                        |
|-----------------------------|-------------------------------------------------------------|
| `CLAUDE.md`                 | Routing tables, dependency graph, repo info                 |
| `docs/personas/swe.md`      | Code patterns, API clients, types, testing                  |
| `docs/personas/ux.md`       | Visual tokens, HeroUI components, animation, design tools   |
| `docs/personas/ia.md`       | Notion DB schema, content hierarchy, property mapping       |
| `docs/personas/devops.md`   | Render config, env vars, deployment workflow                |
| `docs/agents/maintenance.md`| This file — trigger conditions and agent behavior           |

---

## Example: HeroUI Version Bump

1. Read `package.json` → find new version of `@heroui/react`
2. Read `docs/personas/ux.md` → find the version reference
3. Update only the version string in ux.md
4. Read `CLAUDE.md` → check if stack line in Repo Info needs updating
5. Update the stack line if version is mentioned
6. Commit: `chore: sync agent protocol [maintenance] — HeroUI v3.x`

---

## Example: New Notion Database Added

1. Read `docs/personas/ia.md` → check if DB already documented
2. If not found → add the new DB schema to the Notion Databases section
3. Read `docs/personas/devops.md` → add the new env var for the DB ID
4. Read `CLAUDE.md` → no change needed (routing unchanged)
5. Update `src/lib/types.ts` reminder note in `swe.md` if new type is needed
6. Commit: `chore: sync agent protocol [maintenance] — new Notion DB`
