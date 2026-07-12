/* ─────────────────────────────────────────────────────────
 * TaskDetailRail — 416px right panel with stacked floating cards.
 *
 * Each section (Properties · Milestones · Progress · Activity)
 * is its OWN shadow-seeko rounded-xl card. Cards sit on the
 * --ov-bg gray surface with a gap-3 vertical rhythm — same
 * vocabulary as the SEEKO overview page tiles.
 *
 * The task header (task number + name + close button) sits as plain
 * chrome above the card stack — not in a card.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   header crossfades when task changes (AnimatePresence mode="wait")
 *  exit    on close, content fades + slides 4–8px outward
 *
 * Empty-rail (no task selected): project-level view — project title,
 * total task count, milestones overview, last 5 activity entries.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Plus } from 'lucide-react';
import type {
  Area,
  Milestone,
  Profile,
  TaskActivity,
  TaskWithAssignee,
} from '@/lib/types';
import { RailSection } from './RailSection';
import { PropertiesSection } from './PropertiesSection';
import { MilestonesSection } from './MilestonesSection';
import { MilestonePopover } from './MilestonePopover';
import { ProgressSection } from './ProgressSection';
import { ActivitySection } from './ActivitySection';
import { TaskActionsMenu } from './TaskActionsMenu';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };
/* Outer slot width + inner translateX are now handled by TasksBoard so that
 * one spring drives both motions in frame-lock. This file only owns the
 * INTERNAL crossfade between task-detail and project-overview content. */

