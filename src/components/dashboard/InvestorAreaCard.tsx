'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { StaggerItem, HoverCard } from '@/components/motion';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';
import { useHaptics } from '@/components/HapticsProvider';
import type { Area } from '@/lib/types';
import type { TaskWithAssignee } from '@/lib/types';
import type { TaskStatus } from '@/lib/types';

/* ── Constants ──────────────────────────────────────────── */

const AREA_PHASES = ['Alpha', 'Beta', 'Launch'] as const;
const AREA_STATUSES = ['Active', 'Planned', 'Complete'] as const;
const TASK_STATUSES: TaskStatus[] = ['In Progress', 'In Review', 'Blocked', 'Complete'];

function statusDotColor(status: string): string {
  if (status === 'Active') return 'var(--color-seeko-accent)';
  if (status === 'Complete') return 'var(--color-status-complete)';
  return 'var(--color-muted-foreground)';
}

/* ── Props ──────────────────────────────────────────────── */

interface InvestorAreaCardProps {
  area: Area;
  tasksInArea: TaskWithAssignee[];
  isAdmin?: boolean;
}

export function InvestorAreaCard({ area, tasksInArea, isAdmin = false }: InvestorAreaCardProps) {
  const [open, setOpen] = useState(false);
  const { trigger } = useHaptics();

  /* ── Admin area editing state ──────────────────────────── */
  const [editPhase, setEditPhase] = useState(area.phase ?? '');
  const [editStatus, setEditStatus] = useState(area.status ?? '');
  const [editDescription, setEditDescription] = useState(area.description ?? '');
  const [editProgress, setEditProgress] = useState(area.progress);
  const [saving, setSaving] = useState(false);

  /* ── Admin task status state ───────────────────────────── */
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>(
    () => Object.fromEntries(tasksInArea.map(t => [t.id, t.status]))
  );

  const hasAreaChanges =
    editPhase !== (area.phase ?? '') ||
    editStatus !== (area.status ?? '') ||
    editDescription !== (area.description ?? '') ||
    editProgress !== area.progress;

  const supabase = isAdmin
    ? createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
    : null;

  /* ── Save area changes ─────────────────────────────────── */
  const handleSaveArea = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: editPhase || null,
          status: editStatus || null,
          description: editDescription || null,
          progress: editProgress,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Failed to update area');
        trigger('error');
        return;
      }
      toast.success('Area updated');
      trigger('success');
    } catch {
      toast.error('Failed to update area');
      trigger('error');
    } finally {
      setSaving(false);
    }
  }, [area.id, editPhase, editStatus, editDescription, editProgress, trigger]);

  /* ── Update task status ────────────────────────────────── */
  const handleTaskStatusChange = useCallback(async (taskId: string, newStatus: string) => {
    if (!supabase) return;
    setTaskStatuses(prev => ({ ...prev, [taskId]: newStatus }));
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
    if (error) {
      toast.error('Failed to update task');
      trigger('error');
    } else {
      toast.success('Task updated');
      trigger('success');
    }
  }, [supabase, trigger]);

  /* ── Shared select styling ─────────────────────────────── */
  const selectClass = 'bg-muted/50 border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-seeko-accent/40';

  return (
    <>
      <StaggerItem>
        <HoverCard>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative w-full text-left rounded-xl transition-colors hover:bg-white/[0.02] focus:outline-none focus:ring-2 focus:ring-seeko-accent/30 cursor-pointer"
            style={{
              backgroundColor: '#2a2a2a',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{area.name}</p>
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs text-muted-foreground font-mono tabular-nums">
                          {tasksInArea.filter(t => t.status === 'Complete').length}/{tasksInArea.length} tasks
                        </span>
                      </div>
                      {area.progress === 0 ? (
                        <div className="flex items-center h-1.5">
                          <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Not started</span>
                        </div>
                      ) : (
                        <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-start gap-1.5 shrink-0">
                    {area.phase && (
                      <span className="text-[11px] text-muted-foreground/70 font-mono tracking-wide uppercase">
                        {area.phase}
                      </span>
                    )}
                    {area.status && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: statusDotColor(area.status) }}
                        />
                        <span className="text-[11px] text-muted-foreground font-medium">{area.status}</span>
                      </div>
                    )}
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">{area.progress}%</span>
                  </div>
                </div>
                {area.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 pt-0.5">
                    {area.description}
                  </p>
                )}
            </div>
          </button>
        </HoverCard>
      </StaggerItem>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogClose onClose={() => setOpen(false)} />
        <DialogHeader>
          <DialogTitle>{area.name}</DialogTitle>

          {/* ── Phase & status: editable for admins ──────── */}
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <select
                value={editPhase}
                onChange={e => setEditPhase(e.target.value)}
                className={selectClass}
              >
                <option value="">No phase</option>
                {AREA_PHASES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                className={selectClass}
              >
                <option value="">No status</option>
                {AREA_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {area.phase && (
                <span className="text-xs text-muted-foreground/70 font-mono tracking-wide uppercase">
                  {area.phase}
                </span>
              )}
              {area.status && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: statusDotColor(area.status) }}
                  />
                  <span className="text-xs text-muted-foreground font-medium">{area.status}</span>
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        {/* ── Description: editable for admins ──────────── */}
        {isAdmin ? (
          <div className="mb-4">
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Description</label>
            <textarea
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              placeholder="Add a description..."
              rows={2}
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-seeko-accent/40 resize-none"
            />
          </div>
        ) : area.description ? (
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{area.description}</p>
        ) : null}

        {/* ── Progress: editable slider for admins ──────── */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-foreground">Overall progress</span>
            {isAdmin ? (
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editProgress}
                  onChange={e => {
                    const n = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    setEditProgress(n);
                  }}
                  className="w-10 text-right text-sm font-mono text-muted-foreground bg-transparent border-b border-transparent focus:border-seeko-accent focus:outline-none transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            ) : (
              <span className="text-sm font-mono text-muted-foreground">{area.progress}%</span>
            )}
          </div>
          {isAdmin ? (
            <>
              <input
                type="range"
                min={0}
                max={100}
                value={editProgress}
                onChange={e => setEditProgress(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none bg-secondary cursor-pointer accent-[#6ee7b7] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-seeko-accent [&::-webkit-slider-thumb]:shadow-md"
              />
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-1">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{ width: `${editProgress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                />
              </div>
            </>
          ) : editProgress === 0 ? (
            <div className="flex items-center h-2">
              <span className="text-xs text-muted-foreground/50 font-medium uppercase tracking-wider">Not started</span>
            </div>
          ) : (
            <ProgressBar value={area.progress} animated={false} />
          )}
        </div>

        {/* ── Save button for area changes ──────────────── */}
        {isAdmin && hasAreaChanges && (
          <div className="mb-4">
            <button
              type="button"
              onClick={handleSaveArea}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-seeko-accent text-[#1a1a1a] hover:bg-seeko-accent/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}

        {/* ── Tasks list ─────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-2">
            Tasks in this area ({tasksInArea.length})
          </h3>
          {tasksInArea.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks in this area yet.</p>
          ) : (
            <ul className="space-y-2 max-h-[60dvh] overflow-y-auto">
              {tasksInArea.map(task => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-muted/50 text-sm"
                >
                  <span className="font-medium text-foreground truncate">{task.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.assignee?.display_name && (
                      <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                        {task.assignee.display_name}
                      </span>
                    )}
                    {isAdmin ? (
                      <select
                        value={taskStatuses[task.id] ?? task.status}
                        onChange={e => handleTaskStatusChange(task.id, e.target.value)}
                        className={selectClass}
                      >
                        {TASK_STATUSES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                        {task.status}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
