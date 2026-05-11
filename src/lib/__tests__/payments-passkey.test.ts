// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { jwtVerify } from 'jose';
import {
  getRpConfig,
  deriveDeviceName,
  issuePaymentsCookie,
  PAYMENTS_COOKIE,
  PAYMENTS_COOKIE_MAX_AGE,
} from '../payments-passkey';

describe('getRpConfig', () => {
  it('uses localhost in dev', () => {
    const cfg = getRpConfig('http://localhost:3000');
    expect(cfg.rpId).toBe('localhost');
    expect(cfg.origin).toBe('http://localhost:3000');
    expect(cfg.rpName).toBe('SEEKO Studio');
  });

  it('uses bare hostname in production', () => {
    const cfg = getRpConfig('https://seeko-studio.onrender.com');
    expect(cfg.rpId).toBe('seeko-studio.onrender.com');
    expect(cfg.origin).toBe('https://seeko-studio.onrender.com');
  });

  it('throws on missing/invalid origin', () => {
    expect(() => getRpConfig('')).toThrow();
    expect(() => getRpConfig('not-a-url')).toThrow();
  });
});

describe('deriveDeviceName', () => {
  it('returns Mac for macOS UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (Macintosh; Mac OS X 14_0)')).toBe('Mac');
  });

  it('returns iPhone for iPhone UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
  });

  it('returns iPad for iPad UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('iPad');
  });

  it('returns Android device for Android UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (Linux; Android 14)')).toBe('Android device');
  });

  it('returns Windows device for Windows UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows device');
  });

  it('returns Linux device for Linux UA', () => {
    expect(deriveDeviceName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux device');
  });

  it('returns Unknown device for empty UA', () => {
    expect(deriveDeviceName(null)).toBe('Unknown device');
    expect(deriveDeviceName(undefined)).toBe('Unknown device');
    expect(deriveDeviceName('')).toBe('Unknown device');
  });
});

describe('issuePaymentsCookie', () => {
  const SECRET = 'a'.repeat(48);

  beforeEach(() => {
    process.env.PAYMENTS_JWT_SECRET = SECRET;
    process.env.NODE_ENV = 'test';
  });

  it('returns a cookie with httpOnly, sameSite=strict, scoped to /api/payments', async () => {
    const cookie = await issuePaymentsCookie('user-123');
    expect(cookie.name).toBe(PAYMENTS_COOKIE);
    expect(cookie.options.httpOnly).toBe(true);
    expect(cookie.options.sameSite).toBe('strict');
    expect(cookie.options.path).toBe('/api/payments');
    expect(cookie.options.maxAge).toBe(PAYMENTS_COOKIE_MAX_AGE);
    expect(PAYMENTS_COOKIE_MAX_AGE).toBe(60 * 60);
  });

  it('signs a JWT bound to the user with scope=payments', async () => {
    const cookie = await issuePaymentsCookie('user-123');
    const { payload } = await jwtVerify(cookie.value, new TextEncoder().encode(SECRET));
    expect(payload.sub).toBe('user-123');
    expect(payload.scope).toBe('payments');
  });

  it('throws if PAYMENTS_JWT_SECRET is missing', async () => {
    delete process.env.PAYMENTS_JWT_SECRET;
    await expect(issuePaymentsCookie('user-123')).rejects.toThrow(/PAYMENTS_JWT_SECRET/);
  });
});
