'use client';

import { useState } from 'react';

/* ─────────────────────────────────────────────────────────
 * CONFETTI STORYBOARD (redesign)
 *
 * Trigger: tour completion (active = true).
 *
 *    0ms     particles mount at startY (35–50%), staggered by --delay (0–350ms)
 *   ~350ms   burst fully underway
 *   12%      peak: translateY(-120px), drift + rotation, scale 1.15
 *   75%      fall: translateY(100px), drift × 2, rotation × 1.5
 *  100%      fade out: translateY(180px), drift × 2.5, scale 0.85, opacity 0
 *
 * Keyframe timing and distances in globals.css @keyframes confetti-burst.
 * ───────────────────────────────────────────────────────── */

const BURST = {
  duration: 3.2, // seconds
} as const;

const CONFETTI = {
  particleCount: 96,
  delaySpread: 0.35,   // seconds; tighter so burst feels simultaneous
  originXMin: 25,      // %; centered origin for one cohesive burst
  originXMax: 75,
  sizeMin: 7,
  sizeMax: 11,         // 7–18px
  circleChance: 0.5,   // 50% circles, 50% squares
  driftMin: -80,       // px; symmetric spread
  driftMax: 80,
  rotationSpread: 720, // deg
  startYMin: 35,       // % from top
  startYMax: 15,       // 35–50%
} as const;

/** SEEKO palette for confetti (tour completion only) */
const CONFETTI_COLORS = [
  '#6ee7b7', // seeko-accent
  '#93c5fd',
  '#c4b5fd',
  '#fbbf24',
  '#f9a8d4',
  '#f0f0f0',
  '#22c55e',
  '#a855f7',
];

function ConfettiParticle({ delay, originX }: { delay: number; originX: number }) {
  const [styles] = useState(() => {
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const size = CONFETTI.sizeMin + Math.random() * CONFETTI.sizeMax;
    const isCircle = Math.random() > CONFETTI.circleChance;
    const drift = CONFETTI.driftMin + Math.random() * (CONFETTI.driftMax - CONFETTI.driftMin);
    const rotation = (Math.random() - 0.5) * CONFETTI.rotationSpread;
    const startY = CONFETTI.startYMin + Math.random() * CONFETTI.startYMax;
    return {
      '--drift': `${drift}px`,
      '--rotation': `${rotation}deg`,
      '--delay': `${delay}s`,
      '--start-y': `${startY}%`,
      left: `${originX}%`,
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: color,
      borderRadius: isCircle ? '50%' : '3px',
    } as React.CSSProperties & {
      '--drift'?: string;
      '--rotation'?: string;
      '--delay'?: string;
      '--start-y'?: string;
    };
  });

  return (
    <div
      className="absolute animate-confetti-burst"
      style={{
        left: styles.left,
        top: styles['--start-y'],
        animationDelay: styles['--delay'],
        ['--drift' as string]: styles['--drift'],
        ['--rotation' as string]: styles['--rotation'],
      }}
    >
      <div
        style={{
          width: styles.width,
          height: styles.height,
          backgroundColor: styles.backgroundColor,
          borderRadius: styles.borderRadius,
        }}
      />
    </div>
  );
}

export function TourConfetti({ active }: { active: boolean }) {
  const [particles] = useState(() =>
    Array.from({ length: CONFETTI.particleCount }, (_, i) => ({
      id: i,
      delay: Math.random() * CONFETTI.delaySpread,
      originX: CONFETTI.originXMin + Math.random() * (CONFETTI.originXMax - CONFETTI.originXMin),
    }))
  );

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[200] overflow-hidden"
      style={{ ['--confetti-duration' as string]: `${BURST.duration}s` } as React.CSSProperties}
      aria-hidden
    >
      <div className="absolute inset-0">
        {particles.map(p => (
          <ConfettiParticle key={p.id} delay={p.delay} originX={p.originX} />
        ))}
      </div>
    </div>
  );
}
