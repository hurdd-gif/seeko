# Boneyard Skeletons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (this session) or superpowers:executing-plans (parallel session) to implement this plan task-by-task.

**Goal:** Show instant, layout-accurate skeleton loading states during the server-fetch wait when navigating to six data-heavy dashboard routes, using `boneyard-js` driven by native Next.js `loading.tsx` files.

**Architecture:** Each target route gets a `loading.tsx` that re-renders the *real* `LightShell` chrome (static across the load) and skeletonizes only the content region via a shared `<ContentSkeleton>` wrapper around `boneyard-js`'s `<Skeleton>`. Bone layouts are captured once via Chrome DevTools Protocol against the logged-in dev session and committed to `src/bones/*.bones.json` as editable source. The matching real page wraps the same content region in `<ContentSkeleton loading={false}>` — a runtime passthrough that doubles as the CLI snapshot target. Bone JSON is imported and passed via `initialBones`, so the client bundle never imports the CLI/playwright path.

**Tech Stack:** Next.js 16.2.6 App Router · React 19.2.3 · Tailwind v4 · `boneyard-js@1.8.1` (single dep: playwright, CLI-only) · Vitest + @testing-library/react.

**Design doc:** `docs/plans/2026-05-27-boneyard-skeletons-design.md` (approved).

**Branch:** `feat/light-theme-migration` is current. Confirm with the user whether to branch a fresh `feat/boneyard-skeletons` off it before starting (recommended — this work is independent of the light-theme migration).

---

## Reconnaissance Facts (verified 2026-05-27)

Chrome ownership differs per route — this drives how each `loading.tsx` reproduces chrome:

| Route | File | Chrome owner | `LightShell` props in use |
|-------|------|--------------|---------------------------|
| `/activity` | `src/app/(dashboard)/activity/page.tsx` | **page** renders `LightShell` | `navLabel="Sections" fill bordered headerPadding="px-6 py-4"` |
| `/docs` | `src/app/(dashboard)/docs/page.tsx` | **page** renders `LightShell` | `activeTab="docs" navLabel="Sections" fill bordered headerPadding="px-6 py-4"` |
| `/team` | `src/app/(dashboard)/team/page.tsx` | **page** renders `LightShell` | (read file for exact props) |
| `/tasks` | `src/app/(dashboard)/tasks/page.tsx` | **`TasksBoard`** (client) owns shell | page renders `<Suspense><TasksBoard …/></Suspense>` |
| `/tasks/[id]` | `src/app/(dashboard)/tasks/[id]/page.tsx` | **`TaskDetailPage`** owns bespoke breadcrumb header | page renders `<TaskDetailPage …/>` |
| `/payments` | `src/app/(dashboard)/payments/page.tsx` | **`PaymentsAdmin`** owns shell behind passkey gate | page renders `<FadeRise><PaymentsAdmin …/></FadeRise>` |

- **No `loading.tsx` exists anywhere** under `src/app` today.
- `LightShell` is `'use client'` at `src/components/dashboard/LightShell.tsx`. Props: `activeTab?: 'overview'|'issues'|'docs'`, `navLabel?`, `account?`, `actions?`, `fill?`, `bordered?`, `animatePill?`, `headerPadding?`, `leftSlot?`, `children`. Outer wrapper class: `overview-light fixed inset-0 z-40 overflow-hidden bg-[var(--ov-bg)] antialiased` (+ ` flex flex-col` when `fill`).
- `next.config.ts` already has `serverExternalPackages: ['@react-pdf/renderer']` and `turbopack: { root: __dirname }`. This is where playwright externalization goes if Task 1 finds it leaking.
- Vitest config: `src/test-setup.ts` setup, `jsdom`, `globals: true`, `@` alias → `src`. Component tests use `@testing-library/react` `render`/`screen`, co-located in `__tests__/`. Reference: `src/components/ui/__tests__/dialog.test.tsx`, `src/components/dashboard/__tests__/LightShell.test.tsx`.
- Reduced-motion pattern: `useReducedMotion()` from `motion/react` (see `src/components/layout/PageTransition.tsx`).
- `package.json` scripts: `dev`, `dev:mobile`, `build`, `start`, `test: vitest`. No `boneyard-js`, no `playwright` installed.

---

## Standing constraints (carry through every task)

