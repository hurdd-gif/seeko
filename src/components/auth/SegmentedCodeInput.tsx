'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Segmented Code Input
 *
 *    0ms   8 cells render with stagger (40ms each)
 *   user types → digit fills cell, scale-bounce
 *   auto-advance to next cell on entry
 *   on paste → all cells fill with stagger (40ms each)
 *   on complete → cells settle to the quiet filled state
 * ───────────────────────────────────────────────────────── */

import React, { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/motion';

const CELL_COUNT = 8;
const SPRING = springs.smooth;

interface SegmentedCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  // Opt into the light Paper theme (white cells, AA-dark digits, azure rings).
  // Default false → the original dark cells (other callers untouched).
  light?: boolean;
  // Rejected-code state: red rings replace the azure complete/focus rings
  // until the user edits the code.
  invalid?: boolean;
}

export function SegmentedCodeInput({ value, onChange, disabled, light = false, invalid = false }: SegmentedCodeInputProps) {
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

  return (
    // Static container — the group used to zoom 1.05x once anything was
    // typed, which read as the whole control lurching. State now lives in
    // the cells alone.
    <div className="flex items-center justify-center gap-1 sm:gap-1.5 w-full max-w-sm mx-auto px-1.5">
      {digits.map((digit, i) => (
        <React.Fragment key={i}>
          {i === 4 && (
            <div className={cn(
              'w-2 sm:w-3 flex items-center justify-center text-base sm:text-lg font-light select-none',
              light ? 'text-black/20 dark:text-white/20' : 'text-muted-foreground/30',
            )}>
              &ndash;
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: i * 0.04 }}
            className="relative flex-1"
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
              // One quiet state per cell, matching lightKit's input language
              // (hairline border, azure BORDER on focus — no ring glow). The
              // old "complete" state ringed all 8 cells at once, which is the
              // main thing that read as noise; a full code now just settles
              // to the filled look and lets the CTA carry the affordance.
              className={cn(
                'w-full aspect-square rounded-[10px] border text-center text-base sm:text-[17px] font-medium font-mono tabular-nums transition-[border-color,background-color] duration-150 ease-out',
                'focus:outline-none caret-transparent disabled:opacity-50',
                // `light` = the scheme-aware Paper kit (surface-1/wash tokens
                // flip under .dark); the hardcoded light-only inks get dark:
                // twins here. The non-light branch stays the legacy dark kit.
                light ? 'bg-surface-1 text-[#1c1c1c] dark:text-[#e4e4e4]' : 'bg-white/5 text-foreground',
                invalid
                  ? light
                    ? 'border-danger/70 bg-[#fff7f6] dark:bg-[#2a201f]'
                    : 'border-red-400/60'
                  : light
                    ? focusedIndex === i
                      ? 'border-seeko-accent'
                      : digit
                        ? 'border-black/[0.16] dark:border-white/[0.16]'
                        : 'border-wash-8'
                    : focusedIndex === i
                      ? 'border-foreground/40'
                      : digit
                        ? 'border-border/80'
                        : 'border-border',
              )}
              aria-invalid={invalid || undefined}
              aria-label={`Digit ${i + 1}`}
            />
          </motion.div>
        </React.Fragment>
      ))}
    </div>
  );
}
