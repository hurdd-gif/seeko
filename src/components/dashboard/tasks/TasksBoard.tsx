/* ─────────────────────────────────────────────────────────
 * TasksBoard — Linear/Height-style issue board on /tasks
 *
 * ANIMATION STORYBOARD
 *
 *          header chrome (surface + pill @40ms + actions @80ms) is owned by <LightShell>
 *  200ms   first visible column header rises (8px)
 *  250ms   +50ms per subsequent column header
 *   …      cards inside each column stagger at +25ms each (handled in TaskCard)
 *  exit    when the rail toggles closed → slides off-screen to the RIGHT
 *  enter   when the rail toggles open → slides in from off-screen RIGHT
 * ───────────────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { motion } from 'motion/react';
import { toast } from 'sonner';

/**
 * Rail open/close spring. Drives BOTH the outer slot width (0↔416) and the
 * inner panel translateX (0↔416) simultaneously — same spring, same React
 * state flip, so the two motions are frame-locked.
 */
const RAIL_SPRING = { type: 'spring' as const, stiffness: 320, damping: 34 };
const RAIL_WIDTH = 416;
import { PanelRight, LayoutGrid, Rows3 } from 'lucide-react';
import type {
  Area,
  Milestone,
  Profile,
  TaskActivity,
  TaskStatus,
  TaskWithAssignee,
} from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { TasksBoardColumn } from './TasksBoardColumn';
import { HiddenColumnsStack } from './HiddenColumnsStack';
import { TaskDetailRail } from './TaskDetailRail';
import { BoardFilterPopover, EMPTY_FILTER, type BoardFilterState } from './BoardFilterPopover';
import { BoardDisplayPopover } from './BoardDisplayPopover';
import { TaskDeleteUndoToastSlot, UNDO_WINDOW_MS } from './TaskDeleteUndoToast';
import { CreateTaskComposer } from './CreateTaskComposer';
import { TasksIssueList } from './TasksIssueList';
import { LightShell, type AccountPillProps } from '@/components/dashboard/LightShell';
import { createClient } from '@/lib/supabase/client';
import { requestEkoSpotlight } from '@/lib/eko-bus';

type ViewMode = 'board' | 'list';

function applyFilter(tasks: TaskWithAssignee[], f: BoardFilterState): TaskWithAssignee[] {
  if (
    f.status.length === 0 &&
    f.priority.length === 0 &&
    f.department.length === 0 &&
    f.assignee.length === 0
  ) {
    return tasks;
  }
  return tasks.filter((t) => {
    if (f.status.length && !f.status.includes(t.status)) return false;
    if (f.priority.length && !f.priority.includes(t.priority)) return false;
    if (f.department.length && !f.department.includes(t.department as string)) return false;
    if (f.assignee.length && (!t.assignee_id || !f.assignee.includes(t.assignee_id))) return false;
    return true;
  });
}

