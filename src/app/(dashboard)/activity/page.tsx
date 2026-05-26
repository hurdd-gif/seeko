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

import Link from 'next/link';
import { fetchActivity } from '@/lib/supabase/data';
import { FadeRise } from '@/components/motion';
import { ActivitySection } from '@/components/dashboard/tasks/ActivitySection';
import type { TaskActivity } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Canonical nav set — same three tabs on every light page (Overview · Issues ·
// Docs). Activity reaches this page via the account dropdown, so none of the
// pill tabs is active here.
const TABS = [
  { label: 'Overview', href: '/', active: false },
  { label: 'Issues', href: '/tasks', active: false },
  { label: 'Docs', href: '/docs', active: false },
] as const;

export default async function ActivityPage() {
  const activity = await fetchActivity(50).catch(() => []);
  const typedActivity = activity as unknown as TaskActivity[];

  return (
    <div className="overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--ov-bg)] antialiased">
      {/* ── Top chrome ──────────────────────────────────────── */}
      <header className="shrink-0 border-b border-black/[0.06] bg-[var(--ov-bg)]">
        <FadeRise y={6} delay={0.04}>
          <div className="flex items-center gap-3 px-6 py-4">
            <nav
              aria-label="Sections"
              className="flex h-[44px] items-center gap-1 rounded-full bg-white px-1.5 shadow-seeko"
            >
              {TABS.map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  aria-current={t.active ? 'page' : undefined}
                  className={
                    t.active
                      ? 'flex h-[32px] items-center rounded-full bg-[#0000000d] px-3 text-[13.5px] font-medium leading-[18px] tracking-[-0.27px] text-[#626262]'
                      : 'flex h-[32px] items-center rounded-full px-3 text-[13.5px] font-medium leading-[18px] tracking-[-0.27px] text-[#c5c5c5] transition-colors duration-150 ease-out hover:text-[#808080]'
                  }
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>
        </FadeRise>
      </header>

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
    </div>
  );
}
