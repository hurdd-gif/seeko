import { fetchTasks, fetchAreas, fetchTeam, fetchDocs, fetchActivity } from '@/lib/supabase/data';
import { Task, Area } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import {
  CheckSquare,
  Activity,
  Users,
  FileText,
  Circle,
  ArrowUpRight,
  Map,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'outline'> = {
  High: 'destructive',
  Urgent: 'destructive',
  Medium: 'default',
  Low: 'outline',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function OverviewPage() {
  const [tasks, areas, team, docs, activity] = await Promise.all([
    fetchTasks().catch((): Task[] => []),
    fetchAreas().catch((): Area[] => []),
    fetchTeam().catch(() => []),
    fetchDocs().catch(() => []),
    fetchActivity(5).catch(() => []),
  ]);

  const openTasks = tasks.filter(t => t.status !== 'Complete').length;
  const completed = tasks.filter(t => t.status === 'Complete').length;

  const stats = [
    { label: 'Open Tasks', value: openTasks, icon: CheckSquare },
    { label: 'Completed', value: completed, icon: Activity },
    { label: 'Team Members', value: team.length, icon: Users },
    { label: 'Documents', value: docs.length, icon: FileText },
  ];

  const upcoming = tasks
    .filter(t => t.status !== 'Complete')
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <FadeRise>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Here is what is happening with your team.</p>
      </FadeRise>

      {/* ── Stat cards ──────────────────────────────────── */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <StaggerItem key={stat.label}>
            <HoverCard>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                  <stat.icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tracking-tight">{stat.value}</span>
                    <span className="flex items-center text-xs font-medium text-foreground">
                      <ArrowUpRight className="mr-0.5 size-3" />
                      {stat.value}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>
        ))}
      </Stagger>

      {/* ── Game Areas ──────────────────────────────────── */}
      {areas.length > 0 && (
        <FadeRise delay={0.3}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Map className="size-4 text-muted-foreground" />
                <CardTitle>Game Areas</CardTitle>
              </div>
              <CardDescription>Dojo · Battleground · Fighting Club</CardDescription>
            </CardHeader>
            <CardContent>
              <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-4" delayMs={0.05}>
                {areas.map(area => (
                  <StaggerItem key={area.id}>
                    <HoverCard>
                      <div className="rounded-lg border border-border p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{area.name}</p>
                          {area.phase && (
                            <Badge variant="outline" className="shrink-0 text-xs">{area.phase}</Badge>
                          )}
                        </div>
                        {area.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {area.description}
                          </p>
                        )}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-muted-foreground">Progress</span>
                            <span className="text-xs font-mono text-muted-foreground">{area.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                            />
                          </div>
                        </div>
                      </div>
                    </HoverCard>
                  </StaggerItem>
                ))}
              </Stagger>
            </CardContent>
          </Card>
        </FadeRise>
      )}

      {/* ── Tasks + Activity ────────────────────────────── */}
      <FadeRise delay={0.4}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Upcoming Tasks</CardTitle>
              <CardDescription>Tasks that need attention soon.</CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming tasks.</p>
              ) : (
                <Stagger className="flex flex-col gap-4" staggerMs={0.06} delayMs={0.05}>
                  {upcoming.map(task => (
                    <StaggerItem key={task.id}>
                      <div className="flex items-center justify-between rounded-md border border-border p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-md bg-secondary">
                            <Circle className="size-4 text-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{task.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {task.department ?? 'Unassigned'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge
                            variant={PRIORITY_VARIANT[task.priority] ?? 'outline'}
                            className="text-xs"
                          >
                            {task.priority}
                          </Badge>
                          {task.deadline && (
                            <p className="text-xs text-muted-foreground">Due {task.deadline}</p>
                          )}
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions from your team.</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <Stagger className="flex flex-col gap-4" staggerMs={0.06} delayMs={0.05}>
                  {activity.map(item => {
                    const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
                    const name = prof?.display_name ?? 'Unknown';
                    const avatar = prof?.avatar_url;
                    return (
                      <StaggerItem key={item.id}>
                        <div className="flex items-start gap-3">
                          <Avatar className="size-8">
                            <AvatarImage src={avatar} alt={name} />
                            <AvatarFallback className="bg-secondary text-foreground text-xs">
                              {getInitials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-0.5">
                            <p className="text-sm text-foreground">
                              <span className="font-medium">{name}</span>{' '}
                              <span className="text-muted-foreground">{item.action.toLowerCase()}</span>
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">{item.target}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              )}
            </CardContent>
          </Card>
        </div>
      </FadeRise>
    </div>
  );
}
