import { fetchTasks, fetchAreas } from '@/lib/notion';
import { Task, Area } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<string, string> = {
  'Complete':    'var(--color-status-complete)',
  'In Progress': 'var(--color-status-progress)',
  'In Review':   'var(--color-status-review)',
  'Blocked':     'var(--color-status-blocked)',
};

const PRIORITY_VARIANT: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  High:   'destructive',
  Medium: 'secondary',
  Low:    'outline',
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function OverviewPage() {
  const [tasks, areas] = await Promise.all([
    fetchTasks().catch((): Task[] => []),
    fetchAreas().catch((): Area[] => []),
  ]);

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'Complete').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const blocked = tasks.filter(t => t.status === 'Blocked').length;

  const depts = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];
  const deptCounts = depts.map(dept => ({
    name: dept,
    count: tasks.filter(t => t.department === dept).length,
  })).sort((a, b) => b.count - a.count);

  const recent = tasks.slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Studio-wide tasks and game area progress</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tasks" value={total} />
        <StatCard label="Completed" value={completed} />
        <StatCard label="In Progress" value={inProgress} />
        <StatCard label="Blocked" value={blocked} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Departments</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {deptCounts.map(({ name, count }) => (
                <div key={name} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-foreground">{name}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {deptCounts.every(d => d.count === 0) && (
                <p className="text-sm text-muted-foreground py-2">No tasks yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Game Areas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {areas.map(area => (
                <div key={area.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-foreground">{area.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{area.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                    />
                  </div>
                </div>
              ))}
              {areas.length === 0 && (
                <p className="text-sm text-muted-foreground">No areas found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">No tasks found.</p>
          ) : (
            <div className="divide-y divide-border">
              {recent.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_DOT[task.status] ?? '#6b7280' }}
                  />
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{task.name}</span>
                  <Badge variant="secondary" className="hidden sm:inline-flex shrink-0">
                    {task.department}
                  </Badge>
                  <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'outline'} className="shrink-0">
                    {task.priority}
                  </Badge>
                  {task.deadline && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0 hidden md:block">
                      {task.deadline}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
