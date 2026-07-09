import type { ReactNode } from 'react';

type Row = {
  id: string;
  leading?: ReactNode;
  primary: ReactNode;
};

// Right half of the Tasks panel: left-aligned rows mirroring the Progress
// panel. A fixed 16px icon gutter lines every label up at the same x, then the
// priority glyph, then a regular-weight, eased-tracking label.
export function PanelList({ rows, empty }: { rows: Row[]; empty?: ReactNode }) {
  if (rows.length === 0) {
    return (
      <p className="text-[14px] leading-[18px] text-[var(--ov-muted)]">
        {empty ?? 'Nothing here yet.'}
      </p>
    );
  }
  return (
    <ul className="flex w-full flex-col items-start gap-2.5">
      {rows.map((r) => (
        <li key={r.id} className="flex w-full min-w-0 items-center gap-2">
          {r.leading && (
            <span className="flex w-4 shrink-0 items-center justify-center">{r.leading}</span>
          )}
          <span className="min-w-0 truncate text-[14px] leading-[18px] tracking-[-0.03em] text-[var(--ov-text)]">
            {r.primary}
          </span>
        </li>
      ))}
    </ul>
  );
}
