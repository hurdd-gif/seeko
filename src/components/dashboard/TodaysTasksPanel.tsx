import { ChevronsUp, ChevronUp, ChevronDown } from 'lucide-react';
import type { Task } from '@/lib/types';
import { OverviewPanel } from './OverviewPanel';
import { OverviewRow } from './OverviewRow';

// AA-on-white priority glyphs. High coral deepened #ff6e5e (~2.75:1, sub-AA) →
// #f04438 (~3.8:1); medium amber #ffce52 (~1.3:1, near-invisible) → #bd7e10
// (~3.4:1, gold not brown). Don't relight back to brighter values: they fail
// the 3:1 graphic threshold on white.
const priority = {
  high: { Icon: ChevronsUp, color: '#f04438' },
  medium: { Icon: ChevronUp, color: '#bd7e10' },
  low: { Icon: ChevronDown, color: '#4c4c4c' },
} as const;

export function TodaysTasksPanel({ tasks, totalOpen }: { tasks: Task[]; totalOpen: number }) {
  const rows = tasks.slice(0, 4);
  // The "Tasks" eyebrow is now a page-level SectionEyebrow above the card
  // (pulled out like "Recently worked on"), so the card header is just the stat,
  // left-aligned — no in-card icon/eyebrow.
  return (
    <OverviewPanel
      stat={`${tasks.length} due soon`}
      statMeta={`${totalOpen} across studio`}
      cta={{ href: '/tasks', label: 'View Tasks →' }}
    >
      {rows.length === 0 ? (
        <OverviewRow primary={<span className="text-[var(--ov-muted)]">Nothing due soon</span>} />
      ) : (
        rows.map((t) => {
          const key = (t.priority ?? 'medium').toString().toLowerCase() as keyof typeof priority;
          const { Icon, color } = priority[key] ?? priority.medium;
          return (
            <OverviewRow
              key={t.id}
              leading={<Icon className="size-4" strokeWidth={2} style={{ color }} aria-hidden />}
              primary={t.name}
            />
          );
        })
      )}
    </OverviewPanel>
  );
}
