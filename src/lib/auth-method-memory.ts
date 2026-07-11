/**
 * Last-used sign-in method memory (Linear-pattern login hierarchy).
 *
 * The login card renders its provider pills in the order this module decides:
 * the method that last signed the user in on THIS browser floats to the top
 * with a "last used" caption, so a returning user re-scans one pill, not
 * three. localStorage (not session) on purpose — the whole point is surviving
 * the weeks between visits. Storage failures degrade to the default order.
 */

export const AUTH_METHODS = ['google', 'passkey', 'email'] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

const STORAGE_KEY = 'seeko-last-auth-method';

function isAuthMethod(value: unknown): value is AuthMethod {
  return (AUTH_METHODS as readonly string[]).includes(value as string);
}

/** Record a successful sign-in. Call at the moment of success (or, for OAuth,
 * right before the redirect steals the page). Never throws. */
export function rememberAuthMethod(method: AuthMethod): void {
  try {
    localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // Private mode / hardened browser: the promotion just won't persist.
  }
}

/** The last method that signed in here, or null (nothing stored, corrupted
 * value, storage blocked). */
export function recallAuthMethod(): AuthMethod | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isAuthMethod(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Pill render order: default [google, passkey, email], minus passkey where
 * WebAuthn is missing, with the remembered method promoted to the front when
 * it's still available. */
export function orderAuthMethods(
  last: AuthMethod | null,
  { passkeySupported }: { passkeySupported: boolean },
): AuthMethod[] {
  const available = AUTH_METHODS.filter(m => m !== 'passkey' || passkeySupported);
  if (!last || !available.includes(last)) return [...available];
  return [last, ...available.filter(m => m !== last)];
}