- **File-scoped commits ONLY:** `git commit -m "msg" --only -- <path>`. NEVER `git add -A` / `git add .`. `git add <dir>` is allowed ONLY for new untracked files in that dir.
- **Commit only when the user explicitly asks.** Do not auto-commit between tasks unless the user has said to.
- The staged `notifications/` WIP must stay untouched at exactly 8 files.
- Screenshots: nested relative Playwright `filename` inside the project tree (e.g. `seeko-studio/docs/plans/boneyard-baselines/…`). Never the drive root, never `mv`/cross-volume `cp`.
- Never weaken the passkey gate or leak gated data. Bones are layout-only (no text/values) — confirm captured JSON carries no real content.

---

## Task 1: Install boneyard-js + verify the playwright import-graph is client-safe (HARD GATE)

**This task blocks all others.** boneyard-js declares `playwright` as a full dependency. The runtime import (`boneyard-js/react`) must NOT transitively pull playwright into the client bundle.

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Possibly modify: `next.config.ts`

**Step 1 — Install pinned version**

```bash
npm install --save-exact boneyard-js@1.8.1
```

Expected: `boneyard-js@1.8.1` added; `playwright` (or `playwright-core`) appears as a transitive dep in `node_modules`.

**Step 2 — Inspect the package's exports map and entry points**

```bash
node -e "console.log(JSON.stringify(require('boneyard-js/package.json').exports, null, 2))"
ls node_modules/boneyard-js/dist 2>/dev/null || ls node_modules/boneyard-js
```

Record: the exact subpath for the React runtime (design doc assumes `boneyard-js/react`), the CLI subpath, and the props/exports the runtime entry provides (`Skeleton`, `renderBones`, `snapshotBones`, `computeLayout`, and the prop name for pre-supplied bone data — design doc calls it `initialBones`; **confirm the real prop name here and use it in Tasks 3+**).

**Step 3 — Prove `boneyard-js/react` does not import playwright**

```bash
node --input-type=module -e "import('boneyard-js/react').then(m => console.log('react entry OK, exports:', Object.keys(m))).catch(e => { console.error(e); process.exit(1); })"
```

Then grep the react entry's source/dist for any `playwright` import:

```bash
grep -rn "playwright" node_modules/boneyard-js/dist/react* 2>/dev/null || echo "no playwright ref in react entry (good)"
```

**Step 4 — Build-time proof (the real gate)**

Add a temporary throwaway import of `Skeleton` from `boneyard-js/react` into one existing client component, then:

```bash
npm run build
```

Expected: build succeeds with no "Module not found" / no attempt to bundle playwright into a client chunk. If the build fails or warns about playwright in a client chunk:
- Add `serverExternalPackages: ['@react-pdf/renderer', 'playwright', 'playwright-core']` to `next.config.ts`, and if needed mark playwright external in the turbopack config. Re-run `npm run build`.

Revert the throwaway import after the build proves out.

**Step 5 — Decision gate**

- ✅ If `boneyard-js/react` is playwright-free (or cleanly externalized) AND the build is clean → proceed to Task 2.
- ❌ If playwright cannot be kept out of the client bundle → STOP and report to the user. Do not ship a multi-MB playwright payload to the browser. Fallback options to raise: (a) import only the JSON + a hand-written minimal bone renderer, (b) abandon boneyard runtime and render static CSS skeletons from the captured layout. Get a decision before continuing.

**Step 6 — Commit (only if user has authorized committing)**

```bash
git commit -m "chore: add boneyard-js@1.8.1 for skeleton loading states" --only -- package.json package-lock.json next.config.ts
```

---

## Task 2: Add boneyard config + the `bones` capture script

**Files:**
- Create: `boneyard.config.json` (repo root)
- Modify: `package.json` (scripts)
- Create: `src/bones/.gitkeep` (so the dir exists before first capture)

