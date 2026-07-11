// src/components/contractor/CompletedTimeline.tsx
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { parseDeadline } from '@/lib/contractor-buckets';

export type CompletedTimelineProps = {
  timeline: TimelineMonth[];
  /** How many entries show before the "Show N earlier" toggle. */
  initialCount?: number;
};

function shortDate(deadline: string | null): string | null {
  if (!deadline) return null;
  return parseDeadline(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The collapsing history below the deliverables card. Done tasks sit as
 * single-line nodes on a faint hairline spine, grouped by month. Only the first
 * `initialCount` show; the rest reveal (with a staggered fade) behind a toggle.
 * A completed task carries nothing to act on, so rows are static, not expandable.
 */
export function CompletedTimeline({ timeline, initialCount = 4 }: CompletedTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  if (timeline.length === 0) return null;

  // Flatten across months, remembering each entry's month so a divider prints on change.
  const flat = timeline.flatMap((m) =>
    m.items.map((item) => ({ item, monthKey: m.key, monthLabel: m.label })),
  );
  const total = flat.length;
  const visible = expanded ? flat : flat.slice(0, initialCount);
  const hiddenCount = total - visible.length;

  let lastMonth: string | null = null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 pl-6">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Timeline</h2>
        <span className="text-[11px] tabular-nums text-ink-ghost">{total}</span>
      </div>

      <ol className="relative">
        {visible.map(({ item, monthKey, monthLabel }, i) => {
          const showMonth = monthKey !== lastMonth;
          lastMonth = monthKey;
          const date = shortDate(item.deadline);
          const isNew = i >= initialCount; // only rows the toggle revealed animate in

          return (
            <li key={item.id}>
              {showMonth && (
                <p
                  className={`mb-1.5 pl-6 text-[11px] font-medium tabular-nums text-ink-faint ${
                    i === 0 ? 'mt-0' : 'mt-4'
                  }`}
                >
                  {monthLabel}
                </p>
              )}
              <div
                className={`relative flex items-center gap-2 py-1.5 pl-6 ${
                  isNew ? 'animate-timeline-enter' : ''
                }`}
                style={isNew ? { animationDelay: `${(i - initialCount) * 60}ms` } : undefined}
              >
                {/* node on the spine */}
                <span
                  className="absolute -left-[5px] flex size-2.5 items-center justify-center rounded-full bg-white ring-1 ring-hairline"
                  aria-hidden
                >
                  <span className="size-1 rounded-full bg-ink-ghost" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted-strong">
                  {item.name}
                </span>
                {date && (
                  <span className="shrink-0 text-[12px] tabular-nums text-ink-faint">{date}</span>
                )}
                <Check className="size-3.5 shrink-0 text-[#15803d]" strokeWidth={2.5} aria-hidden />
              </div>
            </li>
          );
        })}
      </ol>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 ml-6 inline-flex items-center gap-1 text-[12px] text-ink-faint transition-colors duration-150 ease-out hover:text-ink active:text-[#111]"
        >
          Show {hiddenCount} earlier
          <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      )}
    </section>
  );
}
