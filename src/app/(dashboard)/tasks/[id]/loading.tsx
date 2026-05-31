/* ─────────────────────────────────────────────────────────
 * Instant task-detail loading state — bespoke skeleton.
 *
 * NOT a ContentSkeleton/boneyard surface: TaskDetailPage owns
 * its own fixed-inset chrome (it is not wrapped in LightShell),
 * and the task name/number are unknown until fetched. So this
 * hand-builds the detail chrome instead of reusing the shared
 * skeleton kit. The breadcrumb back-link ("Issues") and the
 * fixed chrome are reproduced verbatim; the task-number, title,
 * body and right-sidebar are skeletonized as pulsing tint bars.
 * ───────────────────────────────────────────────────────── */

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function TaskDetailLoading() {
  return (
    <div className="overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--ov-bg)] antialiased">
      {/* Top chrome: breadcrumb + actions */}
      <header className="shrink-0 border-b border-black/[0.06] bg-[var(--ov-bg)]">
        <div className="flex items-center gap-2 px-6 pt-5 pb-2">
          <Link
            href="/tasks"
            className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
          >
            <ChevronLeft className="size-3.5" />
            <span>Issues</span>
          </Link>
          <ChevronRight className="size-3 text-[#c5c5c5]" />
          {/* task number unknown at load → skeleton bar */}
          <div className="h-3 w-12 motion-safe:animate-pulse rounded bg-black/[0.06]" />
        </div>
        <div className="flex items-center justify-end gap-1 px-6 pb-3">
          {/* actions placeholder */}
          <div className="size-8 motion-safe:animate-pulse rounded-md bg-black/[0.05]" />
        </div>
      </header>

      {/* Body: main content + right sidebar */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl motion-safe:animate-pulse px-8 py-8">
            {/* main detail card */}
            <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
              <div className="px-8 pt-8 pb-6">
                {/* title (text-[28px]) → tall bar */}
                <div className="h-7 w-2/3 rounded-md bg-black/[0.06]" />
                {/* description lines */}
                <div className="mt-5 space-y-2.5">
                  <div className="h-3.5 w-full rounded bg-black/[0.05]" />
                  <div className="h-3.5 w-11/12 rounded bg-black/[0.05]" />
                  <div className="h-3.5 w-4/5 rounded bg-black/[0.05]" />
                </div>
              </div>
            </section>
            {/* Activity section placeholder */}
            <div className="mt-4 space-y-3">
              <div className="h-3.5 w-20 rounded bg-black/[0.06]" />
              {/* a few activity rows */}
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="size-7 shrink-0 rounded-full bg-black/[0.06]" />
                  <div className="h-3 w-3/4 rounded bg-black/[0.05]" />
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Right sidebar — Properties / Milestones / Progress */}
        <aside
          aria-label="Task properties"
          className="hidden w-[380px] shrink-0 border-l border-black/[0.06] lg:flex lg:flex-col"
        >
          <div className="flex min-h-0 flex-1 motion-safe:animate-pulse flex-col gap-6 overflow-y-auto px-4 py-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="h-3.5 w-24 rounded bg-black/[0.06]" />
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="h-3 w-20 rounded bg-black/[0.05]" />
                    <div className="h-3 w-16 rounded bg-black/[0.05]" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
