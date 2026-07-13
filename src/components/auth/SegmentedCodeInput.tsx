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

import React, { useState, useRef, useCallback, useEffect, type ChangeEvent, type KeyboardEvent, type ClipboardEvent } from 'react';
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
  /**
   * Grab focus on mount. True is right when the code is the ONLY thing on the
   * screen. It is wrong inside a form that has a field above it — the cells
   * would silently steal the caret from whatever the user is meant to fill in
   * first, and they'd have to click their way back UP the form. Hosts with a
   * field above this one pass false and own the focus decision themselves.
   */
  autoFocus?: boolean;
}

export function SegmentedCodeInput({ value, onChange, disabled, light = false, invalid = false, autoFocus = true }: SegmentedCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const digits = Array.from({ length: CELL_COUNT }, (_, i) => value[i] ?? '');

  const focusCell = useCallback((index: number) => {
    if (index >= 0 && index < CELL_COUNT) {
      inputRefs.current[index]?.focus();
    }
  }, []);

  /**
   * The single write path. Everything that can put digits into this control —
   * a physical key, an Android soft keyboard, a paste, a one-time-code autofill,
   * a dropped selection — funnels through here, so they all behave identically.
   *
   * `at` is clamped to the code's length because the value model is a compact
   * string and a string cannot hold a gap. Without the clamp, writing into cell 5
   * of an empty code produces `['','','','','','5','','']`, whose `join('')` is
   * `'5'` — the digit silently teleports to cell 0. Clamped, it lands in the last
   * cell it can actually occupy, which is the only representable answer.
   */
  const fill = useCallback((index: number, incoming: string) => {
    const chars = incoming.replace(/\D/g, '');
    if (!chars) return;
    const at = Math.min(index, value.length);
    const next = [...digits];
    chars.slice(0, CELL_COUNT - at).split('').forEach((c, i) => { next[at + i] = c; });
    onChange(next.join('').slice(0, CELL_COUNT));
    focusCell(Math.min(at + chars.length, CELL_COUNT - 1));
  }, [digits, value.length, onChange, focusCell]);

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
      // Physical keyboards land here and never reach onChange — preventDefault
      // stops the browser writing the character itself. Soft keyboards mostly
      // DON'T: Android reports `key: 'Unidentified'` for ordinary typing, so this
      // branch misses and the input event carries the digit instead.
      e.preventDefault();
      fill(index, e.key);
    }
  }, [digits, onChange, focusCell, fill]);

  /**
   * Everything the keydown branch can't see.
   *
   * This used to be `() => {}`. With a no-op onChange and a controlled `value`,
   * any input React didn't already know about was reverted on the next render —
   * silently. That killed Android soft-keyboard typing, one-time-code autofill,
   * and drag-and-drop, and no amount of `autoComplete` would have helped: the
   * digits arrived and were thrown away.
   *
   * An empty value means a deletion the keydown branch also missed (same
   * `Unidentified` problem), so it has to be honoured here or backspace would
   * appear broken on half the phones in the world.
   */
  const handleChange = useCallback((index: number, e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      if (!digits[index]) return;
      const next = [...digits];
      next[index] = '';
      onChange(next.join('').slice(0, CELL_COUNT));
      return;
    }
    fill(index, raw);
  }, [digits, onChange, fill]);

  /**
   * Backspace on an EMPTY cell, from a soft keyboard.
   *
   * The keydown branch steps back a cell and clears it — that's how you fix a
   * typo three digits ago. But a soft keyboard's backspace arrives as
   * `Unidentified`, so keydown misses it, and deleting nothing from an already-
   * empty field fires no `change` either: the key does nothing at all, and the
   * user cannot walk back through their own code. `beforeinput` is the one event
   * that reliably names the intent (`deleteContentBackward`) on mobile.
   *
   * IT MUST BE A NATIVE LISTENER. React's `onBeforeInput` prop is NOT the native
   * `beforeinput` event — it is a legacy synthetic that React composes from
   * `keypress`/`textInput`/composition events, and it carries no `inputType` at
   * all. Wiring this through the prop type-checks, renders, and silently never
   * fires. (Verified in-browser: the handler no-op'd on every dispatch.) So the
   * listener is attached to the DOM directly, delegated from the container —
   * `beforeinput` bubbles, so one listener covers all eight cells.
   *
   * Physical keyboards never reach this: their keydown already preventDefault'd.
   */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onBeforeInput = (e: Event) => {
      const event = e as InputEvent;
      if (event.inputType !== 'deleteContentBackward') return;

      const index = inputRefs.current.indexOf(event.target as HTMLInputElement);
      if (index < 0) return;
      if (digits[index]) return; // The browser will delete it and fire `change`.

      event.preventDefault();
      if (index === 0) return;
      const next = [...digits];
      next[index - 1] = '';
      onChange(next.join('').slice(0, CELL_COUNT));
      focusCell(index - 1);
    };

    root.addEventListener('beforeinput', onBeforeInput);
    return () => root.removeEventListener('beforeinput', onBeforeInput);
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
    if (!autoFocus) return;
    const timer = setTimeout(() => focusCell(0), 100);
    return () => clearTimeout(timer);
  }, [autoFocus, focusCell]);

  return (
    // Static container — the group used to zoom 1.05x once anything was
    // typed, which read as the whole control lurching. State now lives in
    // the cells alone.
    <div ref={containerRef} className="flex items-center justify-center gap-1 sm:gap-1.5 w-full max-w-sm mx-auto px-1.5">
      {digits.map((digit, i) => (
        <React.Fragment key={i}>
          {/* The group separator. It used to carry `font-light`, which was the
              one weight utility globals.css never remapped to 500 — so it fell
              through to 300, and with only 400/500/600 loaded the browser drew
              the nearest real file, 400. This dash was the sole sub-500 glyph in
              the app, and it pulled down a whole font Inter otherwise never
              needed here. The 20% opacity was always what made it recede.
              (globals.css now covers thin/extralight/light too, so the hole is
              closed at the source — but the class stays gone: it never meant
              anything.) */}
          {i === 4 && (
            <div className={cn(
              'w-2 sm:w-3 flex items-center justify-center text-base sm:text-lg select-none',
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
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              autoCorrect="off"
              spellCheck={false}
              /* NO maxLength. It reads like the obvious guard on a one-digit cell,
                 and it is precisely what made one-time-code autofill impossible:
                 the browser hands the WHOLE code to the focused field, a
                 maxLength of 1 truncates it to a single character, and the other
                 seven digits are gone before any handler sees them. Without it the
                 full code arrives intact and `fill` spreads it across the cells —
                 which is the entire point of tagging cell 0 with `one-time-code`.
                 Nothing is lost: `value` is controlled to a single character, so a
                 cell still cannot end up holding two. */
              value={digit}
              disabled={disabled}
              onChange={e => handleChange(i, e)}
              onKeyDown={e => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex(-1)}
              // One quiet state per cell, matching lightKit's input language
              // (hairline border, azure BORDER on focus — no ring glow). The
              // old "complete" state ringed all 8 cells at once, which is the
              // main thing that read as noise; a full code now just settles
              // to the filled look and lets the CTA carry the affordance.
              // `font-mono` was a no-op: globals.css aliases --font-mono to Inter,
              // so these cells were always rendering in the body face. tabular-nums
              // is what actually does the job — it holds every digit to one advance
              // width, which is the only property a code cell needs. font-medium
              // resolved to the inherited 500; both classes are gone, the render is
              // byte-identical, and the intent no longer lies.
              className={cn(
                'w-full aspect-square rounded-[10px] border text-center text-base sm:text-[17px] tabular-nums transition-[border-color,background-color] duration-150 ease-out',
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
