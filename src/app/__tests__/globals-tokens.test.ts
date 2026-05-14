import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8');

describe('globals.css design tokens', () => {
  it('defines --radius-pill in :root', () => {
    expect(css).toMatch(/--radius-pill:\s*9999px/);
  });

  it('defines number pop-in tokens', () => {
    expect(css).toMatch(/--digit-dur:\s*500ms/);
    expect(css).toMatch(/--digit-distance:\s*8px/);
    expect(css).toMatch(/--digit-stagger:\s*70ms/);
    expect(css).toMatch(/--digit-blur:\s*2px/);
    expect(css).toMatch(/--digit-ease:\s*cubic-bezier\(0\.34,\s*1\.45,\s*0\.64,\s*1\)/);
  });

  it('exposes --radius-pill through @theme inline', () => {
    const themeBlock = css.match(/@theme inline\s*{[\s\S]*?}/)?.[0] ?? '';
    expect(themeBlock).toMatch(/--radius-pill:\s*var\(--radius-pill\)/);
  });
});
