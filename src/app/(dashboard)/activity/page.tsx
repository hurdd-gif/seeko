/* ─────────────────────────────────────────────────────────
 * Activity — paper-family port matching Overview/Tasks chrome.
 *
 * Shell: fixed inset-0 light surface + pill nav at top.
 * Body: single white shadow-seeko card containing the ActivitySection.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   page surface fades in
 *   40ms   pill nav rises
 *   80ms   header rises
 *  120ms   activity card rises
 * ───────────────────────────────────────────────────────── */

import { fetchActivity } from '@/lib/supabase/data';
import { FadeRise } from '@/components/motion';
import { LightShell } from '@/components/dashboard/LightShell';
import { ActivitySection } from '@/components/dashboard/tasks/ActivitySection';
import type { TaskActivity } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const activity = await fetchActivity(50).catch(() => []);
  const typedActivity = activity as unknown as TaskActivity[];

  return (
    <LightShell navLabel="Sections" fill bordered headerPadding="px-6 py-4">
      {/* ── Body ────────────────────────────────────────────── */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <FadeRise y={6} delay={0.08}>
            <div className="mb-6">
              <h1 className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-[#1a1a1a]">
                Activity
              </h1>
              <p className="mt-1 text-[13.5px] text-[#7a7a7a]">
                What the team&apos;s been up to.
              </p>
            </div>
          </FadeRise>

          <FadeRise y={6} delay={0.12}>
            {typedActivity.length === 0 ? (
              <div className="rounded-2xl bg-white px-8 py-10 text-center shadow-seeko">
                <p className="text-[14px] text-[#9a9a9a]">No activity yet.</p>
              </div>
            ) : (
              <section className="rounded-2xl bg-white px-6 py-5 shadow-seeko">
                <ActivitySection activity={typedActivity} />
              </section>
            )}
          </FadeRise>
        </div>
      </main>
    </LightShell>
  );
}
