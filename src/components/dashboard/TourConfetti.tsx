'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

const CONFETTI_COLORS = [
  '#6ee7b7', // seeko-accent
  '#93c5fd',
  '#c4b5fd',
  '#fbbf24',
  '#f9a8d4',
  '#22c55e',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#ec4899',
];

export function TourConfetti({ active }: { active: boolean }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current) return;
    firedRef.current = true;

    const end = Date.now() + 2200;

    function burst() {
      confetti({
        particleCount: 70,
        startVelocity: 25,
        spread: 100,
        decay: 0.93,
        gravity: 1.0,
        origin: { x: 0.5, y: 0.5 },
        colors: CONFETTI_COLORS,
        ticks: 200,
        scalar: 1.1,
      });
    }

    // Fire two quick bursts for a fuller effect
    burst();
    setTimeout(burst, 120);

    // Keep firing smaller bursts until duration ends
    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval);
        return;
      }
      confetti({
        particleCount: 20,
        startVelocity: 15,
        spread: 120,
        decay: 0.93,
        gravity: 1.0,
        origin: { x: 0.3 + Math.random() * 0.4, y: 0.4 + Math.random() * 0.2 },
        colors: CONFETTI_COLORS,
        ticks: 180,
        scalar: 1.0,
      });
    }, 250);

    return () => clearInterval(interval);
  }, [active]);

  // Reset when deactivated so it can fire again next time
  useEffect(() => {
    if (!active) {
      firedRef.current = false;
    }
  }, [active]);

  return null;
}
