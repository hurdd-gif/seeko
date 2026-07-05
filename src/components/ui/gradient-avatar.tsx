/* GradientAvatar — deterministic, SSR-safe gradient avatar.
 *
 * Built from hashvatar's pure helpers (`hashToColors` / `hashToSeeds` /
 * `oklchToHex`) rather than its canvas renderer, so it works in Server
 * Components, ships no per-avatar <canvas>, and produces identical markup on
 * server and client (no hydration mismatch — no Math.random / Date anywhere).
 *
 * Two soft radial blends over a base fill, all seeded from the same hash, give
 * each user a stable colour identity in place of grey initials.
 */

import { hashToColors, hashToSeeds, oklchToHex } from 'hashvatar';
import { cn } from '@/lib/utils';

/** Deterministic djb2 → base36 id so each seed gets unique, collision-free
 *  <defs> gradient ids (two avatars sharing an id would cross-paint). */
function stableId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function GradientAvatar({
  seed,
  className,
  label,
}: {
  /** Stable per-user seed — a profile id or display name. */
  seed: string;
  className?: string;
  /** Accessible name (the person). Omit → treated as decorative. */
  label?: string;
}) {
  const colors = hashToColors(seed, undefined, 3).map(oklchToHex);
  const s = hashToSeeds(seed, 4);
  const id = stableId(seed);

  const base = colors[0] ?? '#9a9a9a';
  const c1 = colors[1] ?? base;
  const c2 = colors[2] ?? c1;

  // Blob centres kept off the edges so the blend reads as a soft sweep, not a
  // corner smear. objectBoundingBox units (0–1).
  const b1 = { cx: 0.15 + s[0] * 0.7, cy: 0.1 + s[1] * 0.4 };
  const b2 = { cx: 0.15 + s[2] * 0.7, cy: 0.5 + s[3] * 0.4 };

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('h-full w-full', className)}
      preserveAspectRatio="xMidYMid slice"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <defs>
        <radialGradient id={`ga1-${id}`} cx={b1.cx} cy={b1.cy} r={0.8}>
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c1} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`ga2-${id}`} cx={b2.cx} cy={b2.cy} r={0.85}>
          <stop offset="0%" stopColor={c2} />
          <stop offset="100%" stopColor={c2} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill={base} />
      <rect width="64" height="64" fill={`url(#ga1-${id})`} />
      <rect width="64" height="64" fill={`url(#ga2-${id})`} />
    </svg>
  );
}
