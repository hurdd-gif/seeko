/* MilestonesSection — list of milestones in a rail card.
 *
 * Read-only by default. When `isAdmin` is true and `allTasks` is provided,
 * each row becomes a MilestoneEditPopover trigger so admins can rename,
 * re-date, link/unlink tasks, or delete the milestone in place. */

'use client';

import { Flag } from 'lucide-react';
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

const TONE_COLOR: Record<TargetTone, string> = {
  overdue: '#f04438', // red — past due
  soon: '#bd7e10', // amber — due today / within a week
  normal: '#9a9a9a', // grey — comfortably out
};

function RowContent({ milestone }: { milestone: Milestone }) {
  const due = describeTargetDate(milestone.target_date);
  return (
    <>
      {milestone.health ? (
        <MilestoneHealthBadge level={milestone.health} />
      ) : (
        <Flag className="size-3.5 shrink-0 text-[#9a9a9a]" />
      )}
      <span className="min-w-0 flex-1 truncate">{milestone.name}</span>
      {due && (
        <span
          className={`shrink-0 text-[12px] tabular-nums ${
            due.tone === 'normal' ? '' : 'font-medium'
          }`}
          style={{ color: TONE_COLOR[due.tone] }}
        >
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
      <p className="text-[13px] leading-[1.5] text-[#7a7a7a]">
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
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[#2a2a2a] hover:bg-black/[0.02]"
          >
            <RowContent milestone={m} />
          </li>
        ),
      )}
    </ul>
  );
}
