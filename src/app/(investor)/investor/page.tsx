/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Panel
 *
 * Read top-to-bottom. Each value is ms after mount.
 *
 *    0ms   hero fades up (title + health summary)
 *   50ms   KPI strip stat cards stagger in (80ms apart)
 *  200ms   game areas card fades up (open by default)
 *  350ms   recent activity card fades up (grouped by day)
 * ───────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchAreas, fetchActivity, fetchAllTasksWithAssignees } from '@/lib/supabase/data';
import { Area } from '@/lib/types';
import type { TaskWithAssignee } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeRise } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { InvestorKPIStrip } from '@/components/dashboard/InvestorKPIStrip';
import { CollapsibleInvestorAreas } from '@/components/dashboard/CollapsibleInvestorAreas';
import { Map, Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TIMING = {
  hero:      0,
  kpi:      50,
  areas:   200,
  summary: 350,
};

const delay = (ms: number) => ms / 1000;

/** Relative time for "Updated X ago". */
function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Color for activity action type. */
function actionColor(action: string): string {
  if (action === 'Completed') return 'var(--color-seeko-accent)';
  if (action === 'Blocked') return 'var(--color-status-blocked)';
  if (action === 'Started' || action === 'Moved to review') return 'var(--color-status-progress)';
  return 'var(--color-muted-foreground)';
}

/** Group activity entries by day label. */
function groupByDay(entries: { created_at: string }[]): { label: string; items: typeof entries }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;

  const groups: Record<string, typeof entries> = {};
  for (const entry of entries) {
    const entryDate = new Date(entry.created_at);
    const entryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate()).getTime();
    let label: string;
    if (entryDay >= today) label = 'Today';
    else if (entryDay >= yesterday) label = 'Yesterday';
    else label = entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(entry);
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

/** Build a one-line health summary for the investor. */
function buildHealthSummary(
  completedThisWeek: number,
  blocked: number,
  overdue: number,
  areas: { name: string; progress: number }[],
): string {
  const parts: string[] = [];

  // Progress signal
  if (completedThisWeek > 0) {
    parts.push(`${completedThisWeek} task${completedThisWeek !== 1 ? 's' : ''} completed this week`);
  }

  // Area progress
  const progressing = areas.filter(a => a.progress > 0);
  if (progressing.length > 0 && progressing.length === areas.length) {
    parts.push('all areas progressing');
  } else if (progressing.length > 0) {
    parts.push(`${progressing.length} of ${areas.length} areas progressing`);
  }

  // Issues
  if (blocked > 0 && overdue > 0) {
    parts.push(`${blocked} blocked and ${overdue} overdue`);
  } else if (blocked > 0) {
    parts.push(`${blocked} blocked task${blocked !== 1 ? 's' : ''} need attention`);
  } else if (overdue > 0) {
    parts.push(`${overdue} overdue task${overdue !== 1 ? 's' : ''}`);
  }

  if (parts.length === 0) return 'No activity this week yet.';

  // Capitalize first part
  const sentence = parts.join(', ') + '.';
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export default async function InvestorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const profile = user ? await fetchProfile(user.id) : null;

  const [tasks, areas, activity] = await Promise.all([
    fetchAllTasksWithAssignees().catch(() => []),
    fetchAreas().catch((): Area[] => []),
    fetchActivity(30).catch(() => []),
  ]);

  // ── Stat computations ─────────────────────────────────
  const totalTasks     = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Complete').length;
  const overallPct     = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const blocked        = tasks.filter(t => t.status === 'Blocked').length;
  const overdueCount   = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date()).length;
  const activeAreas    = areas.filter(a => a.status === 'Active').length;

  // Tasks completed this week (from activity log)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const completedThisWeek = activity.filter(
    a => a.action === 'Completed' && new Date(a.created_at).getTime() > weekAgo
  ).length;

  const areasSubtitle = areas.length > 0
    ? `${completedTasks} of ${totalTasks} tasks complete · ${areas.map(a => a.name).join(' · ')}`
    : 'No active areas';

  const firstName = profile?.display_name?.split(' ')[0];

  // Health summary
  const healthSummary = buildHealthSummary(
    completedThisWeek,
    blocked,
    overdueCount,
    areas.map(a => ({ name: a.name, progress: a.progress })),
  );
  const hasIssues = blocked > 0 || overdueCount > 0;

  // Build task-to-area lookup for activity context
  const taskAreaLookup: Record<string, string> = {};
  for (const task of tasks) {
    const area = areas.find(a => a.id === task.area_id);
    if (area) taskAreaLookup[task.name] = area.name;
  }

  // Recent activity entries (last 12, grouped by day)
  const recentActivity = activity.slice(0, 12);
  const activityGroups = groupByDay(recentActivity);

  return (
    <div className="flex flex-col gap-6">

      {/* ── Hero + Health Summary ─────────────────────────── */}
      <FadeRise delay={delay(TIMING.hero)} className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--color-seeko-accent)' }}
            >
              Investor Panel
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {firstName ? `Welcome, ${firstName}. ` : ''}Here&apos;s the current state of SEEKO.
            </p>
          </div>
        </div>
        <div className={`mt-3 rounded-lg px-3.5 py-2.5 text-sm ${hasIssues ? 'bg-red-950/15 border border-red-900/30 text-red-300' : 'bg-muted/50 border border-border/50 text-muted-foreground'}`}>
          {healthSummary}
        </div>
      </FadeRise>

      {/* ── KPI Strip ────────────────────────────────────── */}
      <InvestorKPIStrip
        overallPct={overallPct}
        completedThisWeek={completedThisWeek}
        blocked={blocked}
        overdue={overdueCount}
        activeAreas={activeAreas}
        areas={areas.map(a => ({ id: a.id, name: a.name, progress: a.progress }))}
        isAdmin={profile?.is_admin ?? false}
        delay={TIMING.kpi}
      />

      {/* ── Game Areas (open by default) ─────────────────── */}
      <FadeRise delay={delay(TIMING.areas)}>
        {areas.length === 0 ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Map className="size-4 text-muted-foreground" />
                <CardTitle className="text-xl font-semibold text-foreground">Game Areas</CardTitle>
              </div>
              <CardDescription>Progress by area.</CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon="Map"
                title="No game areas yet"
                description="Areas will appear here when the team adds them."
              />
            </CardContent>
          </Card>
        ) : (
          <CollapsibleInvestorAreas
            areas={areas}
            tasks={tasks as TaskWithAssignee[]}
            subtitle={areasSubtitle}
            defaultOpen
            isAdmin={profile?.is_admin ?? false}
          />
        )}
      </FadeRise>

      {/* ── Recent Activity (grouped by day) ──────────────── */}
      <FadeRise delay={delay(TIMING.summary)}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <CardTitle className="text-xl font-semibold text-foreground">Recent Activity</CardTitle>
            </div>
            <CardDescription>Latest updates from the team.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon="Activity"
                title="No activity yet"
                description="Team updates will appear here."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {activityGroups.map(group => (
                  <div key={group.label}>
                    <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider pt-3 pb-1.5 first:pt-0">
                      {group.label}
                    </p>
                    {group.items.map((entry, i) => {
                      const areaName = taskAreaLookup[(entry as typeof recentActivity[number]).target];
                      return (
                        <div key={i} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                          <span
                            className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: actionColor((entry as typeof recentActivity[number]).action) }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">
                              {areaName && (
                                <span className="text-muted-foreground/60 mr-1.5">{areaName} &mdash;</span>
                              )}
                              <span className="font-medium">{(entry as typeof recentActivity[number]).action}</span>
                              {' '}
                              <span className="text-muted-foreground">{(entry as typeof recentActivity[number]).target}</span>
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                              {timeAgo(entry.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

    </div>
  );
}
