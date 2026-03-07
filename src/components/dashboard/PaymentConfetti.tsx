'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface PaymentConfettiProps {
  active: boolean;
}

export function PaymentConfetti({ active }: PaymentConfettiProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current) return;
    firedRef.current = true;

    const defaults = {
      gravity: 0.8,
      particleCount: 110,
      spread: 200,
      startVelocity: 31,
      decay: 0.9,
      scalar: 1.3,
      origin: { y: 0.6 },
      colors: ['#6ee7b7', '#34d399', '#a7f3d0', '#fbbf24', '#93c5fd', '#c4b5fd'],
    };

    // Two quick bursts
    confetti({ ...defaults });
    setTimeout(() => confetti({ ...defaults, particleCount: 60 }), 200);

    // Trailing bursts
    let t = 400;
    const interval = setInterval(() => {
      t += 300;
      if (t > 2200) { clearInterval(interval); return; }
      confetti({ ...defaults, particleCount: 30, startVelocity: 20 });
    }, 300);

    return () => clearInterval(interval);
  }, [active]);

  return null;
}
