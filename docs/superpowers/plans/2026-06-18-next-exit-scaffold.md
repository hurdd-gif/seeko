# Next Exit Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parallel React Router and Hono foundation so SEEKO can migrate off Next.js route by route without a production cutover.

**Architecture:** Keep the existing Next app intact while adding a separate Vite entrypoint and a standalone Hono API app. The first route ports should be public token routes, followed by dashboard reads, write-heavy dashboard routes, and auth last.

**Tech Stack:** React 19, React Router 7, Vite, Hono, Supabase shared data modules, Vitest.

---

### Task 1: Parallel Runtime Scaffold

**Files:**
- Create: `index.html`
- Create: `vite.migration.config.ts`
- Create: `src/rr-app/main.tsx`
- Create: `src/rr-app/routes.tsx`
- Create: `src/rr-app/styles.css`
- Create: `src/api-server/app.ts`
- Create: `src/api-server/index.ts`
- Modify: `package.json`

- [x] Add React Router 7 and Hono dependencies.
- [x] Add `migrate:web:dev`, `migrate:web:build`, `migrate:api:dev`, and `migrate:api:start` scripts.
- [x] Add a Vite build target that emits to `dist/react-router`.
- [x] Add a Hono app with `/api/health` and `/api/migration/routes`.
- [x] Add a React Router app shell with the first migration route inventory.

### Task 2: Verification

**Files:**
- Create: `src/api-server/__tests__/app.test.ts`
- Create: `src/rr-app/__tests__/routes.test.tsx`

- [x] Add API tests for Hono health and migration route inventory.
- [x] Add route inventory tests to lock the public-token-first migration order.
- [x] Run `npm test -- src/api-server/__tests__/app.test.ts src/rr-app/__tests__/routes.test.tsx`.
- [x] Run `npm run migrate:web:build`.
- [x] Run `npm run migrate:api:start` and verify `GET /api/health`.

### Task 3: First Production Route Port

**Files:**
- Modify: `src/rr-app/routes.tsx`
- Create: `src/rr-app/routes/invoice.tsx`
- Create: `src/api-server/routes/invoice.ts`
- Extract from: `src/app/invoice/[token]/page.tsx`
- Extract from: `src/app/invoice/[token]/client.tsx`

- [x] Move invoice token loading into a framework-neutral function in `src/lib`.
- [x] Add a Hono invoice endpoint that calls the shared loader.
- [x] Replace the invoice placeholder with a real React Router route.
- [x] Add rendering and API tests for valid, missing, and expired token states.
- [x] Compare the Next and React Router invoice state contract with focused loader/API/render tests before moving to shared/sign routes.

### Task 4: Shared Document Route Port

**Files:**
- Modify: `src/rr-app/routes.tsx`
- Create: `src/rr-app/routes/shared.tsx`
- Create: `src/api-server/routes/doc-share.ts`
- Create: `src/lib/doc-share.ts`
- Extract from: `src/app/shared/[token]/page.tsx`
- Extract from: `src/app/shared/[token]/client.tsx`
- Extract from: `src/app/api/doc-share/[token]/route.ts`
- Extract from: `src/app/api/doc-share/send-code/route.ts`
- Extract from: `src/app/api/doc-share/verify/route.ts`
- Extract from: `src/app/api/doc-share/view/route.ts`

- [x] Move shared document token loading into a framework-neutral function in `src/lib`.
- [x] Add Hono doc-share endpoints for initial load, send-code, verify, and view.
- [x] Replace the shared placeholder with a real React Router route.
- [x] Add loader/API/render tests for missing, pending, expired, and session-required states.
- [x] Run focused migration tests, Vite migration build, and Next build.

### Task 5: External Signing Route Port

**Files:**
- Modify: `src/rr-app/routes.tsx`
- Create: `src/rr-app/routes/sign.tsx`
- Create: `src/api-server/routes/external-signing.ts`
- Create: `src/lib/external-signing.ts`
- Extract from: `src/app/sign/[token]/page.tsx`
- Extract from: `src/app/sign/[token]/client.tsx`
- Extract from: `src/app/api/external-signing/[token]/route.ts`
- Extract from: `src/app/api/external-signing/send-code/route.ts`
- Extract from: `src/app/api/external-signing/verify/route.ts`
- Extract from: `src/app/api/external-signing/sign/route.ts`

- [x] Move external signing token loading into a framework-neutral function in `src/lib`.
- [x] Add Hono external-signing endpoints for initial load, send-code, verify, and sign.
- [x] Replace the sign placeholder with a real React Router route.
- [x] Add loader/API/render tests for missing, pending, expired, and validation states.
- [x] Run focused migration tests, Vite migration build, and Next build.

### Task 6: Migration Route Code Splitting

**Files:**
- Modify: `src/rr-app/routes.tsx`

- [x] Convert migrated public token routes to React Router lazy route modules.
- [x] Run focused migration tests, Vite migration build, and Next build.
- [x] Compare Vite output against the previous single ~656 kB migration JS chunk.
