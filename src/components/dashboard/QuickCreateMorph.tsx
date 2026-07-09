'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { LoaderCircle, Plus, X } from 'lucide-react';
import { createTask } from '@/lib/dashboard-actions';
import { issueCreatedToast } from '@/components/dashboard/tasks/issueCreatedToast';
import type { Department, Priority, TaskStatus } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { PriorityIcon, PRIORITIES, PRIORITY_COLOR } from '@/components/dashboard/tasks/PriorityIcon';
import { PropertyPopover, type PropertyOption } from '@/components/dashboard/tasks/PropertyPopover';
import { StatusDot } from '@/components/dashboard/tasks/StatusDot';

interface QuickCreateMorphProps {
  className?: string;
  onCreated?: () => void;
  onOpenChange?: (open: boolean) => void;
}

const DEPARTMENT_COLOR: Record<Department, string> = {
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

const STATUS_OPTIONS: PropertyOption<TaskStatus>[] = TASK_STATUSES.map((status) => ({
  value: status,
  label: status,
  leading: <StatusDot status={status} size="sm" />,
}));

const PRIORITY_OPTIONS: PropertyOption<Priority>[] = PRIORITIES.map((priority) => ({
  value: priority,
  label: priority,
  leading: (
    <PriorityIcon
      level={priority}
      className="size-3"
      style={{ color: PRIORITY_COLOR[priority] }}
    />
  ),
}));

const DEPARTMENT_OPTIONS: PropertyOption<Department>[] = DEPARTMENTS.map((department) => ({
  value: department,
  label: department,
  leading: (
    <span
      className="inline-block size-2 rounded-sm"
      style={{ backgroundColor: DEPARTMENT_COLOR[department] }}
    />
  ),
}));

function metaChipClass() {
  return [
    'inline-flex h-6 min-w-[30px] cursor-pointer select-none items-center justify-center gap-1.5 rounded-full bg-black/[0.025] px-2 text-[12px] leading-4 text-[#777777]',
    'ring-1 ring-inset ring-black/[0.035] transition-[background-color,color,scale] duration-150 ease-out',
    'hover:bg-black/[0.055] hover:text-[#222222] active:scale-[0.96]',
  ].join(' ');
}

const QUICK_META_POPOVER = {
  panelWidth: 156,
  panelClassName:
    'z-[200] origin-top-left overflow-hidden rounded-[14px] bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.055]',
  optionClassName:
    'flex h-7 w-full items-center gap-2 rounded-[10px] px-2 text-left transition-colors duration-150 ease-out hover:bg-black/[0.045]',
  labelClassName: 'flex-1 truncate text-[12px] leading-4 tracking-[-0.1px] text-[#242424]',
  leadingClassName: 'flex size-3 shrink-0 items-center justify-center',
} as const;

export function QuickCreateMorph({
  className = '',
  onCreated,
  onOpenChange,
}: QuickCreateMorphProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Todo');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [department, setDepartment] = useState<Department>('Coding');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  function setMorphOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setError(null);
  }

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-property-popover-panel="true"]')) {
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMorphOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) setMorphOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, isPending]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name || isPending) return;

    setError(null);
    startTransition(async () => {
      try {
        const created = await createTask({
          name,
          description: description.trim() || undefined,
          status,
          priority,
          department,
        });
        issueCreatedToast(created);
        setTitle('');
        setDescription('');
        setMorphOpen(false);
        onCreated?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create issue');
      }
    });
  }

  const canSubmit = title.trim().length > 0 && !isPending;

  return (
    <div className={`create-morph-anchor ${className}`}>
      <div
        ref={rootRef}
        data-testid="Create morph"
        className="t-morph create-morph"
        data-open={open ? 'true' : 'false'}
      >
        <form
          data-testid="Quick add menu"
          className="t-morph-menu create-morph-menu"
          aria-hidden={!open}
          onSubmit={handleSubmit}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] leading-[18px] tracking-[-0.22px] text-[#1a1a1a]">
                Quick add
              </p>
              <div className="mt-2 flex max-w-[244px] flex-wrap items-center gap-1">
                <PropertyPopover<TaskStatus>
                  value={status}
                  options={STATUS_OPTIONS}
                  ariaLabel="Status"
                  onSelect={(next) => next && setStatus(next)}
                  triggerClassName={metaChipClass()}
                  {...QUICK_META_POPOVER}
                >
                  <StatusDot status={status} size="sm" />
                  <span className="truncate">{status}</span>
                </PropertyPopover>
                <PropertyPopover<Priority>
                  value={priority}
                  options={PRIORITY_OPTIONS}
                  ariaLabel="Priority"
                  onSelect={(next) => next && setPriority(next)}
                  triggerClassName={metaChipClass()}
                  {...QUICK_META_POPOVER}
                >
                  <PriorityIcon
                    level={priority}
                    className="size-3"
                    style={{ color: PRIORITY_COLOR[priority] }}
                  />
                  <span className="truncate">{priority}</span>
                </PropertyPopover>
                <PropertyPopover<Department>
                  value={department}
                  options={DEPARTMENT_OPTIONS}
                  ariaLabel="Department"
                  onSelect={(next) => next && setDepartment(next)}
                  triggerClassName={metaChipClass()}
                  align="end"
                  {...QUICK_META_POPOVER}
                >
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ backgroundColor: DEPARTMENT_COLOR[department] }}
                  />
                  <span className="truncate">{department}</span>
                </PropertyPopover>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close quick add"
              tabIndex={open ? 0 : -1}
              onClick={() => !isPending && setMorphOpen(false)}
              className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[#8a8a8a] transition-[background-color,color,scale] duration-150 ease-out hover:bg-black/[0.04] hover:text-[#2a2a2a] active:scale-[0.96]"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Issue title"
            aria-label="Issue title"
            tabIndex={open ? 0 : -1}
            className="mt-4 h-9 w-full rounded-[14px] bg-[#f6f6f6] px-3 text-[14px] leading-5 tracking-[-0.18px] text-[#111111] outline-none ring-1 ring-inset ring-black/[0.05] transition-[background-color,box-shadow] duration-150 ease-out placeholder:text-[#a3a3a3] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,122,255,0.09)] focus:ring-[#0d7aff]/30"
          />

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a note..."
            aria-label="Description"
            tabIndex={open ? 0 : -1}
            rows={2}
            className="mt-2 h-[54px] w-full resize-none rounded-[14px] bg-[#f6f6f6] px-3 py-2 text-[13px] leading-5 tracking-[-0.12px] text-[#2a2a2a] outline-none ring-1 ring-inset ring-black/[0.05] transition-[background-color,box-shadow] duration-150 ease-out placeholder:text-[#a3a3a3] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,122,255,0.09)] focus:ring-[#0d7aff]/30"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {error ? (
                <p className="truncate text-[12px] leading-4 text-[#dc2626]" role="alert">
                  {error}
                </p>
              ) : (
                <p className="text-[12px] leading-4 text-[#8a8a8a]">Press Enter to create</p>
              )}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              tabIndex={open ? 0 : -1}
              data-testid="Submit issue"
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-[#111111] px-3.5 text-[13px] leading-4 tracking-[-0.16px] text-white transition-[background-color,opacity,scale] duration-150 ease-out hover:bg-[#2a2a2a] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-[#111111] disabled:active:scale-100"
            >
              {isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : 'Create'}
            </button>
          </div>
        </form>

        <button
          type="button"
          className="t-morph-plus create-morph-plus"
          aria-expanded={open}
          aria-hidden={open}
          aria-label="Create"
          tabIndex={open ? -1 : 0}
          onClick={(event) => {
            event.stopPropagation();
            setMorphOpen(!open);
          }}
        >
          <Plus className="size-[15px]" strokeWidth={2.25} aria-hidden />
          <span>Create</span>
        </button>
      </div>
    </div>
  );
}
