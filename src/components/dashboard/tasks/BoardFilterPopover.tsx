/* ─────────────────────────────────────────────────────────
 * BoardFilterPopover — Filter icon trigger + floating menu.
 *
 * Filter state shape (URL-encoded as ?status=…&priority=…&department=…&assignee=…):
 *   { status: TaskStatus[]; priority: Priority[]; department: string[]; assignee: string[] }
 *
 * Visual: dense menu — Linear-style — not a dialog. Sections
 * separated by inset hairlines, compact rows, checkbox at trailing edge.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   trigger button highlights (bg-surface-1 shadow-seeko if active)
 *    0ms   panel opens with opacity + 4px slide
 *  exit    fade + 4px slide back
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Filter, Check } from 'lucide-react';
import type { Priority, Profile, TaskStatus } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { PriorityIcon, PRIORITY_COLOR } from './PriorityIcon';

export type BoardFilterState = {
  status: TaskStatus[];
  priority: Priority[];
  department: string[];
  assignee: string[]; // profile.id
};

export const EMPTY_FILTER: BoardFilterState = {
  status: [],
  priority: [],
  department: [],
  assignee: [],
};

const PRIORITIES: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };

function activeCount(f: BoardFilterState): number {
  return f.status.length + f.priority.length + f.department.length + f.assignee.length;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function BoardFilterPopover({
  filter,
  onChange,
  team,
}: {
  filter: BoardFilterState;
  onChange: (next: BoardFilterState) => void;
  team: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const count = activeCount(filter);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerClass = (count > 0 || open)
    ? 'flex size-9 items-center justify-center rounded-full bg-wash-5 text-ink transition-[background-color,color,transform] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:active:scale-[0.97]'
    : 'flex size-9 items-center justify-center rounded-full text-ink-muted-strong transition-[background-color,color,transform] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-wash-4 hover:text-ink motion-safe:active:scale-[0.97]';

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Filter tasks"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <Filter className="size-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-seeko-accent px-1 text-[10px] font-medium leading-none text-white tabular-nums ring-2 ring-[#eeeeee] dark:ring-[oklch(0.240_0_0)]">
            {count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduce ? { duration: 0 } : SPRING}
            className="group/menu absolute right-0 top-[calc(100%+4px)] z-[100] w-56 origin-top-right overflow-hidden rounded-[14px] bg-overlay p-1 shadow-seeko-pop"
            role="menu"
            aria-label="Filter tasks"
          >
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-[12px] font-medium text-ink-muted">Filter</span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(EMPTY_FILTER)}
                  className="text-[12px] text-ink-muted transition-colors hover:text-ink-title"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="mx-3 h-px bg-wash-5" />

            <div className="max-h-[420px] overflow-y-auto [color-scheme:light] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.18)_transparent] dark:[color-scheme:dark] dark:[scrollbar-color:rgba(255,255,255,0.22)_transparent]">
              <FilterGroup title="Status">
                {TASK_STATUSES.map((s) => (
                  <FilterRow
                    key={s}
                    label={s}
                    leading={<StatusDot status={s} size="sm" />}
                    checked={filter.status.includes(s)}
                    onToggle={() => onChange({ ...filter, status: toggle(filter.status, s) })}
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Priority">
                {PRIORITIES.map((p) => (
                  <FilterRow
                    key={p}
                    label={p}
                    leading={
                      <PriorityIcon
                        level={p}
                        className="size-3.5"
                        style={{ color: PRIORITY_COLOR[p] }}
                      />
                    }
                    checked={filter.priority.includes(p)}
                    onToggle={() => onChange({ ...filter, priority: toggle(filter.priority, p) })}
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Department">
                {DEPARTMENTS.map((d) => (
                  <FilterRow
                    key={d}
                    label={d}
                    checked={filter.department.includes(d)}
                    onToggle={() => onChange({ ...filter, department: toggle(filter.department, d) })}
                  />
                ))}
              </FilterGroup>

              {team.length > 0 && (
                <FilterGroup title="Assignee">
                  {team.map((p) => (
                    <FilterRow
                      key={p.id}
                      label={p.display_name ?? 'Unnamed'}
                      checked={filter.assignee.includes(p.id)}
                      onToggle={() => onChange({ ...filter, assignee: toggle(filter.assignee, p.id) })}
                    />
                  ))}
                </FilterGroup>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative py-1 [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:bottom-0 [&:not(:last-child)]:after:left-3 [&:not(:last-child)]:after:right-3 [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:bg-wash-5">
      <div className="px-3 pt-1.5 pb-1 text-[11.5px] font-medium text-ink-faint">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function FilterRow({
  label,
  leading,
  checked,
  onToggle,
}: {
  label: string;
  leading?: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-1.5 text-left text-ink-body opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-wash-4 hover:text-ink-title hover:opacity-100!"
    >
      {leading && <span className="flex size-3.5 shrink-0 items-center justify-center">{leading}</span>}
      <span className="flex-1 truncate text-[13px]">{label}</span>
      <span
        className={
          checked
            ? 'flex size-3.5 shrink-0 items-center justify-center rounded-[4px] bg-seeko-accent text-white'
            : 'size-3.5 shrink-0 rounded-[4px] border border-black/[0.18]'
        }
      >
        {checked && <Check className="size-2.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
