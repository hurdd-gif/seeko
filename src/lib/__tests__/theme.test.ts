import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getThemePreference,
  resolveTheme,
  getResolvedTheme,
  setThemePreference,
  subscribeTheme,
  applyTheme,
} from '@/lib/theme';

/** Point prefers-color-scheme at a fixed answer for the test's duration. */
function mockSystemScheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) =>
    ({
      matches: query.includes('prefers-color-scheme: dark') ? dark : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getThemePreference', () => {
  it('is system when nothing is stored', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('passes explicit light/dark through', () => {
    localStorage.setItem('seeko-theme', 'dark');
    expect(getThemePreference()).toBe('dark');
    localStorage.setItem('seeko-theme', 'light');
    expect(getThemePreference()).toBe('light');
  });

  it('treats unrecognized stored values as system', () => {
    localStorage.setItem('seeko-theme', 'blue');
    expect(getThemePreference()).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('returns explicit preferences unchanged regardless of the OS', () => {
    mockSystemScheme(true);
    expect(resolveTheme('light')).toBe('light');
    mockSystemScheme(false);
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves system from prefers-color-scheme', () => {
    mockSystemScheme(true);
    expect(resolveTheme('system')).toBe('dark');
    mockSystemScheme(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('resolves system to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('setThemePreference', () => {
  it('persists, applies the <html> class, and notifies subscribers', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeTheme(() => seen.push(getResolvedTheme()));

    setThemePreference('dark');
    expect(localStorage.getItem('seeko-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(seen).toEqual(['dark']);

    setThemePreference('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(seen).toEqual(['dark', 'light']);

    unsubscribe();
  });

  it('system preference follows the OS at apply time', () => {
    mockSystemScheme(true);
    setThemePreference('system');
    expect(localStorage.getItem('seeko-theme')).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('applyTheme', () => {
  it('keeps the theme-color meta on the canvas tint', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);

    setThemePreference('dark');
    expect(meta.getAttribute('content')).toBe('#1f1f1f');
    setThemePreference('light');
    expect(meta.getAttribute('content')).toBe('#eeeeee');

    meta.remove();
    applyTheme();
  });
});
