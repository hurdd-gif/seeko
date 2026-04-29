import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf-8');

describe('globals.css token contract', () => {
  it('contains zero mint hex references', () => {
    expect(css).not.toMatch(/#6ee7b7/i);
  });

  it('contains zero department color tokens', () => {
    expect(css).not.toMatch(/--color-dept-/);
  });

  it('contains zero seeko-accent token', () => {
    expect(css).not.toMatch(/--color-seeko-accent/);
  });

  it('contains zero accent-glow shadows', () => {
    expect(css).not.toMatch(/--shadow-accent-(glow|inset)/);
  });

  it('contains zero handwriting font token', () => {
    expect(css).not.toMatch(/--font-handwriting/);
  });

  it('contains zero legacy 4-color status tokens', () => {
    expect(css).not.toMatch(/--color-status-(complete|progress|review|blocked)/);
  });

  it('uses OKLCH for color tokens (no hex in token definitions)', () => {
    const colorTokenLines = css.match(/--color-[a-z-]+:\s*[^;]+;/g) ?? [];
    const hexCount = colorTokenLines.filter(line => /#[0-9a-f]{3,6}\b/i.test(line)).length;
    expect(hexCount).toBe(0);
  });

  it('declares paper + ink tokens', () => {
    expect(css).toMatch(/--color-paper:\s*oklch\(/);
    expect(css).toMatch(/--color-ink:\s*oklch\(/);
  });

  it('declares the single accent + single status hue', () => {
    expect(css).toMatch(/--color-accent:\s*oklch\(/);
    expect(css).toMatch(/--color-status-warning:\s*oklch\(/);
  });

  it('declares editorial + compressed type scales', () => {
    expect(css).toMatch(/--text-display:/);
    expect(css).toMatch(/--text-h1-compressed:/);
  });

  it('declares dark-mode mirror via [data-theme="dark"]', () => {
    expect(css).toMatch(/\[data-theme="dark"\]/);
  });
});
