import { Calendar } from 'lucide-react';
import type { Area } from '@/lib/types';
import { SplitPanel } from './SplitPanel';
import { PanelPromo } from './PanelPromo';
import { PanelList } from './PanelList';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type AreaWithDeadline = Area & { deadline?: string };

export function NextMilestonePanel({ areas }: { areas: AreaWithDeadline[] }) {
  const phase = areas[0]?.phase ?? 'Studio plan';
  const dated = areas
    .filter((a): a is AreaWithDeadline & { deadline: string } => Boolean(a.deadline))
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 4);

  return (
    <SplitPanel
      icon={Calendar}
      eyebrow="Next milestone"
      left={
        <PanelPromo
          title={phase}
          body={`${areas.length} areas in this phase`}
          cta={{ href: '/areas', label: 'Open phase plan →' }}
        />
      }
      right={
        <PanelList
          rows={dated.map((a) => ({
            id: a.id,
            leading: fmtDate(a.deadline),
            primary: a.name,
            meta: `${a.progress}%`,
          }))}
        />
      }
    />
  );
}
