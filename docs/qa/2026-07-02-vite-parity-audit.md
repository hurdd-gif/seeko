# Vite Migration Parity Audit — 2026-07-02

QA audit of the migrated React + Vite dashboard (rr-app) against the finalized pre-migration Next.js design.
Environment: Vite dev server at `http://localhost:5173`, API at `http://localhost:8787`, `DEV_AUTH_BYPASS=1` (rendered as admin). Ground truth: staged git index versions of `src/app/**` (`git show :"path"`) on branch `feat/light-theme-migration` — the migration itself is uncommitted, so HEAD still contains the old App Router tree.

## Summary

| Severity | Count |
|----------|-------|
| P0 (crash) | 0 |
| P1 (broken feature) | 2 |
| P2 (visual/behavioral mismatch) | 3 |
| P3 (polish) | 1 |
| **Total** | **6** |

Overall: the migration is in strong shape. Every route renders, the light theme is intact everywhere (no dark-theme remnants found), fonts are correct on every page, and all network requests returned 200 across the whole audit. The gaps are concentrated at the **layout level** — features the old `src/app/(dashboard)/layout.tsx` mounted globally that `src/rr-app/main.tsx` / `routes.tsx` never picked up.

## Issues

| # | Sev | Route(s) | Description | Evidence | Suspected file |
|---|-----|----------|-------------|----------|----------------|
| 1 | P1 | all | **Command palette (Cmd+K) is gone app-wide.** Old `(dashboard)/layout.tsx` mounted `CommandPalette`; nothing in rr-app mounts it. | Verified live: Cmd+K does nothing on /tasks; grep of `src/rr-app/**` finds zero references | `src/rr-app/main.tsx` (missing mount) |
| 2 | P1 | all (visible on /team) | **PresenceHeartbeat + ActivityTracker not mounted** — presence and activity tracking are silently dead. On /team both members show gray (offline) dots, *including the actively-signed-in admin session*, which the old app would show online (`#0d7aff`). | /team screenshot: both presence dots gray while browsing as karti; grep confirms no mount in rr-app | `src/rr-app/main.tsx` (missing mounts) |
| 3 | P2 | all | **Route loading skeletons lost / no `HydrateFallback`.** react-router logs `No HydrateFallback element provided to render during initial hydration` on every initial load. The old app shipped six `loading.tsx` boneyard skeletons (/activity, /docs, /team, /tasks, /tasks/[id], /payments). | Console warning reproduced on every full page load, all routes | `src/rr-app/routes.tsx` (no `HydrateFallback` / per-route fallbacks) |
| 4 | P2 | all | **Other layout-level features not ported:** `MobileNav` (mobile chrome; partially mitigated since light pages are fixed full-bleed overlays, but small viewports have no nav), `DashboardTourWrapper` (new-user tour), `PageTransition` (route transition wrapper). | grep of `src/rr-app/**` — zero references to any of the three | `src/rr-app/main.tsx` / `routes.tsx` |
| 5 | P2 | /notifications (+ root error boundary) | **Fake ShellFrame chrome diverges from the real StudioHeaderActions:** hardcoded "SK" avatar initials, static identity ("SEEKO Studio / studio@seeko.app"), non-functional Create button, plain Inbox glyph instead of the live `NotificationBell`, and a "More" nav popover that does not exist in the real chrome (real chrome puts nav links in the avatar menu). | Verified live on /notifications: buttons `Create`, `More`, `SK` present; real pages use `StudioHeaderActions` instead | `src/rr-app/routes.tsx` (`ShellFrame` / `StudioHeaderCluster`) |
| 6 | P3 | dev only | **`routeInventory` export in routes.tsx breaks Vite Fast Refresh** — every edit to the route table triggers a full page reload with console noise (`Could not Fast Refresh ("routeInventory" export is incompatible)`). | Console debug lines on every routes.tsx HMR | `src/rr-app/routes.tsx` |

Resolved during audit: the stale `/progress` link in the fake ShellFrame "More" popover (seen in an earlier read of `routes.tsx`) was removed mid-audit — verified live that no `/progress` anchor exists anywhere in the More popover or DOM, and `routes.tsx` now carries "Progress disabled 2026-07" comments. Not counted above.

## Expected behavior changes (NOT regressions)

Per coordinator confirmation during the audit — do not misread these as bugs:

1. **/progress is disabled by user decision.** The route now redirects to /tasks and the Progress nav entry was removed from all menus. Verified: navigation to /progress lands on /tasks; no Progress link appears in the More popover, avatar menu, or anywhere in the DOM.
2. **/payments shows no passkey gate on the dev server.** `DEV_AUTH_BYPASS` now also waives the payments token (`src/api-server/payments-auth.ts`) and `PaymentsAdmin` skips the gate when `import.meta.env.MODE === 'development'`. The full admin body rendering without a gate is correct in dev; the gate still applies in production.

## Per-route notes

### `/` (index)
- Redirects to `/tasks` via `<Navigate replace>` — matches old `redirect('/tasks')`. ✓

