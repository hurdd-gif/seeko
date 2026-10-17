# Maintenance Agent

A subagent invoked when the codebase changes significantly. Its job: keep CLAUDE.md and persona files accurate.

---

## Triggers — Invoke when:

- New npm dependency added (check if it changes persona routing)
- Supabase schema, grant or RLS changes (update `docs/personas/ia.md`)
- New MCP configured (update CLAUDE.md Routing: MCPs table)
- New skill discovered or installed (update CLAUDE.md Routing: Skills table)
- Render config changes (update `docs/personas/devops.md`)
- Stack changes (React Router, Hono, Vite, Supabase, Tailwind)
- New route added to `src/rr-app/routes/` or `src/api-server/routes/`
- New component directory added to `src/components/`

---

## Agent Tasks

1. Read current `CLAUDE.md` and all files in `docs/personas/`
2. Read `package.json` for current dependencies and versions
3. Read `render.yaml` for current deployment config
4. Diff against actual project structure using `ls src/`, `ls src/rr-app/routes/` and `ls src/api-server/routes/`
5. Update only what has changed — do not rewrite stable sections
6. Before updating any file, confirm the existing file covers a different scope — never duplicate
7. Commit with message: `chore: sync agent protocol [maintenance]`

---

## Rules

- **Never duplicate content** across persona files or CLAUDE.md
- **Update in place** — find the relevant section and change it, don't append
- **Minimal diffs** — one logical change per section
- **Verify before updating** — read the target file before editing
- **Deploy and env facts belong in devops.md** — not in CLAUDE.md

---

## What Each File Owns

| File                        | Owns                                                        |
|-----------------------------|-------------------------------------------------------------|
| `CLAUDE.md`                 | Routing tables, dependency graph, repo info                 |
| `docs/personas/swe.md`      | Code patterns, API clients, types, testing                  |
| `docs/personas/ux.md`       | Visual tokens, house components, animation, design tools    |
| `docs/personas/ia.md`       | Supabase schema, RLS/grants, content hierarchy              |
| `docs/personas/devops.md`   | Render config, env vars, deployment workflow                |
| `docs/agents/maintenance.md`| This file — trigger conditions and agent behavior           |

---

## Example: New Supabase Migration

1. Read the migration → note new tables, columns, grants and policies
2. Read `docs/personas/ia.md` → update the table and RLS Policies sections in place
3. Read `docs/personas/swe.md` → update query rules if client access changed
4. If the migration must be applied after a deploy, check `docs/personas/devops.md` → Before deploying
5. Commit: `chore: sync agent protocol [maintenance] — <migration name>`
