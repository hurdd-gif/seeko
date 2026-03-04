# SEEKO Studio — Agent Protocol

> Load one persona → invoke skill → then act. Never load all personas at once.

## Routing: Personas

| Task type                                        | Load                       |
|--------------------------------------------------|----------------------------|
| Next.js, API routes, Supabase, Notion API, tests | @docs/personas/swe.md      |
| shadcn/ui, Tailwind, components, animations       | @docs/personas/ux.md       |
| Notion DB schema, content structure, task model  | @docs/personas/ia.md       |
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

## Routing: MCPs

| MCP                          | Purpose                                               |
|------------------------------|-------------------------------------------------------|
| mcp__claude_ai_Notion__*     | Notion workspace — read/write pages, DBs              |
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

Before creating ANY file (plan, persona, skill, Notion DB, component):
1. Search for an existing file that covers the same topic
2. If found → update it, do not create a new one
3. If not found → create it

Applies to:
- `docs/plans/` — search by topic before writing a new plan
- `docs/personas/` — update the relevant persona rather than adding a new one
- `.claude/skills/` — check before running api2cli again (avoid regenerating existing skills)
- Notion databases — confirm DB doesn't already exist before creating via MCP
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
- Stack: Next.js 16 (App Router) · shadcn/ui · Tailwind v4 · Supabase Auth · Notion API
- Hosting: Render (render.yaml at root)
- Auth: Supabase email/password — karti invites team members
- Data source: Notion API (Notion is single source of truth, karti manages)
- Dev server: npm run dev → localhost:3000
- Test runner: npm test (Vitest)
- Plans saved to: docs/plans/YYYY-MM-DD-<topic>.md

---
*Kept current by docs/agents/maintenance.md*
