/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Overview page entrance
 *
 *    0ms   hero greeting fades in, y 20 → 0
 *   80ms   stat pills stagger in (40ms between each)
 *  200ms   tasks card fades in (3-col on md+), y 16 → 0
 *  350ms   activity feed fades in (2-col on md+), y 16 → 0
 *   50ms   activity items stagger in (60ms between each)
 *  500ms   game areas card fades in, y 16 → 0
 *   50ms   area tiles stagger in
 * ───────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server';
import { fetchTasks, fetchAllTasksWithAssignees, fetchAreas, fetchTeam, fetchDocs, fetchActivity, fetchProfile } from '@/lib/supabase/data';
import { Task, Area } from '@/lib/types';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { UpcomingTasks } from '@/components/dashboard/UpcomingTasks';
import { DashboardAreaCard } from '@/components/dashboard/DashboardAreaCard';
import { CollapsibleAreas } from '@/components/dashboard/CollapsibleAreas';
import {
  CheckSquare,
  Activity,
  Map,
  UserPlus,
  MessageSquare,
  Pencil,
  Trash2,
  FileText,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { StatPills } from '@/components/dashboard/StatPills';
import { ActivityFeedItem } from '@/components/dashboard/ActivityFeedItem';
import { ViewAllLink } from '@/components/dashboard/ViewAllLink';

export const dynamic = 'force-dynamic';

// ── Animation timing (ms) — single source of truth ────────────────
const TIMING = {
  hero:     0,
  pills:    80,
  pillStagger: 40,
  tasks:  200,
  activity: 350,
  activityStagger: 60,
  activityDelay: 50,
  areas:  500,
  areasInner: 50,
};

/** FadeRise/Stagger delay in seconds */
const delay = (ms: number) => ms / 1000;

const SECTION_Y = 16;

// ── Activity kind → icon + color ────────────────────────────────
const ACTIVITY_ICONS: Record<string, { icon: typeof Activity; className: string; bg: string }> = {
  assigned:    { icon: UserPlus,       className: 'text-seeko-accent',  bg: 'bg-emerald-500/10' },
  completed:   { icon: CheckSquare,    className: 'text-emerald-500',   bg: 'bg-emerald-500/10' },
  created:     { icon: FileText,       className: 'text-blue-400',      bg: 'bg-blue-500/10' },
  updated:     { icon: Pencil,         className: 'text-amber-400',     bg: 'bg-amber-500/10' },
  commented:   { icon: MessageSquare,  className: 'text-violet-400',    bg: 'bg-violet-500/10' },
  deleted:     { icon: Trash2,         className: 'text-red-400',       bg: 'bg-red-500/10' },
  started:     { icon: Activity,       className: 'text-amber-400',     bg: 'bg-amber-500/10' },
  'moved to review': { icon: Activity, className: 'text-blue-400',      bg: 'bg-blue-500/10' },
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

  // Aggregate area progress for subtitle
  const avgProgress = areas.length > 0
    ? Math.round(areas.reduce((sum, a) => sum + a.progress, 0) / areas.length)
    : 0;
  const areasSubtitle = areas.length > 0
    ? `${avgProgress}% average progress`
    : 'No active areas';

  const greeting = buildGreeting(tasks);
  const firstName = profile?.display_name?.split(' ')[0];

  // Build stat pills data
  const pills: { label: string; count: number; variant: 'danger' | 'accent' | 'muted'; href?: string }[] = [];
  if (overdue > 0) pills.push({ label: 'overdue', count: overdue, variant: 'danger' });
  pills.push({ label: 'open', count: openTasks, variant: 'accent', href: '/tasks' });
  if (inProgress > 0) pills.push({ label: 'in progress', count: inProgress, variant: 'muted' });
  if (blocked > 0) pills.push({ label: 'blocked', count: blocked, variant: 'danger' });
  pills.push({ label: 'done', count: completed, variant: 'muted' });

  // Prepare activity items — resolve to plain data (no React components across server→client boundary)
  const activityItems = activity.map(item => {
    const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
    const name = prof?.display_name ?? 'Unknown';
    const actionWord = item.action?.toLowerCase() ?? '';
    const kindCfg = ACTIVITY_ICONS[actionWord] ?? ACTIVITY_DEFAULT;
    return { id: item.id, name, action: actionWord, target: item.target, time: timeAgo(item.created_at), iconClassName: kindCfg.className, iconBg: kindCfg.bg, actionKey: actionWord };
  });

  // Shared surface style matching the task screen rehaul
  const surface = 'rounded-2xl bg-[#222222] border-0';
  const surfaceShadow = { boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.1)' };

  return (
    <div className="flex flex-col gap-4 overflow-hidden">

      {/* ── Hero — greeting + stat pills ──────────────── */}
      <FadeRise delay={delay(TIMING.hero)} y={SECTION_Y}>
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
              {firstName ? `Hey, ${firstName}` : 'Overview'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{greeting}</p>
          </div>

          {/* Staggered stat pills */}
          <StatPills pills={pills} delayMs={delay(TIMING.pills)} staggerMs={delay(TIMING.pillStagger)} />
        </div>
      </FadeRise>

      {/* ── Tasks + Activity — two-column on desktop ──── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">

        {/* Tasks — primary card */}
        <FadeRise delay={delay(TIMING.tasks)} y={SECTION_Y} className="md:col-span-3">
          <div className={surface} style={surfaceShadow}>
            <div className="flex flex-col space-y-1.5 p-6">
              <h3 className="text-lg font-semibold text-foreground">Your Tasks</h3>
              {earliestDeadline && upcoming.length > 0 && (
                <p className={cn('text-xs', new Date(earliestDeadline + 'T23:59:59') < new Date() ? 'text-red-400' : 'text-muted-foreground')}>
                  {new Date(earliestDeadline + 'T23:59:59') < new Date()
                    ? `Overdue since ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : `Next deadline: ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  }
                </p>
              )}
            </div>
            <div className="p-6 pt-0">
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Sparkles className="size-8 text-seeko-accent/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">You're all caught up</p>
                    <p className="text-xs text-muted-foreground mt-1">No open tasks right now.</p>
                  </div>
                  <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                  >
                    <FileText className="size-3" />
                    Browse docs
                  </Link>
                </div>
              ) : (
                <>
                  <UpcomingTasks
                    tasks={upcoming}
                    team={team}
                    docs={docs}
                    currentUserId={user?.id ?? ''}
                    isAdmin={isAdmin}
                  />
                  <ViewAllLink href="/tasks" label="View all tasks" />
                </>
              )}
            </div>
          </div>
        </FadeRise>

        {/* Activity */}
        <FadeRise delay={delay(TIMING.activity)} y={SECTION_Y} className="md:col-span-2 flex">
          <div className={cn(surface, 'flex flex-col flex-1')} style={surfaceShadow}>
            <div className="flex flex-col space-y-1.5 p-6 pb-3">
              <h3 className="text-base font-semibold text-foreground">Activity</h3>
            </div>
            <div className="p-6 pt-0 flex-1 flex flex-col">
              {activityItems.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground flex-1 flex items-center justify-center">No recent activity.</p>
              ) : (
                <>
                  <Stagger className="flex flex-col gap-1 flex-1" staggerMs={delay(TIMING.activityStagger)} delayMs={delay(TIMING.activityDelay)}>
                    {activityItems.map(item => (
                      <StaggerItem key={item.id}>
                        <ActivityFeedItem
                          name={item.name}
                          action={item.action}
                          target={item.target}
                          time={item.time}
                          actionKey={item.actionKey}
                          iconClassName={item.iconClassName}
                          iconBg={item.iconBg}
                        />
                      </StaggerItem>
                    ))}
                  </Stagger>
                  {!isContractor && (
                    <ViewAllLink href="/activity" label="View all activity" className="mt-auto pt-3" />
                  )}
                </>
              )}
            </div>
          </div>
        </FadeRise>

      </div>

      {/* ── Game Areas ────────────────────────────────── */}
      {areas.length > 0 && (
        <FadeRise delay={delay(TIMING.areas)} y={SECTION_Y}>
          {/* Desktop: always expanded */}
          <div className="hidden md:block">
            <div className={surface} style={surfaceShadow}>
              <div className="flex flex-col space-y-1.5 p-6">
                <div className="flex items-center gap-2">
                  <Map className="size-4 text-muted-foreground" />
                  <h3 className="text-base font-semibold text-foreground">Game Areas</h3>
                </div>
                <p className="text-xs text-muted-foreground">{areasSubtitle}</p>
              </div>
              <div className="p-6 pt-0">
                <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-4" delayMs={delay(TIMING.areasInner)}>
                  {areas.map(area => (
                    <DashboardAreaCard key={area.id} area={area} isAdmin={isAdmin} />
                  ))}
                </Stagger>
              </div>
            </div>
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
