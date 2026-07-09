import type { Area, Milestone } from '@/lib/types';
import { Gamepad2 } from 'lucide-react';
import { OverviewPanel } from './OverviewPanel';
import { OverviewRow } from './OverviewRow';
import { phaseHealthMap } from './areaHealth';
import { orderAreas, overallProgress } from './studioProgress';
import { MilestoneHealthBadge } from './tasks/MilestoneHealthBadge';

export function StudioOverviewPanel({
  areas,
  milestones = [],
}: {
  areas: Area[];
  milestones?: Milestone[];
}) {
  const ordered = orderAreas(areas);
  const hasAreas = areas.length > 0;
  const overall = overallProgress(areas);

  // Health relayed from the issues tab. Areas have no milestones of their own,
  // so each area's health = the like-named phase milestone's health (Main Game
  // in phase Alpha → the ALPHA milestone). Worst-of if a phase has several.
  const healthByPhase = phaseHealthMap(milestones);

  return (
    <OverviewPanel
      icon={Gamepad2}
      eyebrow="Progress"
      centerRows
      stat={`${overall}% Overall`}
      cta={{ href: '/areas', label: 'Open studio →' }}
    >
      {hasAreas ? (
        ordered.map((a) => {
          const health = a.phase ? healthByPhase.get(a.phase.trim().toLowerCase()) ?? null : null;
          return (
            <OverviewRow
              key={a.id}
              leading={<span className="size-2 rounded-full bg-[#12121273]" aria-hidden />}
              primary={a.name}
              trailing={health ? <MilestoneHealthBadge level={health} showLabel light /> : undefined}
            />
          );
        })
      ) : (
        <OverviewRow primary={<span className="text-[var(--ov-muted)]">No areas tracked yet.</span>} />
      )}
    </OverviewPanel>
  );
}
