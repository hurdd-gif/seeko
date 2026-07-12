'use client';

/* ActivityView — the /activity page body: a contribution heatmap over the
 * studio's last six months, then the event feed grouped by day.
 *
 * Feed rows lean on data the old flat list ignored: the actor join
 * (profiles.display_name/avatar_url) fronts each row, and `target` carries the
 * task name on typed rows, so copy reads "Karti moved Game Combat from In
 * Progress to Done" instead of a subject-less "moved from In Progress to Todo".
 *
 * The tasks_audit triggers write BOTH a typed `assignee_changed` row and a
 * legacy "Assigned task: X → name" row for one assignment (and the same pair on
 * create-with-assignee), so the raw feed reads duplicated — dedupeActivity
 * drops the legacy twin when its typed sibling is within a few seconds.
 */

import { Fragment, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from '@/components/ui/heatmap';
import { FadeRise } from '@/components/motion';
import { CARD_TITLE } from '@/components/dashboard/lightKit';
import { getInitials } from '@/lib/utils';
import type { ActivityViewData } from '@/lib/dashboard-views';
import type { Profile, TaskActivity } from '@/lib/types';

const HEATMAP_WEEKS = 26;

/* ── Copy ──────────────────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Emphasised span — actors, task names, and "after" values get ink. */
function Ink({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink-title">{children}</span>;
}

/** Parse a legacy target like "task: Game Combat → Youngan" into parts. */
function parseLegacyTarget(target: string): { name: string; value?: string } | null {
  const m = target.match(/^task:\s*(.*?)(?:\s*→\s*(.*))?$/);
  return m ? { name: m[1], value: m[2] } : null;
}

/** The verb-phrase segment of a feed row (everything after the actor name). */
function eventCopy(a: TaskActivity, resolveName: (id: string) => string | undefined): ReactNode {
  const task = a.target ? <Ink>{a.target}</Ink> : 'a task';
  const before = (a.before_value as string | number | null) ?? null;
  const after = (a.after_value as string | number | null) ?? null;

  switch (a.kind) {
    case 'created':
      return <>created {task}</>;
    case 'status_changed':
      return before != null && after != null ? (
        <>
          moved {task} from {String(before)} to <Ink>{String(after)}</Ink>
        </>
      ) : (
        <>changed the status of {task}</>
      );
    case 'assignee_changed': {
      if (after == null) return <>unassigned {task}</>;
      const name = resolveName(String(after));
      const label = name ?? (UUID_RE.test(String(after)) ? 'a teammate' : String(after));
      return (
        <>
          assigned {task} to <Ink>{label}</Ink>
        </>
      );
    }
    case 'progress_changed':
      return before != null && after != null ? (
        <>
          moved {task} progress {String(before)}% → <Ink>{String(after)}%</Ink>
        </>
      ) : (
        <>updated progress on {task}</>
      );
    case 'milestone_linked':
      return (
        <>
          linked {task} to {after != null ? <Ink>{String(after)}</Ink> : 'a milestone'}
        </>
      );
    case 'milestone_unlinked':
      return (
        <>
          unlinked {task} from {before != null ? <Ink>{String(before)}</Ink> : 'a milestone'}
        </>
      );
  }

  // Legacy free-text rows: "Deleted" + "task: test", "Changed priority" +
  // "task: X → High" …
  const legacy = parseLegacyTarget(a.target);
  const verb = a.action.charAt(0).toLowerCase() + a.action.slice(1);
  if (legacy) {
    const destructive = /^delete/i.test(a.action);
    return (
      <>
        <span className={destructive ? 'text-danger' : undefined}>{verb}</span>{' '}
        <Ink>{legacy.name}</Ink>
        {legacy.value != null && (
          <>
            {' '}
            → <Ink>{legacy.value}</Ink>
          </>
        )}
      </>
    );
  }
  return (
    <>
      {verb} {a.target}
    </>
  );
}

/* ── Grouping & dedupe ─────────────────────────────────────────────────── */

/** Drop legacy "Assigned …" rows whose typed twin (assignee_changed or
 *  created-with-assignee) landed within 5s on the same task. Deleting a task
 *  nulls task_id on its rows (`on delete set null`), so fall back to the task
 *  name — typed rows carry it in `target`, legacy rows inside "task: …". */
function dedupeActivity(activity: TaskActivity[]): TaskActivity[] {
  const typedTimes = new Map<string, number[]>();
  for (const a of activity) {
    if (a.kind === 'assignee_changed' || a.kind === 'created') {
      const key = a.task_id ?? `name:${a.target}`;
      const list = typedTimes.get(key) ?? [];
      list.push(new Date(a.created_at).getTime());
      typedTimes.set(key, list);
    }
  }
  return activity.filter((a) => {
    if (a.kind || a.action !== 'Assigned') return true;
    const key = a.task_id ?? `name:${parseLegacyTarget(a.target)?.name ?? a.target}`;
    const t = new Date(a.created_at).getTime();
    return !(typedTimes.get(key) ?? []).some((tt) => Math.abs(tt - t) < 5000);
  });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function groupByDay(activity: TaskActivity[]): { label: string; rows: TaskActivity[] }[] {
  const groups: { label: string; rows: TaskActivity[] }[] = [];
  for (const a of activity) {
    const label = dayLabel(a.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(a);
    else groups.push({ label, rows: [a] });
  }
  return groups;
}

/* ── Rows ──────────────────────────────────────────────────────────────── */

function ActivityRow({
  a,
  resolveName,
}: {
  a: TaskActivity;
  resolveName: (id: string) => string | undefined;
}) {
  // EKO's own writes carry source='eko'; they front EKO's mark + name instead
  // of the admin whose id is on the row.
  const isEko = a.source === 'eko';
  const actorName = isEko ? 'EKO' : a.profiles?.display_name ?? undefined;
  const time = new Date(a.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <li className="flex items-center gap-2.5 py-[7px]">
      {isEko ? (
        <span
          aria-label="EKO"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-seeko-accent/[0.12] text-seeko-accent outline outline-1 -outline-offset-1 outline-seeko-accent/25"
        >
          <Sparkles className="size-3.5" />
        </span>
      ) : (
        <Avatar className="size-6 shrink-0 outline outline-1 -outline-offset-1 outline-wash-6">
          <AvatarImage src={a.profiles?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-surface-4 text-[9px] text-ink-body">
            {actorName ? getInitials(actorName) : '?'}
          </AvatarFallback>
        </Avatar>
      )}
      <p className="min-w-0 flex-1 truncate text-[13px] leading-[1.45] text-[#6a6a6a] dark:text-ink-muted-strong">
        {isEko ? (
          <span className="font-medium text-seeko-accent">EKO</span>
        ) : (
          actorName && <Ink>{actorName}</Ink>
        )}
        {actorName ? ' ' : null}
        {eventCopy(a, resolveName)}
      </p>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{time}</span>
    </li>
  );
}

/* ── Page body ─────────────────────────────────────────────────────────── */

export function ActivityView({ view }: { view: ActivityViewData }) {
  const { activity, team, heatmap } = view;

  const nameById = new Map<string, string | undefined>(
    (team ?? []).map((p: Profile) => [p.id, p.display_name]),
  );
  const resolveName = (id: string) => nameById.get(id) || undefined;

  const feed = groupByDay(dedupeActivity(activity));
  const totalEvents = heatmap.reduce((sum, d) => sum + d.count, 0);

  return (
    <>
      {/* Chart sits bare on the canvas (user call — no card behind it). */}
      <FadeRise y={6} delay={0.08}>
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className={CARD_TITLE}>
              {totalEvents} event{totalEvents === 1 ? '' : 's'} in the past six months
            </h2>
            <HeatmapLegend className="translate-y-[1px]" />
          </div>
          <div className="mt-4">
            <HeatmapChart data={heatmap} weeks={HEATMAP_WEEKS} gap={3} layout="fluid">
              <HeatmapCells />
              <HeatmapXAxis />
              <HeatmapYAxis tickFilter="odd" labelFormat="initial" />
              <HeatmapTooltip />
            </HeatmapChart>
          </div>
        </section>
      </FadeRise>

      {feed.length === 0 ? (
        <FadeRise y={6} delay={0.12}>
          <div className="mt-6 rounded-2xl bg-surface-1 px-8 py-10 text-center shadow-seeko">
            <p className="text-[14px] text-ink-faint">No activity yet.</p>
          </div>
        </FadeRise>
      ) : (
        feed.map((group, i) => (
          <FadeRise key={group.label} y={6} delay={Math.min(0.12 + i * 0.04, 0.36)}>
            <section className="mt-6">
              <h3 className="px-1 text-[12px] font-medium text-ink-faint">{group.label}</h3>
              <ol className="mt-2 rounded-2xl bg-surface-1 px-5 py-2.5 shadow-seeko">
                {group.rows.map((a, j) => (
                  <Fragment key={a.id}>
                    {j > 0 && <li aria-hidden className="h-px bg-wash-4" />}
                    <ActivityRow a={a} resolveName={resolveName} />
                  </Fragment>
                ))}
              </ol>
            </section>
          </FadeRise>
        ))
      )}
    </>
  );
}
