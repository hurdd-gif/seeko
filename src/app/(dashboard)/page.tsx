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
import { UpcomingTasks } from '@/components/dashboard/UpcomingTasks';
import { DashboardAreaCard } from '@/components/dashboard/DashboardAreaCard';
import {
  CheckSquare,
  Activity,
  Users,
  FileText,
  Map,
} from 'lucide-react';
import Link from 'next/link';

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
    { label: 'Open Tasks',    value: openTasks,   icon: CheckSquare, accent: true, primary: true, href: '/tasks' },
    { label: 'Completed',     value: completed,    icon: Activity,    accent: false, primary: false },
    { label: 'Team Members',  value: team.length, icon: Users,       accent: false, primary: false },
    { label: 'Documents',     value: docs.length, icon: FileText,    accent: false, primary: false },
  ];

  const upcoming = tasks
    .filter(t => t.status !== 'Complete')
    .slice(0, 4);

  const nextTask = upcoming[0] ?? null;

  // Derive Game Areas subtitle from real data
  const areasSubtitle = areas.length > 0
    ? areas.map(a => a.name).join(' · ')
    : 'No active areas';

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
          {openTasks === 0 ? "You're all caught up." : "Here's what's happening."}
        </p>
      </FadeRise>

      {/* ── Stat cards ──────────────────────────────────── */}
      <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4" delayMs={delay(TIMING.stats)} staggerMs={delay(TIMING.statsStagger)}>
        {stats.map(stat => (
          <StaggerItem key={stat.label}>
            <HoverCard>
              {'href' in stat && stat.href ? (
                <Link href={stat.href} className="block">
                  <Card className="transition-colors hover:bg-card/90">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                      <stat.icon className="size-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <span
                        className={stat.primary ? 'text-3xl font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}
                        style={stat.accent ? { color: 'var(--color-seeko-accent)' } : undefined}
                      >
                        {stat.value}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                    <stat.icon className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <span
                      className={stat.primary ? 'text-3xl font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}
                      style={stat.accent ? { color: 'var(--color-seeko-accent)' } : undefined}
                    >
                      {stat.value}
                    </span>
                  </CardContent>
                </Card>
              )}
            </HoverCard>
          </StaggerItem>
        ))}
      </Stagger>

      {/* ── Game Areas ──────────────────────────────────── */}
      {areas.length > 0 && (
        <FadeRise delay={delay(TIMING.areas)} y={SECTION.offsetY}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Map className="size-4 text-muted-foreground" />
                <CardTitle className="text-xl font-semibold text-foreground">Game Areas</CardTitle>
              </div>
              <CardDescription>{areasSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-4" delayMs={delay(TIMING.areasInner)}>
                {areas.map(area => (
                  <DashboardAreaCard key={area.id} area={area} isAdmin={isAdmin} />
                ))}
              </Stagger>
            </CardContent>
          </Card>
        </FadeRise>
      )}

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
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">Recent Activity</CardTitle>
              <CardDescription>Latest actions.</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <EmptyState
                  icon="Activity"
                  title="No recent activity"
                  description="Latest actions will show here."
                />
              ) : (
                <Stagger className="flex flex-col gap-4" staggerMs={delay(TIMING.activityStagger)} delayMs={delay(TIMING.activityDelay)}>
                  {activity.map(item => {
                    const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
                    const name = prof?.display_name ?? 'Unknown';
                    const avatar = prof?.avatar_url;
                    return (
                      <StaggerItem key={item.id}>
                        <div className="flex items-start gap-3">
                          <Avatar className="size-8">
                            <AvatarImage src={avatar} alt={name} />
                            <AvatarFallback className="bg-secondary text-foreground text-xs">
                              {getInitials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-0.5">
                            <p className="text-sm text-foreground">
                              <span className="font-medium">{name}</span>{' '}
                              <span className="text-muted-foreground">{item.action.toLowerCase()}</span>
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">{item.target}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              )}
            </CardContent>
          </Card>

        </div>
      </FadeRise>
    </div>
  );
}
