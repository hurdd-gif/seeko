# 001 — Sign-out exit choreography (staged departure to /login)

- **Status**: DONE (implemented + live feel-check on 8788, 2026-07-16 — recede timing verified numerically, entrance replay confirmed)
- **Commit**: `33ffc69` (note: `src/components/dashboard/StudioHeaderActions.tsx` and `src/rr-app/routes/investor-layout.tsx` carry uncommitted edits on top of this commit — the excerpts below were taken from the working tree, not the commit)
- **Severity**: HIGH
- **Category**: Missed opportunities / Purpose & frequency
- **Estimated scope**: 4 files — 1 new (`src/lib/sign-out.ts`), 3 edited (`src/components/dashboard/StudioHeaderActions.tsx`, `src/rr-app/routes/investor-layout.tsx`, `src/rr-app/globals.css`)

## Problem

Signing out is a hard cut. Both account menus (studio header and investor header) render the same confirm toggle, and its "Yes" button submits a **native HTML form POST**:

```tsx
{/* src/components/dashboard/StudioHeaderActions.tsx:291 — current */}
<form action="/auth/signout" method="post">
  <button
    type="submit"
    className="text-[14px] font-medium text-[#e5484d] dark:text-danger transition-colors hover:text-[#d33b40] dark:hover:text-danger-strong"
  >
    Yes
  </button>
</form>
```

```tsx
{/* src/rr-app/routes/investor-layout.tsx:404 — current (identical mechanism) */}
<form action="/auth/signout" method="post">
  <button
    type="submit"
    className="text-[14px] font-medium text-[#e5484d] dark:text-danger transition-colors hover:text-[#d33b40]"
  >
    Yes
  </button>
</form>
```

The server side (`src/api-server/routes/auth.ts:21`) awaits the Supabase sign-out and answers with a redirect:

```ts
return new Hono().post('/signout', async (c) => {
  await signOut(c);            // supabase.auth.signOut() + cookie clearing
  return c.redirect('/login', 303);
});
```

A native form POST is a **full-document navigation**, so the experience is:

1. Click "Yes" → the page **freezes exactly as it is** (menu open, button mid-hover) for the entire server round-trip.
2. The browser hard-swaps documents — a flash, no exit motion of any kind. React never gets a chance to animate: the document is torn down from outside.
3. `/login` usually arrives **static** too: its entrance storyboard is gated by `sessionStorage` (`ENTRANCE_KEYS.loginCard = 'seeko-login-entrance-played'`, see `src/lib/entrance-once.ts:24-37` and `src/components/auth/LoginForm.tsx:458-479`), and anyone signing out almost certainly played that entrance earlier in the same tab — so `hasPlayedEntrance()` is true and the form rests immediately at stage 5.

Freeze → flash → static page. It reads like a crash, not a departure. Sign-out is a deliberate, low-frequency, ceremonial action — precisely the kind of moment that can afford (and deserves) a considered exit, unlike high-frequency actions where motion must get out of the way.

What is already right and must NOT change: the confirm toggle itself (Sign out → "Sign out? Yes/Cancel") animates correctly — `AnimatePresence mode="wait"`, ±8px y-fade, `springs.snappy` with a 120ms opacity ramp — in both menus. Leave it alone.

## Target

A three-beat departure that hides the network latency inside motion, then hands the arrival to the login card's existing storyboard:

```
/* ─────────────────────────────────────────────────────────
 * SIGN-OUT STORYBOARD (ms after "Yes" is clicked)
 *
 *    0ms   fetch POST /auth/signout fires (network hides under motion)
 *    0ms   account menu closes — existing DROPDOWN shell exit (130ms ease-in)
 *   60ms   app recedes: #root opacity 1→0, scale 1→0.985,
 *          240ms cubic-bezier(0.4, 0, 1, 1)   ← accelerate-away, house exit curve
 *  300ms   viewport quiet (bare canvas) — the fade-through gap
 *  ≥300ms  when BOTH the fetch has settled AND the recede has finished:
 *          sessionStorage.removeItem('seeko-login-entrance-played')
 *          window.location.assign('/login')
 *  then    /login cold-loads and its 0–170ms card stagger plays as the ARRIVAL
 * ───────────────────────────────────────────────────────── */
```

