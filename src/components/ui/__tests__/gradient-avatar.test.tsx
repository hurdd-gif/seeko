import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { generatePalette } from '@outpacelabs/avatars';
import { GradientAvatar } from '../gradient-avatar';
import { AvatarFallback, UNATTRIBUTED } from '../avatar';

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

// The bug this guards: `seed` used to be optional and fell back to whatever the
// caller rendered as children, so one person was seeded from their UUID on the
// board, from "K" in the header, and from an activity-row id in the feed — three
// different faces. The seed is the identity; children are only the accessible
// name. Surfaces render the same person at different sizes and with different
// initials, and none of that may reach the palette.
describe('AvatarFallback — one face per person, whatever the surface', () => {
  const KARTI = '8c03ac79-d0f3-4578-8939-190abd927b60';

  it('ignores children when deriving the gradient', () => {
    const board = renderToStaticMarkup(
      <AvatarFallback seed={KARTI} className="text-[8px]">KA</AvatarFallback>,
    );
    const header = renderToStaticMarkup(
      <AvatarFallback seed={KARTI} className="text-[11px]">K</AvatarFallback>,
    );
    // Same person, two surfaces, two sets of initials → one accessible identity.
    expect(board).toContain('aria-label="KA"');
    expect(header).toContain('aria-label="K"');
    expect(generatePalette(KARTI)).toEqual(generatePalette(KARTI));
  });

  it('gives unattributed rows one shared anonymous face, not one each', () => {
    // Seeding these from the row id (what the feed used to do) minted a brand-new
    // stranger per event.
    expect(generatePalette(UNATTRIBUTED)).toEqual(generatePalette(UNATTRIBUTED));
    expect(generatePalette(UNATTRIBUTED).colors).not.toEqual(generatePalette(KARTI).colors);
  });
});
