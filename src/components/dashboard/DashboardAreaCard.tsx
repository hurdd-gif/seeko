'use client';

import { useState } from 'react';
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
import type { Area } from '@/lib/types';

const PHASES = ['Alpha', 'Beta', 'Launch'] as const;
const STATUSES = ['Active', 'Planned', 'Complete'] as const;

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
      const res = await fetch(`/api/areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progress: Math.min(100, Math.max(0, progress)),
          phase: phase || null,
          status: status || null,
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to update');
        return;
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
          <span className="shrink-0 rounded-md border border-white/[0.08] px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
            {area.phase}
          </span>
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
        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${area.progress}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.3 }}
            className="h-full rounded-full"
            style={{ backgroundColor: 'var(--color-seeko-accent)' }}
          />
        </div>
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
              className="w-full text-left rounded-lg bg-white/[0.03] transition-colors hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-seeko-accent/30"
            >
              {cardContent}
            </button>
          ) : (
            <div className="rounded-lg bg-white/[0.03]">
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
              <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                {phase || area.phase}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Progress — hero field with live bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Progress</span>
            <div className="flex items-baseline gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={e => setProgress(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                className="w-12 bg-transparent text-right text-sm font-mono font-medium text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <motion.div
              animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="h-full rounded-full"
              style={{ backgroundColor: 'var(--color-seeko-accent)' }}
            />
          </div>
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
