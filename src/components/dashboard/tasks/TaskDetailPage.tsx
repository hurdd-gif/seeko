/* ─────────────────────────────────────────────────────────
 * TaskDetailPage — full-page issue detail (Linear-style).
 *
 * Surface layout:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ breadcrumb · NN                          [actions] │
 *   ├──────────────────────────────────┬─────────────────────┤
 *   │  Title                           │  Properties         │
 *   │  Description / body              │  Milestones         │
 *   │  Activity                        │  Progress           │
 *   │                                  │                     │
 *   └──────────────────────────────────┴─────────────────────┘
 *
 * Main content (left, flex-1) + right sidebar (380px) — same
 * paper-family vocabulary as the in-board rail (white shadow-seeko
 * cards on the --ov-bg surface).
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   page surface fades in (light overview-light treatment)
 *   40ms   breadcrumb fades up (6px)
 *   80ms   title card fades up (6px)
 *  120ms   sidebar cards fade up (6px each, +25ms stagger)
 * ───────────────────────────────────────────────────────── */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { Link } from '@/lib/react-router-adapters';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import type {
  Area,
  Milestone,
  Profile,
  TaskActivity,
  TaskWithAssignee,
} from '@/lib/types';
import { FadeRise } from '@/components/motion';
import { RailSection } from './RailSection';
import { PropertiesSection } from './PropertiesSection';
import { MilestonesSection } from './MilestonesSection';
import { ProgressSection } from './ProgressSection';
import { ActivitySection } from './ActivitySection';
import { TaskActionsMenu } from './TaskActionsMenu';
import { createClient } from '@/lib/supabase/client';

export function TaskDetailPage({
  task: initialTask,
  areas,
  team,
  milestones: initialMilestones,
  activity,
  isAdmin = false,
}: {
  task: TaskWithAssignee;
  areas: Area[];
  team: Profile[];
  milestones: Milestone[];
  activity: TaskActivity[];
  isAdmin?: boolean;
}) {
  const router = useRouter();

  /** Local mirror — lets PropertyPopover edits re-render the page without a server roundtrip. */
  const [task, setTask] = useState<TaskWithAssignee>(initialTask);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);

  const idLabel = task.task_number != null ? String(task.task_number) : null;

  const handleTaskUpdated = useCallback(
    (_id: string, patch: Partial<TaskWithAssignee>) => {
      setTask((cur) => ({ ...cur, ...patch }));
    },
    [],
  );

  const handleTaskDeleted = useCallback(async () => {
    const supabase = createClient();
    await supabase.from('tasks').delete().eq('id', task.id);
    router.push('/tasks');
    router.refresh();
  }, [router, task.id]);

  return (
    <div className="overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--ov-bg)] antialiased">
      {/* ── Top chrome: breadcrumb + actions ───────────────────── */}
      {/* One-row bar at the canonical chrome geometry (matches LightShell:
          `flex w-full items-center justify-between gap-3 px-[52px] pt-11 pb-3`).
          Breadcrumb stays bespoke (back-link, not the Issues·Docs tabs) per
          the chrome-redesign decision, but rides the same inset/baseline as
          every other light page so the top bar is consistent. */}
      <header className="shrink-0 border-b border-black/[0.06] bg-[var(--ov-bg)]">
        <div className="flex w-full items-center justify-between gap-3 px-[52px] pt-11 pb-3">
          <FadeRise y={6} delay={0.04}>
            <div className="flex h-8 items-center gap-2">
              <Link
                href="/tasks"
                className="flex items-center gap-1 text-[13.5px] leading-[18px] tracking-[-0.27px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
              >
                <ChevronLeft className="size-3.5" />
                <span>Issues</span>
              </Link>
              <ChevronRight className="size-3 text-[#c5c5c5]" />
              {idLabel && (
                <span className="font-mono text-[12px] tabular-nums text-[#7a7a7a]">
                  {idLabel}
                </span>
              )}
            </div>
          </FadeRise>

          {isAdmin && (
            <FadeRise y={6} delay={0.08}>
              <div className="flex items-center gap-1">
                <TaskActionsMenu
                  taskId={task.id}
                  taskName={task.name}
                  onDeleted={handleTaskDeleted}
                />
              </div>
            </FadeRise>
          )}
        </div>
      </header>

      {/* ── Body: main content + right sidebar ─────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main content (scrollable) */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-8">
            <FadeRise y={6} delay={0.1}>
              <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
                <div className="px-8 pt-8 pb-6">
                  <h1 className="text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-[#1a1a1a]">
                    {task.name}
                  </h1>
                  {task.description ? (
                    <p className="mt-5 whitespace-pre-wrap text-[15px] leading-[1.6] text-[#3a3a3a]">
                      {task.description}
                    </p>
                  ) : (
                    <p className="mt-5 text-[14px] leading-[1.6] text-[#b8b8b8]">
                      No description.
                    </p>
                  )}
                </div>
              </section>
            </FadeRise>

            <FadeRise y={6} delay={0.18}>
              <div className="mt-4">
                <RailSection title="Activity" defaultOpen>
                  <ActivitySection activity={activity} />
                </RailSection>
              </div>
            </FadeRise>
          </div>
        </main>

        {/* Right sidebar — Properties / Milestones / Progress */}
        <aside
          aria-label="Task properties"
          className="hidden w-[380px] shrink-0 border-l border-black/[0.06] lg:flex lg:flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-6">
            <FadeRise y={6} delay={0.12}>
              <RailSection title="Properties" defaultOpen>
                <PropertiesSection
                  task={task}
                  areas={areas}
                  team={team}
                  isAdmin={isAdmin}
                  onTaskUpdated={handleTaskUpdated}
                />
              </RailSection>
            </FadeRise>

            <FadeRise y={6} delay={0.16}>
              <RailSection title="Milestones" defaultOpen>
                <MilestonesSection
                  milestones={milestones}
                  isAdmin={isAdmin}
                  allTasks={[task]}
                  onSaved={(m) =>
                    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)))
                  }
                  onDeleted={(id) =>
                    setMilestones((prev) => prev.filter((m) => m.id !== id))
                  }
                />
              </RailSection>
            </FadeRise>

            <FadeRise y={6} delay={0.2}>
              <RailSection title="Progress" defaultOpen>
                <ProgressSection task={task} />
              </RailSection>
            </FadeRise>
          </div>
        </aside>
      </div>
    </div>
  );
}
