'use client';

import { useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    title: 'Set up your profile',
    description: 'Add your name and profile picture.',
  },
  {
    title: 'Explore your tasks',
    description: 'View and manage your assigned tasks.',
  },
  {
    title: 'Meet the team',
    description: 'See who is in your workspace.',
  },
  {
    title: 'Browse documents',
    description: 'Check out shared docs and resources.',
  },
];

function Confetti({ active }: { active: boolean }) {
  const [particles] = useState(() => {
    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#f97316', '#ec4899'];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      scale: 0.4 + Math.random() * 1,
      delay: Math.random() * 0.4,
      drift: -40 + Math.random() * 80,
      isCircle: i % 3 === 0,
    }));
  });

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 -top-48 h-56 overflow-visible z-10">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute animate-confetti-burst"
          style={{
            left: `${p.x}%`,
            bottom: '0',
            animationDelay: `${p.delay}s`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        >
          <div
            style={{
              width: `${5 * p.scale}px`,
              height: `${8 * p.scale}px`,
              backgroundColor: p.color,
              borderRadius: p.isCircle ? '50%' : '1px',
              transform: `rotate(${p.rotation}deg)`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function GettingStarted({ userId }: { userId: string }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(STEPS.map(() => false));
  const [dismissed, setDismissed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const completedCount = completed.filter(Boolean).length;
  const progress = Math.round((completedCount / STEPS.length) * 100);
  const allDone = completedCount === STEPS.length;

  const markComplete = useCallback(async () => {
    await supabase
      .from('profiles')
      .update({ tour_completed: 1 })
      .eq('id', userId);
  }, [userId, supabase]);

  const handleNext = useCallback(() => {
    setCompleted(prev => {
      const next = [...prev];
      next[currentStep] = true;
      return next;
    });

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1);
    }
  }, [currentStep]);

  const handleDone = useCallback(async () => {
    setShowConfetti(true);
    await markComplete();
    setTimeout(() => setDismissed(true), 2200);
  }, [markComplete]);

  const handleSkip = useCallback(async () => {
    await markComplete();
    setDismissed(true);
  }, [markComplete]);

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md mx-4">
        <Confetti active={showConfetti} />

        <div className="relative rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <button
            onClick={handleSkip}
            className="absolute right-4 top-5 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>

          <div className="p-6 pb-0 pr-14">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-foreground">Getting started</h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground tabular-nums">
                {progress}%
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {allDone
                ? "All steps complete \u2014 you're ready to go!"
                : 'Set up your workspace and explore the dashboard.'}
            </p>
          </div>

          <div className="flex flex-col gap-0 px-6 py-5">
            {STEPS.map((step, i) => {
              const isActive = i === currentStep && !allDone;
              const isCompleted = completed[i];

              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200',
                    isActive && 'bg-secondary/60'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                      isCompleted
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : isActive
                          ? 'border-foreground/40'
                          : 'border-border bg-transparent'
                    )}
                  >
                    {isCompleted && <Check className="size-3" strokeWidth={3} />}
                  </div>
                  <div>
                    <p
                      className={cn(
                        'text-sm font-medium transition-colors duration-200',
                        isCompleted || isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {step.title}
                    </p>
                    <p className={cn(
                      'text-xs transition-colors duration-200',
                      isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'
                    )}>
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Skip
            </Button>
            {allDone ? (
              <Button size="sm" onClick={handleDone} disabled={showConfetti}>
                Done
              </Button>
            ) : (
              <Button size="sm" onClick={handleNext}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
