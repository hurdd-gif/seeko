# Boneyard Skeletons — Design

**Date:** 2026-05-27
**Status:** Approved (brainstorming) → next: writing-plans
**Branch:** `feat/light-theme-migration` (current) — implementation branch TBD at plan time

## Goal

Show instant, layout-accurate skeleton loading states during the server-fetch wait when
navigating to data-heavy dashboard pages, using [`boneyard-js`](https://github.com/0xGF/boneyard).

## Context

- **Stack:** Next.js 16.2.6 App Router · React 19.2.3 · Tailwind v4 · light theme.
- **Today:** no `loading.tsx` anywhere — route navigation waits on the server with no
  feedback, then the `PageTransition` (`AnimatePresence mode="wait"`) crossfade swaps pages.
  A dark-gap flash during that crossfade was just fixed with a persistent light floor in
  `PageTransition.tsx` (`fixed inset-0 bg-[#eeeeee]`). This skeleton work is complementary:
  the floor covers any residual gap; skeletons fill the *actual* fetch wait.
- **Package:** `boneyard-js@1.8.1`, maintainer `0xgf` (GoodFuture/0xGF — first-party-adjacent).
  Single dependency: `playwright@^1.58.2` (CLI snapshot engine only). ~34.7k weekly downloads.

## Decisions (locked)

### 1. Trigger — native `loading.tsx`
Each target route gets a `loading.tsx`. Next renders it the instant the user clicks a tab,
before the server responds, then swaps to real content when data resolves. Chosen over
client nav-pending and a global overlay because it is the only option that paints *before*
navigation commits (most responsive) and the only one that exploits boneyard's per-route
bone layouts. Trade-off accepted: `loading.tsx` is a Next file convention; the `<Skeleton>`
component itself is framework-agnostic and survives the planned migrate-off-Next, so only the
thin file wrapper would need re-homing.

### 2. Scope — 6 data-heavy routes
`/tasks`, `/tasks/[id]`, `/activity`, `/payments`, `/docs`, `/team`.
Excluded (near-instant, skeleton would flash sub-100ms and feel janky): `/`, `/settings`,
`/notifications`, `/admin/external-signing`. Each route is an independent `loading.tsx`, so
expanding scope later is trivial.

### 3. Chrome stays, content bones
`loading.tsx` renders the **real `LightShell`** (pill/breadcrumb header — static and identical
across the load) and skeletonizes **only the content region** via `<Skeleton name="…-content" loading />`.
The shell stays rock-stable; only the data area fills in. Avoids a full-page gray flash.

### 4. Capture target
Each target page wraps its content region in `<Skeleton name="…-content" loading={false}>{content}</Skeleton>`
— a passthrough at runtime, and the snapshot target for the CLI. `loading.tsx` mirrors the
same `name` with `loading` forced true.

### 5. Bone generation — CDP capture, committed JSON
- Root `boneyard.config.json`:
  ```json
  {
    "breakpoints": [390, 768, 1440],
    "out": "./src/bones",
    "wait": 800,
    "color": "rgba(0,0,0,0.06)",
    "animate": "pulse"
  }
  ```
  - Breakpoints = our QA viewports (390 mobile, 768 md, 1440 desktop).
  - `color: rgba(0,0,0,0.06)` matches our `border-black/[0.06]` hairline — calm on white
    `shadow-seeko` cards and the `#eeeeee` canvas.
  - `animate: pulse` (calm; not shimmer).
- Workflow (documented `npm run bones`): launch Chrome with `--remote-debugging-port`, log
  into `localhost:3000`, then `npx boneyard-js build --cdp`. Snapshots the real authenticated
  pages (sidesteps the Supabase gate without committing creds or building mock pages).
- Commit `src/bones/*.bones.json` as **editable source** — hand-tweak a bone directly, or
  re-capture only when a layout changes materially.

### 6. Resilience
- `prefers-reduced-motion` → `animate: "solid"` (no pulse).
- Missing-bones guard: a route without committed bone data degrades gracefully (renders the
  bare LightShell content area, not a crash/blank).

## Open risk to verify during implementation (not a design blocker)

`boneyard-js` declares `playwright` as a **full dependency** (not dev). The runtime import is
`boneyard-js/react` (`Skeleton`, `renderBones`); the CLI/snapshot path (`boneyard-js/cli`,
`boneyard-js/vite`) is what needs playwright. **Verify the `boneyard-js/react` import graph is
playwright-free** so it never reaches the client bundle. If it isn't, externalize/optional-ize
playwright (or mark it external in the Next/Turbopack config). Pin the exact version (`1.8.1`).

## Testing

- **Unit:** the content-skeleton wrapper renders bones when `loading`, passes children through
  when not.
- **Visual QA:** capture the loading frame at 390/768/1440 (throttled network) against the real
  layout per route.
- **Design hook:** `/interface-craft` critique before AND after.

## Architecture summary

```
Click tab
  → Next starts server render of target route
  → loading.tsx paints instantly:
        <LightShell {...sameChromeProps}>
          <Skeleton name="tasks-content" loading />   ← reads src/bones/tasks-content.bones.json
        </LightShell>
  → server data resolves
  → real page mounts:
        <LightShell {...}>
          <Skeleton name="tasks-content" loading={false}>{realContent}</Skeleton>
        </LightShell>
```

Bone data captured once via `--cdp` against the logged-in dev session, committed to `src/bones/`.
```
