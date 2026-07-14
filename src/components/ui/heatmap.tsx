'use client';

// GitHub-style contribution heatmap, composed shadcn-style:
//
//   <HeatmapChart data={data} gap={3} layout="fluid" levelStyles={levelStyles}>
//     <HeatmapCells />
//     <HeatmapXAxis />
//     <HeatmapYAxis tickFilter="odd" labelFormat="initial" />
//     <HeatmapTooltip />
//   </HeatmapChart>
//   <HeatmapLegend lessLabel="Less" moreLabel="More" />
//
// Weeks are columns (Sun→Sat rows), ending at the current week. `layout="fluid"`
// stretches columns to fill the container (cells stay square); `"fixed"` uses
// `cellSize` pixels. Levels are 0–4: zero-count days are level 0, the rest are
// scaled against the window's max count, GitHub-quartile style.

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export type HeatmapDatum = { date: string; count: number };

/** SEEKO accent-blue ramp on white (level 0 matches the light icon-circle grey). */
export const HEATMAP_LEVEL_STYLES = [
  'bg-wash-5',
  'bg-heat-1',
  'bg-heat-2',
  'bg-heat-3',
  'bg-seeko-accent',
];

type Cell = {
  /** ISO `YYYY-MM-DD`; null for grid slots after today (rendered invisible). */
  date: string | null;
  count: number;
  level: number;
  col: number;
  row: number;
};

type HoveredCell = { date: string; count: number; x: number; y: number };

type HeatmapContextValue = {
  cells: Cell[];
  weeks: number;
  gap: number;
  layout: 'fluid' | 'fixed';
  cellSize: number;
  levelStyles: string[];
  monthLabels: { col: number; label: string }[];
  hovered: HoveredCell | null;
  setHovered: (h: HoveredCell | null) => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
};

const HeatmapContext = createContext<HeatmapContextValue | null>(null);

