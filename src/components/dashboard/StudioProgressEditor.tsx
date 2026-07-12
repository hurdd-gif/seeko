'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { ProgressBar } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Area } from '@/lib/types';
import { LIGHT_INPUT, BTN_PRIMARY, LIGHT_FOCUS_RING } from './lightKit';
import { orderAreas } from './studioProgress';

const PHASES = ['Alpha', 'Beta', 'Launch'] as const;
const STATUSES = ['Active', 'Planned', 'Complete'] as const;

// The mutable slice of an Area this editor owns. Mirrors the PATCH /api/areas/[id]
// body so each field maps 1:1 to the column it updates.
type EditState = {
  progress: number;
  phase: string;
  status: string;
  description: string;
  target_date: string;
};

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

// Project Areas → keyed draft records. Optional columns collapse to '' so the
// inputs are always controlled and the PATCH body can re-null them on save.
function buildStates(areas: Area[]): Record<string, EditState> {
  const out: Record<string, EditState> = {};
  for (const a of areas) {
    out[a.id] = {
      progress: a.progress,
      phase: a.phase ?? '',
      status: a.status ?? 'Active',
      description: a.description ?? '',
      target_date: a.target_date ?? '',
    };
  }
  return out;
}

/**
 * The admin-only "Studio progress" editor — one light dialog stacking every area's
 * full editor (progress / status / phase / target date / description) with a single
 * "Save changes" action. Opened by clicking the Overview ProgressRing (admin only).
 *
 * Save PATCHes ONLY the areas the admin actually touched (dirty-diff vs the baseline
 * captured on open), each as an independent request to /api/areas/[id]. All succeed →
 * close + refresh. A partial failure keeps the dialog open, re-baselines the ones that
 * saved (so they're no longer dirty / won't re-fire on retry), and names the failures.
 */
export function StudioProgressEditor({
  open,
  onOpenChange,
  areas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: Area[];
}) {
  const router = useRouter();
  const ordered = useMemo(() => orderAreas(areas), [areas]);

  // `draft` is what the inputs render; `baseline` is the on-open snapshot we diff
  // against to find dirty areas. Both seed from props so the inputs are populated
  // on first paint (the dialog can mount already-open).
  const [draft, setDraft] = useState<Record<string, EditState>>(() => buildStates(areas));
  const [baseline, setBaseline] = useState<Record<string, EditState>>(() => buildStates(areas));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-snapshot whenever the dialog (re)opens or the source areas change — the ring's
  // data refreshes after a save, so the next open must reflect the persisted values.
  useEffect(() => {
    if (!open) return;
    setDraft(buildStates(areas));
    setBaseline(buildStates(areas));
    setError(null);
  }, [open, areas]);

  function setField<K extends keyof EditState>(id: string, key: K, val: EditState[K]) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [key]: val } }));
  }

  function isDirty(id: string) {
    const d = draft[id];
    const b = baseline[id];
    if (!d || !b) return false;
    return (
      d.progress !== b.progress ||
      d.phase !== b.phase ||
      d.status !== b.status ||
      d.description !== b.description ||
      d.target_date !== b.target_date
    );
  }

  const anyDirty = ordered.some((a) => isDirty(a.id));

  async function handleSave() {
    const dirty = ordered.filter((a) => isDirty(a.id));
    if (dirty.length === 0) return;
    setSaving(true);
    setError(null);

    const results = await Promise.all(
      dirty.map(async (a) => {
        const s = draft[a.id];
        try {
          const res = await fetch(`/api/areas/${a.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              progress: clamp(s.progress),
              phase: s.phase || null,
              status: s.status || null,
              description: s.description.trim() || null,
              target_date: s.target_date || null,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { id: a.id, name: a.name, ok: false, error: data?.error as string | undefined };
          }
          return { id: a.id, name: a.name, ok: true as const };
        } catch {
          return { id: a.id, name: a.name, ok: false, error: 'Network error' };
        }
      }),
    );

    setSaving(false);
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      onOpenChange(false);
      router.refresh();
      return;
    }
    // Lock in the ones that DID save so they stop reading as dirty (a retry only
    // re-fires the failures), then surface what's left.
    setBaseline((prev) => {
      const next = { ...prev };
      for (const r of results) if (r.ok) next[r.id] = { ...draft[r.id] };
      return next;
    });
    setError(failed.map((f) => `${f.name}: ${f.error ?? 'Failed to save'}`).join(' · '));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} light contentClassName="max-w-md">
      <DialogHeader>
        <DialogTitle>Studio progress</DialogTitle>
        <p className="text-[13px] text-ink-muted">
          Update progress, status, and phase for each area.
        </p>
      </DialogHeader>

      <div className="flex flex-col">
        {ordered.map((a, i) => {
          const s = draft[a.id];
          if (!s) return null;
          return (
            <div key={a.id} className={cn('py-5', i > 0 && 'border-t border-wash-6')}>
              <div className="mb-3 flex items-center gap-2.5">
                <h3 className="text-[15px] font-semibold text-ink-title">{a.name}</h3>
                {s.phase && (
                  <span className="rounded-full bg-wash-5 px-2 py-0.5 font-mono text-[11px] leading-none text-ink-body">
                    {s.phase}
                  </span>
                )}
              </div>

              {/* Progress — hero field with a live light bar */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-muted">Progress</span>
                  <div className="flex items-baseline gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`Progress for ${a.name}`}
                      value={s.progress}
                      onChange={(e) => setField(a.id, 'progress', clamp(Number(e.target.value) || 0))}
                      className="w-14 rounded-md px-1 bg-transparent text-right text-sm font-mono font-medium tabular-nums text-ink-title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-ink-muted">%</span>
                  </div>
                </div>
                <ProgressBar value={s.progress} className="bg-wash-6" />
              </div>

              {/* Status + Phase */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-ink-muted">Status</span>
                  <Select light value={s.status} onChange={(e) => setField(a.id, 'status', e.target.value)}>
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-ink-muted">Phase</span>
                  <Select light value={s.phase} onChange={(e) => setField(a.id, 'phase', e.target.value)}>
                    <option value="">—</option>
                    {PHASES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Target date */}
              <div className="mb-4">
                <span className="mb-1.5 block text-[11px] font-medium text-ink-muted">Target date</span>
                <input
                  type="date"
                  value={s.target_date}
                  onChange={(e) => setField(a.id, 'target_date', e.target.value)}
                  className={cn('flex h-9 w-full px-3 py-1 text-sm [color-scheme:light] dark:[color-scheme:dark]', LIGHT_INPUT)}
                />
              </div>

              {/* Description */}
              <div>
                <span className="mb-1.5 block text-[11px] font-medium text-ink-muted">Description</span>
                <textarea
                  value={s.description}
                  onChange={(e) => setField(a.id, 'description', e.target.value)}
                  rows={2}
                  placeholder="Optional"
                  className={cn('flex w-full resize-none px-3 py-2 text-sm', LIGHT_INPUT)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex flex-col gap-3 border-t border-wash-6 pt-5">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!anyDirty || saving}
            className={cn(BTN_PRIMARY, LIGHT_FOCUS_RING, 'disabled:pointer-events-none disabled:opacity-50')}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
