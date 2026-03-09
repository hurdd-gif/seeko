'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { TourProvider, TourAlertDialog, useTour, type TourStep } from '@/components/ui/tour';
import { TOUR_STEP_IDS, TOUR_STEP_IDS_MOBILE } from '@/lib/tour-constants';
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

function buildNavSteps(isMobile: boolean): TourStep[] {
  const ids = isMobile ? TOUR_STEP_IDS_MOBILE : TOUR_STEP_IDS;
  const pos = isMobile ? 'top' as const : 'right' as const;
  return [
    {
      selectorId: ids.OVERVIEW,
      content: (
        <p>
          <strong>Overview</strong> — Your home screen. See open tasks, completed count, team size, and game areas at a glance.
        </p>
      ),
      position: pos,
    },
    {
      selectorId: ids.TASKS,
      content: (
        <p>
          <strong>Tasks</strong> — View and manage your assigned tasks. Search, filter by status, and open task details from here.
        </p>
      ),
      position: pos,
    },
    {
      selectorId: ids.TEAM,
      content: (
        <p>
          <strong>Team</strong> — See who's in your workspace and how to get in touch.
        </p>
      ),
      position: pos,
    },
    {
      selectorId: ids.DOCS,
      content: (
        <p>
          <strong>Docs</strong> — Shared documents and resources for the team.
        </p>
      ),
      position: pos,
    },
    {
      selectorId: ids.ACTIVITY,
      content: (
        <p>
          <strong>Activity</strong> — Recent actions and updates from your team.
        </p>
      ),
      position: pos,
    },
  ];
}

interface DashboardTourWrapperProps {
  children: React.ReactNode;
  showTour: boolean;
  userId: string;
  isContractor?: boolean;
  isAdmin?: boolean;
}

export function DashboardTourWrapper({ children, showTour, userId, isContractor = false, isAdmin = false }: DashboardTourWrapperProps) {
  const [tourOpen, setTourOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const isMac = useIsMac();
  const isMobile = useIsMobile();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const tourSteps = useMemo<TourStep[]>(() => {
    let steps = buildNavSteps(isMobile);
    if (isContractor) {
      const activityId = isMobile ? TOUR_STEP_IDS_MOBILE.ACTIVITY : TOUR_STEP_IDS.ACTIVITY;
      steps = steps.filter((s) => s.selectorId !== activityId);
    }
    if (isMobile) {
      // Admins have >5 nav items, so Activity goes into the "More" overflow menu.
      // Replace the Activity step with a More step pointing to the overflow button.
      if (isAdmin) {
        steps = steps
          .filter((s) => s.selectorId !== TOUR_STEP_IDS_MOBILE.ACTIVITY)
          .concat({
            selectorId: TOUR_STEP_IDS_MOBILE.MORE,
            content: (
              <p>
                <strong>More</strong> — Tap here to access Activity and other pages.
              </p>
            ),
            position: 'top' as const,
          });
      }
      return steps;
    }
    return [
      ...steps,
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
  }, [isMac, isMobile, isContractor, isAdmin]);

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
  const { setSteps, currentStep, isActive } = useTour();

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

  // When the tour reaches the Cmd+K step:
  // 1. Add a class to lower the palette z-index so it sits BEHIND the tour overlay
  // 2. Auto-open the palette so it's visible inside the tour highlight
  // 3. Suppress keyboard input so the user can't interact with the palette
  useEffect(() => {
    if (cmdKStepIndex === -1) return;

    if (currentStep === cmdKStepIndex) {
      // Lower the palette z-index by adding a body class
      document.body.classList.add('tour-cmd-k-active');

      const openTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-command-palette'));
      }, 300);
      const reQueryTimer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 500);

      return () => {
        clearTimeout(openTimer);
        clearTimeout(reQueryTimer);
        document.body.classList.remove('tour-cmd-k-active');
        window.dispatchEvent(new CustomEvent('close-command-palette'));
      };
    }
  }, [currentStep, cmdKStepIndex]);

  // Suppress Cmd+K keyboard shortcut during the entire tour
  useEffect(() => {
    if (!isActive) return;
    const suppress = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', suppress, true);
    return () => window.removeEventListener('keydown', suppress, true);
  }, [isActive]);

  return null;
}
