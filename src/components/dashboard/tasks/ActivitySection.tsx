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
  Sparkles,
  Activity as ActivityIcon,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { TaskActivity, TaskActivityKind, Profile } from '@/lib/types';

export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const KIND_ICON: Record<TaskActivityKind, React.ComponentType<{ className?: string }>> = {
  created: Plus,
  status_changed: ArrowRightLeft,
  assignee_changed: UserCog,
  milestone_linked: Flag,
  milestone_unlinked: FlagOff,
  progress_changed: TrendingUp,
};

export function formatTimeAgo(iso: string) {
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

/** Resolve a profile id → display name; returns undefined when unknown. */
type NameResolver = (id: string) => string | undefined;

/**
 * Render one activity row's copy. `resolveName` turns an assignee UUID into a
 * human name; when the id can't be resolved we degrade to "a teammate" rather
 * than leaking the raw UUID into the feed (the bug from the board screenshot).
 */
export function renderCopy(a: TaskActivity, resolveName: NameResolver = () => undefined): string {
  if (!a.kind) return `${a.action} ${a.target}`.trim();
  const before = (a.before_value as string | null) ?? null;
  const after = (a.after_value as string | null) ?? null;
  switch (a.kind) {
    case 'created':
      return 'created this task';
    case 'status_changed':
      return before && after ? `moved from ${before} to ${after}` : 'changed status';
    case 'assignee_changed': {
      if (!after) return 'unassigned';
      const name = resolveName(after);
      if (name) return `assigned to ${name}`;
      // Unknown id: never surface the raw UUID. A legacy free-text name passes through.
      return isUuid(after) ? 'assigned to a teammate' : `assigned to ${after}`;
    }
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
  team,
}: {
  activity: TaskActivity[];
  /** Maximum number of rows to render. Parent toggles this via the section header. */
  limit?: number;
  /** Roster used to resolve assignee UUIDs → display names in the feed copy. */
  team?: Profile[];
}) {
  // Build the id→name resolver once per render from the roster. When no team is
  // passed, unresolved assignee ids gracefully read "a teammate" (never a UUID).
  const nameById = new Map<string, string | undefined>(
    (team ?? []).map((p) => [p.id, p.display_name]),
  );
  const resolveName = (id: string): string | undefined => nameById.get(id) || undefined;

  if (activity.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
        <ActivityIcon className="size-3.5" />
        <span>No activity yet.</span>
      </div>
    );
  }

  const visible = typeof limit === 'number' ? activity.slice(0, limit) : activity;

  // gap-1.5 (6px), not gap-2.5: the rows are only 22px tall, so 10px of air
  // between them was ~45% of a row — the feed read as five separate things
  // rather than one list, and it cost 40px of rail height.
  // showActorName: the rail was rendering the avatar but not the name, so a human
  // row read "moved from Todo to Done" — actorless — while EKO's rows right next
  // to it read "EKO moved from…". Who did it is the first thing you want from a
  // feed, and the asymmetry made EKO look like the only one working.
  return (
    <ol className="flex flex-col gap-1.5">
      {visible.map((a) => (
        <ActivityEventRow key={a.id} activity={a} resolveName={resolveName} showActorName />
      ))}
    </ol>
  );
}

/**
 * One activity event row (avatar/EKO mark/icon + copy + time). Shared by the
 * rail's ActivitySection and the full-page merged thread (TaskActivityThread),
 * so event rows read identically wherever they appear. Leads with the actor's
 * name when known — the merged feed sits next to authored comment cards, so
 * "d created this task" beats a nameless "created this task".
 */
export function ActivityEventRow({
  activity: a,
  resolveName = () => undefined,
  showActorName = false,
}: {
  activity: TaskActivity;
  resolveName?: NameResolver;
  /** Prefix the copy with the actor's display name (merged-feed style). */
  showActorName?: boolean;
}) {
  // EKO's own writes carry source='eko'; they get EKO's mark + name
  // instead of impersonating the admin whose id is on the row.
  const isEko = a.source === 'eko';
  const Icon = a.kind ? KIND_ICON[a.kind] : ActivityIcon;
  // Lead with the actor when the profile join resolved; the kind is
  // already spelled out in the copy, so the icon only carries rows
  // without an actor (system writes, deleted profiles).
  const actorName =
    a.profiles?.display_name || (a.user_id ? resolveName(a.user_id) : undefined);
  const hasActor = Boolean(a.profiles || (a.user_id && actorName));
  return (
    <li className="flex items-start gap-2.5 text-[12.5px]">
      {isEko ? (
        <span
          aria-label="EKO"
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-seeko-accent/[0.12] text-seeko-accent ring-1 ring-inset ring-seeko-accent/25"
        >
          <Sparkles className="size-3" />
        </span>
      ) : hasActor ? (
        <Avatar
          className="mt-0.5 size-5 ring-1 ring-wash-4"
          title={actorName}
        >
          <AvatarImage src={a.profiles?.avatar_url ?? undefined} alt={actorName ?? 'Teammate'} />
          <AvatarFallback
            hash={a.user_id ?? a.id}
            className="text-[8px] font-medium text-ink-body"
          >
            {initials(actorName)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-wash-4 text-ink-muted">
          <Icon className="size-3" />
        </span>
      )}
      <div className="min-w-0 flex-1 leading-[1.4]">
        <span className="text-ink">
          {isEko ? (
            <>
              <span className="font-medium text-seeko-accent">EKO</span>{' '}
            </>
          ) : showActorName && actorName ? (
            <>
              <span className="font-medium text-ink-title">{actorName}</span>{' '}
            </>
          ) : null}
          {renderCopy(a, resolveName)}
        </span>
        <span className="ml-1.5 text-[#a8a8a8] dark:text-ink-ghost">·</span>
        <span className="ml-1.5 text-[#a8a8a8] dark:text-ink-muted">{formatTimeAgo(a.created_at)}</span>
      </div>
    </li>
  );
}
