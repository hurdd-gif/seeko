/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   hero
 *  120ms   recently worked on
 *  240ms   today's tasks
 *  320ms   next milestone
 *  400ms   studio progress
 *  480ms   game areas
 *  560ms   quick notes
 * ───────────────────────────────────────────────────────── */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  fetchAreas,
  fetchProfile,
  fetchRecentItems,
  fetchTasks,
  fetchTodayTasks,
} from '@/lib/supabase/data';
import { FadeRise } from '@/components/motion';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { RecentItemsRow } from '@/components/dashboard/RecentItemsRow';
import { TodaysTasksPanel } from '@/components/dashboard/TodaysTasksPanel';
import { NextMilestonePanel } from '@/components/dashboard/NextMilestonePanel';
import { StudioProgressPanel } from '@/components/dashboard/StudioProgressPanel';
import { AreaTileRow } from '@/components/dashboard/AreaTileRow';
import { QuickNotesRow } from '@/components/dashboard/QuickNotesRow';

export const dynamic = 'force-dynamic';

const TIMING = {
  hero: 0,
  recent: 120,
  todaysTasks: 240,
  milestone: 320,
  progress: 400,
  areas: 480,
  quickNotes: 560,
} as const;

const ms = (n: number) => n / 1000;

function greetingPrefix(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

async function fetchAdminQuickNotes(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notes')
    .select('id, body, created_at')
    .eq('status', 'open')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(6);
  return (data ?? []) as { id: string; body: string; created_at: string }[];
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  const admin = profile?.is_admin ?? false;

  const [recent, todayTasks, totalOpen, areas, quickNotes] = await Promise.all([
    fetchRecentItems(user.id, 6).catch(() => []),
    fetchTodayTasks(5).catch(() => []),
    fetchTasks(user.id)
      .catch(() => [])
      .then((t) => t.filter((task) => task.status !== 'Complete').length),
    fetchAreas().catch(() => []),
    admin ? fetchAdminQuickNotes(user.id).catch(() => []) : Promise.resolve([]),
  ]);

  const greeting = greetingPrefix(new Date().getHours());
  const name = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <main className="mx-auto flex max-w-[900px] flex-col gap-10 px-6 py-20">
      <FadeRise delay={ms(TIMING.hero)} y={20}>
        <DashboardHero greeting={greeting} name={name} />
      </FadeRise>

      <FadeRise delay={ms(TIMING.recent)}>
        <RecentItemsRow items={recent} />
      </FadeRise>

      <FadeRise delay={ms(TIMING.todaysTasks)}>
        <TodaysTasksPanel tasks={todayTasks} totalOpen={totalOpen} />
      </FadeRise>

      <FadeRise delay={ms(TIMING.milestone)}>
        <NextMilestonePanel areas={areas} />
      </FadeRise>

      <FadeRise delay={ms(TIMING.progress)}>
        <StudioProgressPanel areas={areas} />
      </FadeRise>

      <FadeRise delay={ms(TIMING.areas)}>
        <AreaTileRow areas={areas} />
      </FadeRise>

      {admin && (
        <FadeRise delay={ms(TIMING.quickNotes)}>
          <QuickNotesRow notes={quickNotes} />
        </FadeRise>
      )}
    </main>
  );
}
