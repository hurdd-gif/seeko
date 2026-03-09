'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Stagger, StaggerItem } from '@/components/motion';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Timer,
  AlertCircle,
  UserPlus,
  Plus,
  Trash2,
  MessageSquare,
  ArrowRight,
  RefreshCw,
  Activity,
  Clock,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────

type ActivityItem = {
  id: string;
  action: string;
  target: string;
  created_at: string;
  task_id?: string | null;
  doc_id?: string | null;
  profiles?: unknown;
};

type ActionConfig = {
  icon: typeof Activity;
  className: string;
  significant?: boolean;
};

// ── Filter definitions ──────────────────────────────────

const FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'completed',   label: 'Completed' },
  { key: 'comments',    label: 'Comments' },
  { key: 'blocked',     label: 'Blocked' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const FILTER_ACTIONS: Record<Exclude<FilterKey, 'all'>, string[]> = {
  assignments: ['Assigned'],
  completed:   ['Completed'],
  comments:    ['Commented on'],
  blocked:     ['Blocked'],
};

// ── Action config ───────────────────────────────────────

const ACTION_CONFIG: Record<string, ActionConfig> = {
  Created:              { icon: Plus,          className: 'text-seeko-accent' },
  Assigned:             { icon: UserPlus,      className: 'text-blue-400', significant: true },
  Completed:            { icon: CheckCircle2,  className: 'text-emerald-400', significant: true },
  Started:              { icon: Timer,         className: 'text-amber-400' },
  'Moved to review':    { icon: AlertCircle,   className: 'text-orange-400' },
  Blocked:              { icon: AlertCircle,   className: 'text-red-400', significant: true },
  Deleted:              { icon: Trash2,        className: 'text-red-400', significant: true },
  'Commented on':       { icon: MessageSquare, className: 'text-purple-400' },
  'Changed priority':   { icon: RefreshCw,     className: 'text-amber-400' },
  'Changed department': { icon: RefreshCw,     className: 'text-blue-400' },
  'Requested extension':  { icon: Clock,        className: 'text-amber-400' },
  'Approved extension':   { icon: CheckCircle2,  className: 'text-emerald-400', significant: true },
  'Denied extension':     { icon: AlertCircle,   className: 'text-red-400', significant: true },
};

const FALLBACK_CONFIG: ActionConfig = { icon: Activity, className: 'text-muted-foreground' };

// ── Helpers ─────────────────────────────────────────────

function timeShort(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - itemDay.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function actionToSentence(action: string): string {
  const map: Record<string, string> = {
    Created: 'created',
    Assigned: 'assigned',
    Completed: 'completed',
    Started: 'started',
    'Moved to review': 'moved to review',
    Blocked: 'blocked',
    Deleted: 'deleted',
    'Commented on': 'commented on',
    'Changed priority': 'changed priority',
    'Changed department': 'changed department',
    'Requested extension': 'requested an extension on',
    'Approved extension': 'approved an extension on',
    'Denied extension': 'denied an extension on',
  };
  return map[action] ?? action.toLowerCase();
}

function itemHref(parsed: { type: string }, taskId?: string | null, docId?: string | null): string {
  if (taskId) return `/tasks?task=${encodeURIComponent(taskId)}`;
  if (docId) return `/docs?doc=${encodeURIComponent(docId)}`;
  if (parsed.type === 'doc') return '/docs';
  if (parsed.type === 'task' || parsed.type === 'area') return '/tasks';
  return '/activity';
}

function parseTarget(target: string): { type: string; name: string; detail?: string } {
  const arrowIdx = target.indexOf(' \u2192 ');
  if (target.startsWith('task: ')) {
    const rest = target.slice(6);
    if (arrowIdx > 0) {
      const taskPart = rest.slice(0, rest.indexOf(' \u2192 '));
      const detail = rest.slice(rest.indexOf(' \u2192 ') + 3);
      return { type: 'task', name: taskPart, detail };
    }
    return { type: 'task', name: rest };
  }
  if (target.startsWith('doc: ')) return { type: 'doc', name: target.slice(5) };
  if (target.startsWith('area: ')) return { type: 'area', name: target.slice(6) };
  return { type: 'other', name: target };
}

function groupByDate(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const groups: Map<string, ActivityItem[]> = new Map();
  for (const item of items) {
    const label = dateLabel(item.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return Array.from(groups, ([label, items]) => ({ label, items }));
}

// ── Component ───────────────────────────────────────────

export function ActivityFeed({ activity }: { activity: ActivityItem[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = filter === 'all'
    ? activity
    : activity.filter(item => FILTER_ACTIONS[filter].includes(item.action));

  const groups = groupByDate(filtered);

  return (
    <div className="flex flex-col gap-5 overflow-x-hidden">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {filter === 'all' ? '' : filter.toLowerCase() + ' '}activity yet.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(group => (
            <section key={group.label}>
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
                {group.label}
              </h2>
              <Stagger className="flex flex-col gap-0.5" staggerMs={0.05} delayMs={0.18}>
                {group.items.map(item => {
                  const prof = item.profiles as { display_name?: string } | undefined;
                  const name = prof?.display_name ?? 'Unknown';
                  const cfg = ACTION_CONFIG[item.action] ?? FALLBACK_CONFIG;
                  const Icon = cfg.icon;
                  const parsed = parseTarget(item.target);
                  const sentence = actionToSentence(item.action);
                  const href = itemHref(parsed, item.task_id, item.doc_id);

                  return (
                    <StaggerItem key={item.id}>
                      <Link
                        href={href}
                        className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 -mx-3 transition-colors hover:bg-white/[0.04] ${cfg.significant ? 'bg-white/[0.02]' : ''}`}
                      >
                        <div
                          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5"
                          aria-hidden
                        >
                          <Icon className={`size-3.5 ${cfg.className}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm text-muted-foreground ${cfg.significant ? 'text-foreground/90' : ''}`}>
                            <span className="font-medium text-foreground">{name}</span>
                            {' '}
                            <span>{sentence}</span>
                            {' '}
                            <span className={`font-medium ${cfg.significant ? 'text-foreground' : 'text-foreground/80'}`}>{parsed.name}</span>
                            {parsed.detail && (
                              <>
                                {' '}
                                <ArrowRight className="inline size-3 mx-0.5 text-muted-foreground/50 align-middle" />
                                {' '}
                                <span className="inline-flex items-center">
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal rounded-md bg-muted/80 text-foreground/80">
                                    {parsed.detail}
                                  </Badge>
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground/50 mt-0.5 group-hover:text-muted-foreground transition-colors">
                          {timeShort(item.created_at)}
                        </span>
                      </Link>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
