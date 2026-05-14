/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Overview page entrance
 *
 *    0ms   hero greeting + subline fade-rise (y 20 → 0)
 *   80ms   stat pills stagger in (40ms between each)
 *  200ms   tasks section fade-rise (y 16 → 0)
 *  300ms   right-rail cascade (60ms stagger across 4 modules)
 *  500ms   game areas fade-rise (y 16 → 0)
 *  550ms   area tiles stagger in (50ms each)
 *
 * Springs: smooth { stiffness: 300, damping: 25 } for sections,
 *          snappy { stiffness: 500, damping: 30 } for pills (in StatPills).
 * Reduced motion: stagger + y disabled (opacity-only) inside motion helpers.
 *
 * Spacing rhythm:
 *   - Outer column gap-6 (24px) between hero / grid / areas
 *   - Two-column grid gap-6 (24px) between Tasks and Rail
 *   - Section headers mb-3 (12px) below
 *   - Subline mt-0.5 (2px) for tight optical pairing with header
 *   - Rail modules use px-4 py-3.5 (consistent across all 4)
 * ───────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server';
import {
  fetchTasks,
  fetchAllTasksWithAssignees,
  fetchAreas,
  fetchTeam,
  fetchDocs,
  fetchActivity,
  fetchProfile,
} from '@/lib/supabase/data';
import { Task, Area } from '@/lib/types';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { UpcomingTasks } from '@/components/dashboard/UpcomingTasks';
import { DashboardAreaCard } from '@/components/dashboard/DashboardAreaCard';
import { CollapsibleAreas } from '@/components/dashboard/CollapsibleAreas';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardRail } from '@/components/dashboard/DashboardRail';
import { RailNextMilestone } from '@/components/dashboard/RailNextMilestone';
import { RailStudioProgress } from '@/components/dashboard/RailStudioProgress';
import { RailRecentActivity } from '@/components/dashboard/RailRecentActivity';
import { RailQuickNote } from '@/components/dashboard/RailQuickNote';
import { ViewAllLink } from '@/components/dashboard/ViewAllLink';
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

export const dynamic = 'force-dynamic';

// ── Animation timing (ms) ────────────────────────────────────────
const TIMING = {
  hero: 0,
  pills: 80,
  pillStagger: 40,
  tasks: 200,
  rail: 300,
  railStagger: 60,
  areas: 500,
  areasInner: 50,
};
const delay = (ms: number) => ms / 1000;
const SECTION_Y = 16;

