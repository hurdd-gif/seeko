import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { generatePalette } from '@outpacelabs/avatars';
import { GradientAvatar } from '../gradient-avatar';

// Rendering is delegated to @outpacelabs/avatars, which paints a <canvas> in
// an effect — so markup no longer varies by seed. The contracts left to guard
// here are the wrapper's: the accessible-name behavior it restores, and that
// the vendor's palette engine stays deterministic per seed.
describe('GradientAvatar — vendor-rendered mesh gradient', () => {
  it('renders the vendor canvas', () => {
    const html = renderToStaticMarkup(<GradientAvatar seed="user-1" />);
    expect(html).toContain('<canvas');
  });

  it('exposes an accessible name when a label is given, else is decorative', () => {
    expect(renderToStaticMarkup(<GradientAvatar seed="x" label="Sam Rivera" />)).toContain(
      'aria-label="Sam Rivera"',
    );
    expect(renderToStaticMarkup(<GradientAvatar seed="x" />)).toContain('aria-hidden');
  });

  it('derives identical palettes across repeated calls for the same seed', () => {
    const a = generatePalette('7887ae1d-2b5a-42e8');
    const b = generatePalette('7887ae1d-2b5a-42e8');
    expect(a).toEqual(b);
  });

  it('derives different palettes for different seeds', () => {
    expect(generatePalette('alice').colors).not.toEqual(generatePalette('bob').colors);
  });
});
