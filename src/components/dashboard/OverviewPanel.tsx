import { Link } from '@/lib/react-router-adapters';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Stacked Overview panel (the "rethink composition" layout): a full-width card
// whose header carries the stat (and an optional section eyebrow), then a
// hairline divider, the row list, and a centered text CTA.
//
// Eyebrow modes:
//  - with `eyebrow` + `icon`: eyebrow pins top-left, stat pins top-right
//    (justified). Used by the legacy Progress panel.
//  - without `eyebrow`: the section heading lives ABOVE the card (a page-level
//    SectionEyebrow), so the in-card header is just the stat — left-aligned and
//    weighted up to semibold so it reads as the card's headline. Used by the
//    redesigned Tasks card.
export function OverviewPanel({
  icon: Icon,
  eyebrow,
  stat,
  statMeta,
  cta,
  centerRows = false,
  children,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  stat: string;
  statMeta?: string;
  cta: { href: string; label: string };
  // When a panel has fewer rows than its twin, equal-height stretch dumps all the
  // slack below the last row. Opt in to centering so the slack splits evenly
  // above/below — the rows float in the middle instead of stranding a void.
  centerRows?: boolean;
  children: ReactNode;
}) {
  const label = cta.label.replace(/\s*→\s*$/, '');
  const showEyebrow = Boolean(eyebrow && Icon);
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col overflow-clip rounded-[30px] bg-[#ffffffe6] shadow-[var(--ov-shadow-panel)]">
        <div
          className={`flex items-center gap-2 px-6 pt-[18px] pb-3.5${showEyebrow ? ' justify-between' : ''}`}
        >
          {showEyebrow && Icon && (
            <div className="flex shrink-0 items-center gap-2 pl-2">
              <Icon className="size-4 shrink-0 text-[var(--ov-eyebrow)]" strokeWidth={2} aria-hidden />
              <span className="whitespace-nowrap text-[15px] font-medium leading-[18px] text-[var(--ov-eyebrow)]">
                {eyebrow}
              </span>
            </div>
          )}
          <div className={`flex min-w-0 items-baseline gap-2${showEyebrow ? '' : ' pl-2'}`}>
            <span
              className={`whitespace-nowrap text-[15px] leading-[18px] tabular-nums text-[#1b1b1b] ${showEyebrow ? 'font-medium' : 'font-semibold'}`}
            >
              {stat}
            </span>
            {statMeta && (
              <span className="whitespace-nowrap text-[14px] leading-[18px] tabular-nums text-[var(--ov-muted)]">
                {statMeta}
              </span>
            )}
          </div>
        </div>
        <div className="h-px bg-[var(--ov-hairline)]" aria-hidden />
        <ul className={`flex flex-1 flex-col px-6 py-2.5${centerRows ? ' justify-center' : ''}`}>
          {children}
        </ul>
        <div className="flex justify-center px-6 pb-5 pt-1">
          <Link
            href={cta.href}
            className="inline-flex w-fit items-center justify-center gap-1.5 rounded-full py-2 pl-3.5 pr-3 text-[14px] leading-[18px] text-[#545454] transition-[background-color,transform] duration-150 ease-out hover:bg-[#0000000a] active:scale-[0.97]"
          >
            <span>{label}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#848484"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
