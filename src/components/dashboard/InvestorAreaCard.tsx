'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerItem, HoverCard } from '@/components/motion';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { MousePointer } from 'lucide-react';
import type { Area } from '@/lib/types';
import type { TaskWithAssignee } from '@/lib/types';

interface InvestorAreaCardProps {
  area: Area;
  tasksInArea: TaskWithAssignee[];
}

export function InvestorAreaCard({ area, tasksInArea }: InvestorAreaCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <StaggerItem>
        <HoverCard>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative w-full text-left rounded-xl border border-border bg-card transition-colors hover:bg-card/90 hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-seeko-accent/30 cursor-pointer"
          >
            <div className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <MousePointer className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <Card className="border-0 shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{area.name}</p>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {area.phase && (
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                        {area.phase}
                      </span>
                    )}
                    {area.status && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal rounded-md">
                        {area.status}
                      </Badge>
                    )}
                  </div>
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
                      className="h-full rounded-full transition-all"
                      style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        </HoverCard>
      </StaggerItem>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogClose onClose={() => setOpen(false)} />
        <DialogHeader>
          <DialogTitle>{area.name}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {area.phase && (
              <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                {area.phase}
              </span>
            )}
            {area.status && (
              <Badge variant="outline" className="text-xs font-normal">
                {area.status}
              </Badge>
            )}
          </div>
        </DialogHeader>
        {area.description && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{area.description}</p>
        )}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-foreground">Overall progress</span>
            <span className="text-sm font-mono text-muted-foreground">{area.progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
            />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground mb-2">
            Tasks in this area ({tasksInArea.length})
          </h3>
          {tasksInArea.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks in this area yet.</p>
          ) : (
            <ul className="space-y-2">
              {tasksInArea.map(task => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-muted/50 text-sm"
                >
                  <span className="font-medium text-foreground truncate">{task.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.assignee?.display_name && (
                      <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                        {task.assignee.display_name}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                      {task.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
