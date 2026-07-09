---
name: seeko-stack-docs-reality-checker
description: Keep SEEKO Studio documentation and agent routing aligned with the real repository stack. Use when README, CLAUDE.md, docs/personas, docs/plans, deployment notes, scripts, skill instructions, route references, or build/dev commands mention stale Next.js, App Router, src/app, next build, localhost ports, Render commands, or architecture assumptions.
---

# SEEKO Stack Docs Reality Checker

## Current Stack Facts

Treat the repository as the source of truth, but these facts reflect the current checkout:

- Frontend: Vite, React 19, React Router 7.
- Frontend entry/routes: `index.html`, `src/rr-app/main.tsx`, `src/rr-app/routes.tsx`, and `src/rr-app/routes/`.
- API server: Hono under `src/api-server/`.
- Dev scripts: `npm run dev` starts Vite on port `5173`; API proxy targets `http://localhost:8787`.
- Production build/start: Render runs `npm run build` and `npm start`.
- Build output: `dist/react-router`.
- Supabase remains the auth/data backend under `src/lib/supabase/` and `supabase/migrations/`.
- Some environment variables intentionally retain `NEXT_PUBLIC_` names because Vite exposes them through `envPrefix` and `define` shims.

## Reality Check Workflow

1. Read source-of-truth files first:

```bash
sed -n '1,220p' package.json
sed -n '1,220p' vite.config.ts
sed -n '1,220p' render.yaml
find src/rr-app src/api-server -maxdepth 2 -type f | sort
```

2. Search docs and agent routing for stale stack references:

```bash
grep -R "Next.js\\|next build\\|App Router\\|src/app\\|app/page.tsx\\|localhost:3000\\|Vercel\\|Turbopack" -n README.md CLAUDE.md docs .agents/skills
```

3. Classify each hit:
   - **Stale instruction:** points future agents to nonexistent files or wrong commands.
   - **Historical note:** acceptable if clearly describing old work.
   - **Compatibility shim:** acceptable when explaining retained `NEXT_PUBLIC_` env names or Next compatibility adapters.
   - **Plan drift:** docs/plans text is outdated but may not need editing unless it misleads current work.
4. Fix active guidance first:
   - `README.md`
   - `CLAUDE.md`
   - `docs/personas/*.md`
   - any `SKILL.md` used by current routing
   - deployment or setup docs
5. Do not mass-rewrite historical plans unless the user asks. Prefer adding a superseding note when a plan is old but valuable.
6. After doc edits, run targeted searches again to confirm active guidance no longer points to the wrong stack.

## Output

Report:

- stale references found
- which ones were fixed or should remain historical
- current commands developers should use
- any repo instructions that still conflict with source files

When editing, keep docs concise and operational. Avoid turning the README or routing table into a full architecture essay.
