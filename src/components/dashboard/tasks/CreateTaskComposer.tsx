/* CreateTaskComposer — Linear-style "New issue" composer.
 *
 * Centered modal. Title + description are a single editable surface (no
 * field labels — placeholders only). Properties are rounded-full pills
 * under the body that open the same PropertyPopover / DatePopover the
 * right rail uses. Defaults are pre-filled (Todo / Medium / Coding) so
 * the user can submit by only typing a title.
 *
 * Replaces the older CreateTaskModal form. Per-column "+" triggers pass
 * `defaultStatus` so the new task lands in the right bucket immediately.
 *
 * Keyboard:
 *   Esc          close (unless mid-submit)
 *   ⌘/Ctrl+Enter submit
 *
 * "Create more" toggle keeps the modal open after a successful submit so
 * the user can chain new tasks without closing/reopening. */

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   backdrop fades in (180ms ease-out)
 *    0ms   card scales 0.97 → 1 + fades in (spring, modal-weight)
 *   80ms   title input gets focus
 *   exit   card scale 1 → 0.94 + fades (160ms accelerate-out)
 *   +60ms  backdrop fades out (trails card by 60ms)
 * ───────────────────────────────────────────────────────── */

'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Maximize2, Calendar as CalendarIcon, Folder } from 'lucide-react';
import { createTask } from '@/app/(dashboard)/actions';
import type {
  Area,
  Department,
  Priority,
  Profile,
  TaskStatus,
} from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import {
  modalBackdropEntrance,
  modalCardEntrance,
} from '@/lib/motion';
import { PropertyPopover, type PropertyOption } from './PropertyPopover';
import { DatePopover } from './DatePopover';
import { StatusDot } from './StatusDot';
import { PriorityIcon, PRIORITIES, PRIORITY_COLOR } from './PriorityIcon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const DEPARTMENT_COLOR: Record<string, string> = {
  Coding: '#0d7aff',
  'Visual Art': '#93c5fd',
  'UI/UX': '#c4b5fd',
  Animation: '#fbbf24',
  'Asset Creation': '#f9a8d4',
};

const DEPARTMENTS: Department[] = [
  'Coding',
  'Visual Art',
  'UI/UX',
  'Animation',
  'Asset Creation',
];

function initial(name?: string | null) {
  return (name ?? '?').slice(0, 1).toUpperCase();
}

function formatDeadline(iso?: string | null) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Pill trigger class — applied directly to the PropertyPopover button so
 * the popover's own <button> IS the visible pill (no extra wrapping span,
 * no width:100% behaviour leaking from the row-style default). */
function pillClass(active: boolean) {
  return [
    'inline-flex h-[26px] min-w-[28px] cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-4 transition-colors',
    'ring-1 ring-inset ring-black/[0.07] hover:bg-black/[0.03]',
    active ? 'bg-white text-[#2a2a2a]' : 'bg-white text-[#7a7a7a]',
  ].join(' ');
}