// ── Activity kind → icon + color ────────────────────────────────
const ACTIVITY_ICONS: Record<string, { icon: typeof Activity; className: string; bg: string }> = {
  assigned:           { icon: UserPlus,      className: 'text-foreground',                                  bg: 'bg-muted' },
  completed:          { icon: CheckSquare,   className: 'text-[color:var(--color-status-complete)]',        bg: 'bg-muted' },
  created:            { icon: FileText,      className: 'text-[color:var(--color-status-review)]',          bg: 'bg-muted' },
  updated:            { icon: Pencil,        className: 'text-[color:var(--color-status-progress)]',        bg: 'bg-muted' },
  commented:          { icon: MessageSquare, className: 'text-foreground',                                  bg: 'bg-muted' },
  deleted:            { icon: Trash2,        className: 'text-[color:var(--color-status-blocked)]',         bg: 'bg-muted' },
  started:            { icon: Activity,      className: 'text-[color:var(--color-status-progress)]',        bg: 'bg-muted' },
  'moved to review':  { icon: Activity,      className: 'text-[color:var(--color-status-review)]',          bg: 'bg-muted' },
};
const ACTIVITY_DEFAULT = { icon: Activity, className: 'text-muted-foreground', bg: 'bg-muted' };

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
    isAdmin ? fetchAllTasksWithAssignees().catch(() => []) : fetchTasks(user?.id ?? '').catch(() => []),
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

  const upcoming = tasks.filter(t => t.status !== 'Complete').slice(0, 5);
  const earliestDeadline = upcoming.filter(t => t.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0]?.deadline;

  const greeting = buildGreeting(tasks);
  const firstName = profile?.display_name?.split(' ')[0];

  const pills: { label: string; count: number; variant: 'danger' | 'accent' | 'muted'; href?: string }[] = [];
  if (overdue > 0) pills.push({ label: 'overdue', count: overdue, variant: 'danger' });
  pills.push({ label: 'open', count: openTasks, variant: 'accent', href: '/tasks' });
  if (inProgress > 0) pills.push({ label: 'in progress', count: inProgress, variant: 'muted' });
  if (blocked > 0) pills.push({ label: 'blocked', count: blocked, variant: 'danger' });
  pills.push({ label: 'done', count: completed, variant: 'muted' });

  const activityItems = activity.map(item => {
    const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
    const name = prof?.display_name ?? 'Unknown';
    const actionWord = item.action?.toLowerCase() ?? '';
    const kindCfg = ACTIVITY_ICONS[actionWord] ?? ACTIVITY_DEFAULT;
    return {
      id: item.id,
      name,
      action: actionWord,
      target: item.target,
      time: timeAgo(item.created_at),
      iconClassName: kindCfg.className,
      iconBg: kindCfg.bg,
      actionKey: actionWord,
    };
  });
  const railActivity = activityItems.slice(0, 3);

  return (
    <div className="flex flex-col gap-6 overflow-hidden">

      {/* ── Hero ─────────────────────────────────────── */}
      <FadeRise delay={delay(TIMING.hero)} y={SECTION_Y}>
        <DashboardHero
          firstName={firstName}
          subline={greeting}
          pills={pills}
          pillDelayMs={delay(TIMING.pills)}
          pillStaggerMs={delay(TIMING.pillStagger)}
        />
      </FadeRise>

      {/* ── Tasks + Right Rail ───────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">

        <FadeRise delay={delay(TIMING.tasks)} y={SECTION_Y}>
          <section>
            <header className="mb-3">
              <h3 className="text-lg font-semibold text-foreground">Your Tasks</h3>
              {earliestDeadline && upcoming.length > 0 && (
                <p className={cn('text-xs tabular-nums mt-0.5', new Date(earliestDeadline + 'T23:59:59') < new Date() ? 'text-[color:var(--color-status-blocked)]' : 'text-muted-foreground')}>
                  {new Date(earliestDeadline + 'T23:59:59') < new Date()
                    ? `Overdue since ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : `Next deadline: ${new Date(earliestDeadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </p>
              )}
            </header>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Sparkles className="size-8 text-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-foreground">You're all caught up</p>
                  <p className="text-xs text-muted-foreground mt-1">No open tasks right now.</p>
                </div>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
          </section>
        </FadeRise>

        <Stagger delayMs={delay(TIMING.rail)} staggerMs={delay(TIMING.railStagger)}>
          <DashboardRail>
            <StaggerItem><RailNextMilestone areas={areas} /></StaggerItem>
            <StaggerItem><RailStudioProgress areas={areas} /></StaggerItem>
            <StaggerItem><RailRecentActivity items={railActivity} showViewAll={!isContractor} /></StaggerItem>
            {isAdmin && <StaggerItem><RailQuickNote /></StaggerItem>}
          </DashboardRail>
        </Stagger>

      </div>

      {/* ── Game Areas ───────────────────────────────── */}
      {areas.length > 0 && (
        <FadeRise delay={delay(TIMING.areas)} y={SECTION_Y}>
          <div className="hidden md:block">
            <section>
              <header className="mb-3 flex items-center gap-2">
                <Map className="size-4 text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">Game Areas</h3>
              </header>
              <Stagger className="flex flex-col gap-4 md:flex-row md:flex-wrap" delayMs={delay(TIMING.areasInner)}>
                {areas.map(area => (
                  <div key={area.id} className="w-full md:w-[calc(33.333%-0.667rem)]">
                    <DashboardAreaCard area={area} isAdmin={isAdmin} />
                  </div>
                ))}
              </Stagger>
            </section>
          </div>
          <div className="md:hidden">
            <CollapsibleAreas areas={areas} isAdmin={isAdmin} subtitle="" />
          </div>
        </FadeRise>
      )}
    </div>
  );
}
