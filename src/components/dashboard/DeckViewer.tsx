/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Deck Viewer
 *
 *   Horizontal (slides)
 *     Nav    instant slide swap (no transition — content first)
 *     Nav    slide counter digit slides vertically (150ms)
 *     Nav    filmstrip active ring slides via layoutId (snappy spring)
 *     Hover  inactive thumbnails scale 1.04 on hover
 *     Notes  fade+rise entrance (150ms delay after mount)
 *
 *   Vertical (scrolling document)
 *     Inline  all pages stacked, scroll container
 *     Hover   fullscreen button appears top-right
 *     Full    scrollable fullscreen with all pages
 *
 *   Fullscreen (both orientations)
 *     Enter  fullscreen fades in (200ms)
 *     Nav    (horizontal) instant slide swap, dot indicators
 *     Exit   fullscreen fades out (200ms)
 * ───────────────────────────────────────────────────────── */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Slide {
  url: string;
  sort_order: number;
}

interface DeckViewerProps {
  slides: Slide[];
  title: string;
  notes?: string | null;
  orientation?: 'horizontal' | 'vertical';
}

const SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };
const SMOOTH = { type: 'spring' as const, stiffness: 300, damping: 25 };

export function DeckViewer({ slides, title, notes, orientation = 'horizontal' }: DeckViewerProps) {
  const sorted = [...slides].sort((a, b) => a.sort_order - b.sort_order);
  const [fullscreen, setFullscreen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0); // -1 = prev, 1 = next
  const filmstripRef = useRef<HTMLDivElement>(null);

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentSlide(prev => Math.min(prev + 1, sorted.length - 1));
  }, [sorted.length]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback((index: number) => {
    setDirection(index > currentSlide ? 1 : -1);
    setCurrentSlide(index);
  }, [currentSlide]);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
  }, []);

  useEffect(() => {
    if (fullscreen) {
      document.documentElement.setAttribute('data-modal-open', '');
      // In vertical fullscreen, we need scroll — override any parent dialog's overflow lock
      if (orientation === 'vertical') {
        document.documentElement.style.overflow = 'auto';
        document.body.style.overflow = 'auto';
      }
    } else {
      document.documentElement.removeAttribute('data-modal-open');
    }
    return () => {
      document.documentElement.removeAttribute('data-modal-open');
      if (orientation === 'vertical') {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    };
  }, [fullscreen, orientation]);

  // Keyboard navigation — works in both inline and fullscreen
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (orientation === 'horizontal') {
        if (e.key === 'ArrowRight') goNext();
        else if (e.key === 'ArrowLeft') goPrev();
        else if (e.key === ' ' && fullscreen) { e.preventDefault(); goNext(); }
      }
      if (e.key === 'Escape' && fullscreen) exitFullscreen();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen, goNext, goPrev, exitFullscreen, orientation]);

  // Scroll filmstrip to keep active thumbnail visible
  useEffect(() => {
    if (orientation !== 'horizontal' || !filmstripRef.current) return;
    const active = filmstripRef.current.children[currentSlide] as HTMLElement | undefined;
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentSlide, orientation]);

  if (sorted.length === 0) return null;

  /* ── Vertical mode: scrollable stack ─────────────────── */
  if (orientation === 'vertical') {
    return (
      <>
        <div className="flex flex-col gap-0">
          {/* Scrollable page stack */}
          <div className="relative group rounded-xl overflow-hidden border border-border/50" style={{ backgroundColor: 'oklch(0.13 0 0)' }}>
            {/* Fullscreen button overlay */}
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-[11px] font-medium text-white/70 hover:text-white bg-black/50 backdrop-blur-sm rounded-md px-2 py-1.5 transition-all opacity-0 group-hover:opacity-100"
            >
              <Maximize2 className="size-3" />
              Expand
            </button>

            <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
              {sorted.map((slide, i) => (
                <img
                  key={i}
                  src={slide.url}
                  alt={`Page ${i + 1}`}
                  className="w-full"
                  draggable={false}
                />
              ))}
            </div>
          </div>

          {/* Page count */}
          {sorted.length > 1 && (
            <div className="flex items-center justify-center mt-3">
              <span className="text-xs font-medium tabular-nums text-muted-foreground/60">
                {sorted.length} {sorted.length === 1 ? 'page' : 'pages'}
              </span>
            </div>
          )}

          {/* Notes section */}
          {notes && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SMOOTH, delay: 0.15 }}
              className="mt-4 rounded-xl border border-border/50 bg-card/50 p-4"
            >
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Notes</p>
              <div className="prose-sm text-sm leading-relaxed text-foreground/70" dangerouslySetInnerHTML={{ __html: notes }} />
            </motion.div>
          )}
        </div>

        {/* Fullscreen — scrollable vertical view */}
        {createPortal(<AnimatePresence>
          {fullscreen && (
            <motion.div
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              data-fullscreen-overlay
              className="fixed inset-0 z-[70] overflow-y-auto"
              style={{ backgroundColor: '#000' }}
            >
              {/* Top bar — fixed overlay */}
              <div className="fixed top-0 inset-x-0 z-10 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)' }}>
                <div className="flex items-center justify-between px-5 py-3.5 pointer-events-auto">
                  <span className="text-xs font-medium tracking-widest uppercase text-white/50 truncate">{title}</span>
                  <button type="button" onClick={exitFullscreen} className="text-white/40 hover:text-white transition-colors">
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable pages */}
              <div className="mx-auto max-w-3xl pt-14 pb-8">
                {sorted.map((slide, i) => (
                  <img
                    key={i}
                    src={slide.url}
                    alt={`Page ${i + 1}`}
                    className="w-full select-none"
                    draggable={false}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
      </>
    );
  }

  /* ── Horizontal mode: slideshow (original behavior) ──── */
  return (
    <>
      {/* ── Inline view: main slide + filmstrip ───────────── */}
      <div className="flex flex-col gap-4">
        {/* Main slide area */}
        <div className="relative group rounded-xl overflow-hidden shadow-lg aspect-[16/9] border border-border/50" style={{ backgroundColor: 'oklch(0.13 0 0)' }}>
          <img
            src={sorted[currentSlide].url}
            alt={`Slide ${currentSlide + 1}`}
            className="w-full h-full object-contain"
            draggable={false}
          />

          {/* Overlay bar — slide counter + present button */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
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

          {/* Prev arrow — always visible when applicable */}
          {sorted.length > 1 && currentSlide > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-9 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-all shadow-lg sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}

          {/* Next arrow — always visible when applicable */}
          {sorted.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (currentSlide < sorted.length - 1) goNext();
                else setFullscreen(true);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-9 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-all shadow-lg sm:opacity-0 sm:group-hover:opacity-100"
            >
              {currentSlide < sorted.length - 1 ? <ChevronRight className="size-4" /> : <Maximize2 className="size-3.5" />}
            </button>
          )}

          {/* Center click — open fullscreen */}
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="absolute left-12 right-12 top-0 bottom-0 cursor-pointer"
          />
        </div>

        {/* Slide counter — animated number transition */}
        {sorted.length > 1 && (
          <div className="flex items-center justify-center">
            <span className="text-xs font-medium tabular-nums text-muted-foreground/60 flex items-center gap-0">
              <span className="relative inline-flex overflow-hidden h-[1.2em] w-[1.5ch] justify-center">
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                  <motion.span
                    key={currentSlide}
                    initial={{ y: direction >= 0 ? '100%' : '-100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: direction >= 0 ? '-100%' : '100%', opacity: 0 }}
                    transition={{ type: 'spring', visualDuration: 0.15, bounce: 0 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    {currentSlide + 1}
                  </motion.span>
                </AnimatePresence>
              </span>
              {' / '}{sorted.length}
            </span>
          </div>
        )}

        {/* Filmstrip thumbnails — layoutId active ring + hover scale */}
        {sorted.length > 1 && (
          <div
            ref={filmstripRef}
            className="flex gap-2 overflow-x-auto py-1 px-0.5 scrollbar-thin"
          >
            {sorted.map((slide, i) => (
              <motion.button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                whileHover={i !== currentSlide ? { scale: 1.04, opacity: 0.85 } : {}}
                transition={SNAPPY}
                className="relative shrink-0 rounded-lg overflow-hidden border border-border/40"
                style={{ width: sorted.length <= 6 ? '7rem' : '5.5rem', aspectRatio: '16/9' }}
              >
                {i === currentSlide && (
                  <motion.div
                    layoutId="filmstrip-ring"
                    className="absolute inset-0 rounded-lg border border-seeko-accent/60 ring-1 ring-seeko-accent/30 shadow-md z-10 pointer-events-none"
                    transition={SNAPPY}
                  />
                )}
                <motion.div
                  animate={{ opacity: i === currentSlide ? 1 : 0.5 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  <img src={slide.url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                </motion.div>
                <span className="absolute bottom-0.5 left-1 text-[9px] font-mono font-medium text-white/90 bg-black/60 backdrop-blur-sm px-1 rounded z-20">
                  {i + 1}
                </span>
              </motion.button>
            ))}
          </div>
        )}

        {/* Notes section — fade+rise entrance */}
        {notes && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SMOOTH, delay: 0.15 }}
            className="mt-2 rounded-xl border border-border/50 bg-card/50 p-4"
          >
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Notes</p>
            <div className="prose-sm text-sm leading-relaxed text-foreground/70" dangerouslySetInnerHTML={{ __html: notes }} />
          </motion.div>
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
            className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
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
              <img
                src={sorted[currentSlide].url}
                alt={`Slide ${currentSlide + 1}`}
                className="max-h-[85vh] max-w-[95vw] object-contain select-none"
                draggable={false}
              />
            </div>

            {/* Navigation arrows */}
            {currentSlide > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            {currentSlide < sorted.length - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight className="size-5" />
              </button>
            )}

            {/* Bottom dot indicators — active dot widens with layoutId */}
            {sorted.length <= 20 && (
              <div className="absolute bottom-4 flex items-center gap-1.5">
                {sorted.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goTo(i); }}
                    className="relative p-1"
                  >
                    <span className={`block h-2 rounded-full transition-colors ${i === currentSlide ? 'w-5 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'}`} />
                    {i === currentSlide && (
                      <motion.span
                        layoutId="fs-dot-active"
                        className="absolute inset-1 h-2 w-5 rounded-full bg-white"
                        transition={SNAPPY}
                      />
                    )}
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
