/* ─────────────────────────────────────────────────────────
 * MilestoneEditPopover — edit a milestone and the tasks it links to.
 *
 * Admin clicks any milestone row → portaled popover with:
 *   • Name (text)
 *   • Target date (native date input)
 *   • Linked tasks (multi-select checkbox list of all project tasks)
 *   • Delete (two-step inline confirm) | Cancel | Save
 *
 * Lazy-fetches the milestone's current linked task ids on open.
 * Save diffs against the original and issues batched insert/delete on
 * `task_milestone` plus an `update` on `milestones`.
 *
 * RLS enforces admin-only on both tables; the parent gates the trigger
 * behind isAdmin for UX, not security.
 *
 * Portal pattern matches the other tasks-board popovers (PropertyPopover,
 * AssigneePopover, MilestonePopover) so the panel escapes the rail's
 * overflow-hidden card.
 * ───────────────────────────────────────────────────────── */

'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, Trash2 } from 'lucide-react';
import type { Milestone, MilestoneHealth, TaskWithAssignee } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import {
  MilestoneHealthBadge,
  HEALTH_LEVELS,
  HEALTH_LABEL,
} from './MilestoneHealthBadge';

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };
const PANEL_WIDTH = 320;
const GAP = 4;
const EDGE = 8;

type Coords = { left: number; top: number };

