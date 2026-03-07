/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Overview page entrance
 *
 * Read top-to-bottom. Each value is ms after mount.
 *
 *    0ms   hero (title + subtitle) fades in, y 20 → 0
 *  100ms   stat cards stagger in (80ms between each)
 *  300ms   game areas card fades in, y 20 → 0
 *   50ms   game area tiles stagger in (after areas card)
 *  450ms   upcoming tasks + recent activity section fades in, y 20 → 0
 *   50ms   activity items stagger in (60ms between each)
 * ───────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server';
import { fetchTasks, fetchAllTasksWithAssignees, fetchAreas, fetchTeam, fetchDocs, fetchActivity, fetchProfile } from '@/lib/supabase/data';
import { Task, Area } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { UpcomingTasks } from '@/components/dashboard/UpcomingTasks';
import { DashboardAreaCard } from '@/components/dashboard/DashboardAreaCard';
import { CollapsibleAreas } from '@/components/dashboard/CollapsibleAreas';
import {
  CheckSquare,
  Activity,
  Users,
  FileText,
  Map,
  ArrowRight,
  UserPlus,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ── Animation timing (ms) — single source of truth ────────────────
const TIMING = {
  hero:     0,   // page title + subtitle
  stats:  100,   // stat cards container delay
  statsStagger: 80,   // ms between each stat card
  areas:  300,   // game areas section
  areasInner: 50,     // game area tiles stagger start
  grid:   450,   // upcoming tasks + recent activity section
  activityStagger: 60,  // ms between each activity item
  activityDelay: 50,    // activity list stagger start
};

/** FadeRise/Stagger delay in seconds */
const delay = (ms: number) => ms / 1000;

// ── Element configs ─────────────────────────────────────────────
const HERO = {
  offsetY: 20,   // px the hero slides up from
};

const SECTION = {
  offsetY: 20,   // px each section slides up from
};

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildGreetingContext(tasks: Task[]): string {
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

  const stats = [
    { label: 'Open Tasks',  value: openTasks,   icon: CheckSquare, accent: true, primary: true, href: '/tasks' },
    { label: 'Completed',   value: completed,    icon: Activity,    accent: false, primary: false },
    { label: 'Team',        value: team.length, icon: Users,       accent: false, primary: false },
    { label: 'Docs',        value: docs.length, icon: FileText,    accent: false, primary: false },
  ];

  const upcoming = tasks
    .filter(t => t.status !== 'Complete')
    .slice(0, 4);

  const nextTask = upcoming[0] ?? null;

  // Derive Game Areas subtitle from real data
  const areasSubtitle = areas.length > 0
    ? areas.map(a => a.name).join(' · ')
    : 'No active areas';

  const greetingContext = buildGreetingContext(tasks);

  return (
    <div className="flex flex-col gap-6">

      {/* ── Hero ────────────────────────────────────────── */}
      <FadeRise delay={delay(TIMING.hero)} y={HERO.offsetY}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.display_name
            ? `Welcome back, ${profile.display_name.split(' ')[0]}.`
            : 'Welcome back.'
          }{' '}
          {greetingContext}
        </p>
      </FadeRise>

      {/* ── Stat cards ──────────────────────────────────── */}
      <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4" delayMs={delay(TIMING.stats)} staggerMs={delay(TIMING.statsStagger)}>
        {stats.map(stat => (
          <StaggerItem key={stat.label}>
            <HoverCard>
              {'href' in stat && stat.href ? (
                <Link href={stat.href} className="block">
                  <Card className={cn(
                    'transition-colors hover:bg-card/90',
                    stat.primary && 'border-seeko-accent/20 bg-seeko-accent/[0.04]'
                  )}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                      <div className={cn(
                        'flex size-8 items-center justify-center rounded-lg',
                        stat.primary ? 'bg-seeko-accent/10' : 'bg-secondary'
                      )}>
                        <stat.icon className={cn('size-4', stat.primary ? 'text-seeko-accent' : 'text-muted-foreground')} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <span
                        className={stat.primary ? 'text-3xl font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}
                        style={stat.accent ? { color: 'var(--color-seeko-accent)' } : undefined}
                      >
                        <AnimatedNumber value={stat.value} />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                      <stat.icon className="size-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">
                      <AnimatedNumber value={stat.value} />
                    </span>
                  </CardContent>
                </Card>
              )}
            </HoverCard>
          </StaggerItem>
        ))}
      </Stagger>

      {/* ── Tasks + Activity ────────────────────────────── */}
      <FadeRise delay={delay(TIMING.grid)} y={SECTION.offsetY}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-5">

          {/* Upcoming Tasks — primary focus card */}
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">Upcoming Tasks</CardTitle>
              <CardDescription>
                {nextTask
                  ? <>Next up: <span className="text-foreground font-medium">{nextTask.name}</span></>
                  : 'All caught up — no open tasks.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UpcomingTasks
                tasks={upcoming}
                team={team}
                docs={docs}
                currentUserId={user?.id ?? ''}
              />
              {upcoming.length > 0 && (
                <Link
                  href="/tasks"
                  className="mt-4 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                >
                  View all tasks
                  <ArrowRight className="size-3" />
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="md:col-span-2 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">Recent Activity</CardTitle>
              <CardDescription>Latest actions across the team.</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <EmptyState
                  icon="Activity"
                  title="No recent activity"
                  description="Latest actions will show here."
                />
              ) : (
                <>
                  <Stagger className="flex flex-col gap-3" staggerMs={delay(TIMING.activityStagger)} delayMs={delay(TIMING.activityDelay)}>
                    {activity.map(item => {
                      const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
                      const name = prof?.display_name ?? 'Unknown';
                      const avatar = prof?.avatar_url;
                      const actionWord = item.action?.toLowerCase() ?? '';
                      const kindCfg = ACTIVITY_ICONS[actionWord] ?? ACTIVITY_DEFAULT;
                      const KindIcon = kindCfg.icon;
                      return (
                        <StaggerItem key={item.id}>
                          <div className="flex items-start gap-3">
                            <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', kindCfg.bg, kindCfg.className)}>
                              <KindIcon className="size-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-sm text-foreground">
                                <span className="font-medium">{name}</span>{' '}
                                <span className="text-muted-foreground">{actionWord}</span>
                              </p>
                              <p className="text-xs text-muted-foreground font-mono truncate">{item.target}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </Stagger>
                  <Link
                    href="/activity"
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                  >
                    View all activity
                    <ArrowRight className="size-3" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </FadeRise>

      {/* ── Game Areas — after tasks on mobile for better priority ── */}
      {areas.length > 0 && (
        <FadeRise delay={delay(TIMING.areas)} y={SECTION.offsetY}>
          {/* Desktop: always expanded */}
          <div className="hidden md:block">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Map className="size-4 text-muted-foreground" />
                  <CardTitle className="text-xl font-semibold text-foreground">Game Areas</CardTitle>
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
