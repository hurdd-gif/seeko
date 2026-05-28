/* Team route loading state — paints instantly on navigation while the
 * server fetches the team roster. Re-renders the real LightShell chrome
 * (stable across the load) and skeletonizes only the content region via boneyard.
 *
 * Until bones are captured (`npm run bones`, see src/bones/README.md), the
 * ContentSkeleton has no registered bones for "team-content" and renders
 * `fallback` below — a calm light placeholder approximating the team card with
 * department groups and member rows. After capture + registry import, it
 * upgrades to pixel-accurate bones automatically. */

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { LightShell } from '@/components/dashboard/LightShell';
import { ContentSkeleton } from '@/components/dashboard/ContentSkeleton';

function TeamFallback() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* header — title + subtitle on the left, online cluster on the right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-6 w-20 rounded-md bg-black/[0.06]" />
          <div className="mt-1.5 h-3.5 w-16 rounded bg-black/[0.05]" />
        </div>
        <div className="hidden items-center -space-x-2 sm:flex">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="size-7 rounded-full bg-black/[0.06] ring-2 ring-white" />
          ))}
        </div>
      </div>

      {/* main team card — department groups with member rows */}
      <div className="rounded-2xl bg-white p-5 shadow-seeko">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              {/* group label bar + divider */}
              <div className="mb-1 flex items-center gap-2 px-3">
                <div className="h-3.5 w-28 rounded bg-black/[0.06]" />
                <div className="h-px flex-1 bg-black/[0.06]" />
              </div>
              {/* member rows */}
              <div className="flex flex-col">
                {Array.from({ length: g === 0 ? 4 : 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="size-10 shrink-0 rounded-full bg-black/[0.06]" />
                    <div className="flex-1 min-w-0">
                      <div className="h-3.5 w-1/3 rounded bg-black/[0.06]" />
                      <div className="mt-1.5 h-3 w-20 rounded bg-black/[0.05]" />
                    </div>
                    <div className="h-5 w-16 shrink-0 rounded-md bg-black/[0.05]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TeamLoading() {
  return (
    <LightShell
      fill
      bordered
      leftSlot={
        <Link
          href="/"
          className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
        >
          <ChevronLeft className="size-3.5" />
          <span>Team</span>
        </Link>
      }
    >
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
          <ContentSkeleton name="team-content" loading fallback={<TeamFallback />} />
        </div>
      </main>
    </LightShell>
  );
}