Exact values and why each is what it is:

- **Recede**: `opacity: 0; transform: scale(0.985)` over `240ms cubic-bezier(0.4, 0, 1, 1)` with a `60ms` delay (total 300ms). Scale 0.985 is a recession, not a zoom — nothing scales toward 0 (same reasoning as the `scale(0.97)` auth-panel recession in `globals.css`). The curve is the codebase's canonical exit ease-in — identical to `DROPDOWN.shell.exitTransition` (`src/lib/motion.ts:101`) and `seeko-vt-panel-out` (`src/rr-app/globals.css:2124`).
- **60ms delay** lets the menu's own 130ms exit lead by a visible beat — the small surface leaves first, then the stage. Overlap is intentional; a full sequential wait would read as sluggish.
- **Gap before arrival**: the same fade-through grammar as the /login ⇄ /legal view-transition seam (`globals.css:2083-2097`): the outgoing surface is *gone* before the incoming one starts, and the arrival's entrance is longer than the exit (login's storyboard staggers to 170ms and each element springs in — comfortably longer than the 240ms recede that already finished). Invariant preserved: **entrance begins strictly after exit has completed.**
- **`window.location.assign('/login')`, not `router.navigate`**: a full document teardown destroys all in-memory authenticated state (React Query caches, realtime channels, stores) — the same hygiene guarantee the current native POST provides. Do not convert this to an SPA navigation.
- **Clearing `seeko-login-entrance-played`**: signing out ends the "visit" (the key's own scope, per `src/lib/entrance-once.ts` — "the scope is the tab, which is the scope of a visit"). Clearing it makes the login card replay its greeting, which is what masks the cold document load. Clear **only** the loginCard key — leave `ENTRANCE_KEYS.veil` alone so the background stays at rest and the card is the arrival.
- **Progressive enhancement**: the `<form action="/auth/signout" method="post">` markup stays. JS intercepts `onSubmit`; if the fetch fails, fall back to `form.submit()` (native POST — guaranteed-correct semantics, server still clears cookies and redirects). If JS never runs, the form works exactly as today.
- **Reduced motion**: do not intercept at all — let the native POST proceed (instant, no choreography; the login entrance is already static under reduced motion, `LoginForm.tsx:467`).

### Considered and rejected

- **Cross-document View Transitions API** (`@view-transition { navigation: auto }`): does not reliably cover form-POST-initiated navigations, Chrome-only, and gives no control over the latency window. The CSS-class approach below works in every browser and degrades to today's behavior.
- **Animating inside the menu only** (e.g. a spinner on "Yes"): doesn't fix the freeze-then-flash; the whole document still hard-cuts.

## Repo conventions to follow

- Motion constants live in `src/lib/motion.ts` (canonical springs, `DROPDOWN`); page-level/cross-document motion CSS lives in `src/rr-app/globals.css` with heavily-commented storyboards — imitate the `/* ── Public-route view transitions ── */` block at `globals.css:2025` (comment explains WHY, keyframes are named `seeko-*`).
- Exits are shorter and quicker than entrances, `cubic-bezier(0.4, 0, 1, 1)` accelerate-away — exemplar: `::view-transition-old(auth-panel)` at `globals.css:2123-2125`.
- Reduced-motion never loses feedback, only movement — exemplar: `shellEntrance()` in `src/lib/motion.ts:120-135`.
- Session-once entrance keys live in `src/lib/entrance-once.ts`; import `ENTRANCE_KEYS` from `@/lib/entrance-once`, never restate the string literal.
- Storyboard-style block comments at the top of new motion modules — exemplar: `src/lib/motion.ts:83-92` (`STORYBOARD (ms after open …)`).

## Steps

1. **Create `src/lib/sign-out.ts`** — the shared departure controller (both menus import it):

   ```ts
   import { ENTRANCE_KEYS } from '@/lib/entrance-once';

   /* ─────────────────────────────────────────────────────────
    * SIGN-OUT STORYBOARD (ms after "Yes")
    *
    *    0ms   fetch POST /auth/signout fires
    *    0ms   caller closes its account menu (DROPDOWN shell exit, 130ms)
    *   60ms   `signing-out` class recedes #root (240ms, ease-in) — CSS in globals.css
    *  300ms   viewport quiet
    *  ≥300ms  fetch settled AND recede done → clear login entrance key,
    *          full-document navigation to /login (arrival = login card storyboard)
    * ───────────────────────────────────────────────────────── */
   const EXIT_TOTAL_MS = 300; // 60ms delay + 240ms recede — keep in sync with globals.css

   /**
    * Full-document navigation on purpose: tearing the document down is what
    * guarantees no authenticated in-memory state (query caches, realtime
    * channels) survives sign-out — the same guarantee the native form POST
    * gave. On any failure we fall back to that native POST, so the worst
    * case is exactly today's behavior.
    */
   export async function performSignOutExit(form: HTMLFormElement, closeMenu: () => void) {
     closeMenu();
     document.documentElement.classList.add('signing-out');

     const receded = new Promise((resolve) => setTimeout(resolve, EXIT_TOTAL_MS));
     try {
       const [response] = await Promise.all([
         // fetch follows the 303 to a GET /login — response.ok is that page's 200.
         fetch(form.action, { method: 'POST', credentials: 'same-origin' }),
         receded,
       ]);
       if (!response.ok) throw new Error(`signout ${response.status}`);
       try {
         // Signing out ends the visit — let /login greet the next arrival.
         sessionStorage.removeItem(ENTRANCE_KEYS.loginCard);
       } catch {
         /* storage blocked — the entrance just won't replay */
       }
       window.location.assign('/login');
     } catch {
       document.documentElement.classList.remove('signing-out');
       form.submit();
     }
   }
   ```

2. **Add the recede CSS to `src/rr-app/globals.css`**, directly after the public-route view-transitions block (after the closing brace of its `@media (prefers-reduced-motion: no-preference)` rule):

   ```css
   /* ── Sign-out departure ──────────────────────────────────────────────────
    * `signing-out` on <html> is stamped by src/lib/sign-out.ts when the user
    * confirms sign-out. The app recedes (fade + 0.985 — a recession, not a
    * zoom) while the POST is in flight, leaving a quiet beat of bare canvas
    * before the full-document navigation to /login, whose card storyboard
    * plays as the arrival. Same fade-through grammar as the /login ⇄ /legal
    * seam above: the exit fully clears before the entrance begins. The 60ms
    * delay lets the account menu's own 130ms exit lead by a beat.
    * Timing lives in TWO places by necessity — EXIT_TOTAL_MS in sign-out.ts
    * must equal delay + duration here. Reduced motion never adds the class
    * (sign-out.ts doesn't intercept), so no media query is needed; the guard
    * below is belt-and-braces against future callers. */
   @media (prefers-reduced-motion: no-preference) {
     html.signing-out #root {
       opacity: 0;
       transform: scale(0.985);
       transition:
         opacity 240ms cubic-bezier(0.4, 0, 1, 1) 60ms,
         transform 240ms cubic-bezier(0.4, 0, 1, 1) 60ms;
       pointer-events: none;
     }
   }
   ```

3. **Wire the studio menu** — `src/components/dashboard/StudioHeaderActions.tsx`:
   - Add the import: `import { performSignOutExit } from '@/lib/sign-out';`
   - The component already has `const reduce = useReducedMotion()` (line ~121) and a `close()` helper (line ~125, sets `openMenu` null + `confirmingSignOut` false).
   - Replace the bare `<form action="/auth/signout" method="post">` (line ~291, inside the `confirmingSignOut` branch quoted in **Problem**) with:

     ```tsx
     <form
       action="/auth/signout"
       method="post"
       onSubmit={(e) => {
         // Reduced motion: let the native POST run — instant, no choreography.
         if (reduce) return;
         e.preventDefault();
         void performSignOutExit(e.currentTarget, close);
       }}
     >
     ```

   - The `<button type="submit">Yes</button>` inside it is untouched.

4. **Wire the investor menu** — `src/rr-app/routes/investor-layout.tsx`:
   - Add the import: `import { performSignOutExit } from '@/lib/sign-out';`
   - The menu component has `reduce` (from `useReducedMotion()`), `setProfileOpen`, and `setConfirmingSignOut` in scope (lines ~190-193).
   - Replace its bare `<form action="/auth/signout" method="post">` (line ~404, quoted in **Problem**) with:

     ```tsx
     <form
       action="/auth/signout"
       method="post"
       onSubmit={(e) => {
         if (reduce) return;
         e.preventDefault();
         void performSignOutExit(e.currentTarget, () => {
           setProfileOpen(false);
           setConfirmingSignOut(false);
         });
       }}
     >
     ```

## Boundaries

- Do NOT touch `src/api-server/routes/auth.ts` — the server handler is correct and stays.
- Do NOT change the confirm-toggle animation (the `AnimatePresence mode="wait"` ±8px swap) in either menu — it is already on-grammar.
- Do NOT touch `src/components/auth/LoginForm.tsx` or `src/lib/entrance-once.ts` — the entrance replay is achieved purely by removing the sessionStorage key.
- Do NOT convert the navigation to `router.navigate` / SPA routing (see Target — document teardown is load-bearing).
- Do NOT remove or restructure the `<form>` markup — it is the no-JS/failure fallback.
- Do NOT add dependencies.
- `src/components/dashboard/StudioHeaderActions.tsx` and `src/rr-app/routes/investor-layout.tsx` carry uncommitted appearance-toggle edits — make ONLY the sign-out edits above; if the code at the cited lines doesn't match the excerpts, STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` from `/Volumes/CODEUSER/seeko-studio` completes. Run `npx vitest run src/components/dashboard/__tests__ src/rr-app/routes/__tests__/investor-layout.test.tsx` with cwd = seeko-studio; the pre-existing baseline failures (StudioHeaderActions.bell, investor-layout) are expected and not caused by this change — anything NEW failing is.
- **Feel check** (on port 8788 — build first; the user never views 5173):
  - Open the studio account menu → Sign out → Yes: the menu exits first (~130ms), the whole app recedes and fades over the next ~240ms, there is a brief quiet beat of bare canvas, then /login paints and its card staggers in (badge → heading → tagline → pills → footer). No frozen frame, no flash of the still-open menu.
  - Repeat from the investor header menu — identical departure.
  - Slow it down: DevTools → Animations panel at 10% (or Performance capture) and confirm the recede has fully completed before the navigation, and that scale ends at 0.985, not lower.
  - Double-click "Yes" rapidly: no double-fire visible (the receding root has `pointer-events: none`).
  - Kill the network (DevTools offline) → Yes: the app un-recedes and the native form POST takes over (browser error page is acceptable — that's today's failure mode).
  - Rendering panel → emulate `prefers-reduced-motion: reduce` → Yes: instant native POST, no choreography, login arrives at rest.
  - Sign back in and sign out twice in one tab: the login entrance replays each time (the key is cleared on every sign-out).
- **Done when**: sign-out from both menus plays menu-exit → app-recede → quiet beat → login entrance, with the native form still functioning under reduced motion, fetch failure, and no-JS.
