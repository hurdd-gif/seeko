import { fetchTasks, fetchAreas, fetchTeam, fetchDocs, fetchActivity } from '@/lib/supabase/data';
import { Task, Area } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  CheckSquare,
  Activity,
  Users,
  FileText,
  Circle,
  ArrowUpRight,
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Here is what is happening with your team.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <Card key={stat.label}>
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
        ))}
      </div>

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
              <div className="flex flex-col gap-4">
                {upcoming.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
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
                ))}
              </div>
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
              <div className="flex flex-col gap-4">
                {activity.map(item => {
                  const prof = item.profiles as unknown as { display_name?: string; avatar_url?: string } | undefined;
                  const name = prof?.display_name ?? 'Unknown';
                  const avatar = prof?.avatar_url;
                  return (
                    <div key={item.id} className="flex items-start gap-3">
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
