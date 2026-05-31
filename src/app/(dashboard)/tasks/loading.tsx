/* ─────────────────────────────────────────────────────────
 * tasks/loading.tsx — instant board loading state for /tasks
 *
 * DELIBERATE EXCEPTION: unlike the other routes (/activity, /docs,
 * /team) which wrap a boneyard `ContentSkeleton` capture target inside
 * the page, the /tasks board does NOT use ContentSkeleton and does NOT
 * touch TasksBoard.tsx. Reason: the board's column layout depends on an
 * unbroken `h-full` flex/overflow chain plus a motion-driven rail, and
 * boneyard's wrapper divs would collapse that chain. So /tasks gets a
 * hand-built static column skeleton instead.
 *
 * The chrome (LightShell + header right cluster) is reproduced 1:1 so
 * the loading frame lines up with the real board; only the columns are
 * skeletonized. The rail is closed on first load (width 0), so no rail
 * skeleton is rendered.
 * ───────────────────────────────────────────────────────── */

import { LightShell } from '@/components/dashboard/LightShell';

/**
 * Static, non-interactive stand-in for the board's real `actions` slot
 * (New-issue button, filter/display popovers, view + rail toggles — all
 * `size-9 rounded-full` controls). Keeps the header's right side shape.
 */
function StaticActionsSkeleton() {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="size-9 rounded-full bg-black/[0.05]" />
      ))}
    </div>
  );
}

/** Card skeleton — mirrors TaskCard (`w-full rounded-xl bg-white p-3 shadow-seeko`). */
function CardSkeleton() {
  return (
    <div className="w-full rounded-xl bg-white p-3 shadow-seeko">
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-10 rounded bg-black/[0.05]" />
        <div className="size-5 rounded-full bg-black/[0.06]" />
      </div>
      <div className="mt-2 flex items-start gap-2">
        <div className="mt-0.5 size-2.5 rounded-full bg-black/[0.10]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-full rounded bg-black/[0.06]" />
          <div className="h-3 w-2/3 rounded bg-black/[0.06]" />
        </div>
      </div>
      <div className="mt-3 h-2.5 w-12 rounded bg-black/[0.05]" />
    </div>
  );
}

/** Column skeleton — mirrors a board column root + header + card stack. */
function ColumnSkeleton({ cardCount }: { cardCount: number }) {
  return (
    <div className="flex w-[296px] shrink-0 flex-col gap-2 rounded-xl bg-black/[0.035] p-2">
      <div className="flex items-center gap-2 px-1 py-1">
        <div className="size-2.5 rounded-full bg-black/[0.12]" />
        <div className="h-3.5 w-24 rounded bg-black/[0.06]" />
        <div className="h-3.5 w-4 rounded bg-black/[0.05]" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: cardCount }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Board skeleton — ~5 columns with a VARYING number of cards so the
 * frame doesn't read as mechanically uniform. Whole tree pulses.
 */
function BoardSkeleton() {
  const columnCardCounts = [3, 4, 2, 3, 1];
  return (
    <div className="flex h-full items-start gap-4 px-6 pb-8 pt-2 motion-safe:animate-pulse">
      {columnCardCounts.map((cardCount, i) => (
        <ColumnSkeleton key={i} cardCount={cardCount} />
      ))}
    </div>
  );
}

export default function TasksLoading() {
  return (
    <LightShell
      activeTab="issues"
      navLabel="Project sections"
      fill
      bordered
      actions={<StaticActionsSkeleton />}
    >
      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          <BoardSkeleton />
        </main>
      </div>
    </LightShell>
  );
}
