import { Gamepad2 } from 'lucide-react';
import type { Area } from '@/lib/types';
import { SplitPanel } from './SplitPanel';
import { PanelPromo } from './PanelPromo';
import { PanelList } from './PanelList';

export function StudioProgressPanel({ areas }: { areas: Area[] }) {
  const pinned = areas[0];
  return (
    <SplitPanel
      icon={Gamepad2}
      eyebrow="Studio progress"
      left={
        <PanelPromo
          title={pinned?.name ?? 'Studio'}
          body={`${areas.length} areas tracked`}
          cta={{ href: '/areas', label: 'Open studio →' }}
        />
      }
      right={
        <PanelList
          rows={areas.map((a) => ({
            id: a.id,
            primary: a.name,
            trailing: (
              <div className="flex items-center gap-2">
                <div className="h-1 w-20 rounded bg-muted">
                  <div
                    className="h-full rounded bg-[var(--color-seeko-accent)]"
                    style={{ width: `${a.progress}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{a.progress}%</span>
              </div>
            ),
          }))}
        />
      }
    />
  );
}
