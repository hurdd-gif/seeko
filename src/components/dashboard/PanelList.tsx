import type { ReactNode } from 'react';

type Row = {
  id: string;
  leading?: ReactNode;
  primary: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
};

export function PanelList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id} className="flex items-baseline gap-4 text-sm">
          {r.leading && (
            <span className="w-16 flex-shrink-0 text-xs text-muted-foreground">
              {r.leading}
            </span>
          )}
          <span className="min-w-0 flex-1 text-foreground">{r.primary}</span>
          {r.meta && <span className="text-xs text-muted-foreground">{r.meta}</span>}
          {r.trailing && <span className="flex-shrink-0">{r.trailing}</span>}
        </li>
      ))}
    </ul>
  );
}
