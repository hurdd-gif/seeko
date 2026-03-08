'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Segmented Code Input
 *
 *    0ms   8 cells render, empty
 *   user types → digit fills cell, scale-bounce 0.95→1.05→1
 *   auto-advance to next cell on entry
 *   on paste → all cells fill with stagger (40ms each)
 *   on complete → subtle glow pulse on all cells
 * ───────────────────────────────────────────────────────── */

import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';
import { cn } from '@/lib/utils';

const CELL_COUNT = 8;

interface SegmentedCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SegmentedCodeInput({ value, onChange, disabled }: SegmentedCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const digits = Array.from({ length: CELL_COUNT }, (_, i) => value[i] ?? '');
  const [animatingCells, setAnimatingCells] = useState<Set<number>>(new Set());

  const focusCell = useCallback((index: number) => {
    if (index >= 0 && index < CELL_COUNT) {
      inputRefs.current[index]?.focus();
    }
  }, []);

  const updateDigit = useCallback((index: number, digit: string) => {
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newValue = newDigits.join('').replace(/\D/g, '').slice(0, CELL_COUNT);
    onChange(newValue);

    setAnimatingCells(prev => new Set(prev).add(index));
    setTimeout(() => {
      setAnimatingCells(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, 300);
  }, [digits, onChange]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        updateDigit(index, '');
      } else if (index > 0) {
        updateDigit(index - 1, '');
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
      updateDigit(index, e.key);
      if (index < CELL_COUNT - 1) {
        focusCell(index + 1);
      }
    }
  }, [digits, updateDigit, focusCell]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CELL_COUNT);
    if (!pasted) return;

    onChange(pasted);

    // Stagger animation for pasted cells
    pasted.split('').forEach((_, i) => {
      setTimeout(() => {
        setAnimatingCells(prev => new Set(prev).add(i));
        setTimeout(() => {
          setAnimatingCells(prev => {
            const next = new Set(prev);
            next.delete(i);
            return next;
          });
        }, 300);
      }, i * 40);
    });

    // Focus the cell after last pasted digit
    const nextIndex = Math.min(pasted.length, CELL_COUNT - 1);
    setTimeout(() => focusCell(nextIndex), pasted.length * 40);
  }, [onChange, focusCell]);

  // Auto-focus first cell on mount
  useEffect(() => {
    const timer = setTimeout(() => focusCell(0), 100);
    return () => clearTimeout(timer);
  }, [focusCell]);

  const isComplete = value.replace(/\D/g, '').length === CELL_COUNT;

  return (
    <div className="flex items-center justify-center gap-1">
      {digits.map((digit, i) => (
        <div key={i} className="flex items-center">
          {i === 4 && (
            <div className="w-2 flex items-center justify-center text-muted-foreground/30 text-sm font-light">
              -
            </div>
          )}
          <div
            className={cn(
              'relative w-8 h-10 md:w-10 md:h-12 rounded-lg border-2 transition-all duration-200',
              isComplete
                ? 'border-seeko-accent shadow-[0_0_8px_rgba(110,231,183,0.15)]'
                : focusedIndex === i
                  ? 'border-seeko-accent shadow-[0_0_0_2px_rgba(110,231,183,0.15)]'
                  : digit
                    ? 'border-[rgba(240,240,240,0.15)]'
                    : 'border-border',
              animatingCells.has(i) && 'scale-105',
            )}
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
              className="absolute inset-0 w-full h-full bg-transparent text-center text-base md:text-lg font-mono font-semibold text-foreground focus:outline-none caret-transparent"
              aria-label={`Digit ${i + 1}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
