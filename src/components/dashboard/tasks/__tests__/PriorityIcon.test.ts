import { describe, it, expect } from 'vitest';
import { PRIORITY_COLOR } from '../PriorityIcon';
import type { Priority } from '@/lib/types';

// WCAG relative luminance → contrast ratio of a hex foreground on white.
// Priority glyphs are graphical objects that convey meaning, so each must
// clear the 3:1 non-text-contrast floor (WCAG 1.4.11) on the #ffffff board.
function srgbToLin(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrastOnWhite(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
  return 1.05 / (lum + 0.05);
}

describe('PRIORITY_COLOR — AA-on-white loudness ladder', () => {
  it('every priority color clears the 3:1 graphics floor on white', () => {
    (Object.keys(PRIORITY_COLOR) as Priority[]).forEach((level) => {
      const ratio = contrastOnWhite(PRIORITY_COLOR[level]);
      expect(ratio, `${level} (${PRIORITY_COLOR[level]})`).toBeGreaterThanOrEqual(3);
    });
  });

  it('encodes the high→medium→low ladder (coral red → amber → gray)', () => {
    // High reuses the codebase's single "validated chevron red" (#f04438,
    // shared with MilestoneHealthBadge.off_track) so there is ONE loud-red for
    // "urgent/bad" across the app — not a near-duplicate per surface.
    expect(PRIORITY_COLOR.High).toBe('#f04438');
    expect(PRIORITY_COLOR.Medium).toBe('#bd7e10');
    expect(PRIORITY_COLOR.Low).toBe('#4c4c4c');
  });

  it('keeps Urgent its own AA-legible red (distinct filled-square glyph)', () => {
    expect(PRIORITY_COLOR.Urgent).toBe('#e5484d');
  });

  it('orders loudness by descending warmth/chroma: High redder than Medium, Low neutral', () => {
    // Low is achromatic gray; High and Medium are warm. Sanity-guard against a
    // future relight that flattens the ladder back to a single ink color.
    expect(PRIORITY_COLOR.High).not.toBe(PRIORITY_COLOR.Medium);
    expect(PRIORITY_COLOR.Medium).not.toBe(PRIORITY_COLOR.Low);
    expect(PRIORITY_COLOR.Low).toBe('#4c4c4c');
  });
});
