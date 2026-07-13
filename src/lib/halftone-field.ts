/**
 * Pure math for the login halftone veil — the sunset-gradient dot bloom
 * pinned to the bottom of the page (see HalftoneVeil.tsx for the canvas
 * renderer). Two references define the recipe:
 *
 * - Delphi (build.delphi.ai, read from their shipped HalftoneBloom): the
 *   geometry — an elliptical intensity bloom centered at bottom-center
 *   (rx = 1.33·ry), driving both dot radius and dot alpha, so the field
 *   concentrates in the middle and falls off radially in every direction.
 * - The sunset mark (user reference): the palette — ultramarine at the top
 *   through cerulean and sky blue to a cream horizon, then amber into deep
 *   orange at the bottom edge, laid out as flat VERTICAL bands (color is a
 *   function of height only; the bloom shapes ink, not hue).
 */

export type VeilStop = {
  /** 0 = bottom edge of the field, 1 = its top. */
  offset: number;
  /** sRGB; the bloom's alpha ramp handles the fade, not the stops. */
  rgb: [number, number, number];
};

/** Sunset palette, bottom (deep orange) to top (ultramarine). The blue stops
 *  sit lower than an even spread because the bloom's ink thins toward the
 *  top — cerulean at 0.72 still lands on dots big enough to read as blue,
 *  and ultramarine owns the faint outermost speckle from 0.92 up. */
export const VEIL_STOPS: VeilStop[] = [
  { offset: 0, rgb: [0xe4, 0x58, 0x1d] },
  { offset: 0.16, rgb: [0xee, 0x8a, 0x2f] },
  { offset: 0.34, rgb: [0xf2, 0xe3, 0xc2] },
  { offset: 0.52, rgb: [0x82, 0xc0, 0xdc] },
  { offset: 0.72, rgb: [0x15, 0x73, 0xc6] },
  { offset: 0.92, rgb: [0x1d, 0x33, 0xb4] },
];

/**
 * The same palette as CSS gradient stops, bottom → top.
 *
 * One palette, two materials. The veil renders VEIL_STOPS as halftone dots
 * (color sampled per row); anything that wants the sunset as CONTINUOUS ink —
 * the /404 numerals, GradientVeil — renders these stops instead. Deriving both
 * from VEIL_STOPS is the point: the gradient can't drift out of sync with the
 * dots, because there is only one list of colors in the codebase.
 *
 * `scale` compresses the stops into a fraction of the gradient's box, for the
 * callers whose ink only reaches part way up their container (the veil's bloom
 * tops out at BLOOM_RY_FRAC of its canvas, so its stops land at 0.833× their
 * nominal height). Ink that fills its own box passes 1.
 *
 * Always interpolate these `in oklab`. sRGB blending between the saturated
 * bands (orange ↔ cream ↔ sky) detours through desaturated middles that read as
 * grey seams in continuous ink — the dots dodge this only because each row is a
 * flat sample, never a blend.
 */
export function veilGradientStops(scale = 1): string {
  return VEIL_STOPS.map(({ offset, rgb }) => {
    const hex = rgb.map(c => c.toString(16).padStart(2, '0')).join('');
    return `#${hex} ${+(offset * scale * 100).toFixed(1)}%`;
  }).join(', ');
}

/** Piecewise-linear sample of the sunset palette at t ∈ [0, 1] (clamped). */
export function sampleVeilGradient(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  let hi = 1;
  while (hi < VEIL_STOPS.length - 1 && VEIL_STOPS[hi].offset < clamped) hi++;
  const a = VEIL_STOPS[hi - 1];
  const b = VEIL_STOPS[hi];
  const span = b.offset - a.offset;
  // min(1, …) holds the last color past its stop (the palette ends at 0.92,
  // so 0.92–1 is all ultramarine) instead of extrapolating beyond it.
  const f = span === 0 ? 0 : Math.min(1, (clamped - a.offset) / span);
  return [
    a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f,
    a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f,
    a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f,
  ];
}

/**
 * Delphi's bloom intensity at offset (dx, dy) from the ellipse center
 * (bottom-center of the field): 1 at the center, 0 at the ellipse edge and
 * beyond. Drives both dot radius and dot alpha — this single field is what
 * gives the reference its centered mass and soft radial falloff.
 */
export function bloomIntensity(
  dx: number,
  dy: number,
  rx: number,
  ry: number,
): number {
  return Math.max(0, 1 - Math.hypot(dx / rx, dy / ry));
}

/**
 * Dot alpha from bloom intensity — Delphi's ramp: a 0.12 floor keeps the
 * bloom's outer reaches present as a faint speckle instead of a hard edge,
 * ramping to full ink at the center.
 */
export function bloomAlpha(n: number): number {
  return Math.min(1, 0.12 + 0.9 * Math.max(0, n));
}

/**
 * Cursor lens: radial displacement TARGET for a dot offset (dx, dy) from the
 * pointer — Delphi's exact profile (read from build.delphi.ai's shipped
 * HalftoneBloom): quadratic falloff (1 - d/radius)² with compact support, so
 * the push peaks at `strength` under the cursor and is exactly zero beyond
 * `radius`. This is only the *target*; the wake illusion comes from each dot
 * chasing its target independently (per-dot lerp in the renderer), not from
 * smoothing the lens itself.
 */
export function lensDisplacement(
  dx: number,
  dy: number,
  radius: number,
  strength: number,
): [number, number] {
  const d = Math.hypot(dx, dy);
  if (d < 0.001 || d >= radius) return [0, 0];
  const n = 1 - d / radius;
  const push = n * n * strength;
  return [(dx / d) * push, (dy / d) * push];
}
