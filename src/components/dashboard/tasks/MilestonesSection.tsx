/* MilestonesSection — list of milestones in a rail card.
 *
 * Read-only by default. When `isAdmin` is true and `allTasks` is provided,
 * each row becomes a MilestoneEditPopover trigger so admins can rename,
 * re-date, link/unlink tasks, or delete the milestone in place. */

'use client';

import { CalendarClock, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Milestone, TaskWithAssignee } from '@/lib/types';
import { MilestoneEditPopover } from './MilestoneEditPopover';
import { MilestoneHealthBadge } from './MilestoneHealthBadge';

// DB stores DATE (no time / no zone). `new Date('YYYY-MM-DD')` parses as UTC
// midnight, which shifts back a day in timezones west of UTC. Build the Date
// from local components so the rendered day matches the picker.
function parseLocalDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 86_400_000;

export type TargetTone = 'overdue' | 'soon' | 'normal';

/**
 * Turn a milestone's target DATE into temporally-aware copy + a severity tone.
 * Compares calendar days in local time (not raw timestamps), so a same-day
 * target reads "Today" no matter the clock. `now` is injectable for testing.
 *   past      → "Nd overdue"  (overdue)
 *   today     → "Today"       (soon)
 *   ≤ 7 days  → "in Nd"       (soon)
 *   further   → "Mon D"       (normal)
 */
export function describeTargetDate(
  iso: string | null | undefined,
  now: Date = new Date(),
): { label: string; tone: TargetTone } | null {
  const target = parseLocalDate(iso);
  if (!target) return null;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(target) - startOfDay(now)) / MS_PER_DAY);

  if (diffDays < 0) return { label: `${-diffDays}d overdue`, tone: 'overdue' };
  if (diffDays === 0) return { label: 'Today', tone: 'soon' };
  if (diffDays <= 7) return { label: `in ${diffDays}d`, tone: 'soon' };
  return {
    label: target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'normal',
  };
}

/**
 * The date reads as a CHIP, not as colored text — the same chip the board's
 * cards already wear for their deadlines (TaskCard: h-6, rounded-full, tinted
 * fill, CalendarClock). It used to be a bare red string, which made "45d
 * overdue" the loudest raw text in the rail while the identical fact on a card
 * two inches away sat calmly inside a pill. Same fact, same object type, two
 * different visual weights — the tint carries the alarm, the fill contains it.
 */
const TONE_CHIP: Record<TargetTone, string> = {
  overdue: 'bg-[#f04438]/10 dark:bg-danger/15 text-[#d92d20] dark:text-danger',
  soon: 'bg-[#bd7e10]/10 dark:bg-[#fbbf24]/15 text-[#a86d0c] dark:text-[#fbbf24]',
  normal: 'bg-wash-4 text-[#777777] dark:text-ink-muted',
};

function RowContent({ milestone }: { milestone: Milestone }) {
  const due = describeTargetDate(milestone.target_date);
  return (
    <>
      {milestone.health ? (
        <MilestoneHealthBadge level={milestone.health} />
      ) : (
        <Flag className="size-3.5 shrink-0 text-ink-faint" />
      )}
      <span className="min-w-0 flex-1 truncate">{milestone.name}</span>
      {due && (
        <span
          className={cn(
            'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium leading-none tabular-nums',
            TONE_CHIP[due.tone],
          )}
        >
          <CalendarClock className="size-3 shrink-0" strokeWidth={1.75} />
          {due.label}
        </span>
      )}
    </>
  );
}

export function MilestonesSection({
  milestones,
  isAdmin = false,
  allTasks,
  onSaved,
  onDeleted,
  onLinksChanged,
}: {
  milestones: Milestone[];
  isAdmin?: boolean;
  /** Required when isAdmin to enable per-row edit. */
  allTasks?: TaskWithAssignee[];
  onSaved?: (m: Milestone) => void;
  onDeleted?: (id: string) => void;
  onLinksChanged?: (milestoneId: string, linkedTaskIds: string[]) => void;
}) {
  if (milestones.length === 0) {
    return (
      <p className="text-[13px] leading-[1.5] text-ink-muted">
        Add milestones to organize work into checkpoints.
      </p>
    );
  }

  const canEdit = isAdmin && !!allTasks && !!onSaved && !!onDeleted;

  return (
    <ul className="flex flex-col gap-0.5">
      {milestones.map((m) =>
        canEdit ? (
          <li key={m.id}>
            <MilestoneEditPopover
              milestone={m}
              allTasks={allTasks!}
              onSaved={onSaved!}
              onDeleted={onDeleted!}
              onLinksChanged={onLinksChanged}
              ariaLabel={`Edit milestone ${m.name}`}
            >
              <RowContent milestone={m} />
            </MilestoneEditPopover>
          </li>
        ) : (
          <li
            key={m.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink-strong hover:bg-wash-2"
          >
            <RowContent milestone={m} />
          </li>
        ),
      )}
    </ul>
  );
}
