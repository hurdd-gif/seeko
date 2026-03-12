/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Overview page entrance
 *
 *    0ms   hero (greeting + stat pills) fades in, y 20 → 0
 *  150ms   tasks card fades in (3-col on md+), y 20 → 0
 *  300ms   activity feed fades in (2-col on md+), y 20 → 0
 *   50ms   activity items stagger in (60ms between each)
 *  400ms   game areas card fades in, y 20 → 0
 *   50ms   area tiles stagger in
 * ───────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server';
import { fetchTasks, fetchAllTasksWithAssignees, fetchAreas, fetchTeam, fetchDocs, fetchActivity, fetchProfile } from '@/lib/supabase/data';
import { Task, Area } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { UpcomingTasks } from '@/components/dashboard/UpcomingTasks';
import { DashboardAreaCard } from '@/components/dashboard/DashboardAreaCard';
import { CollapsibleAreas } from '@/components/dashboard/CollapsibleAreas';
import {
  CheckSquare,
  Activity,
  Map,
  ArrowRight,
  UserPlus,
  MessageSquare,
  Pencil,
  Trash2,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ── Animation timing (ms) — single source of truth ────────────────
const TIMING = {
  hero:     0,
  tasks:  150,
  activity: 300,
  activityStagger: 60,
  activityDelay: 50,
  areas:  400,
  areasInner: 50,
};

/** FadeRise/Stagger delay in seconds */
const delay = (ms: number) => ms / 1000;

const SECTION_Y = 20;

// ── Activity kind → icon + color ────────────────────────────────
const ACTIVITY_ICONS: Record<string, { icon: typeof Activity; className: string; bg: string }> = {
  assigned:    { icon: UserPlus,       className: 'text-seeko-accent',  bg: 'bg-emerald-500/10' },
  completed:   { icon: CheckSquare,    className: 'text-emerald-500',   bg: 'bg-emerald-500/10' },
  created:     { icon: FileText,       className: 'text-blue-400',      bg: 'bg-blue-500/10' },
  updated:     { icon: Pencil,         className: 'text-amber-400',     bg: 'bg-amber-500/10' },
  commented:   { icon: MessageSquare,  className: 'text-violet-400',    bg: 'bg-violet-500/10' },
  deleted:     { icon: Trash2,         className: 'text-red-400',       bg: 'bg-red-500/10' },
};
const ACTIVITY_DEFAULT = { icon: Activity, className: 'text-muted-foreground', bg: 'bg-secondary' };

// ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildGreeting(tasks: Task[]): string {
  const open = tasks.filter(t => t.status !== 'Complete');
  const blocked = open.filter(t => t.status === 'Blocked').length;
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const dueSoon = open.filter(t => {
    if (!t.deadline) return false;
    const d = new Date(t.deadline + 'T23:59:59');
    return d <= weekFromNow;
  }).length;

  if (blocked > 0 && dueSoon > 0) return `${blocked} blocked, ${dueSoon} due this week.`;
  if (blocked > 0) return `${blocked} task${blocked === 1 ? ' is' : 's are'} blocked.`;
  if (dueSoon > 0) return `${dueSoon} task${dueSoon === 1 ? '' : 's'} due this week.`;
  if (open.length === 0) return "You're all caught up.";
  return "Here's what's happening.";
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const profile = user ? await fetchProfile(user.id) : null;
  const isAdmin = profile?.is_admin ?? false;
  const isContractor = profile?.is_contractor ?? false;

  const [tasks, areas, team, docs, activity] = await Promise.all([
    isAdmin
      ? fetchAllTasksWithAssignees().catch(() => [])
      : fetchTasks(user?.id ?? '').catch(() => []),
    fetchAreas().catch((): Area[] => []),
    fetchTeam().catch(() => []),
    fetchDocs().catch(() => []),
    fetchActivity(5).catch(() => []),
  ]);

  const openTasks  = tasks.filter(t => t.status !== 'Complete').length;
  const completed  = tasks.filter(t => t.status === 'Complete').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const blocked    = tasks.filter(t => t.status === 'Blocked').length;
  const overdue    = tasks.filter(t => t.status !== 'Complete' && t.deadline && new Date(t.deadline + 'T23:59:59') < new Date()).length;

  const upcoming = tasks
    .filter(t => t.status !== 'Complete')
    .slice(0, 5);

  // Earliest deadline for context
  const earliestDeadline = upcoming
    .filter(t => t.deadline)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0]?.deadline;

  // Derive Game Areas subtitle from real data
  const areasSubtitle = areas.length > 0
    ? areas.map(a => a.name).join(' · ')
    : 'No active areas';

  const greeting = buildGreeting(tasks);
  const firstName = profile?.display_name?.split(' ')[0];

  return (
    <div className="flex flex-col gap-5 overflow-hidden">

      {/* ── Hero — greeting + inline stats ──────────────── */}
      <FadeRise delay={delay(TIMING.hero)} y={SECTION_Y}>
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
              {firstName ? `Hey, ${firstName}` : 'Overview'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{greeting}</p>
          </div>

          {/* Inline stat pills */}
          <div className="flex flex-wrap items-center gap-2">
            {overdue > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/[0.06] px-3 py-1 text-xs font-medium text-red-400">
                <span className="tabular-nums">{overdue}</span> overdue
              </span>
            )}
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 rounded-full border border-seeko-accent/20 bg-seeko-accent/[0.06] px-3 py-1 text-xs font-medium text-seeko-accent transition-colors hover:bg-seeko-accent/[0.12]"
            >
              <CheckSquare className="size-3" />
              <span className="tabular-nums">{openTasks}</span> open
            </Link>
            {inProgress > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{inProgress}</span> in progress
              </span>
            )}
            {blocked > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/[0.06] px-3 py-1 text-xs font-medium text-red-400">
                <span className="tabular-nums">{blocked}</span> blocked
              </span>
            )}
            {completed > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{completed}</span> completed
              </span>
            )}
          </div>
        </div>
      </FadeRise>

      {/* ── Tasks + Activity — two-column on desktop ──── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-5">

        {/* Tasks — primary, in a card */}
        <FadeRise delay={delay(TIMING.tasks)} y={SECTION_Y} className="md:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Your Tasks</CardTitle>
              {earliestDeadline && upcoming.length > 0 && (
                <CardDescription className={new Date(earliestDeadline + 'T23:59:59') < new Date() ? 'text-red-400' : undefined}>
                  {new Date(earliestDeadline + 'T23:59:59') < new Date()
                    ? `Overdue since ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : `Next deadline: ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  }
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <UpcomingTasks
                tasks={upcoming}
                team={team}
                docs={docs}
                currentUserId={user?.id ?? ''}
                isAdmin={isAdmin}
                emptyAction={
                  <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                  >
                    <FileText className="size-3" />
                    Browse docs
                  </Link>
                }
              />
              {upcoming.length > 0 && (
                <Link
                  href="/tasks"
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-transparent py-2 text-sm text-foreground/50 hover:text-foreground hover:border-border transition-colors"
                >
                  View all tasks
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </CardContent>
          </Card>
        </FadeRise>

        {/* Activity — card, visually lighter than tasks */}
        <FadeRise delay={delay(TIMING.activity)} y={SECTION_Y} className="md:col-span-2 flex">
          <Card className="border-border/50 flex flex-col flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground leading-none">Activity</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {activity.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground flex-1 flex items-center justify-center">No recent activity.</p>
              ) : (
                <>
                  <Stagger className="flex flex-col gap-2.5 flex-1" staggerMs={delay(TIMING.activityStagger)} delayMs={delay(TIMING.activityDelay)}>
                    {activity.map(item => {
                      const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
                      const name = prof?.display_name ?? 'Unknown';
                      const actionWord = item.action?.toLowerCase() ?? '';
                      const kindCfg = ACTIVITY_ICONS[actionWord] ?? ACTIVITY_DEFAULT;
                      const KindIcon = kindCfg.icon;
                      return (
                        <StaggerItem key={item.id}>
                          <div className="flex items-start gap-2.5">
                            <div className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', kindCfg.bg, kindCfg.className)}>
                              <KindIcon className="size-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground leading-snug">
                                <span className="font-medium">{name}</span>{' '}
                                <span className="text-muted-foreground">{actionWord}</span>
                              </p>
                              <p className="text-xs text-muted-foreground font-mono truncate">{item.target}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground mt-0.5">{timeAgo(item.created_at)}</span>
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </Stagger>
                  {!isContractor && (
                    <Link
                      href="/activity"
                      className="mt-auto pt-3 flex items-center justify-center gap-1.5 rounded-lg border border-transparent py-2 text-sm text-foreground/50 hover:text-foreground hover:border-border transition-colors"
                    >
                      View all activity
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </FadeRise>

      </div>

      {/* ── Game Areas ────────────────────────────────── */}
      {areas.length > 0 && (
        <FadeRise delay={delay(TIMING.areas)} y={SECTION_Y}>
          {/* Desktop: always expanded */}
          <div className="hidden md:block">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Map className="size-4 text-muted-foreground" />
                  <CardTitle className="text-lg">Game Areas</CardTitle>
                </div>
                <CardDescription className="line-clamp-1">{areasSubtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-4" delayMs={delay(TIMING.areasInner)}>
                  {areas.map(area => (
                    <DashboardAreaCard key={area.id} area={area} isAdmin={isAdmin} />
                  ))}
                </Stagger>
              </CardContent>
            </Card>
          </div>
          {/* Mobile: collapsible */}
          <div className="md:hidden">
            <CollapsibleAreas areas={areas} isAdmin={isAdmin} subtitle={areasSubtitle} />
          </div>
        </FadeRise>
      )}
    </div>
  );
}
