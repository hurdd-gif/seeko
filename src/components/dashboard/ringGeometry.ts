// Pure geometry for the Overview progress ring. Kept framework-free so the
// percent→arc math is unit-testable without rendering SVG or motion.

// Clamp any number to a whole 0–100 percent. Non-finite input collapses to the
// nearest safe bound (NaN → 0) so a bad `progress` value can never inject NaN
// into an SVG attribute and blank the ring.
export function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n);
}

// strokeDashoffset for a progress arc drawn on a circle of the given
// circumference. 0% → full circumference (nothing shown); 100% → 0 (full ring).
// The percent is clamped first, so callers can pass raw values safely.
export function ringDashOffset(percent: number, circumference: number): number {
  const pct = clampPercent(percent);
  return circumference * (1 - pct / 100);
}
