'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Signature Drawing
 *
 * Handwriting reveal: each character fades in with a slight
 * leftward slide, staggered so text appears to be written.
 *
 *  type char   opacity 0→1, x -6→0 over 0.3s
 *  signed      All chars replay with staggered delays
 * ───────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const DRAW_DURATION = 0.3;
const DRAW_EASING = [0.22, 0.03, 0.26, 1] as [number, number, number, number];

interface SignatureDrawingProps {
  text: string;
  fontSize?: number;
  signed?: boolean;
  sigKey?: number;
  charDelay?: number;
  charDuration?: number;
  initialDelay?: number;
  className?: string;
}

export function SignatureDrawing({
  text,
  fontSize = 32,
  signed = false,
  sigKey = 0,
  charDelay = 0.045,
  charDuration = DRAW_DURATION,
  initialDelay = 0.2,
  className,
}: SignatureDrawingProps) {
  const prevTextRef = useRef('');
  const [charStates, setCharStates] = useState<{ char: string; isNew: boolean }[]>([]);

  useEffect(() => {
    const prev = prevTextRef.current;
    const curr = text;

    if (signed) {
      setCharStates(curr.split('').map((char) => ({ char, isNew: true })));
    } else if (curr.length > prev.length && curr.startsWith(prev)) {
      setCharStates(
        curr.split('').map((char, i) => ({ char, isNew: i >= prev.length }))
      );
    } else {
      setCharStates(curr.split('').map((char) => ({ char, isNew: true })));
    }

    prevTextRef.current = curr;
  }, [text, signed, sigKey]);

  if (!text) return null;

  return (
    <div className={className}>
      <div className="flex justify-center flex-wrap" style={{ minHeight: fontSize * 1.3 }}>
        <AnimatePresence mode="popLayout">
          {charStates.map((entry, i) => {
            const delay = signed ? initialDelay + i * charDelay : 0;
            const duration = signed ? charDuration : DRAW_DURATION;

            return (
              <motion.span
                key={signed ? `${sigKey}-s-${i}` : `t-${i}-${entry.char}`}
                initial={entry.isNew ? { opacity: 0, x: -6, y: 4 } : false}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{
                  duration,
                  delay,
                  ease: DRAW_EASING,
                }}
                className="inline-block leading-tight text-foreground"
                style={{
                  fontFamily: 'var(--font-caveat), cursive',
                  fontSize,
                  whiteSpace: 'pre',
                }}
              >
                {entry.char === ' ' ? '\u00A0' : entry.char}
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
