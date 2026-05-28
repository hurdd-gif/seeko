/* Activity route loading state — paints instantly on navigation while the
 * server fetches activity. Re-renders the real LightShell chrome (stable across
 * the load) and skeletonizes only the content region via boneyard.
 *
 * Until bones are captured (`npm run bones`, see src/bones/README.md), the
 * ContentSkeleton has no registered bones for "activity-content" and renders
 * `fallback` below — a calm light placeholder. After capture + registry import,
 * it upgrades to pixel-accurate bones automatically. */

import { LightShell } from '@/components/dashboard/LightShell';
import { ContentSkeleton } from '@/components/dashboard/ContentSkeleton';

function ActivityFallback() {
  return (
    <div className="motion-safe:animate-pulse">
      {/* heading + subtitle */}
      <div className="mb-6">
        <div className="h-6 w-28 rounded-md bg-black/[0.06]" />
        <div className="mt-2 h-3.5 w-52 rounded bg-black/[0.05]" />
      </div>
      {/* activity card with rows */}
      <section className="rounded-2xl bg-white px-6 py-5 shadow-seeko">
        <div className="space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-black/[0.06]" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="h-3.5 w-3/4 rounded bg-black/[0.06]" />
                <div className="h-3 w-16 rounded bg-black/[0.05]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ActivityLoading() {
  return (
    <LightShell navLabel="Sections" fill bordered headerPadding="px-6 py-4">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <ContentSkeleton name="activity-content" loading fallback={<ActivityFallback />} />
        </div>
      </main>
    </LightShell>
  );
}