### `/tasks` (board)
- Board columns, cards, department colors, `DIH-{n}` IDs in JetBrains Mono all correct. Flat Issues/Docs tabs + bell·Create·avatar cluster match the final chrome design (working-tree `LightShell.tsx` / `StudioHeaderActions.tsx`, intentional final-design changes vs staged versions).
- View switch board→list works; list renders correctly.
- NotificationBell popover opens, light-styled with `shadow-seeko`.
- Avatar menu opens (clip-path circle animation; verified via aria-expanded + CSS override) — identity, nav links, Sign out present. No Progress link. ✓
- **Cmd+K does nothing** → Issue #1.

### `/tasks/:id`
- Bespoke detail page renders correctly (intentionally not LightShell per prior decision). Fonts, light theme ✓.

### `/docs`
- All three tabs render; tab-pill switch works (verified via direct nav for the Shared tab — an AnimatePresence exit froze only because of the backgrounded-tab rAF pause, see caveats). Doc read dialog opens light-styled. ✓

### `/activity`
- Renders correctly, light theme, fonts ✓.

### `/progress`
- Redirects to `/tasks`. **Expected** (route disabled by user decision). Page code kept at `src/rr-app/routes/progress` for easy re-enable per source comment.

### `/settings`
- Breadcrumb drill-in header ("← Settings", label = page name — correct per user decision). Account (Profile card, Display Name, Timezone, Save, Change Password accordion) + Payments (Payment History, Request Payment, PayPal Email) all light, fonts ✓.

### `/team`
- Breadcrumb "← Team", 2 member cards with dept selects + Make Contractor actions, Contractors dashed empty state (local light empty block — correct). Fonts ✓.
- Presence dots gray for everyone including the active session → symptom of Issue #2.

### `/payments`
- **No passkey gate in dev — expected** (see behavior changes above).
- Admin body audited: Pending / Paid This Month stat cards (tabular $ figures), Invoice Requests card (27 requests, JetBrains Mono emails, blue "Approved" chips, Show all 27 disclosure), People card (payment status per member), Recent Payments light empty state. All light theme, `shadow-seeko` cards, fonts ✓ (`document.fonts.check`: Outfit ✓, JetBrains Mono ✓). No console/network errors.

### `/admin/external-signing`
- Breadcrumb "← External Signing". SendInviteForm: recipient input, Template/Upload PDF tab pill, template radios (External NDA selected state with light-blue tint), guardian-signing toggle row, collapsed "Expiration & personal note", disabled Send Invite (no recipient — correct). "No invites sent yet" light empty state below. Fonts ✓. No mutations were performed.

### `/notifications`
- NotificationsPanel itself is fine: Notification Level cards (Everything/Available/Ignoring), Channels toggles, light theme ✓.
- Wears the **fake ShellFrame chrome** → Issue #5.

### `*` (404, tested via `/this-does-not-exist`)
- Renders: dark dot-grid canvas, "This page wandered off the map" heading, subcopy, "Back to tasks" + "Open docs" buttons. Dark background is by design (dot-grid concept).
- DialKit tuning panel ("404 Dot-Grid") visible top-right — **dev-only by design**: gated by `SHOW_DIALS = Boolean(import.meta.hot)` (`src/rr-app/routes/not-found.tsx:53`), absent in production builds. Not counted as an issue.
- The scroll-scrubbed draw animation could **not** be judged: the rAF loop was paused by the backgrounded audit tab, and the page has no scroll overflow at the audit viewport (scrub is presumably wheel/pointer-driven). Recommend a quick manual check in a foreground tab.

## Fonts (checked per route)

- Body `font-family` starts with **Outfit** on every route; `document.fonts.check('16px Outfit')` and `'16px "JetBrains Mono"'` true everywhere checked.
- Mono surfaces (task `DIH-{n}` IDs, payment emails, timezone chips) render in JetBrains Mono. ✓
- **Caveat** is self-hosted (`@font-face` in `src/rr-app/styles.css`, `/fonts/Caveat-Variable.ttf` serves 200) and lazy-loads only where used (`SignaturePad`); `fonts.check` returning false on other pages is expected, not a bug.

## Console & network sweep

- **Console:** zero errors across the entire audit. Warnings: only the recurring `No HydrateFallback` (Issue #3). Debug noise: Vite HMR churn + the Fast Refresh incompatibility (Issue #6).
- **Network:** every request observed across all routes returned **200** (Vite modules, Google Fonts Outfit/JetBrains Mono, Supabase storage avatars + deck slides, API calls to :8787). No 4xx/5xx at any point.

## Audit caveats

1. **Backgrounded tab / rAF pause:** the audit tab was not foregrounded, so `requestAnimationFrame` was throttled — Motion entrance animations froze at opacity 0 and canvas draws paused. Layout screenshots were taken after injecting a CSS override (`opacity/transform/clip-path` forced to final values). Consequence: **live animation behavior (tab-pill slide, stagger entrances, popover springs, 404 scroll-draw) could not be judged** and needs a brief foreground spot-check.
2. **Concurrent edits:** the migration agent was actively editing `src/rr-app/routes.tsx`, `globals.css`, and `StudioHeaderActions.tsx` during the audit (heavy HMR churn observed). Findings reflect the tree as of ~10:40 PM; the stale Progress link was fixed mid-audit.
3. Two other tabs (1680790572, 1680790591) were being driven by another session during the audit; all checks here used tab 1680790577 only.
4. No destructive/mutating controls were exercised (no sends, saves, deletes, or Linear writes).
