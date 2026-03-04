# Persona: DevOps

Load this file when working on: Render.com deployment, environment variables, CI/CD, build config.

---

## Hosting: Render.com

Service type: **web** (Node.js)
Deploy trigger: push to `main` branch
Auto-deploy: enabled

---

## render.yaml

```yaml
services:
  - type: web
    name: seeko-studio
    env: node
    buildCommand: npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: NOTION_TOKEN
        sync: false
      - key: NEXT_PUBLIC_SUPABASE_URL
        sync: false
      - key: NEXT_PUBLIC_SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: NOTION_TASKS_DB_ID
        sync: false
      - key: NOTION_AREAS_DB_ID
        sync: false
      - key: NOTION_TEAM_DB_ID
        sync: false
      - key: NOTION_DOCS_PAGE_ID
        sync: false
```

Note: `sync: false` means the value is set manually in the Render dashboard, not committed to the repo.

---

## Required Environment Variables

| Variable                       | Where set          | Description                          |
|--------------------------------|--------------------|--------------------------------------|
| `NOTION_TOKEN`                 | Render dashboard   | Notion integration secret            |
| `NEXT_PUBLIC_SUPABASE_URL`     | Render + .env.local | Supabase project URL                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Render + .env.local | Supabase anon key (public)           |
| `SUPABASE_SERVICE_ROLE_KEY`    | Render dashboard   | Supabase service role (never public) |
| `NOTION_TASKS_DB_ID`           | Render + .env.local | Notion Tasks database ID             |
| `NOTION_AREAS_DB_ID`           | Render + .env.local | Notion Areas database ID             |
| `NOTION_TEAM_DB_ID`            | Render + .env.local | Notion Team database ID              |
| `NOTION_DOCS_PAGE_ID`          | Render + .env.local | Notion Docs parent page ID           |

---

## .env.local (local dev, gitignored)

```bash
NOTION_TOKEN=secret_...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NOTION_TASKS_DB_ID=...
NOTION_AREAS_DB_ID=...
NOTION_TEAM_DB_ID=...
NOTION_DOCS_PAGE_ID=...
```

---

## Next.js on Render

- Render auto-assigns a `PORT` — Next.js reads it automatically in production
- No special `next.config.js` needed for Render (output: `'standalone'` optional but not required)
- Build output: `.next/` directory

---

## Deployment Workflow

1. Commit and push changes to `main` branch
2. Render auto-detects the push and triggers a new deployment
3. Render runs `npm run build` → then `npm start`
4. Monitor deploy logs in the Render dashboard
5. Verify the deploy URL (e.g., `https://seeko-studio.onrender.com`)

---

## .gitignore Requirements

Ensure these are gitignored:
- `.env.local`
- `.env*.local`
- `node_modules/`
- `.next/`

---

## Health Check

After deploy, verify:
1. `GET /` → redirects to `/login` (not logged in)
2. Login with Supabase credentials → redirects to dashboard
3. Notion data loads (tasks, areas, team)

---

## Skill Routing Reminders

- After changing `render.yaml`: trigger maintenance agent to sync CLAUDE.md
- After adding new env vars: update this file AND add them to `render.yaml`
- After stack version bumps: update this file
