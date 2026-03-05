/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   heading fades up
 *   80ms   subtitle fades up
 *  150ms   activity card rises in
 *  220ms   activity items stagger in (50ms apart)
 * ───────────────────────────────────────────────────────── */

import { fetchActivity } from '@/lib/supabase/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { ActivityMoreInfo } from '@/components/dashboard/ActivityMoreInfo';
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
  heading:  0,    // page title
  subtitle: 80,   // description line
  card:    150,   // activity card rises
  items:   220,   // items stagger start
};

/** FadeRise/Stagger delay in seconds */
const delay = (ms: number) => ms / 1000;

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

/** Lowercase action for sentence: "Name action target" */
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

function moreInfoHref(parsed: { type: string }, taskId?: string | null, docId?: string | null): string {
  if (taskId) return `/tasks?task=${encodeURIComponent(taskId)}`;
  if (docId) return `/docs?doc=${encodeURIComponent(docId)}`;
  if (parsed.type === 'doc') return '/docs';
  if (parsed.type === 'task' || parsed.type === 'area') return '/tasks';
  return '/activity';
}

type ActionConfig = { icon: typeof Activity; className: string; circleBg: string; badge: string; badgeVariant: 'default' | 'outline' | 'destructive' };
const ACTION_CONFIG: Record<string, ActionConfig> = {
  Created:             { icon: Plus,          className: 'text-seeko-accent', circleBg: 'bg-muted', badge: 'created',    badgeVariant: 'default' },
  Assigned:            { icon: UserPlus,      className: 'text-blue-400',     circleBg: 'bg-muted', badge: 'assigned',   badgeVariant: 'default' },
  Completed:           { icon: CheckCircle2,  className: 'text-emerald-400',  circleBg: 'bg-muted', badge: 'completed',  badgeVariant: 'default' },
  Started:             { icon: Timer,         className: 'text-amber-400',    circleBg: 'bg-muted', badge: 'started',    badgeVariant: 'default' },
  'Moved to review':   { icon: AlertCircle,   className: 'text-orange-400',   circleBg: 'bg-muted', badge: 'in review',  badgeVariant: 'outline' },
  Blocked:             { icon: AlertCircle,   className: 'text-red-400',      circleBg: 'bg-muted', badge: 'blocked',    badgeVariant: 'destructive' },
  Deleted:             { icon: Trash2,        className: 'text-red-400',      circleBg: 'bg-muted', badge: 'deleted',    badgeVariant: 'destructive' },
  'Commented on':      { icon: MessageSquare, className: 'text-purple-400',   circleBg: 'bg-muted', badge: 'comment',    badgeVariant: 'outline' },
  'Changed priority':  { icon: RefreshCw,     className: 'text-amber-400',    circleBg: 'bg-muted', badge: 'priority',   badgeVariant: 'outline' },
  'Changed department':{ icon: RefreshCw,     className: 'text-blue-400',     circleBg: 'bg-muted', badge: 'department', badgeVariant: 'outline' },
};

const FALLBACK_CONFIG: ActionConfig = { icon: Activity, className: 'text-muted-foreground', circleBg: 'bg-muted', badge: 'update', badgeVariant: 'outline' };

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

export default async function ActivityPage() {
  const activity = await fetchActivity(50).catch((e) => { throw new Error('Failed to load activity.'); });

  return (
    <div className="space-y-6">
      <div>
        <FadeRise delay={delay(TIMING.heading)}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
        </FadeRise>
        <FadeRise delay={delay(TIMING.subtitle)}>
          <p className="text-sm text-muted-foreground mt-1">Real-time log of task updates across your workspace.</p>
        </FadeRise>
      </div>

      <FadeRise delay={delay(TIMING.card)} y={12}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Activity Feed</CardTitle>
            <CardDescription>Task assignments, status changes, comments, and more.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pt-1">
            {activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Task assignments, status changes, and comments will show here."
              />
            ) : (
              <Stagger className="relative flex flex-col gap-0" staggerMs={0.05} delayMs={delay(TIMING.items)}>
                {activity.map((item, i) => {
                const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
                const name = prof?.display_name ?? 'Unknown';
                const cfg = ACTION_CONFIG[item.action] ?? FALLBACK_CONFIG;
                const Icon = cfg.icon;
                const parsed = parseTarget(item.target);
                const sentence = actionToSentence(item.action);
                const href = moreInfoHref(parsed, item.task_id, item.doc_id);

                return (
                  <StaggerItem key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
                    {i < activity.length - 1 && (
                      <div
                        className="absolute left-4 top-10 h-[calc(100%-24px)] w-px bg-border"
                        style={{ transform: 'translateX(-50%)' }}
                        aria-hidden
                      />
                    )}
                    <div
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.circleBg}`}
                      aria-hidden
                    >
                      <Icon className={`size-4 shrink-0 ${cfg.className}`} />
                    </div>
                    <div className="flex flex-1 min-w-0 flex-col gap-0.5 pt-0.5">
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{name}</span>
                        {' '}
                        <span>{sentence}</span>
                        {' '}
                        <span className="font-medium text-foreground">{parsed.name}</span>
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
                      </div>
                      <span className="text-[11px] text-muted-foreground/70">
                        {timeAgo(item.created_at)}
                      </span>
                      <ActivityMoreInfo
                        name={name}
                        sentence={sentence}
                        parsed={parsed}
                        createdAt={item.created_at}
                        href={href}
                      />
                    </div>
                  </StaggerItem>
                );
              })}
              </Stagger>
            )}
          </CardContent>
        </Card>
      </FadeRise>
    </div>
  );
}
