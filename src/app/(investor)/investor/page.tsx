/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Panel
 *
 * Read top-to-bottom. Each value is ms after mount.
 *
 *    0ms   hero fades up (title + subtitle)
 *  100ms   game areas card fades up
 *  150ms   area tiles stagger in (50ms delay, then 80ms apart)
 *  300ms   recent tasks + this week section fades up
 *  350ms   task rows stagger in (50ms delay, 60ms apart)
 * ───────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchAreas, fetchActivity, fetchAllTasksWithAssignees } from '@/lib/supabase/data';
import { Area } from '@/lib/types';
import type { TaskWithAssignee } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { InvestorAreaCard } from '@/components/dashboard/InvestorAreaCard';
import {
  CheckSquare,
  Map,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const TIMING = {
  hero:            0,   // title + subtitle
  areas:         100,   // game areas card
  areasStagger:  150,   // area tiles start (delay 50ms after areas)
  areasStaggerDelayMs: 50,
  grid:          300,   // recent tasks + this week
  tasksStagger:  350,   // task rows start (delay 50ms after grid)
  tasksStaggerDelayMs: 50,
  staggerMs:      60,   // ms between task rows
};

const delay = (ms: number) => ms / 1000;

/** Relative time for "Updated X ago" (minutes, hours, days). */
function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Summarise last 7 days activity into high-level bullets for the Updates section. */
function buildUpdates(
  activity: Awaited<ReturnType<typeof fetchActivity>>,
  areas: Area[],
) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = activity.filter(a => new Date(a.created_at).getTime() > cutoff);

  const completed  = recent.filter(a => a.action === 'Completed').length;
  const started    = recent.filter(a => a.action === 'Started').length;
  const inReview   = recent.filter(a => a.action === 'Moved to review').length;
  const blocked    = recent.filter(a => a.action === 'Blocked').length;
  const comments   = recent.filter(a => a.action === 'Commented on').length;

  const bullets: string[] = [];
  if (completed > 0) bullets.push(`${completed} task${completed !== 1 ? 's' : ''} completed this week`);
  if (started > 0)   bullets.push(`${started} task${started !== 1 ? 's' : ''} started`);
  if (inReview > 0)  bullets.push(`${inReview} task${inReview !== 1 ? 's' : ''} moved to review`);
  if (blocked > 0)   bullets.push(`${blocked} task${blocked !== 1 ? 's' : ''} currently blocked`);
  if (comments > 0)  bullets.push(`${comments} comment${comments !== 1 ? 's' : ''} added`);

  const activeAreas = areas.filter(a => a.status === 'Active');
  if (activeAreas.length > 0) {
    bullets.push(`${activeAreas.length} area${activeAreas.length !== 1 ? 's' : ''} in active development`);
  }

  return bullets;
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

  const blocked        = tasks.filter(t => t.status === 'Blocked').length;
  const overdueCount   = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date()).length;

  const updates = buildUpdates(activity, areas);
  const areasSubtitle = areas.length > 0
    ? areas.map(a => a.name).join(' · ')
    : 'No active areas';

  const firstName = profile?.display_name?.split(' ')[0];

  // Latest activity or task update for "Updated X ago"
  const latestActivity = activity[0]?.created_at;
  const latestTaskUpdate = tasks
    .map(t => t.updated_at)
    .filter((t): t is string => !!t)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const lastUpdatedRaw = [latestActivity, latestTaskUpdate]
    .filter((t): t is string => !!t)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const lastUpdated = lastUpdatedRaw ? timeAgo(lastUpdatedRaw) : null;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Hero (primary entry point) ───────────────────── */}
      <FadeRise delay={delay(TIMING.hero)} className="pb-4">
        <h1
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ color: 'var(--color-seeko-accent)' }}
        >
          Investor Panel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {firstName ? `Welcome, ${firstName}. ` : ''}
          Here's the current state of SEEKO.
        </p>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground/80 mt-1.5" aria-label={`Last updated ${lastUpdated}`}>
            Updated {lastUpdated}
          </p>
        )}
      </FadeRise>

      {/* ── Game Areas ──────────────────────────────────── */}
      <FadeRise delay={delay(TIMING.areas)}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Map className="size-4 text-muted-foreground" />
              <CardTitle className="text-xl font-semibold text-foreground">Game Areas</CardTitle>
            </div>
            <CardDescription>
              {areas.length > 0 ? areasSubtitle : 'Progress by area.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {areas.length === 0 ? (
              <EmptyState
                icon="Map"
                title="No game areas yet"
                description="Areas will appear here when the team adds them."
              />
            ) : (
              <Stagger
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
                delayMs={delay(TIMING.areasStaggerDelayMs)}
                staggerMs={0.08}
              >
                {areas.map(area => (
                  <InvestorAreaCard
                    key={area.id}
                    area={area}
                    tasksInArea={tasks.filter(t => t.area_id === area.id)}
                  />
                ))}
              </Stagger>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      {/* ── Recent Tasks + Updates ─────────────────────────── */}
      <FadeRise delay={delay(TIMING.grid)}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

          {/* Recent Tasks */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckSquare className="size-4 text-muted-foreground" />
                <CardTitle className="text-xl font-semibold text-foreground">Recent Tasks</CardTitle>
              </div>
              <CardDescription>Latest tasks and their current status.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pt-1">
              {tasks.length === 0 ? (
                <EmptyState
                  icon="CheckSquare"
                  title="No tasks yet"
                  description="Tasks will appear here as the team adds them."
                />
              ) : (
                <Stagger
                  className="relative flex flex-col gap-0"
                  staggerMs={delay(TIMING.staggerMs)}
                  delayMs={delay(TIMING.tasksStaggerDelayMs)}
                >
                  {(tasks as TaskWithAssignee[])
                    .slice(0, 15)
                    .map((task, i) => (
                      <StaggerItem key={task.id} className="flex gap-3 py-4 border-b border-border last:border-0 last:pb-0">
                        <div className="flex flex-1 min-w-0 flex-col gap-0.5">
                          <p className="text-sm font-medium text-foreground truncate">{task.name}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                              {task.status}
                            </Badge>
                            {task.assignee?.display_name && (
                              <span className="text-xs text-muted-foreground">
                                {task.assignee.display_name}
                              </span>
                            )}
                            {task.deadline && (
                              <span className="text-xs text-muted-foreground">
                                Due {new Date(task.deadline).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </StaggerItem>
                    ))}
                </Stagger>
              )}
            </CardContent>
          </Card>

          {/* Updates / Weekly Summary */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                <CardTitle className="text-xl font-semibold text-foreground">This Week</CardTitle>
              </div>
              <CardDescription>Summary of the last 7 days.</CardDescription>
            </CardHeader>
            <CardContent>
              {updates.length === 0 ? (
                <EmptyState
                  icon="TrendingUp"
                  title="No updates yet"
                  description="Activity from the past week will be summarised here."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {updates.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: 'var(--color-seeko-accent)' }}
                        aria-hidden
                      />
                      <span className="text-sm text-muted-foreground">{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

        </div>
      </FadeRise>

      {/* ── Blocked tasks callout ───────────────────────── */}
      {blocked > 0 && (
        <FadeRise delay={delay(TIMING.grid + 100)}>
          <Card className="border-red-900/40 bg-red-950/10">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="size-4 text-red-400 shrink-0" />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{blocked} task{blocked !== 1 ? 's' : ''} blocked.</span>
                {' '}The team is actively working to unblock progress.
              </p>
            </CardContent>
          </Card>
        </FadeRise>
      )}

      {/* ── Overdue tasks callout ───────────────────────── */}
      {overdueCount > 0 && (
        <FadeRise delay={delay(TIMING.grid + (blocked > 0 ? 150 : 100))}>
          <Card className="border-amber-900/40 bg-amber-950/10">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="size-4 text-amber-400 shrink-0" />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{overdueCount} task{overdueCount !== 1 ? 's' : ''} past due.</span>
                {' '}The team is reprioritising and updating deadlines.
              </p>
            </CardContent>
          </Card>
        </FadeRise>
      )}

    </div>
  );
}
