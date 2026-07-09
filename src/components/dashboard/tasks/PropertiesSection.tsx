/* PropertiesSection — property rows for the task rail.
 *
 * Read-only by default. When `isAdmin` is true, each editable property row
 * becomes a click-to-edit trigger anchored to a PropertyPopover. Mutations
 * go straight to Supabase via the browser client (RLS enforces auth); the
 * parent gets an optimistic patch via `onTaskUpdated` so the rail and the
 * card cluster stay in sync without a refetch. */

'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calendar as CalendarIcon } from 'lucide-react';
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
import { createClient } from '@/lib/supabase/client';
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

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[28px] items-center gap-3">
      <span className="w-[88px] shrink-0 text-[12.5px] text-[#9a9a9a]">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-[#2a2a2a]">
        {children}
      </span>
    </div>
  );
}

function Empty() {
  return <span className="text-[#b8b8b8]">—</span>;
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
            <AvatarFallback className="bg-[#e5e5e5] text-[7px] font-medium text-[#505050]">
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
    const supabase = createClient();
    const patch = { [column]: next, ...extraPatch } as Partial<TaskWithAssignee>;
    // Optimistic update first; revert on error.
    onTaskUpdated?.(task.id, patch);
    const { error } = await supabase
      .from('tasks')
      .update({ [column]: next })
      .eq('id', task.id);
    setSaving(null);
    if (error) {
      // Revert by reapplying the previous value.
      const revert = { [column]: task[column] } as Partial<TaskWithAssignee>;
      onTaskUpdated?.(task.id, revert);
      console.error(`Failed to update task.${String(column)}:`, error);
    } else if (column === 'status') {
      const nextStatus = String(next);
      toast.success(nextStatus === 'Done' ? 'Marked done' : `Status changed to ${nextStatus}`);
    }
  }

  // ── Row contents (read-only) ─────────────────────────────
  const statusContent = (
    <>
      <StatusDot status={task.status} size="sm" />
      <span>{task.status}</span>
    </>
  );

  const priorityContent = task.priority ? (
    <>
      <PriorityIcon
        level={task.priority as Priority}
        className="size-3.5"
        style={{ color: PRIORITY_COLOR[task.priority as Priority] }}
      />
      <span>{task.priority}</span>
    </>
  ) : (
    <Empty />
  );

  const departmentContent = task.department ? (
    <>
      <span
        className="inline-block size-2 rounded-sm"
        style={{ backgroundColor: deptColor ?? '#9a9a9a' }}
      />
      <span>{task.department}</span>
    </>
  ) : (
    <Empty />
  );

  const areaContent = area ? <span>{area.name}</span> : <Empty />;

  const assigneeContent = task.assignee ? (
    <>
      <Avatar className="size-5 ring-1 ring-black/[0.04]">
        <AvatarImage
          src={task.assignee.avatar_url ?? undefined}
          alt={task.assignee.display_name ?? ''}
        />
        <AvatarFallback className="bg-[#e5e5e5] text-[9px] font-medium text-[#505050]">
          {initial(task.assignee.display_name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{task.assignee.display_name}</span>
    </>
  ) : (
    <Empty />
  );

  const deadlineContent = deadline ? (
    <>
      <CalendarIcon className="size-3.5 text-[#9a9a9a]" />
      <span>{deadline}</span>
    </>
  ) : (
    <Empty />
  );

  // ── Render ───────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-1.5">
        <Row label="Status">{statusContent}</Row>
        <Row label="Priority">{priorityContent}</Row>
        <Row label="Department">{departmentContent}</Row>
        <Row label="Area">{areaContent}</Row>
        <Row label="Assignee">{assigneeContent}</Row>
        <Row label="Deadline">{deadlineContent}</Row>
      </div>
    );
  }

  // Admin: each row is a popover trigger.
  return (
    <div className="flex flex-col gap-1.5" data-saving={saving ?? undefined}>
      <Row label="Status">
        <PropertyPopover<TaskStatus>
          value={task.status}
          options={statusOptions}
          ariaLabel="Change status"
          onSelect={(next) => next && update('status', next)}
        >
          {statusContent}
        </PropertyPopover>
      </Row>

      <Row label="Priority">
        <PropertyPopover<Priority>
          value={(task.priority ?? null) as Priority | null}
          options={priorityOptions}
          ariaLabel="Change priority"
          onSelect={(next) => next && update('priority', next)}
        >
          {priorityContent}
        </PropertyPopover>
      </Row>

      <Row label="Department">
        <PropertyPopover<string>
          value={(task.department ?? null) as string | null}
          options={departmentOptions}
          ariaLabel="Change department"
          onSelect={(next) => next && update('department', next)}
        >
          {departmentContent}
        </PropertyPopover>
      </Row>

      <Row label="Area">
        <PropertyPopover<string>
          value={task.area_id ?? null}
          options={areaOptions}
          ariaLabel="Change area"
          allowClear
          onSelect={(next) => update('area_id', next ?? undefined)}
        >
          {areaContent}
        </PropertyPopover>
      </Row>

      <Row label="Assignee">
        <PropertyPopover<string>
          value={task.assignee_id ?? null}
          options={assigneeOptions}
          ariaLabel="Change assignee"
          allowClear
          onSelect={(next) => {
            const nextAssignee = next ? team.find((p) => p.id === next) ?? null : null;
            update('assignee_id', next ?? undefined, { assignee: nextAssignee });
          }}
        >
          {assigneeContent}
        </PropertyPopover>
      </Row>

      <Row label="Deadline">
        <DatePopover
          value={task.deadline ?? null}
          ariaLabel="Change deadline"
          onChange={(next) => update('deadline', next ?? undefined)}
        >
          {deadlineContent}
        </DatePopover>
      </Row>
    </div>
  );
}
