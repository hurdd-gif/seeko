# Persona: Software Engineer

Load this file when working on: React Router routes, the Hono API server, Supabase queries, TypeScript types, Vitest tests.

---

## Stack

- **Client:** React 19 + Vite + React Router (`createBrowserRouter`), entry `src/rr-app/main.tsx`, routes `src/rr-app/routes.tsx` + `src/rr-app/routes/*.tsx`
- **API:** Hono on `@hono/node-server`, run with `tsx` (`npm start` → `src/api-server/index.ts`, app wiring in `app.ts`, one file per area in `src/api-server/routes/`)
- **Data/Auth:** Supabase (`@supabase/supabase-js` v2, `@supabase/ssr` for the browser client)
- **Tests:** Vitest + jsdom + Testing Library (`npm test`, setup `src/test-setup.ts`)
- **Hosting:** Render (see devops persona)
- The app was migrated off Next.js. There is no `src/app/`, no Server Components, no `proxy.ts`. `routeInventory[].nextFile` in `routes.tsx` is a migration record, not a live path.

---

## Dev processes

| Process | Command | Port |
|---------|---------|------|
| Vite client (HMR) | `npm run dev` | 5173, proxies `/api` + `/auth` → `VITE_API_TARGET` (default `:8787`) |
| API server | `npm start` | `PORT` (default 8787; usually run at 8788). Also serves the built client from `dist/react-router` |

- The API server has **no watch**: restart it after editing `src/api-server/**`.
- `:8788` serves the build, so `npm run build` ships client changes there. Run it before calling a client change ready. QA and perf checks go on `:8788`, not `:5173`.
- The dev server talks to the **live production database**. Never curl a route that writes.

---

## API route pattern

Each area exports a factory that takes injectable seams (used by tests) and returns a `Hono` app:

```ts
export function createTeamRoutes(options: TeamRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const teamLoader = options.teamLoader ?? loadTeamRoster;
  return new Hono().get('/team', async (c) => {
    const user = await authResolver(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    ...
  });
}
```

- Auth guards live in `src/api-server/auth-utils.ts`: `requireUser`, `requireAdmin`, `requireAdminVia`, `isAdminUser`, `isRateLimited`, `validatePaymentsToken`.
- Loaders that build page data live in `src/lib/*-index.ts` (`docs-index`, `payments-index`, `tasks-index`, …); routes call them, they don't query inline.
- Errors: throw `AccessError` (`src/lib/access-error.ts`), map with `accessErrorStatus`.

---

## Supabase clients

| File | Key | Use |
|------|-----|-----|
| `src/lib/supabase/client.ts` / `src/rr-app/supabase.ts` | anon | Browser only; RLS applies |
| `src/lib/supabase/server.ts` | service role | Server reads in `data.ts`; bypasses RLS, so scope by explicit id filters. Never import into browser code |
| `src/lib/supabase/service.ts` | service role + actor headers | Server writes; sets `x-seeko-actor` / `x-seeko-source` so `activity_log` stamps the real actor. Never stamp the actor from `auth.uid()` behind a service-role call |

- Read helpers: `src/lib/supabase/data.ts` (React `cache()`-wrapped `fetchTasks`, `fetchAreas`, `fetchTeam`, `fetchDocs`, `fetchNotifications`, …). Check there before writing a query.
- Write seams: `task-store.ts` / `tasks-repo.ts`, `invites-repo.ts`, `comment-store.ts`.
- Server reads of PII columns (`profiles.email`, `paypal_email`, `nda_*`) must use the service role: those columns are not client-readable since `20261015000002`, so selecting them on a user-JWT client fails with a permission error.
- Generated types: `src/lib/supabase/database.types.ts`; app types: `src/lib/types.ts`.
- Env vars keep their `NEXT_PUBLIC_` names. Vite exposes them via `envPrefix: ['VITE_', 'NEXT_PUBLIC_']` and shims `process.env.NEXT_PUBLIC_*` in `vite.config.ts`.
- Glossary of seams and terms: `CONTEXT.md` (repo root, local only).

---

## Migrations

- Files in `supabase/migrations/` (timestamped). Never apply one without asking: several are already applied live and must not be re-applied.
- After a schema change, update `docs/personas/ia.md`, `docs/supabase-schema.sql` and `src/lib/types.ts`.

---

## Testing

- `npm test` with cwd = seeko-studio; never run two at once.
- Tests sit in `__tests__/` next to the code.
- Some failures predate current work (LightShell, investor-layout, payments); compare against `main` before calling a failure new.
- Scope test queries to a heading/region, not a bare text match.

---

## Skill Routing Reminders

- Before implementing a feature: `test-driven-development`
- Before claiming complete: `verification-before-completion`
- Bugs: `systematic-debugging`
- Supabase writes/auth: `seeko-supabase-mutation-reviewer`