**Step 1 — Write `boneyard.config.json`** (from design doc decision #5)

```json
{
  "breakpoints": [390, 768, 1440],
  "out": "./src/bones",
  "wait": 800,
  "color": "rgba(0,0,0,0.06)",
  "animate": "pulse"
}
```

(Confirm key names against the version installed in Task 1 — adjust if the CLI expects different keys.)

**Step 2 — Add the capture script to `package.json`**

```json
"bones": "boneyard-js build --cdp"
```

**Step 3 — Document the capture workflow** as a comment block at the top of `boneyard.config.json` is not valid JSON; instead add a short `## Capturing bones` section to the design doc OR a `src/bones/README.md`:

```
1. npm run dev   (server on :3000)
2. Launch Chrome with: --remote-debugging-port=9222
3. Log into localhost:3000 in that Chrome
4. Navigate to each target route so it is the live tab (or let the CLI drive it)
5. npm run bones   (snapshots authenticated pages over CDP into src/bones/)
```

This sidesteps the Supabase gate without committing creds or building mock pages.

**Step 4 — Verify** `src/bones/` exists and `npm run bones --help` (or the CLI's help flag) resolves the binary. Do NOT capture yet — there are no `<ContentSkeleton>` targets until Task 4+.

**Step 5 — Commit (only if authorized)**

```bash
git add src/bones/.gitkeep
git commit -m "chore: boneyard config + bones capture script" --only -- boneyard.config.json package.json src/bones/.gitkeep
```

---

## Task 3: Build the shared `<ContentSkeleton>` wrapper (TDD)

The single seam every route uses. Centralizes: reduced-motion handling, missing-bones graceful degradation, and the `loading`/passthrough contract. Wraps `boneyard-js`'s `Skeleton`.

**Files:**
- Create: `src/components/dashboard/ContentSkeleton.tsx`
- Create: `src/components/dashboard/__tests__/ContentSkeleton.test.tsx`

**Step 1 — Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentSkeleton } from '../ContentSkeleton';

// Mock boneyard so the unit test never touches playwright/CLI paths.
vi.mock('boneyard-js/react', () => ({
  Skeleton: ({ loading, children }: { loading: boolean; children?: React.ReactNode }) =>
    loading ? <div data-testid="bones" /> : <>{children}</>,
}));

describe('ContentSkeleton', () => {
  it('passes children through when not loading', () => {
    render(<ContentSkeleton name="activity-content" loading={false}><p>real content</p></ContentSkeleton>);
    expect(screen.getByText('real content')).toBeInTheDocument();
  });

  it('renders bones when loading', () => {
    render(<ContentSkeleton name="activity-content" loading><p>real content</p></ContentSkeleton>);
    expect(screen.getByTestId('bones')).toBeInTheDocument();
    expect(screen.queryByText('real content')).not.toBeInTheDocument();
  });
});
```

**Step 2 — Run, verify it fails** (`npm test -- ContentSkeleton` → fail: module not found).

**Step 3 — Implement** (adjust the boneyard prop names to whatever Task 1 confirmed)

```tsx
'use client';

import { useReducedMotion } from 'motion/react';
import { Skeleton } from 'boneyard-js/react';
import type { ReactNode } from 'react';

interface ContentSkeletonProps {
  name: string;            // matches the committed src/bones/<name>.bones.json
  loading: boolean;        // true in loading.tsx, false on the real page
  initialBones?: unknown;  // imported JSON, passed straight to boneyard
  children?: ReactNode;
}

export function ContentSkeleton({ name, loading, initialBones, children }: ContentSkeletonProps) {
  const shouldReduce = useReducedMotion();
  // Missing-bones guard: if loading but no bone data resolved, render an empty
  // content area (the surrounding LightShell still paints) instead of crashing.
  return (
    <Skeleton
      name={name}
      loading={loading}
      initialBones={initialBones}
      animate={shouldReduce ? 'solid' : 'pulse'}
    >
      {children}
    </Skeleton>
  );
}
```

**Step 4 — Run, verify pass.**

**Step 5 — Commit (only if authorized)**

```bash
git commit -m "feat: ContentSkeleton wrapper around boneyard-js" --only -- src/components/dashboard/ContentSkeleton.tsx src/components/dashboard/__tests__/ContentSkeleton.test.tsx
```

---

## Task 4: `/activity` — wrap content + add loading.tsx (proof route)

`/activity` is the simplest (page owns LightShell). Prove the full pattern here before touching the harder routes.

**Files:**
- Modify: `src/app/(dashboard)/activity/page.tsx` (wrap the body in `<ContentSkeleton loading={false}>`)
- Create: `src/app/(dashboard)/activity/loading.tsx`

**Step 1 — Wrap the real content region.** In `activity/page.tsx`, wrap the `<main>…</main>` body (the part that shows activity rows — NOT the LightShell chrome) so the snapshot target matches what the user will see:

```tsx
import { ContentSkeleton } from '@/components/dashboard/ContentSkeleton';
// …
<LightShell navLabel="Sections" fill bordered headerPadding="px-6 py-4">
  <ContentSkeleton name="activity-content" loading={false}>
    <main className="min-h-0 flex-1 overflow-y-auto">
      {/* …existing body… */}
    </main>
  </ContentSkeleton>
</LightShell>
```

**Step 2 — Create `loading.tsx`** — mirror the exact same LightShell props, force `loading`:

```tsx
import { LightShell } from '@/components/dashboard/LightShell';
import { ContentSkeleton } from '@/components/dashboard/ContentSkeleton';
import activityBones from '@/bones/activity-content.bones.json';

export default function ActivityLoading() {
  return (
    <LightShell navLabel="Sections" fill bordered headerPadding="px-6 py-4">
      <ContentSkeleton name="activity-content" loading initialBones={activityBones} />
    </LightShell>
  );
}
```

**Step 3 — Capture the bone** (server running + Chrome logged in, per Task 2 workflow):

```bash
npm run bones
```

Expected: `src/bones/activity-content.bones.json` written for all three breakpoints. Inspect it — confirm it holds only layout rectangles, **no real text/values**.

**Step 4 — Manual verify** with network throttling (DevTools → Slow 3G): navigate to `/activity`, confirm the skeleton paints instantly with stable chrome, then swaps to real content. Confirm no dark flash (PageTransition light floor already handles the crossfade gap).

**Step 5 — Commit (only if authorized)**

```bash
git add src/bones/activity-content.bones.json
git commit -m "feat: skeleton loading state for /activity" --only -- "src/app/(dashboard)/activity/page.tsx" "src/app/(dashboard)/activity/loading.tsx" src/bones/activity-content.bones.json
```

---

## Task 5: `/docs` — wrap content + loading.tsx + bone

Same shape as Task 4. LightShell props: `activeTab="docs" navLabel="Sections" fill bordered headerPadding="px-6 py-4"`.

**Files:**
- Modify: `src/app/(dashboard)/docs/page.tsx`
- Create: `src/app/(dashboard)/docs/loading.tsx`
- Create (capture): `src/bones/docs-content.bones.json`

Wrap the `<main>` body in `<ContentSkeleton name="docs-content" loading={false}>`. `loading.tsx` mirrors props + `loading initialBones={docsBones}`. Capture, verify, commit (file-scoped, only if authorized).

---

## Task 6: `/team` — wrap content + loading.tsx + bone

Read `team/page.tsx` for its exact `LightShell` props first (the head wasn't captured in recon). Same pattern: wrap the team body in `<ContentSkeleton name="team-content" loading={false}>`, create `loading.tsx` mirroring the shell, capture `src/bones/team-content.bones.json`, verify, commit.

---

## Task 7: `/tasks` — board-owned chrome

`/tasks` page renders `<Suspense><TasksBoard …/></Suspense>`; `TasksBoard` (client) owns the `LightShell` (`activeTab="issues"` + a right `actions` cluster of board icons + filter/view-toggle).

**Decision for the skeleton:** `loading.tsx` renders a `LightShell` with `activeTab="issues"` and a **neutral header** — omit the interactive `actions` cluster (filter/view-toggle are interactive and meaningless while loading) — and a `<ContentSkeleton name="tasks-content" loading>` body. The bone capture target is the board's content region.

**Files:**
- Modify: `src/components/dashboard/tasks/TasksBoard.tsx` — wrap the board content region (below the shell header, the columns/list area) in `<ContentSkeleton name="tasks-content" loading={false}>`.
- Create: `src/app/(dashboard)/tasks/loading.tsx`:

```tsx
import { LightShell } from '@/components/dashboard/LightShell';
import { ContentSkeleton } from '@/components/dashboard/ContentSkeleton';
import tasksBones from '@/bones/tasks-content.bones.json';

export default function TasksLoading() {
  return (
    <LightShell activeTab="issues" navLabel="Sections" fill bordered headerPadding="px-6 py-4">
      <ContentSkeleton name="tasks-content" loading initialBones={tasksBones} />
    </LightShell>
  );
}
```

(Confirm `TasksBoard`'s actual LightShell props and match them in `loading.tsx` so the chrome is pixel-identical.) Capture `src/bones/tasks-content.bones.json`, verify, commit file-scoped (only if authorized).

---

## Task 8: `/tasks/[id]` — bespoke breadcrumb header, unknown task name

`TaskDetailPage` owns a bespoke `LightShell` with a `leftSlot` breadcrumb (back chevron + task name). The task name is **unknown** at load time.

**Decision:** `loading.tsx` renders `LightShell` with a `leftSlot` containing the static back affordance (chevron + "Issues"/back label) and a small bone where the task name would be. Read `TaskDetailPage.tsx` for the exact `leftSlot` markup to mirror the static parts. Wrap the detail body in `<ContentSkeleton name="task-detail-content" loading={false}>`.

**Files:**
- Modify: `src/components/dashboard/tasks/TaskDetailPage.tsx` (wrap body region)
- Create: `src/app/(dashboard)/tasks/[id]/loading.tsx`
- Create (capture): `src/bones/task-detail-content.bones.json`

Capture against a real task detail page (`/tasks/<some id>`), verify the breadcrumb stays stable and only the body skeletonizes, commit file-scoped (only if authorized).

---

## Task 9: `/payments` — passkey-gated

`PaymentsAdmin` owns the shell behind a passkey gate. `loading.tsx` fires during the **server fetch** of team/profile — *before* the client passkey gate renders. The skeleton must show the shell + neutral content bones and **must not leak any gated payment data** (it won't — bones are layout-only).

**Decision:** `loading.tsx` renders the `PaymentsAdmin` shell chrome (read the file for its `LightShell` props) + `<ContentSkeleton name="payments-content" loading>`. Capture must be done from an authed admin session that has passed the passkey gate so the captured layout matches the admin body; **verify the committed JSON contains zero real amounts/recipient data** before committing.

**Files:**
- Modify: `src/components/dashboard/PaymentsAdmin.tsx` (wrap the admin body)
- Create: `src/app/(dashboard)/payments/loading.tsx`
- Create (capture): `src/bones/payments-content.bones.json`

Verify (network throttle), confirm no gated-data leakage in the JSON, commit file-scoped (only if authorized).

---

## Task 10: Reduced-motion + missing-bones resilience verification

Already implemented in `ContentSkeleton` (Task 3). This task verifies behavior end-to-end.

**Step 1 — Reduced motion:** add a test asserting `ContentSkeleton` passes `animate="solid"` when `useReducedMotion()` returns true (mock the hook). Manually verify via OS "Reduce Motion" → skeletons don't pulse.

**Step 2 — Missing-bones guard:** temporarily rename one `*.bones.json` import to a missing name (or pass `initialBones={undefined}`), confirm the route renders the bare LightShell content area (no crash/blank), then restore.

**Step 3 — Commit any test additions file-scoped (only if authorized).**

---

## Task 11: Visual QA + `/interface-craft` AFTER critique

**Step 1 — Capture loading-frame screenshots** at 390/768/1440 for all six routes under network throttle, saving with nested relative Playwright `filename` into `seeko-studio/docs/plans/boneyard-baselines/` (never the drive root).

**Step 2 — Run `/interface-craft critique`** on the captured loading frames vs the real pages. Check: bone color (`rgba(0,0,0,0.06)`) reads calm on `#eeeeee` and on white `shadow-seeko` cards; pulse is calm not shimmer; chrome is pixel-stable across the load→content swap; no layout shift when real content replaces bones.

**Step 3 — Fix any craft issues surfaced, re-verify.**

**Step 4 — Final review** via subagent-driven-development's final code-reviewer pass (or `requesting-code-review`).

---

## Task 12: Update memory + finish branch

**Step 1 — Add a memory file** recording the boneyard integration (trigger = native `loading.tsx`, six routes, `ContentSkeleton` seam, bones committed as editable JSON, playwright-externalization outcome from Task 1) and a one-line pointer in `MEMORY.md`.

**Step 2 — Finish the branch** via superpowers:finishing-a-development-branch (verify tests pass → present options → execute the user's choice). Do not merge/push without explicit user direction.

---

## Open items to confirm during execution (not blockers)

- **Task 1 is a hard gate.** If playwright can't be kept out of the client bundle, stop and get a decision.
- Confirm boneyard's exact runtime prop names (`initialBones`, `animate`, `name`) against v1.8.1 — the code above uses the design-doc-documented names.
- Confirm `TasksBoard` / `TaskDetailPage` / `PaymentsAdmin` exact `LightShell` props so each `loading.tsx` is pixel-identical chrome.
