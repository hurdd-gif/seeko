/* ─────────────────────────────────────────────────────────
 * THEME — the one seam owning the persisted color scheme (Phase 4).
 *
 * The stored preference lives in localStorage under `seeko-theme` and is
 * applied as a `.dark` class on <html> — the html element (not body) so
 * portalled surfaces (sonner, menus, dialogs) inherit the token flip too.
 *
 * index.html carries an inline pre-paint copy of this logic (same key)
 * so a dark reload never flashes light. Keep the two in sync when
 * editing either.
 * ───────────────────────────────────────────────────────── */

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'seeko-theme';

// Browser-chrome tint follows the canvas: paper #eeeeee ↔ dark 0.240 #1f1f1f.
const THEME_COLOR: Record<Theme, string> = {
  light: '#eeeeee',
  dark: '#1f1f1f',
};

const listeners = new Set<(theme: Theme) => void>();

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Persist a preference and re-apply it against the current URL. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private-mode storage failure: the class still applies for this page life.
  }
  applyTheme();
  listeners.forEach((listener) => listener(theme));
}

/** React to preference changes (e.g. the menu row re-rendering its icon). */
export function subscribeTheme(listener: (theme: Theme) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Render-time preference read for values CSS can't theme — JS-animated
 *  colors (Motion backgroundColor tweens) that a `dark:` class can't reach. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeTheme, () => getStoredTheme() === 'dark');
}

/** Resolve the stored preference into the <html> class. */
export function applyTheme() {
  const dark = getStoredTheme() === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[dark ? 'dark' : 'light']);
}

/**
 * Apply on boot. The router param survives from the per-path exemption era
 * (every route now follows the preference) so main.tsx needs no change; the
 * subscription is gone because the theme no longer varies by route.
 */
export function initTheme(_router?: {
  subscribe(fn: (state: { location: { pathname: string } }) => void): unknown;
}) {
  applyTheme();
}
