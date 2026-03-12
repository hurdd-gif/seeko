/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   heading + subtitle fades up
 *  120ms   filter pills + feed fade in
 * ───────────────────────────────────────────────────────── */

import { fetchActivity } from '@/lib/supabase/data';
import { FadeRise } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';

const TIMING = {
  hero:    0,
  feed:  120,
};

const delay = (ms: number) => ms / 1000;

// ── Page ─────────────────────────────────────────────────

export default async function ActivityPage() {
  const activity = await fetchActivity(50).catch(() => { throw new Error('Failed to load activity.'); });

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto overflow-hidden">
      <FadeRise delay={delay(TIMING.hero)}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">What the team&apos;s been up to.</p>
      </FadeRise>

      {activity.length === 0 ? (
        <EmptyState
          icon="Activity"
          title="No activity yet"
          description="Task updates, comments, and assignments will show here."
        />
      ) : (
        <FadeRise delay={delay(TIMING.feed)} y={12}>
          <ActivityFeed activity={activity} />
        </FadeRise>
      )}
    </div>
  );
}
