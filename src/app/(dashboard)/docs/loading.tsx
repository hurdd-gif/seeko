/* Docs route loading state — paints instantly on navigation while the
 * server fetches documents. Re-renders the real LightShell chrome (stable across
 * the load) and skeletonizes only the content region via boneyard.
 *
 * Until bones are captured (`npm run bones`, see src/bones/README.md), the
 * ContentSkeleton has no registered bones for "docs-content" and renders
 * `fallback` below — a calm light placeholder approximating the grouped doc
 * cards. After capture + registry import, it upgrades to pixel-accurate bones
 * automatically. */

import { LightShell } from '@/components/dashboard/LightShell';
import { ContentSkeleton } from '@/components/dashboard/ContentSkeleton';

function DocsFallback() {
  return (
    <div className="motion-safe:animate-pulse">
      {/* heading + subtitle */}
      <div className="mb-6">
        <div className="h-6 w-32 rounded-md bg-black/[0.06]" />
        <div className="mt-2 h-3.5 w-64 rounded bg-black/[0.05]" />
      </div>
      {/* grouped doc cards — one white card per department, divide-y rows */}
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="mb-7 last:mb-0">
          {/* group label bar */}
          <div className="mb-2.5 px-1">
            <div className="h-3.5 w-24 rounded bg-black/[0.06]" />
          </div>
          <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
            <div className="divide-y divide-black/[0.06]">
              {Array.from({ length: g === 0 ? 4 : 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3.5 px-4 py-3.5">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-black/[0.06]" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <div className="h-3.5 w-1/2 rounded bg-black/[0.06]" />
                    <div className="h-3 w-24 rounded bg-black/[0.05]" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ))}
    </div>
  );
}

export default function DocsLoading() {
  return (
    <LightShell activeTab="docs" navLabel="Sections" fill bordered headerPadding="px-6 py-4">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <ContentSkeleton name="docs-content" loading fallback={<DocsFallback />} />
        </div>
      </main>
    </LightShell>
  );
}
