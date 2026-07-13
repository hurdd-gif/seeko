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
  LinkedTask,
  Milestone,
  PendingExtension,
  Profile,
  TaskActivity,
  TaskComment,
  TaskWithAssignee,
} from '@/lib/types';
import { FadeRise } from '@/components/motion';
import { RailSection } from './RailSection';
import { PropertiesSection } from './PropertiesSection';
import { MilestonesSection } from './MilestonesSection';
import { ProgressSection } from './ProgressSection';
import { TaskActivityThread } from './TaskActivityThread';
import { TaskLinksSection } from './TaskLinksSection';
import { TaskSyncBanner, TaskClosedBanner } from './TaskSyncBanner';
import { ekoCreatedEvent } from './task-feed';
import { TaskActionsMenu } from './TaskActionsMenu';
import { deleteTask } from '@/lib/task-store';
import { DeadlineExtensionBanner } from './DeadlineExtensionBanner';

export function TaskDetailPage({
  task: initialTask,
  areas,
  team,
  milestones: initialMilestones,
  activity,
  comments = [],
  currentUserId = '',
  isAdmin = false,
  pendingExtension = null,
  links = [],
  linkCandidates = [],
}: {
  task: TaskWithAssignee;
  areas: Area[];
  team: Profile[];
  milestones: Milestone[];
  activity: TaskActivity[];
  comments?: TaskComment[];
  currentUserId?: string;
  isAdmin?: boolean;
  pendingExtension?: PendingExtension | null;
  links?: LinkedTask[];
  linkCandidates?: LinkedTask[];
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
    await deleteTask(task.id);
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
      <header className="shrink-0 border-b border-wash-6 bg-[var(--ov-bg)]">
        <div className="flex w-full items-center justify-between gap-3 px-[52px] pt-11 pb-3">
          <FadeRise y={6} delay={0.04}>
            <div className="flex h-8 items-center gap-2">
              <Link
                href="/tasks"
                className="flex items-center gap-1 text-[13.5px] leading-[18px] tracking-[-0.27px] text-ink-faint transition-colors hover:text-ink"
              >
                <ChevronLeft className="size-3.5" />
                <span>Issues</span>
              </Link>
              <ChevronRight className="size-3 text-[#c5c5c5] dark:text-ink-ghost" />
              {idLabel && (
                <span className="font-mono text-[12px] tabular-nums text-ink-muted">
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
        {/* scrollbar-paper, not the native bar: on "always show scrollbars" macOS
            the default paints a 15px slab with a visible track between the column
            and the rail, and it takes real layout width. The overlay pill doesn't. */}
        <main className="scrollbar-paper min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-8">
            {/* Closed-state pill reads the LIVE task mirror, so switching the
                status in the Properties rail surfaces/retires it in place.
                Both pills carry their own entrance (no FadeRise wrapper). */}
            <TaskClosedBanner taskId={task.id} status={task.status} />

            {ekoCreatedEvent(activity) && <TaskSyncBanner taskId={task.id} />}

            {isAdmin && pendingExtension && (
              <FadeRise y={6} delay={0.08}>
                <DeadlineExtensionBanner extension={pendingExtension} />
              </FadeRise>
            )}

            <FadeRise y={6} delay={0.1}>
              {/* No card, and no horizontal inset either. The title and description are
                  the SUBJECT of the page, not an entry in it — a frame around them made
                  the page read as a stack of equal cards with no head. Everything below
                  (Connected, the composer, the thread) stays framed, because those are
                  entries.

                  The inset went with the frame. Unframed text lines up against the CARD
                  EDGES below it, not against the text inside those cards — a 16px inset
                  here reads as an indent, not as a shared spine. Flush left is the same
                  column edge the Activity heading uses. */}
              <div className="pt-2 pb-6">
                {/* -ml is an OPTICAL correction, not a layout one. Inter's glyphs carry a
                    left side bearing of ~0.055em — empty space before the stroke that
                    scales with font size. At 28px that's 1.54px; the 15px description
                    below only has 0.83px. Flush boxes therefore render mismatched ink:
                    the heading appears indented by the 0.7px difference. Pulling the
                    heading back by that difference (0.055em × (28−15) ÷ 28 ≈ 0.026em)
                    lines the two strokes up. Kept in em so it tracks a size change. */}
                <h1 className="-ml-[0.026em] text-balance text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-title">
                  {task.name}
                </h1>
                {task.description ? (
                  <p className="mt-5 whitespace-pre-wrap text-[15px] leading-[1.6] text-ink">
                    {task.description}
                  </p>
                ) : (
                  <p className="mt-5 text-[14px] leading-[1.6] text-ink-faintest">
                    No description.
                  </p>
                )}
              </div>
            </FadeRise>

            {/* Connections sit between the description and the thread: they are a
                fact ABOUT the issue (like its title), not a thing that happened
                TO it (like the activity below). */}
            <FadeRise y={6} delay={0.14}>
              <div className="mt-3">
                <TaskLinksSection
                  taskId={task.id}
                  links={links}
                  candidates={linkCandidates}
                />
              </div>
            </FadeRise>

            <FadeRise y={6} delay={0.18}>
              {/* mt-3 groups the composer with the title card above it;
                  the thread pushes its own Activity heading down (mt-8). */}
              <div className="mt-3">
                <TaskActivityThread
                  taskId={task.id}
                  activity={activity}
                  comments={comments}
                  team={team}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              </div>
            </FadeRise>
          </div>
        </main>

        {/* Right sidebar — Properties / Milestones / Progress */}
        {/* No dividing rule. The rail's cards already carry `shadow-seeko`, so a
            border here draws a second, competing edge right next to them —
            shadows over borders. The rail reads as a column because its cards
            stop, not because a line says so. */}
        <aside
          aria-label="Task properties"
          className="hidden w-[380px] shrink-0 lg:flex lg:flex-col"
        >
          <div className="scrollbar-paper flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-6">
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
