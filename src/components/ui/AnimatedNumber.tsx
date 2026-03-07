'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useReducedMotion } from 'motion/react';

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const shouldReduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { stiffness: 200, damping: 25 });

  useEffect(() => {
    if (shouldReduce) {
      if (ref.current) ref.current.textContent = String(value);
      return;
    }
    motionValue.set(value);
    const unsubscribe = springValue.on('change', (v) => {
      if (ref.current) ref.current.textContent = String(Math.round(v));
    });
    return unsubscribe;
  }, [value, motionValue, springValue, shouldReduce]);

  return <span ref={ref} className={className}>{shouldReduce ? value : 0}</span>;
}
