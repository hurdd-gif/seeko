// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractTrustedClientIp, sanitizeUserAgent } from '../request-audit';

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('extractTrustedClientIp', () => {
  it('returns the rightmost IP of x-forwarded-for (the entry our trusted proxy appends)', () => {
    // A client can pre-seed "1.1.1.1"; the edge appends the real peer last.
    expect(extractTrustedClientIp(headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('accepts a valid IPv6 address', () => {
    expect(extractTrustedClientIp(headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('returns null when x-forwarded-for is absent', () => {
    expect(extractTrustedClientIp(headers({}))).toBeNull();
  });

  it('returns null when the rightmost value is not a valid IP (spoofed / garbage)', () => {
    expect(extractTrustedClientIp(headers({ 'x-forwarded-for': '1.1.1.1, not-an-ip' }))).toBeNull();
  });

  it('does not fall back to the spoofable x-real-ip header', () => {
    // x-real-ip is a single client-supplied header with no append semantics.
    expect(extractTrustedClientIp(headers({ 'x-real-ip': '203.0.113.7' }))).toBeNull();
  });

  it('never returns the literal string "unknown"', () => {
    expect(extractTrustedClientIp(headers({ 'x-forwarded-for': 'unknown' }))).toBeNull();
  });
});

describe('sanitizeUserAgent', () => {
  it('returns a normal user-agent unchanged', () => {
    expect(sanitizeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    );
  });

  it('returns null for null, empty, or whitespace-only input', () => {
    expect(sanitizeUserAgent(null)).toBeNull();
    expect(sanitizeUserAgent(undefined)).toBeNull();
    expect(sanitizeUserAgent('')).toBeNull();
    expect(sanitizeUserAgent('   ')).toBeNull();
  });

  it('caps an oversized user-agent at 400 characters before it reaches the PDF/DB', () => {
    expect(sanitizeUserAgent('A'.repeat(5000))).toHaveLength(400);
  });

  it('strips control characters that could corrupt the audit record', () => {
    const withCtrl = 'Mozilla' + String.fromCharCode(0, 7) + '/5.0';
    expect(sanitizeUserAgent(withCtrl)).toBe('Mozilla/5.0');
  });
});
