import { ENTRANCE_KEYS } from '@/lib/entrance-once';

/* ─────────────────────────────────────────────────────────
 * SIGN-OUT STORYBOARD (ms after "Yes")
 *
 *    0ms   fetch POST /auth/signout fires (latency hides under motion)
 *    0ms   caller closes its account menu (DROPDOWN shell exit, 130ms)
 *   60ms   `signing-out` on <html> recedes #root — opacity→0, scale→0.985,
 *          240ms cubic-bezier(0.4, 0, 1, 1); CSS lives in globals.css
 *  300ms   viewport quiet (bare canvas) — the fade-through gap
 *  ≥300ms  fetch settled AND recede done → clear the login entrance key,
 *          full-document navigation to /login (arrival = card storyboard)
 * ───────────────────────────────────────────────────────── */
const EXIT_TOTAL_MS = 300; // 60ms delay + 240ms recede — keep in sync with globals.css

/**
 * Full-document navigation on purpose: tearing the document down is what
 * guarantees no authenticated in-memory state (query caches, realtime
 * channels) survives sign-out — the same guarantee the native form POST
 * gave. On any failure we fall back to that native POST, so the worst
 * case is exactly the old behavior.
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
