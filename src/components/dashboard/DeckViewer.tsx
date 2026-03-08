'use client';

import { useState, useCallback, useEffect } from 'react';
import { Maximize2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Slide {
  url: string;
  sort_order: number;
}

interface DeckViewerProps {
  slides: Slide[];
  title: string;
}

export function DeckViewer({ slides, title }: DeckViewerProps) {
  const sorted = [...slides].sort((a, b) => a.sort_order - b.sort_order);
  const [fullscreen, setFullscreen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const goNext = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, sorted.length - 1));
  }, [sorted.length]);

  const goPrev = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  const exitFullscreen = useCallback(() => setFullscreen(false), []);

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

  if (sorted.length === 0) return null;

  return (
    <>
      {/* Inline scroll view */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {sorted.length} slide{sorted.length !== 1 ? 's' : ''}
          </p>
          <button
            type="button"
            onClick={() => { setCurrentSlide(0); setFullscreen(true); }}
            className="flex items-center gap-1.5 text-xs text-seeko-accent hover:text-seeko-accent/80 transition-colors"
          >
            <Maximize2 className="size-3" />
            Present
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {sorted.map((slide, i) => (
            <div
              key={i}
              className="relative rounded-lg overflow-hidden bg-secondary cursor-pointer"
              onClick={() => { setCurrentSlide(i); setFullscreen(true); }}
            >
              <img src={slide.url} alt={`Slide ${i + 1}`} className="w-full" />
              <span className="absolute bottom-2 left-2 text-xs font-mono text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen slideshow */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ backgroundColor: '#000' }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          >
            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 z-10">
              <span className="text-sm text-white/80 font-medium truncate">{title}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/60 font-mono">
                  {currentSlide + 1} / {sorted.length}
                </span>
                <button type="button" onClick={exitFullscreen} className="text-white/70 hover:text-white transition-colors">
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Slide — click to advance */}
            <div
              className="flex-1 flex items-center justify-center w-full cursor-pointer"
              onClick={goNext}
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentSlide}
                  src={sorted[currentSlide].url}
                  alt={`Slide ${currentSlide + 1}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="max-h-[85vh] max-w-[95vw] object-contain select-none"
                  draggable={false}
                />
              </AnimatePresence>
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

            {/* Bottom dot indicators */}
            {sorted.length <= 20 && (
              <div className="absolute bottom-4 flex items-center gap-1.5">
                {sorted.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentSlide(i)}
                    className={`size-1.5 rounded-full transition-all ${i === currentSlide ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