function computeCoords(rect: DOMRect, panelHeight: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Right-align with the trigger (milestone rows live in the rail's right column).
  let left = rect.right - PANEL_WIDTH;
  if (left + PANEL_WIDTH + EDGE > vw) left = vw - PANEL_WIDTH - EDGE;
  if (left < EDGE) left = EDGE;

  let top = rect.bottom + GAP;
  if (top + panelHeight + EDGE > vh) {
    const above = rect.top - GAP - panelHeight;
    top = above >= EDGE ? above : Math.max(EDGE, vh - panelHeight - EDGE);
  }
  return { left, top };
}

function diffSets(prev: Set<string>, next: Set<string>) {
  const added: string[] = [];
  const removed: string[] = [];
  next.forEach((id) => {
    if (!prev.has(id)) added.push(id);
  });
  prev.forEach((id) => {
    if (!next.has(id)) removed.push(id);
  });
  return { added, removed };
}

export function MilestoneEditPopover({
  milestone,
  allTasks,
  onSaved,
  onDeleted,
  onLinksChanged,
  ariaLabel,
  children,
  triggerClassName,
}: {
  milestone: Milestone;
  allTasks: TaskWithAssignee[];
  /** Called after a successful name/date update. */
  onSaved: (m: Milestone) => void;
  /** Called after a successful delete. */
  onDeleted: (id: string) => void;
  /**
   * Called whenever the milestone's task-link set changes (during a save,
   * not as the user toggles checkboxes). Parent uses this to keep its
   * per-task `taskMilestones` lists in sync if the currently-selected task
   * was added or removed.
   */
  onLinksChanged?: (milestoneId: string, linkedTaskIds: string[]) => void;
  ariaLabel: string;
  children: ReactNode;
  /** Override the trigger button styles. Defaults to a full-width row look. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Edit form state — synced when popover opens.
  const [name, setName] = useState(milestone.name);
  const [targetDate, setTargetDate] = useState(milestone.target_date ?? '');
  const [health, setHealth] = useState<MilestoneHealth | null>(milestone.health ?? null);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [originalLinkedIds, setOriginalLinkedIds] = useState<Set<string>>(new Set());
  const [loadingLinks, setLoadingLinks] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setMounted(true), []);

  // Lazy-fetch current links + reset form whenever the popover opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setName(milestone.name);
    setTargetDate(milestone.target_date ?? '');
    setHealth(milestone.health ?? null);
    setError(null);
    setConfirmDelete(false);
    setLoadingLinks(true);
    const supabase = createClient();
    supabase
      .from('task_milestone')
      .select('task_id')
      .eq('milestone_id', milestone.id)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setLoadingLinks(false);
          return;
        }
        const ids = new Set<string>((data ?? []).map((r) => r.task_id as string));
        setLinkedIds(ids);
        setOriginalLinkedIds(ids);
        setLoadingLinks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, milestone.id, milestone.name, milestone.target_date, milestone.health]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const h = panelRef.current?.offsetHeight ?? 360;
      setCoords(computeCoords(trigger.getBoundingClientRect(), h));
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
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

  function toggleTask(taskId: string) {
    setLinkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const updates: Record<string, string | null> = {};
    if (trimmed !== milestone.name) updates.name = trimmed;
    const nextDate = targetDate || null;
    if (nextDate !== (milestone.target_date ?? null)) updates.target_date = nextDate;
    const nextHealth = health ?? null;
    if (nextHealth !== (milestone.health ?? null)) updates.health = nextHealth;

    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await supabase
        .from('milestones')
        .update(updates)
        .eq('id', milestone.id);
      if (updErr) {
        setSaving(false);
        setError(updErr.message);
        return;
      }
    }

    const { added, removed } = diffSets(originalLinkedIds, linkedIds);

    if (added.length > 0) {
      const rows = added.map((task_id) => ({ task_id, milestone_id: milestone.id }));
      const { error: addErr } = await supabase.from('task_milestone').insert(rows);
      if (addErr) {
        setSaving(false);
        setError(addErr.message);
        return;
      }
    }

    if (removed.length > 0) {
      const { error: delErr } = await supabase
        .from('task_milestone')
        .delete()
        .eq('milestone_id', milestone.id)
        .in('task_id', removed);
      if (delErr) {
        setSaving(false);
        setError(delErr.message);
        return;
      }
    }

    const next: Milestone = {
      ...milestone,
      name: trimmed,
      target_date: nextDate ?? undefined,
      health: nextHealth,
    };
    onSaved(next);
    if (added.length > 0 || removed.length > 0) {
      onLinksChanged?.(milestone.id, Array.from(linkedIds));
    }
    setSaving(false);
    setOpen(false);
  }

  async function destroy() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from('milestones')
      .delete()
      .eq('id', milestone.id);
    if (delErr) {
      setSaving(false);
      setError(delErr.message);
      return;
    }
    onDeleted(milestone.id);
    setSaving(false);
    setOpen(false);
  }

  const dirty = useMemo(() => {
    if (name.trim() !== milestone.name) return true;
    if ((targetDate || null) !== (milestone.target_date ?? null)) return true;
    if ((health ?? null) !== (milestone.health ?? null)) return true;
    const { added, removed } = diffSets(originalLinkedIds, linkedIds);
    return added.length > 0 || removed.length > 0;
  }, [
    name,
    targetDate,
    health,
    originalLinkedIds,
    linkedIds,
    milestone.name,
    milestone.target_date,
    milestone.health,
  ]);

  const panel = (
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={panelRef}
          key="milestone-edit-panel"
          role="dialog"
          aria-label={ariaLabel}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduce ? { duration: 0 } : SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: PANEL_WIDTH }}
          className="z-[200] origin-top-right overflow-hidden rounded-lg bg-white p-3 shadow-seeko-pop"
        >
          {/* Name */}
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Milestone name"
            className="block w-full rounded-md border border-black/[0.06] bg-white px-2.5 py-1.5 text-[13px] text-[#1a1a1a] placeholder:text-[#b8b8b8] transition-colors focus:border-[#0d7aff] focus:outline-none"
            maxLength={120}
          />

          {/* Date */}
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-1.5 block w-full rounded-md border border-black/[0.06] bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums text-[#1a1a1a] transition-colors focus:border-[#0d7aff] focus:outline-none"
          />

          {/* Health */}
          <div className="mt-3">
            <div className="px-0.5 pb-1 text-[11px] font-medium text-[#9a9a9a]">
              Health
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setHealth(null)}
                className={
                  'rounded-md border px-2 py-1 text-[11.5px] transition-colors ' +
                  (health == null
                    ? 'border-[#1a1a1a]/15 bg-[#f5f5f5] text-[#1a1a1a]'
                    : 'border-transparent text-[#9a9a9a] hover:bg-black/[0.03]')
                }
              >
                None
              </button>
              {HEALTH_LEVELS.map((h) => {
                const active = health === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHealth(h)}
                    className={
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-colors ' +
                      (active
                        ? 'border-[#1a1a1a]/15 bg-[#f5f5f5] text-[#1a1a1a]'
                        : 'border-transparent text-[#6a6a6a] hover:bg-black/[0.03]')
                    }
                  >
                    <MilestoneHealthBadge level={h} className="size-3" />
                    {HEALTH_LABEL[h]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Linked tasks */}
          <div className="mt-3">
            <div className="px-0.5 pb-1 text-[11px] font-medium text-[#9a9a9a]">
              Linked tasks
            </div>
            {loadingLinks ? (
              <div className="px-2 py-2 text-[12px] text-[#9a9a9a]">Loading…</div>
            ) : allTasks.length === 0 ? (
              <div className="px-2 py-2 text-[12px] text-[#9a9a9a]">No tasks in this project.</div>
            ) : (
              <div className="scrollbar-paper max-h-[180px] overflow-y-auto rounded-md">
                {allTasks.map((t) => {
                  const checked = linkedIds.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-black/[0.03]"
                    >
                      <span
                        className={
                          'flex size-3.5 shrink-0 items-center justify-center rounded-[3.5px] border transition-colors ' +
                          (checked
                            ? 'border-[#0d7aff] bg-[#0d7aff]'
                            : 'border-black/15 bg-white')
                        }
                      >
                        {checked && <Check className="size-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTask(t.id)}
                        className="sr-only"
                      />
                      {t.task_number != null && (
                        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-[#9a9a9a]">
                          {t.task_number}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#1a1a1a]">
                        {t.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="mt-2 text-[11.5px] text-[#f87171]">{error}</p>}

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between gap-2">
            {confirmDelete ? (
              <button
                type="button"
                disabled={saving}
                onClick={destroy}
                className="flex items-center gap-1.5 rounded-md bg-[#f87171] px-2 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-[#ef4444] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="size-3" />
                {saving ? 'Deleting…' : 'Confirm delete'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] text-[#9a9a9a] transition-colors hover:bg-black/[0.04] hover:text-[#f87171]"
              >
                <Trash2 className="size-3" />
                Delete
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-[11.5px] text-[#808080] transition-colors hover:bg-black/[0.04] hover:text-[#0d0d0d]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !dirty || !name.trim()}
                onClick={save}
                className="rounded-md bg-[#0d7aff] px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-[#0964d6] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#e6e6e6] disabled:text-[#9a9a9a]"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={
          triggerClassName ??
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#2a2a2a] transition-colors hover:bg-black/[0.04]'
        }
      >
        {children}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
