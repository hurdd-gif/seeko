/* PropertiesSection — property rows for the task rail.
 *
 * NO LABEL COLUMN. Each row is a glyph + its value, and nothing else. The
 * label column used to eat 88px of a 348px card to tell you that "Coding" is
 * a department and that "May 11" is a date — which the value and its glyph
 * already say. Dropping it gives the values the full width and leaves the
 * card with a single text spine.
 *
 * That only works if EVERY row has a glyph, because the glyph box is what the
 * text aligns to: a row without one starts its text 24px left of its
 * neighbours. Hence Area (Folder) and unset-Assignee (CircleDashed) — both
 * lifted from the CreateTaskComposer / AssigneePopover vocabulary rather than
 * invented here.
 *
 * Empty values render "Set priority" / "Unassigned", not an em-dash. The
 * placeholder IS the affordance — it says the slot is fillable at the moment
 * you notice it's empty. Because that text is now actionable rather than
 * decorative it sits at `ink-muted-strong` (4.9:1, the AA floor), NOT at
 * `ink-faintest`, which the token ladder reserves for decoration.
 *
 * Read-only by default. When `isAdmin` is true, each row becomes a
 * click-to-edit trigger anchored to a PropertyPopover. Mutations go straight
 * to Supabase via the browser client (RLS enforces auth); the parent gets an
 * optimistic patch via `onTaskUpdated` so the rail and the card cluster stay
 * in sync without a refetch. */

'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, CircleDashed, Folder } from 'lucide-react';
import type {
  Area,
  Priority,
  Profile,
  TaskStatus,
  TaskWithAssignee,
} from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { PropertyPopover, type PropertyOption } from './PropertyPopover';
import { DatePopover } from './DatePopover';
import { updateTask } from '@/lib/task-store';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PriorityIcon, PRIORITIES, PRIORITY_COLOR } from './PriorityIcon';

const DEPARTMENT_COLOR: Record<string, string> = {
  Coding: '#0d7aff',
  'Visual Art': '#93c5fd',
  'UI/UX': '#c4b5fd',
  Animation: '#fbbf24',
  'Asset Creation': '#f9a8d4',
};

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'] as const;

/* The row bleeds 8px into RailSection's px-4 so the hover/press surface is the
 * whole row, not the value pill it used to be. `w-[calc(100%+16px)]` pays back
 * the two negative margins. 16px glyph + 2×8px padding = a 32px row: the rows
 * tile with no gap, so the hit areas meet exactly and never overlap.
 *
 * No scale-on-press here, deliberately. A 332px-wide row scaling to 0.96 reads
 * as the whole card flexing; for full-width list rows the press signal is the
 * fill (`active:bg-wash-4`), same as every other row list in the app. */
const ROW =
  '-mx-2 flex w-[calc(100%+16px)] min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left';
const ROW_INTERACTIVE = `${ROW} transition-colors duration-150 ease-out hover:bg-wash-3 active:bg-wash-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent`;

/** The shared 16px box every glyph sits in — this is what the value text aligns to. */
const GLYPH = 'flex size-4 shrink-0 items-center justify-center text-ink-muted';

function Row({ glyph, value, muted }: { glyph: ReactNode; value: string; muted?: boolean }) {
  return (
    <>
      <span className={GLYPH}>{glyph}</span>
      {/* `title` because `truncate` is a one-way door: a long area or assignee name
          clipped at 300px would otherwise be unreadable with no way to recover it. */}
      <span
        title={value}
        className={`min-w-0 flex-1 truncate text-[13px] leading-4 ${
          muted ? 'text-ink-muted-strong' : 'text-ink-strong'
        }`}
      >
        {value}
      </span>
    </>
  );
}

/** Unset department — a dashed swatch, so set/unset read as one glyph in two states. */
function EmptySwatch() {
  return <span className="size-3 rounded-[3.5px] border border-dashed border-ink-ghost" />;
}

function formatDate(iso?: string) {
  if (!iso) return null;
  // DATE columns parse as UTC midnight via `new Date('YYYY-MM-DD')` — shift
  // to local components so the rendered day matches the picker value.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function initial(name?: string | null) {
  return (name ?? '?').slice(0, 1).toUpperCase();
}

