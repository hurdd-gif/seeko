import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_METHODS,
  orderAuthMethods,
  recallAuthMethod,
  rememberAuthMethod,
} from '../auth-method-memory';

/* The login card promotes the last-used sign-in method (Linear-style): the
 * remembered pill moves to the top with a "last used" caption. This module is
 * the pure seam — storage read/write with graceful degradation, plus the
 * ordering rule the card renders from. */

describe('rememberAuthMethod / recallAuthMethod', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips each method', () => {
    for (const method of AUTH_METHODS) {
      rememberAuthMethod(method);
      expect(recallAuthMethod()).toBe(method);
    }
  });

  it('returns null when nothing is stored', () => {
    expect(recallAuthMethod()).toBeNull();
  });

  it('returns null for a corrupted / unknown stored value', () => {
    localStorage.setItem('seeko-last-auth-method', 'carrier-pigeon');
    expect(recallAuthMethod()).toBeNull();
  });

  it('degrades silently when storage is blocked (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => rememberAuthMethod('google')).not.toThrow();
    expect(recallAuthMethod()).toBeNull();
  });
});

describe('orderAuthMethods', () => {
  it('keeps the default order when nothing is remembered', () => {
    expect(orderAuthMethods(null, { passkeySupported: true })).toEqual([
      'google',
      'passkey',
      'email',
    ]);
  });

  it('moves the remembered method to the front', () => {
    expect(orderAuthMethods('email', { passkeySupported: true })).toEqual([
      'email',
      'google',
      'passkey',
    ]);
  });

  it('a remembered first method is a no-op reorder', () => {
    expect(orderAuthMethods('google', { passkeySupported: true })).toEqual([
      'google',
      'passkey',
      'email',
    ]);
  });

  it('omits passkey when WebAuthn is unsupported', () => {
    expect(orderAuthMethods(null, { passkeySupported: false })).toEqual(['google', 'email']);
  });

  it('falls back to default order when the remembered method is unavailable', () => {
    expect(orderAuthMethods('passkey', { passkeySupported: false })).toEqual(['google', 'email']);
  });
});
