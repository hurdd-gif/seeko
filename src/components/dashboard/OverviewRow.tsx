import type { ReactNode } from 'react';

// The one row primitive shared by both Overview panels (Tasks + Progress). A
// fixed 16px leading-glyph gutter lines every label up at the same x — within a
// panel AND across panels. Single-line rows hold a 28px rhythm (min-h-7 +
// py-[5px] centers an 18px line exactly as the old fixed height did); long
// labels wrap to a second line (line-clamp-2) instead of truncating, so a name
// like "Concept Art: Characters icons and currency" stays legible. The leading
// glyph and trailing meta pin to the FIRST text line (items-start + a line-tall
// box), so the chevron/dot/badge sits beside line one, not the block center.
export function OverviewRow({
  leading,
  primary,
  trailing,
}: {
  leading?: ReactNode;
  primary: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex min-h-7 min-w-0 items-start gap-2 py-[5px]">
      <span className="flex h-[18px] w-4 shrink-0 items-center justify-center">{leading}</span>
      <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-[18px] tracking-[-0.03em] text-[var(--ov-text)]">
        {primary}
      </span>
      {trailing && (
        <span className="flex h-[18px] shrink-0 items-center gap-2 whitespace-nowrap pl-2">{trailing}</span>
      )}
    </li>
  );
}
