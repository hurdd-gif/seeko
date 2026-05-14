'use client';

import { useEffect, useRef } from 'react';

export function StatPillCount({ value }: { value: number }) {
  const groupRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<number>(value);

  useEffect(() => {
    if (prevRef.current === value) return;
    prevRef.current = value;
    const group = groupRef.current;
    if (!group) return;
    group.classList.remove('is-animating');
    void group.offsetHeight;
    group.classList.add('is-animating');
  }, [value]);

  const chars = String(value).split('');
  const lastIdx = chars.length - 1;
  const secondLastIdx = chars.length - 2;

  return (
    <span ref={groupRef} className="t-digit-group is-animating" data-value={value}>
      {chars.map((ch, i) => {
        const stagger = i === secondLastIdx ? '1' : i === lastIdx ? '2' : undefined;
        return (
          <span
            key={`${i}-${ch}`}
            className="t-digit"
            {...(stagger ? { 'data-stagger': stagger } : {})}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
