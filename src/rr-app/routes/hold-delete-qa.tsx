import { useState } from 'react';
import { HoldToDelete } from '@/components/dashboard/tasks/TaskActivityThread';

/* No-backend visual-QA preview for the comment card's hold-to-delete control,
 * reachable at /tasks/hold-delete-qa WITHOUT the loader's auth gate. Mounts the
 * REAL <HoldToDelete> so the press → open → sweep → commit sequence (and the
 * release retraction, which is the part that has to stay interruptible) can be
 * exercised in a fresh browser session.
 *
 * It exists because the control only renders on a comment you OWN: QA'ing it on
 * the real thread means writing a throwaway comment to the live DB and leaving
 * activity_log rows behind. Here the commit is a counter.
 *
 * One bay, not a light/dark pair: the scheme is a `.dark` class on <html>, so a
 * subtree cannot opt back into light. Use the app's own toggle (or flip the root
 * class) to check the other scheme — the control's fill is a hardcoded #c04040
 * in light and a `danger` token in dark, and those have to be compared.
 *
 * NOT a migration target — deliberately absent from routeInventory. */

export function HoldDeleteQaRoute() {
  const [commits, setCommits] = useState(0);

  return (
    // Literal canvas, matching the sibling QA routes — these previews mount
    // outside the themed shells, so a token-backed page background has nothing
    // to resolve against.
    <div className="flex min-h-screen items-start justify-center bg-[#f5f5f5] p-12 dark:bg-[#1b1b1b]">
      <div className="flex w-[380px] flex-col gap-4 rounded-2xl bg-surface-1 p-6 ring-1 ring-wash-6">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-ink-title">Hold to delete</span>
          <span className="text-[12px] tabular-nums text-ink-faint">committed {commits}×</span>
        </div>

        {/* The real comment-card action row. The control has to sit next to its
            siblings, because "does the pill shove the row around when it opens?"
            is a question the control cannot answer on its own. */}
        <div className="flex items-center justify-end gap-1 rounded-xl bg-surface-2 p-3 ring-1 ring-wash-4">
          <button
            type="button"
            aria-label="React"
            className="flex size-7 items-center justify-center rounded-md text-ink-faint hover:bg-wash-4"
          >
            ☺
          </button>
          <button
            type="button"
            aria-label="Edit"
            className="flex size-7 items-center justify-center rounded-md text-ink-faint hover:bg-wash-4"
          >
            ✎
          </button>
          <HoldToDelete onCommit={() => setCommits((n) => n + 1)} />
        </div>

        <p className="text-[12px] leading-relaxed text-ink-faint">
          Press and hold 3s to commit. Release early to abort.
        </p>
      </div>
    </div>
  );
}
