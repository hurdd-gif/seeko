import { describe, expect, it } from 'vitest';
import { sanitizeNextPath } from '../next-path';

describe('sanitizeNextPath', () => {
  it('accepts a same-origin absolute path', () => {
    expect(sanitizeNextPath('/issues')).toBe('/issues');
    expect(sanitizeNextPath('/tasks/abc-123')).toBe('/tasks/abc-123');
    expect(sanitizeNextPath('/investor/docs?tab=decks')).toBe('/investor/docs?tab=decks');
  });

  it('rejects empty / missing input', () => {
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
    expect(sanitizeNextPath('')).toBeNull();
  });

  it('rejects protocol-relative and off-origin targets (open-redirect guard)', () => {
    expect(sanitizeNextPath('//evil.com')).toBeNull();
    expect(sanitizeNextPath('//evil.com/path')).toBeNull();
    expect(sanitizeNextPath('https://evil.com')).toBeNull();
    expect(sanitizeNextPath('http://evil.com')).toBeNull();
    expect(sanitizeNextPath('javascript:alert(1)')).toBeNull();
  });

  it('rejects the backslash trick browsers normalize to //', () => {
    expect(sanitizeNextPath('/\\evil.com')).toBeNull();
    expect(sanitizeNextPath('/\\/evil.com')).toBeNull();
  });

  it('rejects a relative path with no leading slash', () => {
    expect(sanitizeNextPath('issues')).toBeNull();
    expect(sanitizeNextPath('../etc')).toBeNull();
  });

  it('rejects embedded control characters', () => {
    expect(sanitizeNextPath('/tasks\nSet-Cookie: x')).toBeNull();
    expect(sanitizeNextPath('/tasks\tfoo')).toBeNull();
  });
});
