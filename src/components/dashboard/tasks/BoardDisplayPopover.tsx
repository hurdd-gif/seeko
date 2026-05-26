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
    ? 'flex size-9 items-center justify-center rounded-full bg-black/[0.05] text-[#3a3a3a] transition'
    : 'flex size-9 items-center justify-center rounded-full text-[#9a9a9a] transition hover:bg-black/[0.04] hover:text-[#505050]';

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
            className="group/menu absolute right-0 top-[calc(100%+4px)] z-[100] w-56 origin-top-right overflow-hidden rounded-2xl bg-white p-1 shadow-seeko"
            role="menu"
            aria-label="Display options"
          >
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-[12px] font-medium text-[#7a7a7a]">Display</span>
            </div>

            <div className="mx-3 h-px bg-[#0000000d]" />

            <div className="py-1">
              <div className="px-3 pt-1.5 pb-1 text-[11.5px] font-medium text-[#9a9a9a]">
                Show columns
              </div>
              <p className="px-3 pb-1.5 text-[11.5px] leading-[1.4] text-[#a8a8a8]">
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
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left transition-[color,background-color,opacity] ${
                      auto
                        ? 'cursor-default opacity-60'
                        : 'opacity-100 group-hover/menu:opacity-20 hover:bg-[#0000000a] hover:opacity-100!'
                    }`}
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      <StatusDot status={s} size="sm" />
                    </span>
                    <span className="flex-1 truncate text-[12.5px] text-[#1a1a1a]">{s}</span>
                    <span className="text-[11px] tabular-nums text-[#a8a8a8]">
                      {countsByStatus[s] ?? 0}
                    </span>
                    <span
                      className={
                        checked
                          ? 'flex size-3.5 shrink-0 items-center justify-center rounded-[4px] bg-[#0d7aff] text-white'
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
