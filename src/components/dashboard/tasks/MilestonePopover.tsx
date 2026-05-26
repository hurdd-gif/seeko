/* ─────────────────────────────────────────────────────────
 * MilestonePopover — link existing project milestones to a task
 * and/or create a new project milestone.
 *
 * Two modes, decided by `taskId`:
 *   • taskId set    → check rows link/unlink the milestone to that task.
 *                     Inline composer creates a project-level milestone
 *                     and auto-links it.
 *   • taskId omitted → no link list. Composer creates a project-level
 *                     milestone, unattached.
 *
 * Admin-only (RLS enforces `profiles.is_admin` for milestones +
 * task_milestone CRUD; activity_log is written by triggers).
 *
 * Portal pattern matches PropertyPopover/AssigneePopover so the panel
 * escapes the rail's overflow-hidden card stacks.
 * ───────────────────────────────────────────────────────── */

'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Flag, Plus, Check } from 'lucide-react';
import type { Milestone } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 30 };
const PANEL_WIDTH = 288;
const GAP = 4;
const EDGE = 8;

type Coords = { left: number; top: number };

function computeCoords(rect: DOMRect, panelHeight: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Right-align with the trigger (the `+` sits on a section header's right edge).
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

function formatDate(iso?: string | null) {
  if (!iso) return null;
  // DATE columns parse as UTC midnight via `new Date('YYYY-MM-DD')` — shift
  // to local components so the rendered day matches the picker value.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MilestonePopover({
  taskId,
  projectMilestones,
  linkedMilestoneIds,
  onMilestoneCreated,
  onLinkToggled,
  ariaLabel,
  children,
}: {
  /** When set, the popover offers link/unlink against this task. */
  taskId?: string | null;
  /** All milestones in the project (the link list draws from this). */
  projectMilestones: Milestone[];
  /** Ids of milestones currently linked to `taskId` (for the checked state). */
  linkedMilestoneIds?: string[];
  /** Called after a new milestone row is created (and auto-linked if taskId is set). */
  onMilestoneCreated: (m: Milestone, linked: boolean) => void;
  /** Called after a link/unlink toggle persists (task mode only). */
  onLinkToggled?: (milestoneId: string, linked: boolean) => void;
  ariaLabel: string;
  /** Trigger content (usually the `+` glyph). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row pending toggle ids
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const linkedSet = useMemo(
    () => new Set(linkedMilestoneIds ?? []),
    [linkedMilestoneIds],
  );

  useEffect(() => setMounted(true), []);

  // Reset composer when the popover closes.
  useEffect(() => {
    if (!open) {
      setComposerOpen(false);
      setName('');
      setTargetDate('');
      setError(null);
    }
  }, [open]);

  // Autofocus name field when the composer expands.
  useEffect(() => {
    if (composerOpen) {
      const id = requestAnimationFrame(() => nameInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [composerOpen]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const h = panelRef.current?.offsetHeight ?? 320;
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

  async function toggleLink(milestoneId: string) {
    if (!taskId) return;
    const isLinked = linkedSet.has(milestoneId);
    setTogglingId(milestoneId);
    const supabase = createClient();

    // Optimistic — fire callback first.
    onLinkToggled?.(milestoneId, !isLinked);

    const { error: err } = isLinked
      ? await supabase
          .from('task_milestone')
          .delete()
          .eq('task_id', taskId)
          .eq('milestone_id', milestoneId)
      : await supabase
          .from('task_milestone')
          .insert({ task_id: taskId, milestone_id: milestoneId });

    setTogglingId(null);
    if (err) {
      // Revert.
      onLinkToggled?.(milestoneId, isLinked);
      console.error('Failed to toggle milestone link:', err);
    }
  }

  async function submitNew(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const sortOrder = projectMilestones.length;

    const insertRow: {
      name: string;
      sort_order: number;
      target_date?: string;
    } = { name: trimmed, sort_order: sortOrder };
    if (targetDate) insertRow.target_date = targetDate;

    const { data: newRow, error: insertErr } = await supabase
      .from('milestones')
      .insert(insertRow)
      .select('id, name, target_date, area_id, sort_order, created_at')
      .single();

    if (insertErr || !newRow) {
      setSubmitting(false);
      setError(insertErr?.message ?? 'Failed to create');
      console.error('Failed to create milestone:', insertErr);
      return;
    }

    let linked = false;
    if (taskId) {
      const { error: linkErr } = await supabase
        .from('task_milestone')
        .insert({ task_id: taskId, milestone_id: newRow.id });
      if (linkErr) {
        // Created but didn't link — surface but still report creation.
        console.error('Created milestone but failed to link:', linkErr);
      } else {
        linked = true;
      }
    }

    onMilestoneCreated(newRow as Milestone, linked);
    setSubmitting(false);
    setName('');
    setTargetDate('');
    setComposerOpen(false);
  }

  const showLinkList = !!taskId && projectMilestones.length > 0;

  const panel = (
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={panelRef}
          key="milestone-panel"
          role="dialog"
          aria-label={ariaLabel}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduce ? { duration: 0 } : SPRING}
          style={{ position: 'fixed', left: coords.left, top: coords.top, width: PANEL_WIDTH }}
          className="z-[200] origin-top-right overflow-hidden rounded-lg bg-white p-1 shadow-seeko-pop"
        >
          {showLinkList && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#b0b0b0]">
                Link to task
              </div>
              <div className="max-h-[200px] overflow-y-auto [scrollbar-width:thin]">
                {projectMilestones.map((m) => {
                  const linked = linkedSet.has(m.id);
                  const pending = togglingId === m.id;
                  const date = formatDate(m.target_date);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={linked}
                      disabled={pending}
                      onClick={() => toggleLink(m.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        <Flag className="size-3.5 text-[#9a9a9a]" />
                      </span>
                      <span className="flex-1 truncate text-[12.5px] text-[#1a1a1a]">{m.name}</span>
                      {date && (
                        <span className="shrink-0 text-[11px] tabular-nums text-[#9a9a9a]">
                          {date}
                        </span>
                      )}
                      {linked && <Check className="size-3 text-[#0d7aff]" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              <div className="my-1 border-t border-black/[0.05]" />
            </>
          )}

          {/* Composer — toggle then inline form */}
          {!composerOpen ? (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-[#505050]">
                <Plus className="size-3.5" strokeWidth={2.25} />
              </span>
              <span className="flex-1 truncate text-[12.5px] text-[#1a1a1a]">New milestone</span>
            </button>
          ) : (
            <form onSubmit={submitNew} className="p-1.5">
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Milestone name"
                className="block w-full rounded-md border border-black/[0.08] bg-white px-2 py-1.5 text-[12.5px] text-[#1a1a1a] placeholder:text-[#b8b8b8] focus:border-[#0d7aff] focus:outline-none"
                maxLength={120}
              />
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1.5 block w-full rounded-md border border-black/[0.08] bg-white px-2 py-1.5 text-[12.5px] tabular-nums text-[#1a1a1a] focus:border-[#0d7aff] focus:outline-none"
              />
              {error && (
                <p className="mt-1.5 text-[11.5px] text-[#f87171]">{error}</p>
              )}
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setName('');
                    setTargetDate('');
                    setError(null);
                  }}
                  className="rounded-md px-2 py-1 text-[11.5px] text-[#808080] transition-colors hover:bg-black/[0.04] hover:text-[#0d0d0d]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !name.trim()}
                  className="rounded-md bg-[#0d7aff] px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-[#0964d6] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : taskId ? 'Create & link' : 'Create'}
                </button>
              </div>
            </form>
          )}
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
        onClick={() => setOpen((v) => !v)}
        className="flex size-6 items-center justify-center rounded-md text-[#9a9a9a] transition-colors hover:bg-black/[0.04] hover:text-[#3a3a3a]"
      >
        {children}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
