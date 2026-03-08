'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Sparkles, ChevronLeft, Rocket } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BUTTON_SPRING, DURATION_STATE_MS } from '@/lib/motion';

export interface TourStep {
  content: ReactNode;
  selectorId: string;
  width?: number;
  height?: number;
  onClickWithinArea?: () => void;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface TourContextType {
  currentStep: number;
  totalSteps: number;
  nextStep: () => void;
  previousStep: () => void;
  endTour: () => void;
  isActive: boolean;
  startTour: () => void;
  setSteps: (steps: TourStep[]) => void;
  steps: TourStep[];
  isTourCompleted: boolean;
  setIsTourCompleted: (completed: boolean) => void;
}

interface TourProviderProps {
  children: ReactNode;
  onComplete?: () => void;
  className?: string;
  isTourCompleted?: boolean;
}

const TourContext = createContext<TourContextType | null>(null);

/* ── Spring used for cutout + tooltip glide ── */
const POSITION_SPRING = { type: 'spring' as const, stiffness: 280, damping: 30 };

function TourOverlay({
  elementPosition,
}: {
  elementPosition: { top: number; left: number; width: number; height: number };
}) {
  const pad = 4;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 9999;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
  // Clamp highlight so it doesn't extend past the viewport (fixes bottom nav clipping on mobile)
  const top = Math.max(0, elementPosition.top - pad);
  const left = Math.max(0, elementPosition.left - pad);
  const w = Math.min(elementPosition.width + pad * 2, vw - left);
  const h = Math.min(elementPosition.height + pad * 2, vh - top);

  return (
    <motion.div
      className="fixed inset-0 z-[100]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Top */}
      <motion.div
        className="absolute left-0 right-0 bg-black/60"
        style={{ top: 0 }}
        animate={{ height: Math.max(0, top) }}
        transition={POSITION_SPRING}
      />
      {/* Left */}
      <motion.div
        className="absolute bg-black/60"
        style={{ left: 0 }}
        animate={{ top, width: Math.max(0, left), height: h }}
        transition={POSITION_SPRING}
      />
      {/* Right */}
      <motion.div
        className="absolute right-0 bg-black/60"
        animate={{ top, left: left + w, height: h }}
        transition={POSITION_SPRING}
      />
      {/* Bottom */}
      <motion.div
        className="absolute left-0 right-0 bottom-0 bg-black/60"
        animate={{ top: top + h }}
        transition={POSITION_SPRING}
      />
      {/* Highlight border */}
      <motion.div
        className="absolute rounded-lg border-2 border-seeko-accent pointer-events-none"
        animate={{ top, left, width: w, height: h }}
        transition={POSITION_SPRING}
      />
    </motion.div>
  );
}

const PADDING = 16;
const CONTENT_MAX_WIDTH = 300;
const CONTENT_HEIGHT = 200;

function getContentWidth() {
  return Math.min(CONTENT_MAX_WIDTH, window.innerWidth - PADDING * 2);
}

function getElementPosition(id: string) {
  const element = document.getElementById(id);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  // Skip elements that are hidden (zero dimensions = display:none / hidden class)
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function calculateContentPosition(
  elementPos: { top: number; left: number; width: number; height: number },
  position: 'top' | 'bottom' | 'left' | 'right' = 'bottom'
) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const contentWidth = getContentWidth();

  let left = elementPos.left;
  let top = elementPos.top;

  switch (position) {
    case 'top':
      top = elementPos.top - CONTENT_HEIGHT - PADDING;
      left = elementPos.left + elementPos.width / 2 - contentWidth / 2;
      break;
    case 'bottom':
      top = elementPos.top + elementPos.height + PADDING;
      left = elementPos.left + elementPos.width / 2 - contentWidth / 2;
      break;
    case 'left':
      left = elementPos.left - contentWidth - PADDING;
      top = elementPos.top + elementPos.height / 2 - CONTENT_HEIGHT / 2;
      break;
    case 'right':
      left = elementPos.left + elementPos.width + PADDING;
      top = elementPos.top + elementPos.height / 2 - CONTENT_HEIGHT / 2;
      break;
  }

  return {
    top: Math.max(PADDING, Math.min(top, viewportHeight - CONTENT_HEIGHT - PADDING)),
    left: Math.max(PADDING, Math.min(left, viewportWidth - contentWidth - PADDING)),
    width: contentWidth,
    height: CONTENT_HEIGHT,
  };
}

export function TourProvider({
  children,
  onComplete,
  className,
  isTourCompleted = false,
}: TourProviderProps) {
  const [steps, setStepsState] = useState<TourStep[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [elementPosition, setElementPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [contentPosition, setContentPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [isCompleted, setIsCompleted] = useState(isTourCompleted);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateElementPosition = useCallback(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      if (!step) return;
      const pos = getElementPosition(step.selectorId);
      if (pos) {
        setElementPosition(pos);
        setContentPosition(calculateContentPosition(pos, step.position ?? 'bottom'));
        // Stop polling once found
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return true;
      }
      // Element not found — keep previous position (don't null it)
      return false;
    } else {
      setElementPosition(null);
      setContentPosition(null);
      return true;
    }
  }, [currentStep, steps]);

  // On step change: try to find element, poll if not found (handles delayed renders like Cmd+K palette)
  useEffect(() => {
    const found = updateElementPosition();
    if (!found && currentStep >= 0) {
      pollRef.current = setInterval(() => {
        const ok = updateElementPosition();
        if (ok && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 80);
    }
    window.addEventListener('resize', updateElementPosition);
    window.addEventListener('scroll', updateElementPosition, true);

    return () => {
      window.removeEventListener('resize', updateElementPosition);
      window.removeEventListener('scroll', updateElementPosition, true);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [updateElementPosition]);

  const nextStep = useCallback(() => {
    setCurrentStep(prev => {
      if (prev >= steps.length - 1) {
        setIsCompleted(true);
        onComplete?.();
        return -1;
      }
      return prev + 1;
    });
  }, [steps.length, onComplete]);

  const previousStep = useCallback(() => {
    setCurrentStep(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const endTour = useCallback(() => {
    setCurrentStep(-1);
  }, []);

  const startTour = useCallback(() => {
    if (isCompleted) return;
    setCurrentStep(0);
  }, [isCompleted]);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (
        currentStep >= 0 &&
        elementPosition &&
        steps[currentStep]?.onClickWithinArea
      ) {
        const clickX = e.clientX + window.scrollX;
        const clickY = e.clientY + window.scrollY;
        const step = steps[currentStep];
        const w = step?.width ?? elementPosition.width;
        const h = step?.height ?? elementPosition.height;
        const isWithinBounds =
          clickX >= elementPosition.left &&
          clickX <= elementPosition.left + w &&
          clickY >= elementPosition.top &&
          clickY <= elementPosition.top + h;

        if (isWithinBounds) {
          steps[currentStep].onClickWithinArea?.();
        }
      }
    },
    [currentStep, elementPosition, steps]
  );

  useEffect(() => {
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [handleClick]);

  const setIsTourCompleted = useCallback((completed: boolean) => {
    setIsCompleted(completed);
  }, []);

  const setSteps = useCallback((s: TourStep[]) => {
    setStepsState(s);
  }, []);

  return (
    <TourContext.Provider
      value={{
        currentStep,
        totalSteps: steps.length,
        nextStep,
        previousStep,
        endTour,
        isActive: currentStep >= 0,
        startTour,
        setSteps,
        steps,
        isTourCompleted: isCompleted,
        setIsTourCompleted,
      }}
    >
      <div className={cn(className)}>{children}</div>

      <AnimatePresence>
        {currentStep >= 0 && elementPosition && contentPosition && (
          <>
            <TourOverlay elementPosition={elementPosition} />
            {/* Tooltip content — position animated with spring */}
            <motion.div
              className="fixed z-[101] rounded-xl border border-border bg-card p-4 shadow-xl"
              style={{ width: contentPosition.width, minHeight: contentPosition.height }}
              initial={{ opacity: 0, y: 8, top: contentPosition.top, left: contentPosition.left }}
              animate={{ opacity: 1, y: 0, top: contentPosition.top, left: contentPosition.left }}
              exit={{ opacity: 0, y: 8 }}
              transition={POSITION_SPRING}
            >
              <div className="mb-3 text-xs font-medium text-muted-foreground">
                {currentStep + 1} / {steps.length}
              </div>
              <div className="text-sm text-foreground mb-4">
                {steps[currentStep]?.content}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  {currentStep > 0 && (
                    <Button variant="ghost" size="sm" onClick={previousStep}>
                      <ChevronLeft className="size-3.5" />
                      Previous
                    </Button>
                  )}
                </div>
                <motion.div
                  animate={{
                    scale: currentStep === steps.length - 1 ? 1.02 : 1,
                    backgroundColor:
                      currentStep === steps.length - 1
                        ? 'var(--color-seeko-accent)'
                        : 'transparent',
                  }}
                  transition={BUTTON_SPRING}
                  className="inline-block rounded-md"
                >
                  <Button
                    size="sm"
                    onClick={nextStep}
                    className={`min-w-[90px] gap-1.5 ${
                      currentStep === steps.length - 1
                        ? 'bg-seeko-accent text-background hover:bg-seeko-accent/90'
                        : ''
                    }`}
                  >
                    <AnimatePresence mode="wait">
                      {(() => {
                        const isLast = currentStep === steps.length - 1;
                        const Icon = isLast ? Sparkles : ArrowRight;
                        const label = isLast ? 'Finish' : 'Next';
                        return (
                          <motion.span
                            key={isLast ? 'finish' : 'next'}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: DURATION_STATE_MS / 1000 }}
                            className="inline-flex items-center gap-1.5"
                          >
                            {label}
                            <Icon className="size-3.5 shrink-0" />
                          </motion.span>
                        );
                      })()}
                    </AnimatePresence>
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}

export function TourAlertDialog({
  isOpen,
  setIsOpen,
  onStart,
  onSkip,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onStart?: () => void;
  onSkip?: () => void;
}) {
  const { startTour, steps, isTourCompleted, currentStep } = useTour();

  if (isTourCompleted || steps.length === 0 || currentStep > -1) {
    return null;
  }

  const handleStart = () => {
    setIsOpen(false);
    startTour();
    onStart?.();
  };

  const handleSkip = () => {
    setIsOpen(false);
    onSkip?.();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Welcome to the team!</AlertDialogTitle>
          <AlertDialogDescription>
            Take a quick tour to learn about the key features and how to get started.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleSkip}>
            Skip tour
          </Button>
          <Button
            onClick={handleStart}
            className="bg-seeko-accent text-background hover:bg-seeko-accent/90 gap-1.5"
          >
            <Rocket className="size-4 shrink-0" />
            Start tour
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
