import { Link } from '@/lib/react-router-adapters';
import type { LucideIcon } from 'lucide-react';

type Props = {
  href: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
};

// Recent-work tile — redesign spec (Paper 2LN-0): 64px tall, 8px radius, 12px
// pad, 4px gap, bg #FCFCFCE6, resting --ov-shadow-row (hairline ring + faint
// pool), lifting to --ov-shadow-row-hov on hover. 16px leading glyph; the time
// token hugs its content (shrink-0) at 15px so any bucket — "Today", "1 week",
// "3 wk" — fits without the old fixed slot clipping it; right-aligned 15px title
// fills the rest and clamps to one line. Width 356px so exactly three tiles span
// the 1100px content column (3×356 + 2×16 gap = 1100); the rest scroll.
export function Tile({ href, title, subtitle, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      className="flex h-16 w-[356px] shrink-0 snap-start items-center gap-1 rounded-lg bg-[#fcfcfce6] p-3 shadow-[var(--ov-shadow-row)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-[var(--ov-shadow-row-hov)] active:scale-[0.98]"
    >
      {Icon && (
        <Icon className="size-4 shrink-0 text-[var(--ov-muted)]" strokeWidth={2} aria-hidden />
      )}
      {subtitle && (
        <span className="shrink-0 whitespace-nowrap text-[15px] leading-[16px] tracking-[-0.03em] tabular-nums text-[var(--ov-muted)]">
          {subtitle}
        </span>
      )}
      <span className="line-clamp-1 min-w-0 flex-1 text-right text-[15px] leading-[115%] tracking-[-0.03em] text-[var(--ov-title)]">
        {title}
      </span>
    </Link>
  );
}
