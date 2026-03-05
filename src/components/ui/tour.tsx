'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
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

function TourOverlay({
  elementPosition,
}: {
  elementPosition: { top: number; left: number; width: number; height: number };
}) {
  const pad = 4;
  const top = elementPosition.top - pad;
  const left = elementPosition.left - pad;
  const w = elementPosition.width + pad * 2;
  const h = elementPosition.height + pad * 2;
  return (
    <motion.div
      className="fixed inset-0 z-[100]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute left-0 right-0 bg-black/60" style={{ top: 0, height: Math.max(0, top) }} />
      <div className="absolute bg-black/60" style={{ top, left: 0, width: Math.max(0, left), height: h }} />
      <div className="absolute bg-black/60" style={{ top, left: left + w, right: 0, height: h }} />
      <div className="absolute left-0 right-0 bg-black/60" style={{ top: top + h, bottom: 0 }} />
      <div
        className="absolute rounded-lg border-2 border-seeko-accent pointer-events-none"
        style={{ top, left, width: w, height: h }}
      />
    </motion.div>
  );
}

const PADDING = 16;
const CONTENT_WIDTH = 300;
const CONTENT_HEIGHT = 200;

function getElementPosition(id: string) {
  const element = document.getElementById(id);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
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

  let left = elementPos.left;
  let top = elementPos.top;

  switch (position) {
    case 'top':
      top = elementPos.top - CONTENT_HEIGHT - PADDING;
      left = elementPos.left + elementPos.width / 2 - CONTENT_WIDTH / 2;
      break;
    case 'bottom':
      top = elementPos.top + elementPos.height + PADDING;
      left = elementPos.left + elementPos.width / 2 - CONTENT_WIDTH / 2;
      break;
    case 'left':
      left = elementPos.left - CONTENT_WIDTH - PADDING;
      top = elementPos.top + elementPos.height / 2 - CONTENT_HEIGHT / 2;
      break;
    case 'right':
      left = elementPos.left + elementPos.width + PADDING;
      top = elementPos.top + elementPos.height / 2 - CONTENT_HEIGHT / 2;
      break;
  }

  return {
    top: Math.max(PADDING, Math.min(top, viewportHeight - CONTENT_HEIGHT - PADDING)),
    left: Math.max(PADDING, Math.min(left, viewportWidth - CONTENT_WIDTH - PADDING)),
    width: CONTENT_WIDTH,
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

  const updateElementPosition = useCallback(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      if (!step) return;
      const pos = getElementPosition(step.selectorId);
      if (pos) {
        setElementPosition(pos);
        const contentPos = calculateContentPosition(pos, step.position ?? 'bottom');
        setContentPosition(contentPos);
      }
    } else {
      setElementPosition(null);
      setContentPosition(null);
    }
  }, [currentStep, steps]);

  useEffect(() => {
    updateElementPosition();
    window.addEventListener('resize', updateElementPosition);
    window.addEventListener('scroll', updateElementPosition, true);

    return () => {
      window.removeEventListener('resize', updateElementPosition);
      window.removeEventListener('scroll', updateElementPosition, true);
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
            {/* Tooltip content */}
            <motion.div
              className="fixed z-[101] rounded-xl border border-border bg-card p-4 shadow-xl"
              style={{
                top: contentPosition.top,
                left: contentPosition.left,
                width: contentPosition.width,
                minHeight: contentPosition.height,
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
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
                      Previous
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={nextStep}>
                    {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                  </Button>
                </div>
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
          <AlertDialogTitle>Welcome to SEEKO</AlertDialogTitle>
          <AlertDialogDescription>
            Take a quick tour to learn about the key features and how to get started.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleSkip}>
            Skip tour
          </Button>
          <Button onClick={handleStart}>
            Start tour
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
