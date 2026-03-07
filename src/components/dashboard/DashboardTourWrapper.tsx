'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { TourProvider, TourAlertDialog, useTour, type TourStep } from '@/components/ui/tour';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { TourConfetti } from '@/components/dashboard/TourConfetti';

function useIsMac() {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);
  return isMac;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function KeybindKbd({ isMac }: { isMac: boolean }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] font-mono bg-muted">
      {isMac ? '⌘K' : 'Ctrl+K'}
    </kbd>
  );
}

const SIDEBAR_STEPS: TourStep[] = [
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
        <strong>Team</strong> — See who's in your workspace and how to get in touch.
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
];

interface DashboardTourWrapperProps {
  children: React.ReactNode;
  showTour: boolean;
  userId: string;
}

export function DashboardTourWrapper({ children, showTour, userId }: DashboardTourWrapperProps) {
  const [tourOpen, setTourOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const isMac = useIsMac();
  const isMobile = useIsMobile();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const tourSteps = useMemo<TourStep[]>(() => {
    if (isMobile) return SIDEBAR_STEPS;
    return [
      ...SIDEBAR_STEPS,
      {
        selectorId: TOUR_STEP_IDS.CMD_K,
        content: (
          <p>
            <strong>Quick Navigation</strong> — Press <KeybindKbd isMac={isMac} /> anytime to search pages, team members, docs, and actions instantly.
          </p>
        ),
        position: 'bottom' as const,
      },
    ];
  }, [isMac, isMobile]);

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
        steps={tourSteps}
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

  const cmdKStepIndex = useMemo(
    () => steps.findIndex((s) => s.selectorId === TOUR_STEP_IDS.CMD_K),
    [steps]
  );

  useEffect(() => {
    setSteps(steps);
  }, [steps, setSteps]);

  useEffect(() => {
    if (showTour && steps.length > 0) {
      setTourOpen(true);
    }
  }, [showTour, steps.length, setTourOpen]);

  // Auto-open the command palette when the tour reaches the Cmd+K step,
  // then force the tour to re-query element position after it renders.
  // Close the palette when leaving that step.
  useEffect(() => {
    if (cmdKStepIndex === -1) return;

    if (currentStep === cmdKStepIndex) {
      const openTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-command-palette'));
      }, 300);
      // Force tour overlay to re-find the element after palette has rendered
      const reQueryTimer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 500);
      return () => {
        clearTimeout(openTimer);
        clearTimeout(reQueryTimer);
        // Close the palette when leaving this step
        window.dispatchEvent(new CustomEvent('close-command-palette'));
      };
    }
  }, [currentStep, cmdKStepIndex]);

  return null;
}
