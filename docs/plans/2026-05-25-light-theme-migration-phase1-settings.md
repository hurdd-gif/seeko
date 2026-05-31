# Light-Theme Migration — Phase 1, Page 1: Settings

> **For Claude:** REQUIRED SUB-SKILL: execute via `subagent-driven-development` (fresh implementer per task + spec review + code-quality review between tasks). Branch `feat/light-theme-migration` (already checked out). Dev server runs from the MAIN repo at `/Volumes/CODEUSER/seeko-studio` — write to main, no worktree.

**Goal:** Migrate `/settings` from the dark DesktopHeader chrome + dark shadcn cards onto the light design language, consuming the shared `LightShell` with a breadcrumb header. ZERO logic change — visual/chrome migration only.

**Architecture:** Extend `LightShell` with one additive optional `leftSlot` prop (renders in place of the pill when provided; the 3 Phase-0 consumers don't pass it → provably unchanged). Then relight `SettingsPanel.tsx`: breadcrumb-on-LightShell shell, sentence-case group labels (Account / Payments / Admin), white `shadow-seeko` cards replacing shadcn `Card`, light form controls, restrained-red destructive actions, staggered `FadeRise` entrances. Preserve every handler, state, and behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TS, Tailwind v4 (`.overview-light` `--ov-*` tokens + `shadow-seeko`/`shadow-seeko-pop` in `globals.css`), motion/react, Vitest.

**Design doc / decisions (user-approved 2026-05-25):**
- Header = **breadcrumb** (`‹ Settings`, chevron links to Overview `/`), styled like the `/tasks/[id]` breadcrumb (13px, muted), hosted in LightShell via `leftSlot`. No pill, no account/actions cluster.
- Section grouping = **sentence-case labels** (`Account`, `Payments`, `Admin`) — NOT uppercase/tracked (banned eyebrow chrome).
- Cards = white `rounded-2xl bg-white shadow-seeko` (matches detail/rail). NO bounded Admin zone (declined). NO browser-back (declined — fixed link to `/`).
- Centered `max-w-3xl` reading column on `--ov-bg`.

**Canonical idioms to reuse (do not reinvent):**
- Light card: `overflow-hidden rounded-2xl bg-white shadow-seeko` (outer), nested blocks `rounded-xl`. Ref: `TaskDetailPage.tsx:126`, `RailSection.tsx:42`.
- Breadcrumb back-link (from `TaskDetailPage.tsx:91-97`): `className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"` with `<ChevronLeft className="size-3.5" />`.
- Tokens (under `.overview-light`): `--ov-bg #eeeeee`, `--ov-heading #111`, `--ov-text #505050`, `--ov-muted #808080`, `--ov-faint #9a9a9a`. Text colors use these (e.g. `text-[#111]` headings, `text-[#505050]` body, `text-[#808080]` muted).
- Antialiased text is on the LightShell wrapper already.

---

## Task 1: Extend LightShell with `leftSlot`

**Files:**
- Modify: `src/components/dashboard/LightShell.tsx`
- Test: `src/components/dashboard/__tests__/LightShell.test.tsx`

**Step 1 — Add the prop (additive, zero-risk).**
In the `LightShellProps` type add: `leftSlot?: React.ReactNode; // when set, replaces the pill nav (for breadcrumb/back headers)`.
In the component, where the pill `<nav>` is rendered as the left element of the header row, branch: if `leftSlot` is provided, render `leftSlot` in that left position INSTEAD of the `<nav>` pill (still wrapped in the same `FadeRise y={6} delay={0.04}` when `animatePill` is true, so entrance timing is preserved). The pill `<nav>` (and its `activeTab`/`navLabel` handling) renders only when `leftSlot` is NOT provided. Right cluster (account/actions) logic is unchanged.

**Step 2 — Failing test first.** Add to `LightShell.test.tsx` (Vitest globals, no import-from-vitest; mock `../OverviewHeaderActions` already exists):
- `renders leftSlot in place of the pill nav when provided`: render `<LightShell leftSlot={<a data-testid="crumb">‹ Settings</a>} />`; assert `getByTestId('crumb')` is present AND `queryByRole('navigation')`/the pill tabs (`queryByText('Overview')`) is absent.
- `still renders the pill when leftSlot is omitted`: existing default render asserts the pill tabs are present (guard against regression).

**Step 3 — Run tests:** `npx vitest run src/components/dashboard/__tests__/LightShell.test.tsx` → all green (the 7 existing + 2 new).

**Step 4 — Verify Phase-0 consumers untouched:** `npx tsc --noEmit` clean for LightShell + the 3 consumers; grep that none pass `leftSlot` (so their render path is identical).

**Step 5 — Commit** (pathspec only these two files; repo has large unrelated staged WIP incl. `notifications/*` — never `git add -A`):
```bash
git commit -m "feat(LightShell): optional leftSlot for breadcrumb headers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" -- src/components/dashboard/LightShell.tsx src/components/dashboard/__tests__/LightShell.test.tsx
```
After: `git show --stat HEAD` (only those 2 files) and `git status --short | grep -c notifications` (must print 10).

---

## Task 2: Relight SettingsPanel onto the light language

**Files:**
- Modify: `src/components/dashboard/SettingsPanel.tsx` (~860 lines — READ IT FULLY FIRST)
- Reference (read for idioms, do not modify): `src/components/dashboard/tasks/TaskDetailPage.tsx`, `src/components/dashboard/tasks/RailSection.tsx`, `src/components/dashboard/LightShell.tsx`, `src/app/globals.css` (`.overview-light` block).

**Step 1 — Read the whole current SettingsPanel.** Note the section skeleton: header (h1 "Settings" + subtitle) → **Account** (Profile card: avatar/display-name/timezone/Save + Change Password accordion; Onboarding Tour card; Haptic Feedback card) → **Payments** (Payment History card: PayPal email + history list) → **Admin, `isAdmin` only** (User Activity card; Team Management card) → Security keys card (`SecurityKeysPanel`). Catalogue every handler/state/dialog so NONE is dropped.

**Step 2 — Shell.** Wrap the whole panel in `<LightShell fill bordered leftSlot={<settings breadcrumb>}>`. Breadcrumb = `<Link href="/" className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"><ChevronLeft className="size-3.5" /><span>Settings</span></Link>`. Body = a scroll container `<main className="min-h-0 flex-1 overflow-y-auto">` holding a centered `<div className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-10">`. (LightShell already provides the `overview-light` canvas + bordered header.) Remove the old in-body h1/subtitle ONLY if redundant with the breadcrumb — KEEP a body h1 "Settings" + "Manage your profile and preferences." subtitle as the page's opening (heading `text-[#111]`, subtitle `text-[#808080]`); the breadcrumb is chrome, the h1 is content.

**Step 3 — Group labels.** Replace each `<h2 className="text-[11px] ... uppercase tracking-wider ...">` with a sentence-case label: `<h2 className="text-[13px] font-medium text-[#808080]">Account</h2>` (and `Payments`, `Admin`). No uppercase, no tracking.

**Step 4 — Cards.** Replace every shadcn `<Card>/<CardHeader>/<CardTitle>/<CardDescription>/<CardContent>` with light markup:
- Card shell: `<section className="rounded-2xl bg-white shadow-seeko p-6 flex flex-col gap-6">` (use `p-5` for denser cards; keep internal rhythm).
- Card title: `<h3 className="text-[15px] font-semibold text-[#111]">Profile</h3>`; description: `<p className="text-[13px] text-[#808080]">…</p>`.
- Nested blocks (e.g. the Change Password accordion body, payment rows) use `rounded-xl` + `--ov-hairline`/`border-black/[0.06]` dividers instead of dark `Separator`.

**Step 5 — Form controls (relight, preserve behavior).** The shadcn `Input/Select/Switch/Button/Label/Avatar/Badge` are dark-themed. Relight in place:
- Inputs/selects: white field, `border border-black/[0.08]`, `rounded-lg`, `text-[#2a2a2a]`, placeholder `text-[#b3b3b3]`, focus ring `focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30`. Apply via className overrides on the existing primitives if they accept `className`; otherwise replace with native `<input>/<select>` styled to match. Keep all `value`/`onChange`/refs.
- Primary button ("Save Changes", "Request Payment"): light solid — `bg-[#111] text-white hover:bg-[#2a2a2a] active:scale-[0.98] rounded-full px-4 h-9 text-[13px] font-medium transition`. Secondary ("Replay Tour", "Register this device"): `bg-[#f4f4f4] text-[#2a2a2a] hover:bg-[#ececec]`.
- Switch (Haptic): light track.
- Avatar: keep, add `outline outline-1 -outline-offset-1 outline-black/10` (image outline rule).
- Destructive ("Remove" team, delete passkey): restrained red `text-[#d4503e] hover:text-[#b8402f]` (not the dark `text-destructive` glow).
- The amber PayPal warning → `text-[#b8860b]` (calmer on light) or keep a muted amber that reads on white.
- Status `Badge` (e.g. "Approved"): light chip — `bg-[#0d7aff]/10 text-[#0d7aff]` or neutral `bg-black/[0.05] text-[#505050]` per semantics.

**Step 6 — Motion.** Wrap each group (Account / Payments / Admin / Security) in `FadeRise` with staggered delays (`0.06, 0.1, 0.14, 0.18`). Keep existing AnimatePresence on the password accordion / dialogs.

**Step 7 — Preserve behavior (HARD constraint).** Do NOT touch: any handler (`handleSave`, password change, avatar upload, `loadEvents`, `loadPayments`, team boot/remove, tour replay, haptic toggle), any state, `revalidate`/`completedTasks` props, `SecurityKeysPanel`, `PaymentRequestDialog`. If a shadcn primitive can't take a className cleanly, replace its MARKUP but wire the identical props/handlers. Investor settings reuse this panel (`revalidate` prop) — keep that path working.

**Step 8 — Verify:**
- `npx tsc --noEmit` → no NEW errors in SettingsPanel (ignore pre-existing test/investor-preview errors).
- `npm test` → no NEW failures (≈12 known pre-existing unrelated failures; confirm count unchanged).
- Do NOT run Playwright (controller does visual QA).

**Step 9 — Commit** (pathspec only SettingsPanel.tsx; if `settings/page.tsx` needs a wrapper tweak to drop a now-duplicated outer container, include it explicitly):
```bash
git commit -m "feat(settings): migrate /settings onto light LightShell + breadcrumb (Phase 1)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" -- src/components/dashboard/SettingsPanel.tsx
```
After: `git show --stat HEAD` and `git status --short | grep -c notifications` (must print 10).

---

## Task 3: QA, AFTER-critique, wrap-up

**Step 1 — Visual QA (controller).** Dev server on `localhost:3000`. Navigate `/settings`, settle 1.2s, capture `seeko-studio/docs/plans/phase1-baselines/settings-after.png` (fullPage). As admin the page shows all groups. Verify against the design: breadcrumb `‹ Settings`, sentence-case group labels, white shadow-seeko cards, light controls, restrained-red destructive, no dark chrome, no uppercase eyebrows.
**Step 2 — Functional smoke.** Confirm: Display Name input editable, Save button present, Change Password accordion toggles, PayPal field present, payment history row renders, (admin) User Activity feed + filter, Team Management Remove, Security keys list + Register. No console errors.
**Step 3 — Mandatory `/interface-craft` AFTER critique** on `settings-after.png`: confirm it resolves the BEFORE critique (eyebrows gone, light cards, account-page consistency) and flag any residual.
**Step 4 — Commit** the after-screenshot (pathspec). 
**Step 5 — Memory:** update `project_seeko_light_theme_migration.md` — Settings DONE; LightShell gained `leftSlot`; breadcrumb-shell pattern now shared (Settings via LightShell leftSlot; detail still bespoke). Note Docs + Team remain in Phase 1.
**Step 6 — STOP.** Do NOT start Docs/Team without user direction.