function useHeatmap(component: string) {
  const ctx = useContext(HeatmapContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <HeatmapChart>`);
  return ctx;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function HeatmapChart({
  data,
  weeks = 26,
  gap = 3,
  layout = 'fluid',
  cellSize = 12,
  levelStyles = HEATMAP_LEVEL_STYLES,
  className,
  children,
}: {
  data: HeatmapDatum[];
  /** Number of week columns, ending at the current week. */
  weeks?: number;
  gap?: number;
  layout?: 'fluid' | 'fixed';
  /** Cell edge in px — only used when `layout="fixed"`. */
  cellSize?: number;
  levelStyles?: string[];
  className?: string;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState<HoveredCell | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const { cells, monthLabels } = useMemo(() => {
    const countByDate = new Map(data.map((d) => [d.date, d.count]));
    const max = Math.max(1, ...data.map((d) => d.count));

    // UTC-noon anchors sidestep DST edges. Buckets AND the "today" anchor are
    // UTC days, matching the server's aggregation — a local-date anchor would
    // hide this evening's events once UTC rolls past midnight.
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
    );
    const weekStart = new Date(today.getTime() - today.getUTCDay() * DAY_MS);

    const cells: Cell[] = [];
    const monthLabels: { col: number; label: string }[] = [];
    let prevMonth = -1;

    for (let col = 0; col < weeks; col++) {
      const colStart = new Date(weekStart.getTime() - (weeks - 1 - col) * 7 * DAY_MS);
      const month = colStart.getUTCMonth();
      if (month !== prevMonth) {
        monthLabels.push({
          col,
          label: colStart.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        });
        prevMonth = month;
      }
      for (let row = 0; row < 7; row++) {
        const day = new Date(colStart.getTime() + row * DAY_MS);
        if (day.getTime() > today.getTime()) {
          cells.push({ date: null, count: 0, level: 0, col, row });
          continue;
        }
        const date = isoDay(day);
        const count = countByDate.get(date) ?? 0;
        const level = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
        cells.push({ date, count, level, col, row });
      }
    }
    // Drop a leading month label immediately chased by the next one (a
    // one-column sliver of the previous month reads as noise).
    if (monthLabels.length >= 2 && monthLabels[1].col - monthLabels[0].col < 2) {
      monthLabels.shift();
    }
    return { cells, monthLabels };
  }, [data, weeks]);

  return (
    <HeatmapContext.Provider
      value={{ cells, weeks, gap, layout, cellSize, levelStyles, monthLabels, hovered, setHovered, gridRef }}
    >
      <div
        className={cn(
          // select-none: the month labels and the M/W/F ticks are aria-hidden — the
          // component already calls them decoration — but they are HTML spans in the
          // same box as the hover grid, so dragging across the heatmap highlighted
          // them. Nothing in here is content anyone copies.
          'relative grid select-none',
          layout === 'fluid' && 'w-full',
          className,
        )}
        style={{
          gridTemplateAreas: '"corner xaxis" "yaxis cells"',
          gridTemplateColumns: 'auto 1fr',
          rowGap: gap + 1,
          columnGap: gap + 3,
        }}
      >
        {children}
      </div>
    </HeatmapContext.Provider>
  );
}

function gridColumns(ctx: Pick<HeatmapContextValue, 'weeks' | 'layout' | 'cellSize'>) {
  return ctx.layout === 'fluid'
    ? `repeat(${ctx.weeks}, minmax(0, 1fr))`
    : `repeat(${ctx.weeks}, ${ctx.cellSize}px)`;
}

export function HeatmapCells({ className }: { className?: string }) {
  const ctx = useHeatmap('HeatmapCells');
  const { cells, gap, levelStyles, setHovered, gridRef } = ctx;

  return (
    <div
      ref={gridRef}
      role="img"
      aria-label="Activity heatmap"
      className="grid"
      style={{
        gridArea: 'cells',
        gridTemplateColumns: gridColumns(ctx),
        gridTemplateRows: 'repeat(7, auto)',
        gridAutoFlow: 'column',
        gap,
      }}
      onPointerLeave={() => setHovered(null)}
    >
      {cells.map((cell) =>
        cell.date === null ? (
          <div key={`${cell.col}-${cell.row}`} className="aspect-square w-full" />
        ) : (
          <div
            key={cell.date}
            data-date={cell.date}
            className={cn(
              'aspect-square w-full rounded-[3px]',
              // Hover outline sits inside the cell so neighbours never shift.
              'hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-black/20',
              levelStyles[cell.level] ?? levelStyles[0],
              className,
            )}
            onPointerEnter={(e) => {
              const grid = gridRef.current;
              if (!grid) return;
              const g = grid.getBoundingClientRect();
              const r = e.currentTarget.getBoundingClientRect();
              setHovered({
                date: cell.date!,
                count: cell.count,
                x: r.left - g.left + r.width / 2,
                y: r.top - g.top,
              });
            }}
          />
        ),
      )}
    </div>
  );
}

export function HeatmapXAxis({
  className,
  fontSize = 10,
}: {
  className?: string;
  fontSize?: number;
}) {
  const ctx = useHeatmap('HeatmapXAxis');
  return (
    <div
      aria-hidden
      className="grid"
      style={{ gridArea: 'xaxis', gridTemplateColumns: gridColumns(ctx), gap: ctx.gap }}
    >
      {ctx.monthLabels.map(({ col, label }) => (
        <span
          key={`${col}-${label}`}
          className={cn('whitespace-nowrap leading-none text-ink-faint', className)}
          style={{ gridColumnStart: col + 1, fontSize }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function HeatmapYAxis({
  tickFilter = 'odd',
  labelFormat = 'initial',
  className,
  fontSize = 10,
}: {
  /** `odd` shows Mon/Wed/Fri (GitHub convention); `all` shows every row. */
  tickFilter?: 'odd' | 'all';
  labelFormat?: 'initial' | 'short';
  className?: string;
  fontSize?: number;
}) {
  const ctx = useHeatmap('HeatmapYAxis');
  return (
    <div
      aria-hidden
      className="grid"
      style={{ gridArea: 'yaxis', gridTemplateRows: 'repeat(7, 1fr)', gap: ctx.gap }}
    >
      {WEEKDAYS.map((day, row) => (
        <span
          key={day}
          className={cn('flex items-center leading-none text-ink-faint', className)}
          style={{ fontSize }}
        >
          {(tickFilter === 'all' || row % 2 === 1) &&
            (labelFormat === 'initial' ? day[0] : day.slice(0, 3))}
        </span>
      ))}
    </div>
  );
}

export function HeatmapTooltip({
  format,
}: {
  /** Custom row renderer; defaults to `N events · Mar 24`. */
  format?: (hovered: { date: string; count: number }) => ReactNode;
}) {
  const { hovered } = useHeatmap('HeatmapTooltip');
  if (!hovered) return null;

  const pretty = new Date(`${hovered.date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink-title px-2 py-1 text-[11px] leading-none text-surface-1 shadow-seeko"
      style={{
        gridArea: 'cells',
        left: hovered.x,
        top: hovered.y - 6,
        justifySelf: 'start',
        alignSelf: 'start',
      }}
    >
      {format ? (
        format(hovered)
      ) : (
        <>
          <span className="font-medium tabular-nums">
            {hovered.count === 0 ? 'No events' : `${hovered.count} event${hovered.count === 1 ? '' : 's'}`}
          </span>
          <span className="ml-1.5 text-white/55">{pretty}</span>
        </>
      )}
    </div>
  );
}

export function HeatmapLegend({
  align = 'end',
  variant = 'levels',
  lessLabel = 'Less',
  moreLabel = 'More',
  fontSize = 11,
  gap = 3,
  swatchSize = 11,
  levelStyles = HEATMAP_LEVEL_STYLES,
  labelClassName,
  className,
}: {
  align?: 'start' | 'center' | 'end';
  /** `levels` = discrete swatches (GitHub); `gradient` = continuous bar. */
  variant?: 'levels' | 'gradient';
  lessLabel?: string;
  moreLabel?: string;
  fontSize?: number;
  gap?: number;
  swatchSize?: number;
  levelStyles?: string[];
  labelClassName?: string;
  className?: string;
}) {
  const justify =
    align === 'start' ? 'justify-start' : align === 'center' ? 'justify-center' : 'justify-end';
  const labelCls = cn('leading-none text-ink-faint', labelClassName);

  return (
    /* select-none: "Less"/"More" are a scale key, not content. */
    <div className={cn('flex select-none items-center gap-1.5', justify, className)} style={{ fontSize }}>
      <span className={labelCls}>{lessLabel}</span>
      {variant === 'levels' ? (
        <span className="flex" style={{ gap }}>
          {levelStyles.map((style, i) => (
            <span
              key={i}
              className={cn('rounded-[3px]', style)}
              style={{ width: swatchSize, height: swatchSize }}
            />
          ))}
        </span>
      ) : (
        <span
          className="rounded-full bg-gradient-to-r from-wash-5 via-heat-2 to-seeko-accent"
          style={{ width: swatchSize * 5 + gap * 4, height: swatchSize }}
        />
      )}
      <span className={labelCls}>{moreLabel}</span>
    </div>
  );
}
