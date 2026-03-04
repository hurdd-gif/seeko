import { fetchActivity } from '@/lib/supabase/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ActivityPage() {
  const activity = await fetchActivity(30).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">A log of all recent activity across your workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>Recent events from the team.</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="relative flex flex-col gap-0">
              {activity.map((item, i) => {
                const name = (item.profiles as unknown as { display_name?: string })?.display_name ?? 'Unknown';
                return (
                  <div key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < activity.length - 1 && (
                      <div className="absolute left-4 top-10 h-[calc(100%-24px)] w-px bg-border" />
                    )}
                    <Avatar className="relative z-10 size-8 shrink-0">
                      <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                        {getInitials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 items-start justify-between gap-4 pt-0.5">
                      <div>
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{name}</span>{' '}
                          <span className="text-muted-foreground">{item.action.toLowerCase()}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground font-mono">{item.target}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
