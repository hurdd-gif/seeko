/* ─────────────────────────────────────────────────────────
 * Docs — paper-family port matching Overview/Tasks/Activity chrome.
 *
 * Shell: fixed inset-0 light surface + pill nav (Docs active) at top.
 * Body: grouped white shadow-seeko cards with divide-y document rows.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   page surface fades in
 *   40ms   pill nav rises (LightShell internal)
 *   80ms   heading + subtitle rise
 *  120ms   doc list / empty state rises in
 * ───────────────────────────────────────────────────────── */

import { fetchDocs, fetchProfile, fetchTeam } from '@/lib/supabase/data';
import { createClient } from '@/lib/supabase/server';
import { DocList } from '@/components/dashboard/DocList';
import { LightShell } from '@/components/dashboard/LightShell';
import { ContentSkeleton } from '@/components/dashboard/ContentSkeleton';
import { FadeRise } from '@/components/motion';

export default async function DocsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [docs, profile, team] = await Promise.all([
    fetchDocs().catch(() => { throw new Error('Failed to load documents.'); }),
    user ? fetchProfile(user.id).catch(() => null) : null,
    fetchTeam().catch(() => []),
  ]);
  const userDepartment = profile?.department ?? null;
  const isAdmin = profile?.is_admin ?? false;

  return (
    <LightShell activeTab="docs" navLabel="Sections" fill bordered headerPadding="px-6 py-4">
      {/* ── Body ────────────────────────────────────────────── */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          {/* Runtime passthrough (loading={false}); also the boneyard capture
              target — docs/loading.tsx mirrors this with loading forced on. */}
          <ContentSkeleton name="docs-content" loading={false}>
            <FadeRise y={6} delay={0.08}>
              <div className="mb-6">
                <h1 className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-[#1a1a1a]">
                  Documents
                </h1>
                <p className="mt-1 text-[13.5px] text-[#7a7a7a]">
                  Team documents, specs, and shared resources.
                </p>
              </div>
            </FadeRise>

            <FadeRise y={6} delay={0.12}>
              <DocList
                docs={docs}
                userDepartment={userDepartment}
                isAdmin={isAdmin}
                currentUserId={user?.id ?? ''}
                team={team}
              />
            </FadeRise>
          </ContentSkeleton>
        </div>
      </main>
    </LightShell>
  );
}
