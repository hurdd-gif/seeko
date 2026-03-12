'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor KPI Strip
 *
 *    0ms   4 stat cards stagger in (80ms apart)
 *          progress ring draws in over 700ms
 *          blocked/overdue cards glow red/amber when > 0
 *
 *  on click (admin only):
 *    0ms   backdrop fades in
 *   50ms   dialog scales up 0.95 → 1
 *  150ms   area rows stagger in (60ms apart)
 * ───────────────────────────────────────────────────────── */

import { useState } from 'react';
import { TrendingUp, AlertCircle, Map } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { toast } from 'sonner';
import { useHaptics } from '@/components/HapticsProvider';

interface AreaProgress {
  id: string;
  name: string;
  progress: number;
}

interface InvestorKPIStripProps {
  overallPct: number;
  completedThisWeek: number;
  blocked: number;
  overdue: number;
  activeAreas: number;
  areas?: AreaProgress[];
  isAdmin?: boolean;
  delay?: number;
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 11;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative flex size-8 items-center justify-center rounded-lg bg-secondary shrink-0">
      <svg className="size-6 -rotate-90" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r={r} fill="none" stroke="var(--color-muted-foreground)" opacity="0.3" strokeWidth="2.5" />
        <circle
          cx="13" cy="13" r={r}
          fill="none"
          stroke="var(--color-seeko-accent)"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
    </div>
  );
}

/* ── Large ring for the dialog ────────────────────────── */
function LargeProgressRing({ pct }: { pct: number }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative size-32 shrink-0 mx-auto">
      <svg className="size-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-muted-foreground)" opacity="0.15" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke="var(--color-seeko-accent)"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-foreground">
        {pct}%
      </span>
    </div>
  );
}

export function InvestorKPIStrip({
  overallPct: initialOverallPct,
  completedThisWeek,
  blocked,
  overdue,
  activeAreas,
  areas: initialAreas = [],
  isAdmin = false,
  delay: baseDelay = 0,
}: InvestorKPIStripProps) {
  const d = (ms: number) => (baseDelay + ms) / 1000;
  const { trigger } = useHaptics();

  const hasIssues = blocked > 0 || overdue > 0;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [areaValues, setAreaValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialAreas.map(a => [a.id, a.progress]))
  );
  const [saving, setSaving] = useState<string | null>(null);

  // Compute live overall % from area values
  const liveOverallPct = initialAreas.length > 0
    ? Math.round(Object.values(areaValues).reduce((sum, v) => sum + v, 0) / initialAreas.length)
    : initialOverallPct;

  async function handleSave(areaId: string) {
    const value = areaValues[areaId];
    if (value === undefined) return;

    setSaving(areaId);
    try {
      const res = await fetch(`/api/areas/${areaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Failed to update');
        trigger('error');
        return;
      }
      toast.success('Progress updated');
      trigger('success');
    } catch {
      toast.error('Failed to update');
      trigger('error');
    } finally {
      setSaving(null);
    }
  }

  function handleCompletionClick() {
    if (!isAdmin) return;
    trigger('selection');
    setDialogOpen(true);
  }

  return (
    <>
      <FadeRise delay={d(0)}>
        <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-3" staggerMs={0.08}>
          {/* Overall Completion — clickable for admins */}
          <StaggerItem>
            <HoverCard>
              {isAdmin ? (
                <button type="button" onClick={handleCompletionClick} className="w-full text-left">
                  <Card className="h-full transition-colors hover:border-seeko-accent/30">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardDescription className="text-sm font-medium">Completion</CardDescription>
                      <ProgressRing pct={liveOverallPct} />
                    </CardHeader>
                    <CardContent>
                      <span className="text-2xl font-semibold tracking-tight tabular-nums">{liveOverallPct}%</span>
                      <p className="text-xs text-muted-foreground mt-0.5">overall progress</p>
                    </CardContent>
                  </Card>
                </button>
              ) : (
                <Card className="h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardDescription className="text-sm font-medium">Completion</CardDescription>
                    <ProgressRing pct={liveOverallPct} />
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{liveOverallPct}%</span>
                    <p className="text-xs text-muted-foreground mt-0.5">overall progress</p>
                  </CardContent>
                </Card>
              )}
            </HoverCard>
          </StaggerItem>

          {/* Completed This Week */}
          <StaggerItem>
            <HoverCard>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-sm font-medium">This Week</CardDescription>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <TrendingUp className="size-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight tabular-nums">{completedThisWeek}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">tasks completed</p>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>

          {/* Blocked / Overdue */}
          <StaggerItem>
            <HoverCard>
              <Card className={hasIssues ? 'border-red-900/40 bg-red-950/10' : ''}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-sm font-medium">Issues</CardDescription>
                  <div className={`flex size-8 items-center justify-center rounded-lg ${hasIssues ? 'bg-red-950/30' : 'bg-secondary'}`}>
                    <AlertCircle className={`size-4 ${hasIssues ? 'text-red-400' : 'text-muted-foreground'}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {hasIssues ? (
                    <div className="flex items-baseline gap-2">
                      {blocked > 0 && (
                        <span className="text-2xl font-semibold tracking-tight text-red-400">{blocked}</span>
                      )}
                      {blocked > 0 && overdue > 0 && (
                        <span className="text-muted-foreground">/</span>
                      )}
                      {overdue > 0 && (
                        <span className="text-2xl font-semibold tracking-tight text-amber-400">{overdue}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">0</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {blocked > 0 && overdue > 0
                      ? `${blocked} blocked · ${overdue} overdue`
                      : blocked > 0
                        ? 'blocked'
                        : overdue > 0
                          ? 'overdue'
                          : 'all clear'}
                  </p>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>

          {/* Active Areas */}
          <StaggerItem>
            <HoverCard>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-sm font-medium">Active Areas</CardDescription>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <Map className="size-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight tabular-nums">{activeAreas}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">in development</p>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>
        </Stagger>
      </FadeRise>

      {/* ── Completion Editor Dialog (admin only) ────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} contentClassName="max-w-md">
        <DialogClose onClose={() => setDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>Update Completion</DialogTitle>
          <p className="text-sm text-muted-foreground">Adjust progress per area. Changes save individually.</p>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6">
          <LargeProgressRing pct={liveOverallPct} />

          <div className="w-full flex flex-col gap-4">
            {initialAreas.map(area => {
              const value = areaValues[area.id] ?? area.progress;
              const changed = value !== area.progress;
              return (
                <div key={area.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{area.name}</span>
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={value}
                        onChange={e => {
                          const n = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                          setAreaValues(prev => ({ ...prev, [area.id]: n }));
                        }}
                        className="w-10 text-right text-sm font-mono text-muted-foreground bg-transparent border-b border-transparent focus:border-seeko-accent focus:outline-none transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={e => setAreaValues(prev => ({ ...prev, [area.id]: Number(e.target.value) }))}
                    className="w-full h-2 rounded-full appearance-none bg-secondary cursor-pointer accent-[#6ee7b7] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-seeko-accent [&::-webkit-slider-thumb]:shadow-md"
                  />
                  <div className="flex items-center justify-between">
                    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{ width: `${value}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                      />
                    </div>
                    {changed && (
                      <button
                        type="button"
                        onClick={() => handleSave(area.id)}
                        disabled={saving === area.id}
                        className="ml-3 shrink-0 px-3 py-1 text-xs font-medium rounded-lg bg-seeko-accent text-[#1a1a1a] hover:bg-seeko-accent/90 disabled:opacity-50 transition-colors"
                      >
                        {saving === area.id ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>
    </>
  );
}
