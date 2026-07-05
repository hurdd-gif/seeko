import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeEmailHtml } from '../sanitize';

describe('sanitizeHtml', () => {
  it('runs server-side (no window) without throwing', () => {
    // Regression guard: the bare `dompurify` default export has no `.sanitize`
    // without a DOM, so Next 16 SSR of the agreement/doc components 500'd.
    // isomorphic-dompurify must sanitize in a node context too.
    expect(() => sanitizeHtml('<p>hello</p>')).not.toThrow();
  });

  it('returns a string', () => {
    expect(typeof sanitizeHtml('<b>x</b>')).toBe('string');
  });

  it('preserves safe markup', () => {
    const out = sanitizeHtml('<p>Confidential <strong>info</strong></p>');
    expect(out).toContain('<strong>info</strong>');
    expect(out).toContain('<p>');
  });

  it('strips <script> tags', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('<p>ok</p>');
  });

  it('strips event-handler attributes', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain('onerror');
  });

  it('handles empty / nullish-ish input without throwing', () => {
    expect(() => sanitizeHtml('')).not.toThrow();
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('sanitizeEmailHtml', () => {
  it('runs server-side (no window) without throwing', () => {
    expect(() => sanitizeEmailHtml('<p>hello</p>')).not.toThrow();
  });

  it('handles empty / nullish-ish input without throwing', () => {
    expect(sanitizeEmailHtml('')).toBe('');
    // @ts-expect-error — exercising the runtime nullish guard
    expect(() => sanitizeEmailHtml(null)).not.toThrow();
  });

  it('preserves the allow-listed structural tags', () => {
    const out = sanitizeEmailHtml(
      '<p>Para</p><ul><li>One</li></ul><ol><li>Two</li></ol><strong>b</strong><em>i</em><br>',
    );
    expect(out).toContain('<p>');
    expect(out).toContain('<ul>');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>');
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>');
    expect(out.toLowerCase()).toContain('<br');
  });

  it('strips anchors but keeps their text (phishing-link defense)', () => {
    const out = sanitizeEmailHtml('Click <a href="https://evil.example">here</a>');
    expect(out.toLowerCase()).not.toContain('<a');
    expect(out.toLowerCase()).not.toContain('href');
    expect(out).toContain('here');
  });

  it('strips images (tracking-pixel defense)', () => {
    const out = sanitizeEmailHtml('<img src="https://evil.example/track.gif"><p>ok</p>');
    expect(out.toLowerCase()).not.toContain('<img');
    expect(out).toContain('<p>ok</p>');
  });

  it('strips <script> tags', () => {
    const out = sanitizeEmailHtml('<p>ok</p><script>alert(1)</script>');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out).toContain('<p>ok</p>');
  });

  it('strips style attributes and <style> blocks', () => {
    const out = sanitizeEmailHtml('<p style="position:fixed">x</p><style>body{}</style>');
    expect(out.toLowerCase()).not.toContain('style=');
    expect(out.toLowerCase()).not.toContain('<style');
    expect(out).toContain('x');
  });

  it('strips event-handler attributes', () => {
    const out = sanitizeEmailHtml('<p onclick="alert(1)">x</p>');
    expect(out.toLowerCase()).not.toContain('onclick');
    expect(out).toContain('x');
  });
});
