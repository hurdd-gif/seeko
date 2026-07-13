/* ─────────────────────────────────────────────────────────
 * BoardDisplayPopover — SlidersHorizontal trigger + floating panel.
 *
 * Controls column visibility: which status columns are shown even
 * when empty. Empty columns auto-hide unless the user explicitly
 * pins them visible here.
 *
 * Visual: floating shadow-seeko card, same vocabulary as the filter
 * popover. Active state on trigger when any non-default toggles
 * are in effect.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { SlidersHorizontal, Check } from 'lucide-react';
import type { TaskStatus } from '@/lib/types';
import { TASK_STATUSES } from '@/lib/types';
import { StatusDot } from './StatusDot';

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };

export function BoardDisplayPopover({
  pinnedVisible,
  onTogglePinned,
  countsByStatus,
}: {
  pinnedVisible: Set<TaskStatus>;
  onTogglePinned: (status: TaskStatus) => void;
  countsByStatus: Record<TaskStatus, number>;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasPinned = pinnedVisible.size > 0;

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

  const triggerClass = (hasPinned || open)
    ? 'flex size-9 items-center justify-center rounded-full bg-wash-5 text-ink transition-[background-color,color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]'
    : 'flex size-9 items-center justify-center rounded-full text-ink-muted-strong transition-[background-color,color,transform] duration-150 ease-out hover:bg-wash-4 hover:text-ink motion-safe:active:scale-[0.97]';

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Display options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <SlidersHorizontal className="size-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduce ? { duration: 0 } : SPRING}
            className="group/menu absolute right-0 top-[calc(100%+4px)] z-[100] w-56 origin-top-right overflow-hidden rounded-[14px] bg-surface-1 p-1 shadow-seeko-pop"
            role="menu"
            aria-label="Display options"
          >
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-[12px] font-medium text-ink-muted">Display</span>
            </div>

            <div className="mx-3 h-px bg-wash-5" />

            <div className="py-1">
              <div className="px-3 pt-1.5 pb-1 text-[11.5px] font-medium text-ink-faint">
                Show columns
              </div>
              <p className="px-3 pb-1.5 text-[11.5px] leading-[1.4] text-[#a8a8a8] dark:text-ink-muted">
                Empty columns hide by default. Pin one to keep it visible.
              </p>
              {TASK_STATUSES.map((s) => {
                const pinned = pinnedVisible.has(s);
                const auto = countsByStatus[s] > 0;
                const checked = pinned || auto;
                return (
                  <button
                    key={s}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    onClick={() => onTogglePinned(s)}
                    disabled={auto}
                    title={auto ? 'Always visible while tasks exist' : undefined}
                    className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-1.5 text-left text-ink-body transition-[color,background-color,opacity] ${
                      auto
                        ? 'cursor-default opacity-60'
                        : 'opacity-100 group-hover/menu:opacity-20 hover:bg-wash-4 hover:text-ink-title hover:opacity-100!'
                    }`}
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      <StatusDot status={s} size="sm" />
                    </span>
                    <span className="flex-1 truncate text-[13px]">{s}</span>
                    <span className="text-[11px] tabular-nums text-[#a8a8a8] dark:text-ink-muted">
                      {countsByStatus[s] ?? 0}
                    </span>
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
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