/** Placeholder "+" affordance for sections that don't have a real CRUD wired yet. */
function AddActionStub({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${label} coming soon`}
      aria-label={label}
      className="flex size-6 items-center justify-center rounded-md text-[#b0b0b0] opacity-70 cursor-not-allowed"
    >
      <Plus className="size-3.5" strokeWidth={2.25} />
    </button>
  );
}

/** "See all" link inside an Activity header (right side). */
function SeeAllAction({
  expanded,
  onToggle,
  count,
}: {
  expanded: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-[12px] font-medium text-ink-faint transition-colors hover:text-ink"
    >
      {expanded ? 'Show less' : `See all${count > 0 ? ` ${count}` : ''}`}
    </button>
  );
}

export function TaskDetailRail({
  task,
  tasks,
  areas,
  team,
  projectActivity,
  projectMilestones,
  totalTaskCount: _totalTaskCount,
  onClose,
  isAdmin = false,
  onTaskUpdated,
  onTaskDeleted,
}: {
  task: TaskWithAssignee | null;
  /** Full project task list — used for the MilestoneEditPopover task picker. */
  tasks: TaskWithAssignee[];
  areas: Area[];
  team: Profile[];
  projectActivity: TaskActivity[];
  projectMilestones: Milestone[];
  totalTaskCount: number;
  onClose: () => void;
  isAdmin?: boolean;
  onTaskUpdated?: (id: string, patch: Partial<TaskWithAssignee>) => void;
  /** Called when an admin deletes a task from the rail's action menu. */
  onTaskDeleted?: (id: string) => void;
}) {
  const shouldReduce = useReducedMotion();
  const [taskMilestones, setTaskMilestones] = useState<Milestone[]>([]);
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);

  /**
   * Local mirror of project milestones so a newly-created row from the
   * MilestonePopover shows up in the link list / empty-rail list without
   * waiting for the server prop to re-arrive.
   */
  const [localProjectMilestones, setLocalProjectMilestones] = useState<Milestone[]>(
    projectMilestones,
  );
  useEffect(() => {
    setLocalProjectMilestones(projectMilestones);
  }, [projectMilestones]);

  // Handlers for MilestonePopover ------------------------------------------
  function handleMilestoneCreated(m: Milestone, linked: boolean) {
    setLocalProjectMilestones((prev) => [...prev, m]);
    if (linked) {
      setTaskMilestones((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    }
  }

  function handleLinkToggled(milestoneId: string, isLinked: boolean) {
    if (isLinked) {
      const m = localProjectMilestones.find((x) => x.id === milestoneId);
      if (!m) return;
      setTaskMilestones((prev) => (prev.some((x) => x.id === milestoneId) ? prev : [...prev, m]));
    } else {
      setTaskMilestones((prev) => prev.filter((x) => x.id !== milestoneId));
    }
  }

  function handleMilestoneSaved(updated: Milestone) {
    setLocalProjectMilestones((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
    );
    setTaskMilestones((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
    );
  }

  function handleMilestoneDeleted(id: string) {
    setLocalProjectMilestones((prev) => prev.filter((m) => m.id !== id));
    setTaskMilestones((prev) => prev.filter((m) => m.id !== id));
  }

  /**
   * Called by MilestoneEditPopover after the link set for a milestone has
   * been persisted. We need to update the *current task's* milestone list:
   * if the saved set includes task.id, ensure the milestone is present;
   * if it doesn't, ensure it's absent.
   */
  function handleMilestoneLinksChanged(milestoneId: string, linkedTaskIds: string[]) {
    if (!task) return;
    const includesCurrent = linkedTaskIds.includes(task.id);
    if (includesCurrent) {
      const m = localProjectMilestones.find((x) => x.id === milestoneId);
      if (!m) return;
      setTaskMilestones((prev) => (prev.some((x) => x.id === milestoneId) ? prev : [...prev, m]));
    } else {
      setTaskMilestones((prev) => prev.filter((x) => x.id !== milestoneId));
    }
  }

  const taskMilestoneIds = useMemo(() => taskMilestones.map((m) => m.id), [taskMilestones]);

  // Lazy-fetch task-scoped milestones + activity when a task is selected.
  useEffect(() => {
    let cancelled = false;
    if (!task) {
      setTaskMilestones([]);
      setTaskActivity([]);
      setActivityExpanded(false);
      return;
    }
    setLoadingDetail(true);
    setActivityExpanded(false);
    fetch(`/api/tasks/${task.id}/rail`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { milestones: [], activity: [] }))
      .then((d: { milestones: Milestone[]; activity: TaskActivity[] }) => {
        if (cancelled) return;
        setTaskMilestones(d.milestones ?? []);
        setTaskActivity(d.activity ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setTaskMilestones([]);
        setTaskActivity([]);
      })
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => {
      cancelled = true;
    };
  }, [task]);

  const idLabel = useMemo(
    () => (task?.task_number != null ? String(task.task_number) : null),
    [task],
  );

  const taskActivityLimit = activityExpanded ? undefined : 10;
  const hasMoreTaskActivity = taskActivity.length > 10;

  return (
    <aside
      aria-label={task ? 'Task details' : 'Project overview'}
      className="flex h-full w-[416px] shrink-0 flex-col"
    >
      <div className="m-4 ml-0 flex h-[calc(100%-2rem)] min-h-0 flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {task ? (
            <motion.div
              key={`task-${task.id}`}
              initial={shouldReduce ? false : { opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduce ? { opacity: 0 } : { opacity: 0, x: 6 }}
              transition={shouldReduce ? { duration: 0 } : SPRING}
              className="flex h-full min-h-0 flex-col"
            >
              {/* Task header — chrome, not a card */}
              <header className="flex items-start gap-3 pb-3">
                <div className="min-w-0 flex-1">
                  {idLabel && (
                    <div className="text-[12px] font-medium tracking-[0.01em] text-ink-faint">
                      {idLabel}
                    </div>
                  )}
                  <h2 className="mt-1 text-[18px] font-medium leading-[1.3] tracking-[-0.01em] text-ink-title">
                    {task.name}
                  </h2>
                </div>
                {isAdmin && onTaskDeleted && (
                  <TaskActionsMenu
                    taskId={task.id}
                    taskName={task.name}
                    onDeleted={onTaskDeleted}
                  />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close task detail"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-wash-4 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </header>

              {task.description && (
                <p className="pb-3 text-[13.5px] leading-[1.55] text-[#5a5a5a] dark:text-ink-body">
                  {task.description}
                </p>
              )}

              {/* Stacked floating section cards */}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
                <RailSection title="Properties" defaultOpen trailing={<AddActionStub label="Add property" />}>
                  <PropertiesSection
                    task={task}
                    areas={areas}
                    team={team}
                    isAdmin={isAdmin}
                    onTaskUpdated={onTaskUpdated}
                  />
                </RailSection>

                <RailSection
                  title="Milestones"
                  defaultOpen
                  trailing={
                    isAdmin ? (
                      <MilestonePopover
                        taskId={task.id}
                        projectMilestones={localProjectMilestones}
                        linkedMilestoneIds={taskMilestoneIds}
                        onMilestoneCreated={handleMilestoneCreated}
                        onLinkToggled={handleLinkToggled}
                        ariaLabel="Add milestone"
                      >
                        <Plus className="size-3.5" strokeWidth={2.25} />
                      </MilestonePopover>
                    ) : undefined
                  }
                >
                  <MilestonesSection
                    milestones={taskMilestones}
                    isAdmin={isAdmin}
                    allTasks={tasks}
                    onSaved={handleMilestoneSaved}
                    onDeleted={handleMilestoneDeleted}
                    onLinksChanged={handleMilestoneLinksChanged}
                  />
                </RailSection>

                <RailSection title="Progress" defaultOpen>
                  <ProgressSection task={task} />
                </RailSection>

                <RailSection
                  title="Activity"
                  defaultOpen
                  trailing={
                    hasMoreTaskActivity ? (
                      <SeeAllAction
                        expanded={activityExpanded}
                        onToggle={() => setActivityExpanded((v) => !v)}
                        count={taskActivity.length}
                      />
                    ) : undefined
                  }
                >
                  {loadingDetail && taskActivity.length === 0 ? (
                    <div className="text-[12.5px] text-ink-faint">Loading…</div>
                  ) : (
                    <ActivitySection activity={taskActivity} limit={taskActivityLimit} team={team} />
                  )}
                </RailSection>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={shouldReduce ? false : { opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduce ? { opacity: 0 } : { opacity: 0, x: 6 }}
              transition={shouldReduce ? { duration: 0 } : SPRING}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
                <RailSection
                  title="Milestones"
                  defaultOpen
                  trailing={
                    isAdmin ? (
                      <MilestonePopover
                        projectMilestones={localProjectMilestones}
                        onMilestoneCreated={handleMilestoneCreated}
                        ariaLabel="Add milestone"
                      >
                        <Plus className="size-3.5" strokeWidth={2.25} />
                      </MilestonePopover>
                    ) : undefined
                  }
                >
                  <MilestonesSection
                    milestones={localProjectMilestones}
                    isAdmin={isAdmin}
                    allTasks={tasks}
                    onSaved={handleMilestoneSaved}
                    onDeleted={handleMilestoneDeleted}
                    onLinksChanged={handleMilestoneLinksChanged}
                  />
                </RailSection>

                <RailSection title="Recent activity" defaultOpen>
                  <ActivitySection activity={projectActivity} limit={5} team={team} />
                </RailSection>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