export function CreateTaskComposer({
  open,
  onClose,
  team,
  areas,
  defaultStatus,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  team: Profile[];
  areas: Area[];
  /** Pre-fill status (e.g. from a per-column "+" trigger). */
  defaultStatus?: TaskStatus;
  /** Called after a successful insert — board can opt-in to a refetch. */
  onCreated?: () => void;
}) {
  const reduce = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // ── Form state ─────────────────────────────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? 'Todo');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [department, setDepartment] = useState<Department>('Coding');
  const [areaId, setAreaId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync status whenever the trigger column changes.
  useEffect(() => {
    if (open) setStatus(defaultStatus ?? 'Todo');
  }, [open, defaultStatus]);

  // Reset the entire form whenever the modal opens fresh.
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setPriority('Medium');
    setDepartment('Coding');
    setAreaId(null);
    setAssigneeId(null);
    setDeadline(null);
    setError(null);
  }, [open]);

  // Focus title shortly after enter — avoids fighting the entrance anim.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  // Keyboard: Esc closes, ⌘/Ctrl+Enter submits.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) {
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPending, name, description, status, priority, department, areaId, assigneeId, deadline]);

  // Auto-grow the title textarea so multi-line titles don't clip.
  function resizeTitle(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // ── Option lists ──────────────────────────────────────────
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
        leading: (
          <PriorityIcon
            level={p}
            className="size-3.5"
            style={{ color: PRIORITY_COLOR[p] }}
          />
        ),
      })),
    [],
  );

  const departmentOptions: PropertyOption<Department>[] = useMemo(
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

  // ── Submit ────────────────────────────────────────────────
  function submit() {
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await createTask({
          name: trimmed,
          department,
          priority,
          status,
          area_id: areaId ?? undefined,
          assignee_id: assigneeId ?? undefined,
          deadline: deadline ?? undefined,
          description: description.trim() || undefined,
        });
        onCreated?.();
        if (createMore) {
          // Reset just the title/description, keep property selections so
          // the user can chain several similar tasks in a row.
          setName('');
          setDescription('');
          titleRef.current?.focus();
        } else {
          onClose();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create task');
      }
    });
  }

  // ── Render ────────────────────────────────────────────────
  const assignee = team.find((p) => p.id === assigneeId);
  const area = areas.find((a) => a.id === areaId);
  const deadlineText = formatDeadline(deadline);
  const canSubmit = name.trim().length > 0 && !isPending;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="composer-backdrop"
          {...modalBackdropEntrance(reduce ?? null)}
          onMouseDown={(e) => {
            // Click on the backdrop (not the card) closes.
            if (e.target === e.currentTarget && !isPending) onClose();
          }}
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
        >
          <motion.div
            key="composer-card"
            role="dialog"
            aria-modal="true"
            aria-label="New issue"
            {...modalCardEntrance(reduce ?? null)}
            style={{ width: 'min(720px, calc(100vw - 32px))' }}
            className="flex flex-col overflow-hidden rounded-[18px] bg-white shadow-seeko-pop ring-1 ring-black/[0.06]"
          >
            {/* ── Header ───────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[#f1f1f0] pl-1.5 pr-2 text-[11.5px] font-medium text-[#3a3a3a]">
                <span className="inline-block size-2 rounded-sm bg-[#0d7aff]" />
                SEEKO
              </span>
              <span className="text-[12.5px] text-[#9a9a9a]">›</span>
              <span className="text-[12.5px] font-medium text-[#2a2a2a]">New issue</span>
              <span className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Expand"
                  disabled
                  className="flex size-7 items-center justify-center rounded-full text-[#c5c5c5]"
                >
                  <Maximize2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => !isPending && onClose()}
                  className="flex size-7 items-center justify-center rounded-full text-[#9a9a9a] transition-colors hover:bg-black/[0.04] hover:text-[#3a3a3a]"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </div>

            {/* ── Body: title + description ─────────────────── */}
            <div className="flex flex-col gap-1 px-5 pb-2 pt-1">
              <textarea
                ref={titleRef}
                rows={1}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  resizeTitle(e.currentTarget);
                }}
                placeholder="Issue title"
                aria-label="Issue title"
                className="w-full resize-none border-0 bg-transparent text-[18px] font-semibold leading-6 tracking-[-0.012em] text-[#1a1a1a] placeholder:text-[#b8b8b8] focus:outline-none"
                style={{ height: 'auto' }}
              />
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description…"
                aria-label="Description"
                className="min-h-[80px] w-full resize-none border-0 bg-transparent text-[14px] leading-[22px] tracking-[-0.006em] text-[#3a3a3a] placeholder:text-[#b8b8b8] focus:outline-none"
              />
            </div>

            {/* ── Property pills row ────────────────────────── */}
            <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
              <PropertyPopover<TaskStatus>
                value={status}
                options={statusOptions}
                ariaLabel="Status"
                onSelect={(v) => v && setStatus(v)}
                triggerClassName={pillClass(true)}
              >
                <StatusDot status={status} size="sm" />
                {status}
              </PropertyPopover>

              <PropertyPopover<Priority>
                value={priority}
                options={priorityOptions}
                ariaLabel="Priority"
                onSelect={(v) => v && setPriority(v)}
                triggerClassName={pillClass(true)}
              >
                <PriorityIcon
                  level={priority}
                  className="size-3.5"
                  style={{ color: PRIORITY_COLOR[priority] }}
                />
                {priority}
              </PropertyPopover>

              <PropertyPopover<string>
                value={assigneeId}
                options={assigneeOptions}
                ariaLabel="Assignee"
                allowClear
                onSelect={(v) => setAssigneeId(v ?? null)}
                triggerClassName={pillClass(!!assignee)}
              >
                {assignee ? (
                  <>
                    <Avatar className="size-3.5">
                      <AvatarImage
                        src={assignee.avatar_url ?? undefined}
                        alt={assignee.display_name ?? ''}
                      />
                      <AvatarFallback className="bg-[#e5e5e5] text-[7px] font-medium text-[#505050]">
                        {initial(assignee.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="max-w-[120px] truncate">
                      {assignee.display_name ?? 'Unnamed'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-block size-3.5 rounded-full bg-[#e5e5e5]" />
                    Assignee
                  </>
                )}
              </PropertyPopover>

              <PropertyPopover<Department>
                value={department}
                options={departmentOptions}
                ariaLabel="Department"
                onSelect={(v) => v && setDepartment(v)}
                triggerClassName={pillClass(true)}
              >
                <span
                  className="inline-block size-2 rounded-sm"
                  style={{ backgroundColor: DEPARTMENT_COLOR[department] }}
                />
                {department}
              </PropertyPopover>

              <PropertyPopover<string>
                value={areaId}
                options={areaOptions}
                ariaLabel="Area"
                allowClear
                onSelect={(v) => setAreaId(v ?? null)}
                triggerClassName={pillClass(!!area)}
              >
                <Folder className="size-3.5" />
                {area?.name ?? 'Area'}
              </PropertyPopover>

              <DatePopover
                value={deadline}
                ariaLabel="Deadline"
                onChange={(v) => setDeadline(v ?? null)}
                triggerClassName={pillClass(!!deadline)}
              >
                <CalendarIcon className="size-3.5" />
                {deadlineText ?? 'Deadline'}
              </DatePopover>
            </div>

            {/* Separator above footer */}
            <div className="h-px bg-black/[0.06]" />

            {/* ── Footer: create-more toggle + submit ───────── */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                {error && (
                  <p className="truncate text-[12px] text-[#dc2626]" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#7a7a7a] select-none">
                  <span
                    role="switch"
                    aria-checked={createMore}
                    tabIndex={0}
                    onClick={() => setCreateMore((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setCreateMore((v) => !v);
                      }
                    }}
                    className={[
                      'relative inline-flex h-[14px] w-[24px] shrink-0 items-center rounded-full transition-colors',
                      createMore ? 'bg-[#0d7aff]' : 'bg-[#d4d4d4]',
                    ].join(' ')}
                  >
                    <span
                      className="absolute size-[10px] rounded-full bg-white shadow-sm transition-transform"
                      style={{
                        transform: createMore ? 'translateX(12px)' : 'translateX(2px)',
                      }}
                    />
                  </span>
                  Create more
                </label>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className={[
                    'inline-flex h-7 items-center rounded-full px-3 text-[12.5px] font-medium transition-colors',
                    canSubmit
                      ? 'bg-[#0d7aff] text-white hover:bg-[#0a6cdf] active:bg-[#0860c8]'
                      : 'cursor-not-allowed bg-[#e6e6e6] text-[#9a9a9a]',
                  ].join(' ')}
                >
                  {isPending ? 'Creating…' : 'Create issue'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
