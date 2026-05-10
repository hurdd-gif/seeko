import { describe, it, expect } from 'vitest';
import { getRpConfig, deriveDeviceName } from '../payments-passkey';

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
