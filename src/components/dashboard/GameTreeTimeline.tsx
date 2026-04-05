'use client';

import { useLayoutEffect, useRef, useState, useCallback } from 'react';

const ACCENT = '#6ee7b7';
const LINE_X = 8;

const TREE = [
  {
    title: 'Main Game (UBAKU GROUND)',
    items: [
      'Embed combat & movement system',
      'Quest + Achievement system',
      'Secondary weapons — VFX, SFX & animations',
      'Leveling system',
    ],
  },
  {
    title: 'Fight Club',
    items: [
      'Same-session teleport — shop UI triggers on proximity',
      'Embed combat & movement system',
      'Party / Dueling system (1v1, 2v2, 3v3)',
      'General shop mirroring main grounds',
    ],
  },
];

// Pre-build flat row list with stable dot indices
type SectionRow = { kind: 'section'; title: string; dotIdx: number; sectionIdx: number };
type ItemRow    = { kind: 'item';    text: string;  dotIdx: number; sectionIdx: number; itemIdx: number };
type Row = SectionRow | ItemRow;

const ROWS: Row[] = [];
const SECTION_HEADER_DOT_INDICES: number[] = [];
let _idx = 0;
for (let si = 0; si < TREE.length; si++) {
  SECTION_HEADER_DOT_INDICES.push(_idx);
  ROWS.push({ kind: 'section', title: TREE[si].title, dotIdx: _idx++, sectionIdx: si });
  for (let ii = 0; ii < TREE[si].items.length; ii++) {
    ROWS.push({ kind: 'item', text: TREE[si].items[ii], dotIdx: _idx++, sectionIdx: si, itemIdx: ii });
  }
}
const DOT_COUNT = _idx;

function buildPath(ys: number[]): string {
  if (ys.length < 2) return '';
  const parts: string[] = [`M ${LINE_X} ${ys[0]}`];
  for (let i = 0; i < ys.length - 1; i++) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    // S-curve before each section header (except the first)
    if (SECTION_HEADER_DOT_INDICES.includes(i + 1)) {
      const mid = (y1 + y2) / 2;
      const amp = 11;
      parts.push(
        `C ${LINE_X} ${y1 + 16}, ${LINE_X + amp} ${mid - 8}, ${LINE_X} ${mid}`,
        `S ${LINE_X - amp} ${y2 - 16}, ${LINE_X} ${y2}`,
      );
    } else {
      parts.push(`L ${LINE_X} ${y2}`);
    }
  }
  return parts.join(' ');
}

export function GameTreeTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>(new Array(DOT_COUNT).fill(null));
  const [svgData, setSvgData] = useState<{ path: string; height: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const height = container.offsetHeight;
    const ys = dotRefs.current.map(el => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top - containerTop + r.height / 2;
    });
    setSvgData({ path: buildPath(ys), height });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Game Tree
      </p>

      <div ref={containerRef} className="relative">
        {/* SVG line */}
        {svgData && (
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={LINE_X * 3}
            height={svgData.height}
            overflow="visible"
          >
            <path
              d={svgData.path}
              stroke={ACCENT}
              strokeWidth="1.5"
              strokeOpacity="0.65"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        )}

        {ROWS.map(row => {
          if (row.kind === 'section') {
            return (
              <div
                key={`s-${row.sectionIdx}`}
                className={`relative flex items-center gap-4 py-3 ${row.sectionIdx > 0 ? 'mt-1' : ''}`}
              >
                <div
                  ref={el => { dotRefs.current[row.dotIdx] = el; }}
                  className="relative z-10 flex size-[22px] shrink-0 items-center justify-center"
                >
                  <div
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: ACCENT, boxShadow: `0 0 8px ${ACCENT}55` }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground">{row.title}</span>
              </div>
            );
          }

          // item row
          const isHovered = hovered === row.dotIdx;
          return (
            <div
              key={`i-${row.sectionIdx}-${row.itemIdx}`}
              className="group relative -mx-1 flex cursor-default items-center gap-4 rounded-lg px-1 py-[9px] transition-colors hover:bg-secondary/50"
              onMouseEnter={() => setHovered(row.dotIdx)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                ref={el => { dotRefs.current[row.dotIdx] = el; }}
                className="relative z-10 ml-[3px] flex size-[22px] shrink-0 items-center justify-center"
              >
                <div
                  className="rounded-full transition-all duration-150"
                  style={{
                    width:  isHovered ? 8 : 6,
                    height: isHovered ? 8 : 6,
                    backgroundColor: isHovered ? ACCENT : 'var(--color-muted-foreground)',
                  }}
                />
              </div>
              <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                {row.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
