'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StaggerItem, HoverCard } from '@/components/motion';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type { Area, AreaSection } from '@/lib/types';
import { springs } from '@/lib/motion';
import { ProgressBar } from '@/components/ui/progress';
import { MonoBadge } from '@/components/ui/mono-badge';
import { computeAreaProgress } from '@/lib/area-progress';

const PHASES = ['Alpha', 'Beta', 'Launch'] as const;
const STATUSES = ['Active', 'Planned', 'Complete'] as const;

type PendingSection =
  | AreaSection
  | { _tempId: string; area_id: string; name: string; progress: number; sort_order: number };

interface DashboardAreaCardProps {
  area: Area;
  isAdmin: boolean;
}

export function DashboardAreaCard({ area, isAdmin }: DashboardAreaCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(area.progress);
  const [phase, setPhase] = useState(area.phase ?? '');
  const [status, setStatus] = useState(area.status ?? 'Active');
  const [description, setDescription] = useState(area.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSections, setPendingSections] = useState<PendingSection[]>(
    () => (area.sections ?? []).map(s => ({ ...s }))
  );
  const [deletedSectionIds, setDeletedSectionIds] = useState<string[]>([]);

  const displayProgress = pendingSections.length > 0
    ? computeAreaProgress(pendingSections)
    : area.progress;

  useEffect(() => {
    if (open) {
      setPendingSections((area.sections ?? []).map(s => ({ ...s })));
      setDeletedSectionIds([]);
    }
  }, [open, area.sections]);

  const handleOpen = () => {
    if (!isAdmin) return;
    setProgress(area.progress);
    setPhase(area.phase ?? '');
    setStatus(area.status ?? 'Active');
    setDescription(area.description ?? '');
    setError(null);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const hasSections = pendingSections.length > 0;
      const areaBody: Record<string, unknown> = {
        phase: phase || null,
        status: status || null,
        description: description.trim() || null,
      };
      if (!hasSections) {
        areaBody.progress = Math.min(100, Math.max(0, progress));
      }
      const res = await fetch(`/api/areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(areaBody),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to update');
        return;
      }

      // Build lookup of original sections for diffing
      const originalById = new Map<string, AreaSection>();
      (area.sections ?? []).forEach(s => originalById.set(s.id, s));

      // 1. DELETEs
      for (const delId of deletedSectionIds) {
        const r = await fetch(`/api/areas/${area.id}/sections/${delId}`, { method: 'DELETE' });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setError(d.error ?? 'Failed to delete section');
          return;
        }
      }

      // 2. PATCH existing with changes
      for (let idx = 0; idx < pendingSections.length; idx++) {
        const s = pendingSections[idx];
        if ('_tempId' in s) continue;
        const orig = originalById.get(s.id);
        if (!orig) continue;
        const changed: Record<string, unknown> = {};
        if (s.name !== orig.name) changed.name = s.name;
        if (s.progress !== orig.progress) changed.progress = s.progress;
        if (idx !== orig.sort_order) changed.sort_order = idx;
        if (Object.keys(changed).length === 0) continue;
        const r = await fetch(`/api/areas/${area.id}/sections/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changed),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setError(d.error ?? 'Failed to update section');
          return;
        }
      }

      // 3. POST new
      for (let idx = 0; idx < pendingSections.length; idx++) {
        const s = pendingSections[idx];
        if (!('_tempId' in s)) continue;
        const r = await fetch(`/api/areas/${area.id}/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: s.name, progress: s.progress, sort_order: idx }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setError(d.error ?? 'Failed to create section');
          return;
        }
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const cardContent = (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{area.name}</p>
        {area.phase && (
          <MonoBadge className="shrink-0">{area.phase}</MonoBadge>
        )}
      </div>
      {area.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {area.description}
        </p>
      )}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Progress</span>
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {area.progress}%
          </span>
        </div>
        <ProgressBar value={area.progress} size="lg" delay={0.3} />
      </div>
    </div>
  );

  return (
    <>
      <StaggerItem key={area.id}>
        <HoverCard>
          {isAdmin ? (
            <button
              type="button"
              onClick={handleOpen}
              className="w-full text-left rounded-lg interactive-surface focus:outline-none focus:ring-2 focus:ring-seeko-accent/30"
            >
              {cardContent}
            </button>
          ) : (
            <div className="rounded-lg bg-white/[0.03] border border-transparent transition-all hover:border-white/[0.06]">
              {cardContent}
            </div>
          )}
        </HoverCard>
      </StaggerItem>

      <Dialog open={open} onOpenChange={setOpen} contentClassName="max-w-md">
        <DialogClose onClose={() => setOpen(false)} />
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <DialogTitle>{area.name}</DialogTitle>
            {phase && (
              <MonoBadge>{phase || area.phase}</MonoBadge>
            )}
          </div>
        </DialogHeader>

        {/* Progress — computed from sections, or manual fallback */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Progress</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-mono font-medium text-foreground tabular-nums">{displayProgress}</span>
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <ProgressBar value={displayProgress} />
        </div>

        {/* Status + Phase — side by side */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
            <Select
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Phase</span>
            <Select
              value={phase}
              onChange={e => setPhase(e.target.value)}
            >
              <option value="">—</option>
              {PHASES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Sections */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sections</span>
            <button
              type="button"
              onClick={() => {
                setPendingSections(prev => [
                  ...prev,
                  { _tempId: crypto.randomUUID(), area_id: area.id, name: '', progress: 0, sort_order: prev.length },
                ]);
              }}
              className="text-xs text-seeko-accent hover:text-seeko-accent/80 transition-[color]"
            >
              + Add section
            </button>
          </div>
          {pendingSections.length > 0 ? (
            <ul className="space-y-2">
              {pendingSections.map((section, idx) => {
                const key = 'id' in section ? section.id : section._tempId;
                return (
                  <li key={key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={section.name}
                      onChange={(e) => {
                        setPendingSections(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s));
                      }}
                      placeholder="Section name"
                      className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent/40"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={section.progress}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                        setPendingSections(prev => prev.map((s, i) => i === idx ? { ...s, progress: v } : s));
                      }}
                      className="w-14 rounded-md border border-border bg-card px-2 py-1 text-right text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-muted-foreground w-3">%</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingSections(prev => prev.filter((_, i) => i !== idx));
                        if ('id' in section) {
                          setDeletedSectionIds(prev => [...prev, section.id]);
                        }
                      }}
                      aria-label={`Delete section ${section.name || 'untitled'}`}
                      className="rounded p-1 text-muted-foreground hover:text-destructive transition-[color] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/40"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground/60">No sections yet. Add one to decompose progress.</p>
          )}
        </div>

        {/* Description */}
        <div className="mb-5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">Description</span>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="flex w-full rounded-lg border-0 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Optional"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive mb-3">{error}</p>
        )}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-seeko-accent text-background hover:bg-seeko-accent/90 font-medium"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </Dialog>
    </>
  );
}
