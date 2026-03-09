/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   heading + subtitle fades up
 *  120ms   first date group label fades in
 *  180ms   activity items stagger in (50ms apart)
 * ───────────────────────────────────────────────────────── */

import Link from 'next/link';
import { fetchActivity } from '@/lib/supabase/data';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
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
} from 'lucide-react';

const TIMING = {
  hero:    0,
  groups: 120,
  items:  180,
};

const delay = (ms: number) => ms / 1000;

// ── Helpers ──────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

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

// ── Action config ────────────────────────────────────────

/** significant = events that deserve visual emphasis */
type ActionConfig = {
  icon: typeof Activity;
  className: string;
  significant?: boolean;
};

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
};

const FALLBACK_CONFIG: ActionConfig = { icon: Activity, className: 'text-muted-foreground' };

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

// ── Group by date ────────────────────────────────────────

type ActivityItem = Awaited<ReturnType<typeof fetchActivity>>[number];

function groupByDate(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const groups: Map<string, ActivityItem[]> = new Map();
  for (const item of items) {
    const label = dateLabel(item.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return Array.from(groups, ([label, items]) => ({ label, items }));
}

// ── Page ─────────────────────────────────────────────────

export default async function ActivityPage() {
  const activity = await fetchActivity(50).catch(() => { throw new Error('Failed to load activity.'); });
  const groups = groupByDate(activity);

  return (
    <div className="flex flex-col gap-6">
      <FadeRise delay={delay(TIMING.hero)}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">What the team&apos;s been up to.</p>
      </FadeRise>

      {activity.length === 0 ? (
        <EmptyState
          icon="Activity"
          title="No activity yet"
          description="Task updates, comments, and assignments will show here."
        />
      ) : (
        <FadeRise delay={delay(TIMING.groups)} y={12}>
          <div className="flex flex-col gap-8">
            {groups.map(group => (
              <section key={group.label}>
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
                  {group.label}
                </h2>
                <Stagger className="flex flex-col gap-0.5" staggerMs={0.05} delayMs={delay(TIMING.items)}>
                  {group.items.map(item => {
                    const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
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
        </FadeRise>
      )}
    </div>
  );
}
