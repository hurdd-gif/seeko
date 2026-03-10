'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Segmented Code Input
 *
 *    0ms   8 cells render with stagger (40ms each)
 *   user types → digit fills cell, scale-bounce
 *   auto-advance to next cell on entry
 *   on paste → all cells fill with stagger (40ms each)
 *   on complete → cells glow with accent ring
 * ───────────────────────────────────────────────────────── */

import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

const CELL_COUNT = 8;
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };

interface SegmentedCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SegmentedCodeInput({ value, onChange, disabled }: SegmentedCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const digits = Array.from({ length: CELL_COUNT }, (_, i) => value[i] ?? '');

  const focusCell = useCallback((index: number) => {
    if (index >= 0 && index < CELL_COUNT) {
      inputRefs.current[index]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = [...digits];
      if (digits[index]) {
        newDigits[index] = '';
        onChange(newDigits.join(''));
      } else if (index > 0) {
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
        focusCell(index - 1);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusCell(index - 1);
    } else if (e.key === 'ArrowRight' && index < CELL_COUNT - 1) {
      e.preventDefault();
      focusCell(index + 1);
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const newDigits = [...digits];
      newDigits[index] = e.key;
      onChange(newDigits.join('').replace(/\D/g, '').slice(0, CELL_COUNT));
      if (index < CELL_COUNT - 1) {
        focusCell(index + 1);
      }
    }
  }, [digits, onChange, focusCell]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CELL_COUNT);
    if (!pasted) return;
    onChange(pasted);
    const nextIndex = Math.min(pasted.length, CELL_COUNT - 1);
    setTimeout(() => focusCell(nextIndex), 50);
  }, [onChange, focusCell]);

  // Auto-focus first cell on mount
  useEffect(() => {
    const timer = setTimeout(() => focusCell(0), 100);
    return () => clearTimeout(timer);
  }, [focusCell]);

  const isComplete = value.replace(/\D/g, '').length === CELL_COUNT;

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-1.5 w-full max-w-sm mx-auto">
      {digits.map((digit, i) => (
        <div key={i} className="flex items-center">
          {i === 4 && (
            <div className="w-2 sm:w-3 flex items-center justify-center text-muted-foreground/30 text-base sm:text-lg font-light select-none">
              &ndash;
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: i * 0.04 }}
            className="relative"
          >
            <input
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={disabled}
              onChange={() => {}}
              onKeyDown={e => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex(-1)}
              className={cn(
                'size-9 sm:size-11 md:size-12 rounded-lg sm:rounded-xl border text-center text-base sm:text-lg font-semibold font-mono transition-all duration-150',
                'bg-muted text-foreground focus:outline-none caret-transparent',
                'disabled:opacity-50',
                isComplete
                  ? 'border-seeko-accent/50 ring-1 ring-seeko-accent/20'
                  : focusedIndex === i
                    ? 'border-foreground/40 ring-2 ring-foreground/10'
                    : digit
                      ? 'border-border/80'
                      : 'border-border',
              )}
              aria-label={`Digit ${i + 1}`}
            />
          </motion.div>
        </div>
      ))}
    </div>
  );
}
