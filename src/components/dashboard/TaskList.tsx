'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Task } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

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

const STATUSES = ['All', 'Complete', 'In Progress', 'In Review', 'Blocked'] as const;

export function filterTasks(tasks: Task[], query: string, status: string): Task[] {
  return tasks.filter(t => {
    const matchesQuery = !query || t.name.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === 'All' || t.status === status;
    return matchesQuery && matchesStatus;
  });
}

export function TaskList({ tasks, assigneeName }: { tasks: Task[]; assigneeName?: string }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('All');

  const filtered = useMemo(() => filterTasks(tasks, query, status), [tasks, query, status]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-full sm:w-40">
          {STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">No tasks found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_DOT[task.status] ?? '#6b7280' }}
                  />
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{task.name}</span>
                  <Badge variant="secondary" className="hidden sm:inline-flex shrink-0">
                    {task.department}
                  </Badge>
                  <Badge variant="outline" className="shrink-0 hidden sm:inline-flex">
                    {task.status}
                  </Badge>
                  <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'outline'} className="shrink-0">
                    {task.priority}
                  </Badge>
                  {task.deadline && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0 hidden lg:block">
                      {task.deadline}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
        {assigneeName ? ` for ${assigneeName}` : ''}
      </p>
    </div>
  );
}
