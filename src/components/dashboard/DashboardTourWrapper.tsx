'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { TourProvider, TourAlertDialog, useTour, type TourStep } from '@/components/ui/tour';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { TourConfetti } from '@/components/dashboard/TourConfetti';

const TOUR_STEPS: TourStep[] = [
  {
    selectorId: TOUR_STEP_IDS.OVERVIEW,
    content: (
      <p>
        <strong>Overview</strong> — Your home screen. See open tasks, completed count, team size, and game areas at a glance.
      </p>
    ),
    position: 'right',
  },
  {
    selectorId: TOUR_STEP_IDS.TASKS,
    content: (
      <p>
        <strong>Tasks</strong> — View and manage your assigned tasks. Search, filter by status, and open task details from here.
      </p>
    ),
    position: 'right',
  },
  {
    selectorId: TOUR_STEP_IDS.TEAM,
    content: (
      <p>
        <strong>Team</strong> — See who’s in your workspace and how to get in touch.
      </p>
    ),
    position: 'right',
  },
  {
    selectorId: TOUR_STEP_IDS.DOCS,
    content: (
      <p>
        <strong>Docs</strong> — Shared documents and resources for the team.
      </p>
    ),
    position: 'right',
  },
  {
    selectorId: TOUR_STEP_IDS.ACTIVITY,
    content: (
      <p>
        <strong>Activity</strong> — Recent actions and updates from your team.
      </p>
    ),
    position: 'right',
  },
  {
    selectorId: TOUR_STEP_IDS.CMD_K,
    content: (
      <p>
        <strong>Quick Navigation</strong> — Press <kbd className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] font-mono bg-muted">⌘K</kbd> anytime to search pages, team members, docs, and actions instantly.
      </p>
    ),
    position: 'bottom',
  },
];

interface DashboardTourWrapperProps {
  children: React.ReactNode;
  showTour: boolean;
  userId: string;
}

export function DashboardTourWrapper({ children, showTour, userId }: DashboardTourWrapperProps) {
  const [tourOpen, setTourOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const markTourComplete = async () => {
    await supabase.from('profiles').update({ tour_completed: 1 }).eq('id', userId);
  };

  return (
    <TourProvider
      isTourCompleted={!showTour}
      onComplete={async () => {
        await markTourComplete();
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }}
    >
      <TourContent
        showTour={showTour}
        tourOpen={tourOpen}
        setTourOpen={setTourOpen}
        steps={TOUR_STEPS}
      />
      {children}
      <TourAlertDialog
        isOpen={tourOpen}
        setIsOpen={setTourOpen}
        onSkip={markTourComplete}
      />
      <TourConfetti active={showConfetti} />
    </TourProvider>
  );
}

const CMD_K_STEP_INDEX = TOUR_STEPS.findIndex((s) => s.selectorId === TOUR_STEP_IDS.CMD_K);

function TourContent({
  showTour,
  tourOpen,
  setTourOpen,
  steps,
}: {
  showTour: boolean;
  tourOpen: boolean;
  setTourOpen: (v: boolean) => void;
  steps: TourStep[];
}) {
  const { setSteps, currentStep } = useTour();

  useEffect(() => {
    setSteps(steps);
  }, [steps, setSteps]);

  useEffect(() => {
    if (showTour && steps.length > 0) {
      setTourOpen(true);
    }
  }, [showTour, steps.length, setTourOpen]);

  // Auto-open the command palette when the tour reaches the Cmd+K step
  useEffect(() => {
    if (currentStep === CMD_K_STEP_INDEX) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-command-palette'));
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  return null;
}
