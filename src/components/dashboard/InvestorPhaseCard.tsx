'use client';

type Props = {
  name: string;
  targetDate: string | null;
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

export function InvestorPhaseCard({ name, targetDate, isPast }: Props) {
  const formatted = formatTargetDate(targetDate);

  // One card, one job: name + ship date. When the target has slipped, the
  // date line carries an explicit overdue cue (red status dot + label) rather
  // than a bare red date, so the state reads without a legend.
  return (
    <div className="flex min-h-[88px] flex-col justify-center gap-1 rounded-xl bg-surface-3 px-3.5 py-3 shadow-[0_0_0_1px_rgba(0,0,0,0.035)]">
      <span className="text-[14px] font-medium leading-[18px] text-ink-title">{name}</span>
      {formatted ? (
        isPast ? (
          <span className="inline-flex items-center gap-1.5 self-start text-[12px] leading-[16px] tabular-nums text-[--color-status-blocked]">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[--color-status-blocked]" />
            Overdue · {formatted}
          </span>
        ) : (
          <span className="text-[12px] leading-[16px] tabular-nums text-[var(--ov-muted)]">
            {formatted}
          </span>
        )
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
    </div>
  );
}
