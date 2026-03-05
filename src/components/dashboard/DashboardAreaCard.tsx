'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{area.name}</p>
          {area.phase && (
            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
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
            <span className="text-xs font-mono text-muted-foreground">
              {area.progress}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <StaggerItem key={area.id}>
        <HoverCard>
          {isAdmin ? (
            <button
              type="button"
              onClick={handleOpen}
              className="w-full text-left rounded-xl border border-border bg-card transition-colors hover:bg-card/90 hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-seeko-accent/30"
            >
              {cardContent}
            </button>
          ) : (
            cardContent
          )}
        </HoverCard>
      </StaggerItem>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogClose onClose={() => setOpen(false)} />
        <DialogHeader>
          <DialogTitle>Edit {area.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="area-progress">Progress (%)</Label>
            <Input
              id="area-progress"
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={e => setProgress(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="area-phase">Phase</Label>
            <select
              id="area-phase"
              value={phase}
              onChange={e => setPhase(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">—</option>
              {PHASES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="area-status">Status</Label>
            <select
              id="area-status"
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="area-description">Description</Label>
            <textarea
              id="area-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Optional"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
