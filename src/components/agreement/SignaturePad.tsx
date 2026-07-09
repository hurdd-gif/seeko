'use client';

import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Pen, Type as TypeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIGHT_RECIPIENT_MUTED, LIGHT_FOCUS_RING, LIGHT_FOCUS_RING_WITHIN } from '@/components/dashboard/lightKit';

// useLayoutEffect runs pre-paint (so the typed signature is sized BEFORE it shows,
// never a flash of clipped text) but warns under SSR — fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * The single signature value the pad produces. Exactly one mode is ever live:
 * switching modes clears the other, so the parent never has to disambiguate a
 * drawn-vs-typed signature in the payload.
 *  - `drawn`: a PNG dataURL of the canvas strokes (transparent background, so it
 *     drops cleanly into the Phase-4 certificate PDF with no white box).
 *  - `typed`: the name string, rendered in the handwriting face.
 */
export type SignatureValue =
  | { kind: 'drawn'; dataUrl: string }
  | { kind: 'typed'; text: string };

interface SignaturePadProps {
  /** Called with the live value, or `null` when the pad is empty / cleared. */
  onChange: (value: SignatureValue | null) => void;
  /** Opt into the light signer-ceremony theme. Default false → dark (safe to reuse). */
  light?: boolean;
}

type Mode = 'draw' | 'type';

const PAD_HEIGHT = 140;
// Typed signature scales between these so a long legal name never clips at the
// pad edges (worst-case legal names run ~30+ chars). Max = the design size; min
// is deliberately low (a clipped signature is far worse than a small one on a
// legal surface — the fit must win over the floor). A margin keeps the tail from
// kissing the inset edge so sub-pixel overflow can't reintroduce the clip.
const TYPED_MAX_PX = 34;
const TYPED_MIN_PX = 12;
const TYPED_FIT_MARGIN = 10;