export function TasksBoard({
  tasks,
  team,
  areas,
  projectActivity,
  projectMilestones,
  isAdmin = false,
  currentUserId = '',
  account,
}: {
  tasks: TaskWithAssignee[];
  team: Profile[];
  areas: Area[];
  projectActivity: TaskActivity[];
  projectMilestones: Milestone[];
  isAdmin?: boolean;
  currentUserId?: string;
  /** Global account cluster — Issues owns the chrome now that Overview is gone. */
  account: AccountPillProps;
}) {
  /** Local mirror of tasks so optimistic edits in the rail re-render the grid. */
  const [localTasks, setLocalTasks] = useState<TaskWithAssignee[]>(tasks);
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  /**
   * EKO deep-link fallback: `/issues?spotlight=<taskId>` parks a spotlight on
   * the bus (UI choreography only) and strips the param so refresh/back don't
   * replay it. The SPA path doesn't need this — the bus singleton survives
   * client navigations — but a hard load (or a link shared into a new tab)
   * arrives with fresh module state, and this keeps the receipt link working.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    const spotlightId = url.searchParams.get('spotlight');
    if (!spotlightId) return;
    requestEkoSpotlight({ id: spotlightId });
    url.searchParams.delete('spotlight');
    window.history.replaceState(window.history.state, '', url);
    // Run once on mount — a hard load is the only entry path for the param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Statuses the user has explicitly pinned visible (overrides the auto-hide of empties). */
  const [pinnedVisible, setPinnedVisible] = useState<Set<TaskStatus>>(new Set());

  /** Statuses the user has explicitly hidden via the column ⋯ menu (overrides counts). */
  const [pinnedHidden, setPinnedHidden] = useState<Set<TaskStatus>>(new Set());

  /** Selected task id — derive the live row from localTasks so edits stay in sync. */
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(
    () => (selectedTaskId ? localTasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [selectedTaskId, localTasks],
  );

  const handleTaskUpdated = useCallback(
    (id: string, patch: Partial<TaskWithAssignee>) => {
      setLocalTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [],
  );

  /**
   * Quick-assign from a card's AssigneePopover.
   * - Optimistic patch on localTasks (so the avatar swaps immediately)
   * - Supabase mutation; revert on error.
   */
  const handleAssign = useCallback(
    async (taskId: string, nextProfileId: string | null) => {
      const prev = localTasks.find((t) => t.id === taskId);
      if (!prev) return;
      const nextProfile = nextProfileId ? team.find((p) => p.id === nextProfileId) ?? null : null;
      const optimistic: Partial<TaskWithAssignee> = {
        assignee_id: nextProfileId ?? undefined,
        assignee: nextProfile
          ? { id: nextProfile.id, display_name: nextProfile.display_name, avatar_url: nextProfile.avatar_url }
          : null,
      };
      setLocalTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, ...optimistic } : t)));

      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ assignee_id: nextProfileId })
        .eq('id', taskId);
      if (error) {
        // Revert.
        setLocalTasks((cur) =>
          cur.map((t) =>
            t.id === taskId
              ? { ...t, assignee_id: prev.assignee_id, assignee: prev.assignee ?? null }
              : t,
          ),
        );
        console.error('Failed to update task.assignee_id:', error);
      }
    },
    [localTasks, team],
  );

  /**
   * Quick status change from a card's StatusPopover (the status dot).
   * Mirrors handleAssign: optimistic patch on localTasks (so the card hops
   * to the target column immediately) → Supabase mutation → revert + toast
   * on error. The activity_log row is written by the DB trigger, not here.
   */
  const handleStatusChange = useCallback(
    async (taskId: string, nextStatus: TaskStatus) => {
      const prev = localTasks.find((t) => t.id === taskId);
      if (!prev || prev.status === nextStatus) return;
      const prevStatus = prev.status;

      setLocalTasks((cur) =>
        cur.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
      );

      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', taskId);
      if (error) {
        // Revert.
        setLocalTasks((cur) =>
          cur.map((t) => (t.id === taskId ? { ...t, status: prevStatus } : t)),
        );
        console.error('Failed to update task.status:', error);
        toast.error('Failed to change status. Please try again.');
      } else {
        toast.success(nextStatus === 'Done' ? 'Marked done' : `Status changed to ${nextStatus}`);
      }
    },
    [localTasks],
  );

  /**
   * Admin task delete with a 15-second undo window.
   *
   * The hold-to-delete in TaskActionsMenu signals intent → we optimistically
   * remove the task from local state and snapshot it in `pendingDelete`. A
   * timer fires the actual Supabase DELETE after UNDO_WINDOW_MS. Clicking
   * "Undo" before then restores the task; clicking "×" (or starting another
   * delete) commits the pending one immediately.
   */
  const [pendingDelete, setPendingDelete] = useState<TaskWithAssignee | null>(null);
  const pendingDeleteRef = useRef<TaskWithAssignee | null>(null);
  const pendingTimerRef = useRef<number | null>(null);

  const commitDelete = useCallback(async (task: TaskWithAssignee) => {
    const supabase = createClient();
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      // DB delete failed — restore the task and surface the error.
      setLocalTasks((cur) => (cur.some((t) => t.id === task.id) ? cur : [...cur, task]));
      console.error('Failed to delete task:', error);
    }
  }, []);

  const finalizePendingNow = useCallback(() => {
    if (pendingTimerRef.current != null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const pending = pendingDeleteRef.current;
    if (pending) {
      pendingDeleteRef.current = null;
      setPendingDelete(null);
      void commitDelete(pending);
    }
  }, [commitDelete]);

  const handleTaskDeleted = useCallback(
    (taskId: string) => {
      // If another delete is mid-window, commit it first.
      finalizePendingNow();

      const task = localTasks.find((t) => t.id === taskId);
      if (!task) return;

      setLocalTasks((cur) => cur.filter((t) => t.id !== taskId));
      setSelectedTaskId((cur) => (cur === taskId ? null : cur));

      pendingDeleteRef.current = task;
      setPendingDelete(task);

      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        const pending = pendingDeleteRef.current;
        if (!pending) return;
        pendingDeleteRef.current = null;
        setPendingDelete(null);
        void commitDelete(pending);
      }, UNDO_WINDOW_MS);
    },
    [commitDelete, finalizePendingNow, localTasks],
  );

  const handleUndoDelete = useCallback(() => {
    if (pendingTimerRef.current != null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const restored = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (restored) {
      setLocalTasks((cur) => (cur.some((t) => t.id === restored.id) ? cur : [...cur, restored]));
    }
  }, []);

  // Clean up any pending timer on unmount.
  useEffect(
    () => () => {
      if (pendingTimerRef.current != null) window.clearTimeout(pendingTimerRef.current);
    },
    [],
  );

  /**
   * Create-task composer state.
   *
   * `composerStatus` is set by the per-column "+" affordance so the new
   * task lands in that bucket. The top-right "+" button opens with the
   * default ("Todo").
   */
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStatus, setComposerStatus] = useState<TaskStatus | undefined>(undefined);

  const openComposer = useCallback((status?: TaskStatus) => {
    setComposerStatus(status);
    setComposerOpen(true);
  }, []);

  const closeComposer = useCallback(() => setComposerOpen(false), []);

  const handleTaskCreated = useCallback(() => {
    // Server action already calls revalidatePath('/tasks'); a router.refresh()
    // pulls the new row into the RSC tree without a hard reload.
    router.refresh();
  }, [router]);

  /** Right rail visibility (toggle via PanelRight icon). */
  const [railOpen, setRailOpen] = useState(true);

  /** Filter state (status / priority / department / assignee). */
  const [filter, setFilter] = useState<BoardFilterState>(EMPTY_FILTER);

  /** View mode toggle: stacked-status board vs flat list. */
  const [viewMode, setViewMode] = useState<ViewMode>('board');

  // Apply filter before grouping.
  const filteredTasks = useMemo(() => applyFilter(localTasks, filter), [localTasks, filter]);

  // ── Group tasks by status ────────────────────────────────
  // "Todo" is also the personal queue: any non-terminal task assigned to the
  // current user is bucketed there (and removed from its actual status column)
  // so the user sees their active work in one place. Terminal states
  // (Done/Canceled/Duplicate) keep their normal column even when assigned to me.
  const TERMINAL: TaskStatus[] = ['Done', 'Canceled', 'Duplicate'];
  const tasksByStatus = useMemo(() => {
    const buckets = Object.fromEntries(
      TASK_STATUSES.map((s) => [s, [] as TaskWithAssignee[]]),
    ) as Record<TaskStatus, TaskWithAssignee[]>;
    for (const t of filteredTasks) {
      const isMine = currentUserId && t.assignee_id === currentUserId;
      const promoteToTodo = isMine && !TERMINAL.includes(t.status) && t.status !== 'Todo';
      const bucket = promoteToTodo ? 'Todo' : t.status;
      if (buckets[bucket]) buckets[bucket].push(t);
    }
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks, currentUserId]);

  const countsByStatus = useMemo(() => {
    const out = {} as Record<TaskStatus, number>;
    for (const s of TASK_STATUSES) out[s] = tasksByStatus[s].length;
    return out;
  }, [tasksByStatus]);

  // ── Visible columns vs hidden rollup ─────────────────────
  // Rule: a status is visible when (it has tasks OR the user pinned it open),
  // AND the user hasn't explicitly hidden it via the column ⋯ menu.
  // Order is the canonical TASK_STATUSES order (Backlog → Duplicate).
  const visibleStatuses = TASK_STATUSES.filter(
    (s) => !pinnedHidden.has(s) && (countsByStatus[s] > 0 || pinnedVisible.has(s)),
  );
  const hiddenStatuses = TASK_STATUSES.filter((s) => !visibleStatuses.includes(s));

  function pinHiddenColumn(status: TaskStatus) {
    // Expanding a column from the hidden rollup: clear any explicit hide, and
    // pin it open so it stays visible even when empty.
    setPinnedHidden((prev) => {
      if (!prev.has(status)) return prev;
      const next = new Set(prev);
      next.delete(status);
      return next;
    });
    setPinnedVisible((prev) => {
      const next = new Set(prev);
      next.add(status);
      return next;
    });
  }

  function hideColumn(status: TaskStatus) {
    // Hide from the column ⋯ menu: drop any "pinned visible" pin and force-hide.
    setPinnedVisible((prev) => {
      if (!prev.has(status)) return prev;
      const next = new Set(prev);
      next.delete(status);
      return next;
    });
    setPinnedHidden((prev) => {
      const next = new Set(prev);
      next.add(status);
      return next;
    });
  }

  function togglePinned(status: TaskStatus) {
    setPinnedVisible((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  // Board controls share the global bar row (passed to LightShell as `actions`,
  // rendered just left of the account cluster). The global Create button covers
  // "new issue"; per-column "+ add" stays for status-preselected creation.
  const boardControls = (
    <div className="flex items-center gap-1">
      <BoardFilterPopover filter={filter} onChange={setFilter} team={team} />
      <BoardDisplayPopover
        pinnedVisible={pinnedVisible}
        onTogglePinned={togglePinned}
        countsByStatus={countsByStatus}
      />
      <button
        type="button"
        aria-label={viewMode === 'board' ? 'Switch to list view' : 'Switch to board view'}
        aria-pressed={viewMode === 'list'}
        onClick={() => setViewMode((v) => (v === 'board' ? 'list' : 'board'))}
        className={
          viewMode === 'list'
            ? 'flex size-9 items-center justify-center rounded-full bg-black/[0.05] text-[#3a3a3a] transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]'
            : 'flex size-9 items-center justify-center rounded-full text-[#6e6e6e] transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.04] hover:text-[#3a3a3a] motion-safe:active:scale-[0.97]'
        }
      >
        {viewMode === 'board' ? <Rows3 className="size-4" /> : <LayoutGrid className="size-4" />}
      </button>
      <button
        type="button"
        aria-label={railOpen ? 'Close right rail' : 'Open right rail'}
        aria-pressed={railOpen}
        onClick={() => setRailOpen((v) => !v)}
        className={
          railOpen
            ? 'flex size-9 items-center justify-center rounded-full bg-black/[0.05] text-[#3a3a3a] transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]'
            : 'flex size-9 items-center justify-center rounded-full text-[#6e6e6e] transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.04] hover:text-[#3a3a3a] motion-safe:active:scale-[0.97]'
        }
      >
        <PanelRight className="size-4" />
      </button>
    </div>
  );

  return (
    <LightShell
      activeTab="issues"
      navLabel="Project sections"
      fill
      bordered
      account={account}
      actions={boardControls}
    >
      {/* ── Board area + right rail ────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <main className="scroll-mask-x min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          {viewMode === 'board' ? (
            <div className="flex h-full items-start gap-4 px-6 pb-8 pt-2">
              {visibleStatuses.map((status, i) => (
                <TasksBoardColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  onSelectTask={(t) => router.push(`/tasks/${t.id}`)}
                  onHide={hideColumn}
                  columnIndex={i}
                  isAdmin={isAdmin}
                  team={team}
                  onAssign={handleAssign}
                  onStatusChange={isAdmin ? handleStatusChange : undefined}
                  onDeleteTask={isAdmin ? handleTaskDeleted : undefined}
                  onAddTask={isAdmin ? () => openComposer(status) : undefined}
                  muted={TERMINAL.includes(status)}
                />
              ))}

              {hiddenStatuses.length > 0 && (
                <HiddenColumnsStack
                  hiddenStatuses={hiddenStatuses}
                  countsByStatus={countsByStatus}
                  defaultOpen={false}
                  onExpandColumn={pinHiddenColumn}
                />
              )}
            </div>
          ) : (
            <div className="h-full overflow-y-auto px-6 pb-8 pt-2">
              <TasksIssueList
                tasks={filteredTasks}
                team={team}
                selectedTaskId={selectedTaskId}
                onSelectTask={(t) => router.push(`/tasks/${t.id}`)}
                isAdmin={isAdmin}
                onAssign={handleAssign}
                onDeleteTask={isAdmin ? handleTaskDeleted : undefined}
              />
            </div>
          )}
        </main>

        {/* Rail slot — outer width creates/closes layout space, inner
            content translates X. Same spring, same React state flip → the
            two motions are frame-locked, no FLIP measurement gap. */}
        <motion.div
          initial={false}
          animate={{ width: railOpen ? RAIL_WIDTH : 0 }}
          transition={RAIL_SPRING}
          className="hidden shrink-0 overflow-hidden lg:block"
          aria-hidden={!railOpen}
        >
          <motion.div
            initial={false}
            animate={{ x: railOpen ? 0 : RAIL_WIDTH }}
            transition={RAIL_SPRING}
            className="h-full w-[416px]"
          >
            <TaskDetailRail
              task={selectedTask}
              areas={areas}
              team={team}
              tasks={localTasks}
              projectActivity={projectActivity}
              projectMilestones={projectMilestones}
              totalTaskCount={filteredTasks.length}
              onClose={() => setSelectedTaskId(null)}
              isAdmin={isAdmin}
              onTaskUpdated={handleTaskUpdated}
              onTaskDeleted={handleTaskDeleted}
            />
          </motion.div>
        </motion.div>
      </div>

      <TaskDeleteUndoToastSlot
        pendingTaskName={pendingDelete?.name ?? null}
        onUndo={handleUndoDelete}
        onCommit={finalizePendingNow}
      />

      <CreateTaskComposer
        open={composerOpen}
        onClose={closeComposer}
        team={team}
        areas={areas}
        defaultStatus={composerStatus}
        onCreated={handleTaskCreated}
      />
    </LightShell>
  );
}