export function PropertiesSection({
  task,
  areas,
  team = [],
  isAdmin = false,
  onTaskUpdated,
}: {
  task: TaskWithAssignee;
  areas: Area[];
  team?: Profile[];
  isAdmin?: boolean;
  /** Called with the optimistic patch the parent should apply locally. */
  onTaskUpdated?: (id: string, patch: Partial<TaskWithAssignee>) => void;
}) {
  const [saving, setSaving] = useState<null | keyof TaskWithAssignee>(null);

  const area = areas.find((a) => a.id === task.area_id);
  const deadline = formatDate(task.deadline);
  const deptColor = DEPARTMENT_COLOR[task.department ?? ''];
  const priority = (task.priority ?? null) as Priority | null;

  // ── Option lists ─────────────────────────────────────────
  const statusOptions: PropertyOption<TaskStatus>[] = useMemo(
    () =>
      TASK_STATUSES.map((s) => ({
        value: s,
        label: s,
        leading: <StatusDot status={s} size="sm" />,
      })),
    [],
  );

  const priorityOptions: PropertyOption<Priority>[] = useMemo(
    () =>
      PRIORITIES.map((p) => ({
        value: p,
        label: p,
        leading: <PriorityIcon level={p} className="size-3.5" style={{ color: PRIORITY_COLOR[p] }} />,
      })),
    [],
  );

  const departmentOptions: PropertyOption<string>[] = useMemo(
    () =>
      DEPARTMENTS.map((d) => ({
        value: d,
        label: d,
        leading: (
          <span
            className="inline-block size-2 rounded-sm"
            style={{ backgroundColor: DEPARTMENT_COLOR[d] }}
          />
        ),
      })),
    [],
  );

  const areaOptions: PropertyOption<string>[] = useMemo(
    () => areas.map((a) => ({ value: a.id, label: a.name })),
    [areas],
  );

  const assigneeOptions: PropertyOption<string>[] = useMemo(
    () =>
      team.map((p) => ({
        value: p.id,
        label: p.display_name ?? 'Unnamed',
        leading: (
          <Avatar className="size-3.5">
            <AvatarImage src={p.avatar_url ?? undefined} alt={p.display_name ?? ''} />
            <AvatarFallback seed={p.id} className="bg-[#e5e5e5] dark:bg-surface-6 text-[7px] font-medium text-ink-body">
              {initial(p.display_name)}
            </AvatarFallback>
          </Avatar>
        ),
      })),
    [team],
  );

  // ── Mutation ─────────────────────────────────────────────
  async function update<K extends keyof TaskWithAssignee>(
    column: K,
    next: TaskWithAssignee[K],
    extraPatch?: Partial<TaskWithAssignee>,
  ) {
    setSaving(column);
    const patch = { [column]: next, ...extraPatch } as Partial<TaskWithAssignee>;
    // Optimistic update first; revert on error.
    onTaskUpdated?.(task.id, patch);
    const result = await updateTask(task.id, { [column]: next });
    setSaving(null);
    if (!result.ok) {
      // Revert by reapplying the previous value.
      const revert = { [column]: task[column] } as Partial<TaskWithAssignee>;
      onTaskUpdated?.(task.id, revert);
      console.error(`Failed to update task.${String(column)}:`, result.error);
    } else if (column === 'status') {
      const nextStatus = String(next);
      toast.success(nextStatus === 'Done' ? 'Marked done' : `Status changed to ${nextStatus}`);
    }
  }

  // ── Rows ─────────────────────────────────────────────────
  // Status is the one property that can't be empty, so it has no placeholder.
  const statusRow = <Row glyph={<StatusDot status={task.status} size="md" />} value={task.status} />;

  const priorityRow = (
    <Row
      glyph={
        <PriorityIcon
          level={priority}
          // The null glyph draws its dots from currentColor at 25% opacity, so it
          // needs a dark source to read as a ghost instead of vanishing.
          className={priority ? 'size-3.5' : 'size-3.5 text-ink-strong'}
          style={priority ? { color: PRIORITY_COLOR[priority] } : undefined}
        />
      }
      value={priority ?? 'Set priority'}
      muted={!priority}
    />
  );

  const departmentRow = (
    <Row
      glyph={
        task.department ? (
          <span
            className="size-3 rounded-[3.5px]"
            style={{ backgroundColor: deptColor ?? '#9a9a9a' }}
          />
        ) : (
          <EmptySwatch />
        )
      }
      value={task.department ?? 'Set department'}
      muted={!task.department}
    />
  );

  const areaRow = (
    <Row glyph={<Folder className="size-3.5" />} value={area?.name ?? 'Set area'} muted={!area} />
  );

  const assigneeRow = (
    <Row
      glyph={
        task.assignee ? (
          <Avatar className="size-4">
            <AvatarImage
              src={task.assignee.avatar_url ?? undefined}
              alt={task.assignee.display_name ?? ''}
            />
            <AvatarFallback seed={task.assignee.id} className="bg-[#e5e5e5] dark:bg-surface-6 text-[8px] font-medium text-ink-body">
              {initial(task.assignee.display_name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <CircleDashed className="size-4" strokeWidth={1.5} />
        )
      }
      value={task.assignee?.display_name ?? 'Unassigned'}
      muted={!task.assignee}
    />
  );

  const deadlineRow = (
    <Row
      glyph={<CalendarIcon className="size-3.5" />}
      value={deadline ?? 'Set deadline'}
      muted={!deadline}
    />
  );

  // ── Render ───────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-col">
        <div className={ROW}>{statusRow}</div>
        <div className={ROW}>{priorityRow}</div>
        <div className={ROW}>{departmentRow}</div>
        <div className={ROW}>{areaRow}</div>
        <div className={ROW}>{assigneeRow}</div>
        <div className={ROW}>{deadlineRow}</div>
      </div>
    );
  }

  // Admin: each row is a popover trigger. The aria-label is the only place the
  // property NAME survives now that the visible label column is gone, so it
  // carries the name AND the current value — a button whose accessible name is
  // a bare "Change status" would announce nothing about what the status is.
  return (
    <div className="flex flex-col" data-saving={saving ?? undefined}>
      <PropertyPopover<TaskStatus>
        value={task.status}
        options={statusOptions}
        ariaLabel={`Status: ${task.status}`}
        triggerClassName={ROW_INTERACTIVE}
        onSelect={(next) => next && update('status', next)}
      >
        {statusRow}
      </PropertyPopover>

      <PropertyPopover<Priority>
        value={priority}
        options={priorityOptions}
        ariaLabel={`Priority: ${priority ?? 'not set'}`}
        triggerClassName={ROW_INTERACTIVE}
        onSelect={(next) => next && update('priority', next)}
      >
        {priorityRow}
      </PropertyPopover>

      <PropertyPopover<string>
        value={(task.department ?? null) as string | null}
        options={departmentOptions}
        ariaLabel={`Department: ${task.department ?? 'not set'}`}
        triggerClassName={ROW_INTERACTIVE}
        onSelect={(next) => next && update('department', next)}
      >
        {departmentRow}
      </PropertyPopover>

      <PropertyPopover<string>
        value={task.area_id ?? null}
        options={areaOptions}
        ariaLabel={`Area: ${area?.name ?? 'not set'}`}
        triggerClassName={ROW_INTERACTIVE}
        allowClear
        onSelect={(next) => update('area_id', next ?? undefined)}
      >
        {areaRow}
      </PropertyPopover>

      <PropertyPopover<string>
        value={task.assignee_id ?? null}
        options={assigneeOptions}
        ariaLabel={`Assignee: ${task.assignee?.display_name ?? 'unassigned'}`}
        triggerClassName={ROW_INTERACTIVE}
        allowClear
        onSelect={(next) => {
          const nextAssignee = next ? team.find((p) => p.id === next) ?? null : null;
          update('assignee_id', next ?? undefined, { assignee: nextAssignee });
        }}
      >
        {assigneeRow}
      </PropertyPopover>

      <DatePopover
        value={task.deadline ?? null}
        ariaLabel={`Deadline: ${deadline ?? 'not set'}`}
        triggerClassName={ROW_INTERACTIVE}
        onChange={(next) => update('deadline', next ?? undefined)}
      >
        {deadlineRow}
      </DatePopover>
    </div>
  );
}
