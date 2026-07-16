/* ─────────────────────────────────────────────────────────
 * THEME — the one seam owning the persisted color scheme (Phase 4).
 *
 * The stored PREFERENCE is three-state — 'light' | 'dark' | 'system' — and
 * lives in localStorage under `seeko-theme`. Absence of the key (and any
 * unrecognized value) means 'system', so first-time visitors follow the OS
 * instead of the old hardcoded light default. The RESOLVED theme is always
 * two-state; resolution consults `prefers-color-scheme` only when the
 * preference is 'system'.
 *
 * The resolved theme is applied as a `.dark` class on <html> — the html
 * element (not body) so portalled surfaces (sonner, menus, dialogs) inherit
 * the token flip too.
 *
 * index.html carries an inline pre-paint copy of this resolution (same key,
 * same fallback-to-system rule) so a dark load never flashes light. Keep the
 * two in sync when editing either.
 * ───────────────────────────────────────────────────────── */

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'seeko-theme';

// Browser-chrome tint follows the canvas: paper #eeeeee ↔ dark 0.240 #1f1f1f.
const THEME_COLOR: Record<Theme, string> = {
  light: '#eeeeee',
  dark: '#1f1f1f',
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Guarded media read: jsdom's stub and ancient browsers both resolve light. */
function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference): Theme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

export function getResolvedTheme(): Theme {
  return resolveTheme(getThemePreference());
}

/** Persist a preference and re-apply it. 'system' is stored explicitly —
 *  same behavior as no key, but distinguishes "chose to follow the OS"
 *  from "never visited the toggle" if that ever matters. */
export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Private-mode storage failure: the class still applies for this page life.
  }
  applyTheme();
  notify();
}

/** React to preference OR system-scheme changes (menu row, useIsDark). */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Render-time resolved read for values CSS can't theme — JS-animated
 *  colors (Motion backgroundColor tweens) that a `dark:` class can't reach. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeTheme, () => getResolvedTheme() === 'dark');
}

/** Render-time preference read for the appearance control. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, getThemePreference);
}

/** Resolve the stored preference into the <html> class. */
export function applyTheme() {
  const dark = getResolvedTheme() === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[dark ? 'dark' : 'light']);
}

/**
 * Apply on boot and start following the OS. The media listener lives for the
 * page's life (never detached — boot-scoped, like the router param below,
 * which survives from the per-path exemption era so main.tsx needs no change).
 */
export function initTheme(_router?: {
  subscribe(fn: (state: { location: { pathname: string } }) => void): unknown;
}) {
  applyTheme();
  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      // Resolution only moves when the preference defers to the OS.
      if (getThemePreference() !== 'system') return;
      applyTheme();
      notify();
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onSystemChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(onSystemChange); // Safari < 14
    }
  } catch {
    // No matchMedia (jsdom without the stub): stay on the resolved default.
  }
}
