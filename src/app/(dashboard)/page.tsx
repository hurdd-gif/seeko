/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   hero
 *  120ms   recently worked on
 *  240ms   today's tasks
 *  320ms   studio overview
 * ───────────────────────────────────────────────────────── */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  fetchAreas,
  fetchNotifications,
  fetchProfile,
  fetchRecentItems,
  fetchTasks,
  fetchTeam,
  fetchTodayTasks,
  fetchUnreadNotificationCount,
} from '@/lib/supabase/data';
import { FadeRise } from '@/components/motion';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { RecentItemsRow } from '@/components/dashboard/RecentItemsRow';
import { TodaysTasksPanel } from '@/components/dashboard/TodaysTasksPanel';
import { StudioOverviewPanel } from '@/components/dashboard/StudioOverviewPanel';
import { LightShell } from '@/components/dashboard/LightShell';

export const dynamic = 'force-dynamic';

const TIMING = {
  hero: 0,
  recent: 120,
  todaysTasks: 240,
  studio: 320,
} as const;

const ms = (n: number) => n / 1000;

function greetingPrefix(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  const isAdmin = profile?.is_admin ?? false;

  const [recent, todayTasks, totalOpen, areas, notifications, unreadCount, team] =
    await Promise.all([
      fetchRecentItems(user.id, 6).catch(() => []),
      fetchTodayTasks(5).catch(() => []),
      fetchTasks(user.id)
        .catch(() => [])
        .then((t) => t.filter((task) => task.status !== 'Done').length),
      fetchAreas().catch(() => []),
      fetchNotifications(user.id, 20).catch(() => []),
      fetchUnreadNotificationCount(user.id).catch(() => 0),
      fetchTeam().catch(() => []),
    ]);

  const greeting = greetingPrefix(new Date().getHours());
  const fullName = profile?.display_name ?? 'there';
  const name = fullName.split(' ')[0] ?? 'there';
  const initials = initialsOf(profile?.display_name ?? user.email ?? 'U');

  return (
    <LightShell
      activeTab="overview"
      animatePill={false}
      account={{
        email: user.email ?? '',
        initials,
        displayName: profile?.display_name ?? undefined,
        avatarUrl: profile?.avatar_url ?? undefined,
        userId: user.id,
        isAdmin,
        unreadCount,
        notifications,
        team: team.map((m) => ({ id: m.id, display_name: m.display_name })),
        areas: areas.map((a) => ({ id: a.id, name: a.name })),
      }}
    >
      <main className="flex w-full flex-col items-center px-[52px] pt-[199px] pb-[102px]">
        <div className="flex w-full max-w-[1100px] flex-col gap-[62px]">
          <FadeRise delay={ms(TIMING.hero)} y={20}>
            <DashboardHero greeting={greeting} name={name} />
          </FadeRise>

          <FadeRise delay={ms(TIMING.recent)}>
            <RecentItemsRow items={recent} />
          </FadeRise>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <FadeRise delay={ms(TIMING.todaysTasks)} className="flex lg:flex-1">
              <TodaysTasksPanel tasks={todayTasks} totalOpen={totalOpen} />
            </FadeRise>

            <FadeRise delay={ms(TIMING.studio)} className="flex lg:flex-1">
              <StudioOverviewPanel areas={areas} />
            </FadeRise>
          </div>
        </div>
      </main>
    </LightShell>
  );
}
