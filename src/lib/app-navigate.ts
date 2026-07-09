/**
 * app-navigate — framework-agnostic SPA navigation for code that renders
 * OUTSIDE the React Router context (Sonner toasts, imperative helpers).
 *
 * The router instance lives in `src/rr-app/routes.tsx`; `main.tsx` registers
 * its `navigate` here once at startup so leaf modules can navigate without
 * importing the router (which would couple them to rr-app and pull the whole
 * route graph into their bundle / tests). Kept in `src/lib` so it stays valid
 * across the Next → Vite migration.
 *
 * If no navigate is registered (SSR, unit tests that never trigger it), we
 * fall back to a hard `window.location.assign` so links still resolve.
 */

let navigateFn: ((to: string) => void) | null = null;

/** Called once by the app shell with the live router's navigate function. */
export function setAppNavigate(fn: (to: string) => void): void {
  navigateFn = fn;
}

/** Navigate to an in-app path from anywhere, Router context or not. */
export function appNavigate(to: string): void {
  if (navigateFn) {
    navigateFn(to);
    return;
  }
  if (typeof window !== 'undefined') {
    window.location.assign(to);
  }
}
