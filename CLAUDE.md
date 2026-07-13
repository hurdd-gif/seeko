# SEEKO Studio — Agent Protocol

> Load one persona → invoke skill → then act. Never load all personas at once.

## Routing: Personas

| Task type                                        | Load                       |
|--------------------------------------------------|----------------------------|
| Next.js, API routes, Supabase queries, tests     | @docs/personas/swe.md      |
| shadcn/ui, Tailwind, components, animations       | @docs/personas/ux.md       |
| Supabase schema, content structure, task model   | @docs/personas/ia.md       |
| Render deployment, env vars, CI/CD               | @docs/personas/devops.md   |

## Routing: Skills

| Task class                         | Skill                                          |
|------------------------------------|------------------------------------------------|
| New feature / new screen           | brainstorming → writing-plans                  |
| Implementing from a plan           | executing-plans or subagent-driven-development |
| Any feature/bugfix code            | test-driven-development                        |
| Bug or unexpected behavior         | systematic-debugging                           |
| Before claiming work is complete   | verification-before-completion                 |
| Finishing a dev branch             | finishing-a-development-branch                 |
| Code review                        | requesting-code-review → code-reviewer         |
| Receiving review feedback          | receiving-code-review                          |
| 2+ independent tasks               | dispatching-parallel-agents                    |
| UI animations / motion             | interface-craft, motion-design-patterns        |
| Design system / tokens             | design-tokens                                  |
| Visual QA                          | visual-qa                                      |
| API security review                | sharp-edges                                    |
| Task status enum migration audit   | seeko-status-migration-auditor                 |
| Build/test verification gate       | seeko-build-gate                               |
| Supabase mutation/auth review      | seeko-supabase-mutation-reviewer               |
| Feature blast-radius mapping       | seeko-feature-surface-mapper                   |
| Payments/refunds flow audit        | seeko-payments-flow-auditor                    |
| Dev preview route drift            | seeko-preview-route-keeper                     |
| Plan vs implementation drift       | seeko-plan-drift-reviewer                      |
| UI regression / screenshot review  | seeko-ui-regression-reviewer                   |
| Stack/docs reality check           | seeko-stack-docs-reality-checker               |
| Working tree / commit hygiene      | seeko-repo-hygiene                             |

## Routing: MCPs

| MCP                          | Purpose                                               |
|------------------------------|-------------------------------------------------------|
| mcp__pencil__*               | Quick wireframes + layout sketches (.pen files)       |
| mcp__figma-desktop__*        | Hi-fi prototypes, design tokens, component specs      |

## Design Tool Workflow

| Stage                        | Tool                          |
|------------------------------|-------------------------------|
| Layout sketching/wireframes  | Pencil MCP                    |
| Hi-fi prototypes/tokens      | Figma MCP                     |
| Component variation explorer | Design Canvas (/playground)   |
| Motion/animation decisions   | interface-craft               |
| Screenshot QA                | visual-qa                     |

## Document Management Rule

Before creating ANY file (plan, persona, skill, component):
1. Search for an existing file that covers the same topic
2. If found → update it, do not create a new one
3. If not found → create it

Applies to:
- `docs/plans/` — search by topic before writing a new plan
- `docs/personas/` — update the relevant persona rather than adding a new one
- `.claude/skills/` — check before running api2cli again (avoid regenerating existing skills)
- Supabase tables — check schema in `docs/supabase-schema.sql` before adding tables
- React components in `src/components/` — check for existing component before writing a new one

## Dependency Graph

```
User task
  └─► CLAUDE.md (routing)
        ├─► docs/personas/*.md   (domain context — load ONE)
        ├─► Skill                (process — invoke before acting)
        └─► MCP                  (tool access)
```

## Repo Info

- Root: /Volumes/CODEUSER/seeko-studio
- Stack: React 19 + Vite + React Router · HeroUI v3 · Tailwind v4 · Supabase (Auth + Data)
- Hosting: Render (render.yaml at root)
- Auth: Supabase email/password — karti invites team members
- Data: Supabase Postgres (tables: tasks, areas, team_members, docs, profiles)
- Test runner: npm test (Vitest) — run it with cwd = seeko-studio, never overlap two runs
- Plans saved to: docs/plans/YYYY-MM-DD-<topic>.md

### Dev server — two processes, not one

The app was migrated off Next.js. There is no `localhost:3000` and no Next dev
server; the client and the API are separate processes.

| Process | Command | Port | Serves |
|---------|---------|------|--------|
| Vite client (HMR) | `npm run dev` | `5173` | The React app, hot-reloaded. Proxies `/api` and `/auth` → the API server (`VITE_API_TARGET`, default `http://localhost:8787`). |
| API server | `npm start` | `8787` (`PORT` overrides — commonly run at `8788`) | `src/api-server/index.ts` via `tsx`. Also serves the **built** client out of `dist/`, reading `index.html` per request. |

Which port to use:
- **`5173`** — normal development. HMR, instant client feedback.
- **`8788`** (or whatever `PORT` is set to) — QA against the real build. It reads
  `index.html` on every request, so **`vite build` alone ships client changes there**
  — no restart needed.

Two gotchas that cost time:
- The API server is plain `tsx` with **no watch** — after editing `src/api-server/**`
  you must **restart it**. Client edits never need a restart.
- `npm run dev` alone gives you a client with a **dead API** unless the API server is
  also running; the Vite proxy has nothing to forward to.

---
*Kept current by docs/agents/maintenance.md*
