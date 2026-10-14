# Persona: DevOps

Load this file when working on: Render deployment, environment variables, CI, build config.

---

## Hosting: Render

`render.yaml` defines two services:

| Service | Type | Build | Start |
|---------|------|-------|-------|
| `seeko-studio` | Node web | `npm ci && npm run build` | `npm start` (`tsx src/api-server/index.ts`) |
| `seeko-maintenance` | Static | none | publishes `public/` (serves `maintenance.html` while the main service is in Maintenance Mode) |

- Render runs `buildCommand` verbatim (no implicit install), so `npm ci` must stay in it. Every build/start dependency lives in `dependencies`, because `NODE_ENV=production` prunes devDependencies.
- The API server listens on `PORT` (Render assigns it; local default 8787) and serves the built client from `dist/react-router`.
- Deploy trigger: push to `main`.
- Maintenance page wiring: `public/maintenance.README.md`.

---

## Environment variables

Names keep the `NEXT_PUBLIC_` prefix from the Next.js era; Vite exposes them via `envPrefix` in `vite.config.ts`.

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only, never in browser code |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | Public base URLs |
| `PAYMENTS_JWT_SECRET` | Signs payments session JWTs |
| `PAYMENTS_ACCESS_HASH` | bcrypt recovery password (fallback when no passkey) |
| `RESEND_API_KEY` | Transactional email |
| `ADMIN_EMAIL` | Admin notification copies |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `EKO_ANTHROPIC_MODEL` | EKO agent |
| `SIGNING_PROVIDER`, `DOCUSIGN_*` | External signing |
| `DEV_AUTH_BYPASS` | Local dev only: fakes identity, not DB privileges. Never set on Render |
| `VITE_API_TARGET` | Local dev: where Vite proxies `/api` and `/auth` |

- `sync: false` in `render.yaml` = set in the Render dashboard.
- Local values live in `.env.local` (gitignored). Never print or commit secrets.
- When code reads a new env var, add it here and to `render.yaml`.

---

## CI (`.github/workflows/`)

`ci.yml`, `claude.yml`, `daily-commit-review.yml`, `error-log-monitor.yml`, `secret-scanning.yml`.

---

## Before deploying

1. `npm run build` passes (check the exit code; `| tail` hides failures).
2. `npm test` shows no new failures against `main`.
3. Any migration the change needs is applied first, with the user's go-ahead.
4. `git status` + `git fetch`: another session also edits this repo.

## After deploying

1. `GET /` while signed out redirects to `/login`.
2. Sign in, dashboard data loads.
3. Render logs show no boot errors.

---

## Skill Routing Reminders

- Build/test gate: `seeko-build-gate`
- Commit hygiene: `seeko-repo-hygiene`
- After changing `render.yaml` or env vars: update this file
