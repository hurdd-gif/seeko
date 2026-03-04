'use client';

import { useState, useEffect, useCallback } from 'react';
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
    title: 'Meet your team',
    description: 'See who is in your workspace.',
  },
  {
    title: 'Browse documents',
    description: 'Check out shared docs and resources.',
  },
];

function Confetti() {
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; color: string; rotation: number; scale: number; delay: number }[]
  >([]);

  useEffect(() => {
    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#f97316'];
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 0.8,
      delay: Math.random() * 0.5,
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 -top-32 h-40 overflow-hidden">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute animate-confetti"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.delay}s`,
          }}
        >
          <div
            style={{
              width: `${6 * p.scale}px`,
              height: `${10 * p.scale}px`,
              backgroundColor: p.color,
              borderRadius: '1px',
              transform: `rotate(${p.rotation}deg)`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function GettingStarted({ userId }: { userId: string }) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [completed, setCompleted] = useState<boolean[]>(STEPS.map(() => false));
  const [dismissed, setDismissed] = useState(false);
  const [animating, setAnimating] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const completedCount = completed.filter(Boolean).length;
  const progress = Math.round((completedCount / STEPS.length) * 100);
  const allDone = completedCount === STEPS.length;

  useEffect(() => {
    if (currentStep === -1) {
      const timer = setTimeout(() => {
        setCurrentStep(0);
        setAnimating(true);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!animating || currentStep < 0 || currentStep >= STEPS.length) return;

    const timer = setTimeout(() => {
      setCompleted(prev => {
        const next = [...prev];
        next[currentStep] = true;
        return next;
      });

      setTimeout(() => {
        if (currentStep < STEPS.length - 1) {
          setCurrentStep(s => s + 1);
        } else {
          setAnimating(false);
        }
      }, 300);
    }, 800);

    return () => clearTimeout(timer);
  }, [currentStep, animating]);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    await supabase
      .from('profiles')
      .update({ tour_completed: 1 })
      .eq('id', userId);
  }, [userId, supabase]);

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md">
        {allDone && <Confetti />}

        <div className="relative rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <button
            onClick={handleDismiss}
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>

          <div className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Getting started</h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground tabular-nums">
                {progress}%
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {allDone
                ? "All steps complete — you're ready to go"
                : 'Set up your workspace and explore the dashboard.'}
            </p>
          </div>

          <div className="flex flex-col gap-0 p-6">
            {STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-3 py-2.5">
                <div
                  className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                    completed[i]
                      ? 'border-blue-500 bg-blue-500 text-white scale-100'
                      : 'border-border bg-transparent scale-100'
                  )}
                >
                  {completed[i] && <Check className="size-3" strokeWidth={3} />}
                </div>
                <div>
                  <p
                    className={cn(
                      'text-sm font-medium transition-colors duration-300',
                      completed[i] ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              {allDone ? 'Back' : 'Skip'}
            </Button>
            <Button size="sm" onClick={handleDismiss}>
              {allDone ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
