/* ActivitySection — last N events from activity_log filtered by task_id.
 * Typed events (kind set) render structured copy; legacy free-text events
 * fall back to action + target.
 *
 * The "See all" affordance now lives in the parent RailSection's trailing
 * slot — this component just renders the visible slice. */

'use client';

import {
  Plus,
  ArrowRightLeft,
  UserCog,
  Flag,
  FlagOff,
  TrendingUp,
  Activity as ActivityIcon,
} from 'lucide-react';
import type { TaskActivity, TaskActivityKind } from '@/lib/types';

const KIND_ICON: Record<TaskActivityKind, React.ComponentType<{ className?: string }>> = {
  created: Plus,
  status_changed: ArrowRightLeft,
  assignee_changed: UserCog,
  milestone_linked: Flag,
  milestone_unlinked: FlagOff,
  progress_changed: TrendingUp,
};

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderCopy(a: TaskActivity): string {
  if (!a.kind) return `${a.action} ${a.target}`.trim();
  const before = (a.before_value as string | null) ?? null;
  const after = (a.after_value as string | null) ?? null;
  switch (a.kind) {
    case 'created':
      return 'created this task';
    case 'status_changed':
      return before && after ? `moved from ${before} to ${after}` : 'changed status';
    case 'assignee_changed':
      return after ? `assigned to ${after}` : 'unassigned';
    case 'milestone_linked':
      return after ? `linked to milestone ${after}` : 'linked a milestone';
    case 'milestone_unlinked':
      return before ? `unlinked from milestone ${before}` : 'unlinked a milestone';
    case 'progress_changed':
      return before != null && after != null
        ? `set progress ${before} → ${after}%`
        : 'updated progress';
    default:
      return `${a.action} ${a.target}`.trim();
  }
}

export function ActivitySection({
  activity,
  limit,
}: {
  activity: TaskActivity[];
  /** Maximum number of rows to render. Parent toggles this via the section header. */
  limit?: number;
}) {
  if (activity.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-[#9a9a9a]">
        <ActivityIcon className="size-3.5" />
        <span>No activity yet.</span>
      </div>
    );
  }

  const visible = typeof limit === 'number' ? activity.slice(0, limit) : activity;

  return (
    <ol className="flex flex-col gap-2.5">
      {visible.map((a) => {
        const Icon = a.kind ? KIND_ICON[a.kind] : ActivityIcon;
        return (
          <li key={a.id} className="flex items-start gap-2.5 text-[12.5px]">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[#7a7a7a]">
              <Icon className="size-3" />
            </span>
            <div className="min-w-0 flex-1 leading-[1.4]">
              <span className="text-[#3a3a3a]">{renderCopy(a)}</span>
              <span className="ml-1.5 text-[#a8a8a8]">·</span>
              <span className="ml-1.5 text-[#a8a8a8]">{formatTimeAgo(a.created_at)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
