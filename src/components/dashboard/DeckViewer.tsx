/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Deck Viewer
 *
 *    0ms   inline: main slide + filmstrip visible
 *  Enter   fullscreen fades in (200ms)
 *   Nav    slides shift left/right (directional, 200ms spring)
 *  Last    end card staggered entrance:
 *            0ms  checkmark icon scales up + fades in
 *          150ms  "All done" heading fades up
 *          250ms  subtitle (title + slide count) fades up
 *          400ms  action buttons fade up
 *  Exit    fullscreen fades out (200ms)
 * ───────────────────────────────────────────────────────── */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, ChevronLeft, ChevronRight, X, RotateCcw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Slide {
  url: string;
  sort_order: number;
}

interface DeckViewerProps {
  slides: Slide[];
  title: string;
}

const SLIDE_SHIFT = 60; // px offset for directional transitions

export function DeckViewer({ slides, title }: DeckViewerProps) {
  const sorted = [...slides].sort((a, b) => a.sort_order - b.sort_order);
  const [fullscreen, setFullscreen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0); // -1 = prev, 1 = next
  const [showEndCard, setShowEndCard] = useState(false);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const isLast = currentSlide >= sorted.length - 1;

  const goNext = useCallback(() => {
    if (isLast) {
      setShowEndCard(true);
      return;
    }
    setDirection(1);
    setShowEndCard(false);
    setCurrentSlide(prev => Math.min(prev + 1, sorted.length - 1));
  }, [sorted.length, isLast]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setShowEndCard(false);
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback((index: number) => {
    setDirection(index > currentSlide ? 1 : -1);
    setShowEndCard(false);
    setCurrentSlide(index);
  }, [currentSlide]);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    setShowEndCard(false);
  }, []);

  // Keyboard navigation in fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') exitFullscreen();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen, goNext, goPrev, exitFullscreen]);

  // Scroll filmstrip to keep active thumbnail visible
  useEffect(() => {
    if (!filmstripRef.current) return;
    const active = filmstripRef.current.children[currentSlide] as HTMLElement | undefined;
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentSlide]);

  if (sorted.length === 0) return null;

  // Directional slide animation variants
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir * SLIDE_SHIFT,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir * -SLIDE_SHIFT,
      opacity: 0,
    }),
  };

  return (
    <>
      {/* ── Inline view: main slide + filmstrip ───────────── */}
      <div className="flex flex-col gap-4">
        {/* Main slide area */}
        <div className="relative group rounded-xl overflow-hidden shadow-lg aspect-[16/9] border border-border/50" style={{ backgroundColor: '#111' }}>
          <img src={sorted[currentSlide].url} alt={`Slide ${currentSlide + 1}`} className="w-full h-full object-contain" />

          {/* Overlay bar — slide counter + present button */}
          <div className="absolute top-0 inset-x-0 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[11px] font-medium text-white/70 tabular-nums">
              {currentSlide + 1} / {sorted.length}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setCurrentSlide(0); setDirection(0); setFullscreen(true); }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-white/70 hover:text-white transition-colors"
            >
              <Maximize2 className="size-3" />
              Present
            </button>
          </div>

          {/* Left click zone — go prev */}
          {sorted.length > 1 && currentSlide > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-0 top-0 bottom-0 w-1/3 cursor-pointer flex items-center justify-start pl-3 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <span className="flex items-center justify-center size-8 rounded-full bg-black/50 backdrop-blur-sm text-white/90 shadow-lg">
                <ChevronLeft className="size-4" />
              </span>
            </button>
          )}

          {/* Right click zone — go next or open fullscreen on last */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (currentSlide < sorted.length - 1) goNext();
              else { setFullscreen(true); }
            }}
            className="absolute right-0 top-0 bottom-0 w-1/3 cursor-pointer flex items-center justify-end pr-3 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <span className="flex items-center justify-center size-8 rounded-full bg-black/50 backdrop-blur-sm text-white/90 shadow-lg">
              {currentSlide < sorted.length - 1 ? <ChevronRight className="size-4" /> : <Maximize2 className="size-3.5" />}
            </span>
          </button>

          {/* Center click — open fullscreen */}
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="absolute left-1/3 right-1/3 top-0 bottom-0 cursor-pointer"
          />
        </div>

        {/* Filmstrip thumbnails */}
        {sorted.length > 1 && (
          <div
            ref={filmstripRef}
            className="flex gap-2 overflow-x-auto py-1 px-0.5 scrollbar-thin"
          >
            {sorted.map((slide, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={`relative shrink-0 rounded-lg overflow-hidden transition-all border ${
                  i === currentSlide
                    ? 'border-seeko-accent/60 ring-1 ring-seeko-accent/30 shadow-md'
                    : 'border-border/40 opacity-50 hover:opacity-80 hover:border-border'
                }`}
                style={{ width: sorted.length <= 6 ? '5.5rem' : '4.5rem', aspectRatio: '16/9' }}
              >
                <img src={slide.url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0.5 left-1 text-[9px] font-mono font-medium text-white/90 bg-black/60 backdrop-blur-sm px-1 rounded">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Fullscreen slideshow (portalled to body to escape dialog transforms) ── */}
      {createPortal(<AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            style={{ backgroundColor: '#000' }}
          >
            {/* Top bar with scrim */}
            <div className="absolute top-0 inset-x-0 z-10" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)' }}>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-xs font-medium tracking-widest uppercase text-white/50 truncate">{title}</span>
                <button type="button" onClick={exitFullscreen} className="text-white/40 hover:text-white transition-colors">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Slide area — click to advance */}
            <div
              className="flex-1 flex items-center justify-center w-full cursor-pointer"
              onClick={goNext}
            >
              <AnimatePresence mode="wait" custom={direction}>
                {showEndCard ? (
                  <motion.div
                    key="end-card"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col items-center gap-5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* #1 Visual anchor — checkmark icon with glow */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', visualDuration: 0.4, bounce: 0.3, delay: 0 }}
                    >
                      <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full blur-xl" style={{ backgroundColor: 'rgba(110, 231, 183, 0.15)' }} />
                        <CheckCircle2 className="size-12 text-[#6ee7b7] relative" strokeWidth={1.5} />
                      </div>
                    </motion.div>

                    {/* #1 + #2 Heading with completion signal */}
                    <motion.p
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', visualDuration: 0.3, bounce: 0, delay: 0.15 }}
                      className="text-xl font-semibold text-white"
                    >
                      All done
                    </motion.p>

                    {/* #5 Title + slide count for context */}
                    <motion.p
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', visualDuration: 0.3, bounce: 0, delay: 0.25 }}
                      className="text-sm text-white/40 -mt-2"
                    >
                      {title} &middot; {sorted.length} slide{sorted.length !== 1 ? 's' : ''}
                    </motion.p>

                    {/* #3 Buttons with primary/secondary distinction + #4 staggered */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', visualDuration: 0.3, bounce: 0, delay: 0.4 }}
                      className="flex items-center gap-3 mt-1"
                    >
                      <button
                        type="button"
                        onClick={() => { setDirection(-1); setShowEndCard(false); setCurrentSlide(0); }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-sm text-white/60 hover:text-white/80 transition-colors"
                      >
                        <RotateCcw className="size-3.5" />
                        Restart
                      </button>
                      <button
                        type="button"
                        onClick={exitFullscreen}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-white/90 hover:bg-white text-sm font-medium text-black transition-colors"
                      >
                        Done
                      </button>
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.img
                    key={currentSlide}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: 'spring', visualDuration: 0.2, bounce: 0 }}
                    src={sorted[currentSlide].url}
                    alt={`Slide ${currentSlide + 1}`}
                    className="max-h-[85vh] max-w-[95vw] object-contain select-none"
                    draggable={false}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Navigation arrows */}
            {!showEndCard && currentSlide > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            {!showEndCard && currentSlide < sorted.length - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight className="size-5" />
              </button>
            )}

            {/* Bottom dot indicators — larger touch targets */}
            {!showEndCard && sorted.length <= 20 && (
              <div className="absolute bottom-4 flex items-center gap-2">
                {sorted.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goTo(i); }}
                    className="p-1"
                  >
                    <span className={`block size-2 rounded-full transition-all ${i === currentSlide ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`} />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
