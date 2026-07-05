'use client';
import { cn } from '@/lib/utils';

type Props = {
  name: string;
  targetDate: string | null;
  tasksComplete: number;
  tasksTotal: number;
  isPast?: boolean;
};

function formatTargetDate(targetDate: string | null): string | null {
  if (!targetDate) return null;
  // Parse YYYY-MM-DD components manually so the rendered month/day is
  // timezone-stable (otherwise `new Date('2026-06-15')` shifts to Jun 14
  // in any negative-UTC-offset locale).
  const [y, m, d] = targetDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function InvestorPhaseCard({ name, targetDate, tasksComplete, tasksTotal, isPast }: Props) {
  const formatted = formatTargetDate(targetDate);

  // Hide the task ratio when no tasks are seeded against this area. Rendering
  // "0 of 0 tasks complete" reads as a missing-data bug; collapsing the line
  // leaves a clean two-line card (name + ship date) and the matched
  // min-height keeps it visually peer with the dashed placeholder.
  const hasTasks = tasksTotal > 0;

  return (
    <div className="flex min-h-[88px] flex-col justify-center gap-1 rounded-xl bg-[#f7f7f7] px-3.5 py-3 shadow-[0_0_0_1px_rgba(0,0,0,0.035)]">
      <span className="text-[14px] font-medium leading-[18px] text-[#111]">{name}</span>
      {formatted ? (
        <span
          className={cn(
            'text-[12px] leading-[16px] tabular-nums',
            isPast ? 'text-[--color-status-blocked]' : 'text-[var(--ov-muted)]',
          )}
        >
          {formatted}
        </span>
      ) : (
        // TBD: dotted underline + faded muted-foreground so it recedes; tabular-nums
        // keeps the baseline aligned with real dates so the row doesn't shift.
        <span
          className="self-start text-[12px] leading-[16px] tabular-nums text-[var(--ov-muted)] underline decoration-dotted decoration-[var(--ov-muted)]/40 underline-offset-[3px]"
          aria-label="Target date to be determined"
        >
          TBD
        </span>
      )}
      {hasTasks && (
        <span className="text-[12px] leading-[16px] tabular-nums text-[var(--ov-muted)]">
          {tasksComplete} of {tasksTotal} tasks complete
        </span>
      )}
    </div>
  );
}