export function SignaturePad({ onChange, light = false }: SignaturePadProps) {
  const [mode, setMode] = useState<Mode>('draw');
  const [hasInk, setHasInk] = useState(false);
  const [typed, setTyped] = useState('');
  // Live font size for the typed signature, shrunk to fit the pad width.
  const [typedFontPx, setTypedFontPx] = useState(TYPED_MAX_PX);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const typedInputRef = useRef<HTMLInputElement>(null);
  const typedMeasureRef = useRef<HTMLSpanElement>(null);

  // Size the backing store to the device pixel ratio so strokes stay crisp, and
  // prime the stroke style. Re-runs whenever we (re)enter draw mode, since the
  // canvas unmounts in type mode.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = light ? '#111111' : '#fafafa';
    ctxRef.current = ctx;
  }, [light]);

  useEffect(() => {
    if (mode === 'draw') setupCanvas();
  }, [mode, setupCanvas]);

  // Shrink the typed signature to fit the pad. Measured against a hidden span in
  // the same Inter face at TYPED_MAX_PX, then scaled down by the overflow
  // ratio so the name stays centered and whole instead of scroll-clipping at the
  // input's left edge. Empty → back to full size.
  //
  // Runs in useLayoutEffect (pre-paint, so a long name is never shown clipped for
  // a frame) AND re-fits once `document.fonts.ready` resolves: measuring before
  // the Inter web font settles reads the fallback face's metrics and under-shoots
  // the ratio, which is exactly how the clip slipped through the old post-paint
  // useEffect. A ResizeObserver re-fits on width changes (mobile sheet ⇄ desktop
  // dialog, orientation). The TYPED_FIT_MARGIN guards sub-pixel overflow.
  useIsomorphicLayoutEffect(() => {
    if (mode !== 'type') return;
    let cancelled = false;

    const fit = () => {
      if (cancelled) return;
      const input = typedInputRef.current;
      const measure = typedMeasureRef.current;
      if (!input || !measure) return;
      if (!typed.trim()) {
        setTypedFontPx(TYPED_MAX_PX);
        return;
      }
      const available = input.clientWidth - TYPED_FIT_MARGIN;
      const textWidth = measure.offsetWidth; // rendered at TYPED_MAX_PX
      if (available <= 0 || !textWidth || textWidth <= available) {
        setTypedFontPx(TYPED_MAX_PX);
        return;
      }
      const fitted = Math.floor(TYPED_MAX_PX * (available / textWidth));
      setTypedFontPx(Math.max(TYPED_MIN_PX, fitted));
    };

    fit();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(fit).catch(() => {});
    }
    let ro: ResizeObserver | undefined;
    const input = typedInputRef.current;
    if (input && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(fit);
      ro.observe(input);
    }
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [typed, mode]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    if (typeof canvas.setPointerCapture === 'function') {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    }
    const { x, y } = pointerPos(e);
    lastRef.current = { x, y };
    // A lone tap should leave a dot, not nothing.
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
    const last = lastRef.current;
    if (!ctx || !last) return;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastRef.current = { x, y };
  }

  function commitDrawn() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange({ kind: 'drawn', dataUrl: canvas.toDataURL('image/png') });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && typeof canvas.releasePointerCapture === 'function') {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* not supported */ }
    }
    commitDrawn();
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    lastRef.current = null;
    setHasInk(false);
    onChange(null);
  }

  function handleTyped(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setTyped(text);
    onChange(text.trim() ? { kind: 'typed', text } : null);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    // Only one mode's value is ever live — entering a mode resets both sources so
    // the payload can't carry a stale drawn signature behind a typed one.
    setMode(next);
    setHasInk(false);
    setTyped('');
    lastRef.current = null;
    onChange(null);
  }

  // ── Theme tokens ──
  const trackCls = light ? 'bg-[#f4f4f4]' : 'bg-muted/50';
  const segActiveCls = light
    ? 'bg-white text-[#111] shadow-seeko'
    : 'bg-card text-foreground shadow';
  const segIdleCls = light
    ? 'text-[#6e6e6e] hover:text-[#111]'
    : 'text-muted-foreground hover:text-foreground';
  // In type mode the real control is the transparent inset <input>; ring the frame
  // (not the input) when it takes keyboard focus, so the pad shows focus like any
  // bordered field. The canvas (draw mode) isn't focusable, so this never fires there.
  const padFrameCls = light
    ? `border-black/[0.10] bg-white ${LIGHT_FOCUS_RING_WITHIN}`
    : 'border-border bg-muted/20';
  const baselineCls = light ? 'bg-black/[0.10]' : 'bg-foreground/15';
  // Instructional copy is active guidance on a legal step — it must clear AA, so it
  // uses the #6e6e6e muted tier (4.74:1), not the #9a9a9a fine-print tier (~2.8:1).
  const helperCls = light ? LIGHT_RECIPIENT_MUTED : 'text-muted-foreground';
  const clearCls = light
    ? 'text-[#6e6e6e] hover:text-[#111]'
    : 'text-muted-foreground hover:text-foreground';

  return (
    <div className="space-y-2.5">
      {/* Draw / Type segmented control */}
      <div className={cn('inline-flex w-full gap-1 rounded-full p-1', trackCls)}>
        {([
          { id: 'draw' as const, label: 'Draw', Icon: Pen },
          { id: 'type' as const, label: 'Type', Icon: TypeIcon },
        ]).map(({ id, label, Icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => switchMode(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium',
                'transition-[color,background-color,box-shadow] duration-150 ease-out active:scale-[0.98] motion-reduce:active:scale-100',
                active ? segActiveCls : segIdleCls,
                light && LIGHT_FOCUS_RING,
              )}
            >
              <Icon aria-hidden className="size-3.5" strokeWidth={2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Pad frame — concentric rounded-xl inside the card's rounded-2xl */}
      <div
        className={cn('relative overflow-hidden rounded-xl border', padFrameCls)}
        style={{ height: PAD_HEIGHT }}
      >
        {/* Baseline guide — sits behind the ink, never part of the exported PNG */}
        <div
          aria-hidden
          className={cn('pointer-events-none absolute inset-x-5 bottom-9 h-px', baselineCls)}
        />

        {mode === 'draw' ? (
          <canvas
            ref={canvasRef}
            data-testid="signature-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          />
        ) : (
          <>
            <input
              ref={typedInputRef}
              value={typed}
              onChange={handleTyped}
              placeholder="Type your full name"
              aria-label="Type your signature"
              autoComplete="off"
              spellCheck={false}
              style={{ fontFamily: 'var(--font-inter), sans-serif', fontSize: typedFontPx }}
              className={cn(
                'absolute inset-x-5 bottom-[2.75rem] overflow-hidden bg-transparent text-center leading-none outline-none',
                'transition-[font-size] duration-100 ease-out motion-reduce:transition-none',
                light ? 'text-[#111] placeholder:text-[#c8c8c8]' : 'text-foreground placeholder:text-muted-foreground/50',
              )}
            />
            {/* Off-screen measurer: the typed name at full size, used to derive the
                shrink ratio above. Mirrors the input's font face so the width
                measurement matches what the user actually sees. */}
            <span
              ref={typedMeasureRef}
              aria-hidden
              style={{
                fontFamily: 'var(--font-inter), sans-serif',
                fontSize: TYPED_MAX_PX,
                position: 'absolute',
                left: -9999,
                top: 0,
                whiteSpace: 'pre',
                visibility: 'hidden',
                pointerEvents: 'none',
              }}
            >
              {typed || ' '}
            </span>
          </>
        )}
      </div>

      {/* Helper + Clear */}
      <div className="flex min-h-5 items-center justify-between">
        <p className={cn('text-[11px]', helperCls)}>
          {mode === 'draw'
            ? 'Draw your signature with your finger or mouse.'
            : 'Your typed name will be used as your signature.'}
        </p>
        {mode === 'draw' && (
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasInk}
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-[color,opacity] duration-150 ease-out',
              'active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-40',
              clearCls,
              light && LIGHT_FOCUS_RING,
            )}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
