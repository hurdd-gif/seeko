/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Dashboard
 *
 *    0ms   quick-nav pills + stat row fade up
 *   70ms   capital-deployed chart card fades up (area reveal runs inside)
 *  150ms   milestones stacked bars fade up (bar grow-stagger runs inside)
 *  230ms   progress + shipping ledgers fade up together
 *  310ms   latest-updates ledger fades up
 *
 * Visual language: stripped paper. ONE elevated surface — the capital
 * chart card; every other section is frameless type + hairline ledger
 * rows directly on the canvas (Mercury-style: the chart is the hero,
 * everything else is quiet). Monochrome ink throughout; the single
 * azure accent (#0d7aff) survives only on the area-progress fills,
 * where it already means "progress". Spend stays ink — spend is not
 * progress.
 * ───────────────────────────────────────────────────────── */

import { useMemo, type ReactNode } from 'react';
import { useLoaderData, useRouteLoaderData, type LoaderFunctionArgs } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { INVESTOR_LAYOUT_ROUTE_ID } from '../route-ids';
import type { InvestorLayoutReady } from './investor-layout';
import { Link } from '@/lib/react-router-adapters';
import { FadeRise } from '@/components/motion';
import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import { Gauge } from '@/components/charts/gauge';
import { Grid } from '@/components/charts/grid';
import { XAxis } from '@/components/charts/x-axis';
import { ChartTooltip, TooltipContent } from '@/components/charts/tooltip';
import { useChartStable, useYScale } from '@/components/charts/chart-context';
import { BarChart } from '@/components/charts/bar-chart';
import { Bar } from '@/components/charts/bar';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import type { InvestorOverviewData, InvestorPaymentsData } from '@/lib/investor-index';
import type { ViewState } from '../load-view';

type InvestorReadyData = { index: InvestorOverviewData; payments: InvestorPaymentsData | null };

type InvestorLoaderData = ViewState<InvestorReadyData>;

const TIMING = {
  stats: 0,
  chart: 70,
  milestones: 150,
  ledgers: 230,
  latest: 310,
};

const delay = (ms: number) => ms / 1000;

/** The page's only elevated surface — the capital chart card. */
const CARD =
  'rounded-[14px] border border-wash-5 bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]';

/** Frameless section header — type carries the structure cards used to. */
const SECTION_H = 'text-[15px] font-semibold leading-[20px] text-ink-title';

/* Fetches ONLY payments.
 *
 * The overview index is loaded — and access-gated — by the parent layout
 * (investorLayoutLoader), which runs in parallel with this loader. This route
 * used to fetch /api/investor-index a second time, concurrently, for data the
 * parent already had; it now reads that response back off the parent instead.
 * Do not re-add the fetch here. */
export async function investorLoader(
  _args: LoaderFunctionArgs,
): Promise<InvestorPaymentsData | null> {
  const paymentsResponse = await fetch('/api/investor-payments-index');
  return paymentsResponse.ok
    ? ((await paymentsResponse.json()) as InvestorPaymentsData)
    : null;
}

export function InvestorRoute() {
  // The parent only renders <Outlet /> in its 'ready' branch, so by the time
  // this mounts the index is present — 401/403/404 were already turned into a
  // redirect or the forbidden card upstream. The ViewState wrapper survives for
  // InvestorRouteContent's other callers (the /investor-preview QA route and
  // the unit tests), which drive it by prop rather than through the router.
  const layout = useRouteLoaderData(INVESTOR_LAYOUT_ROUTE_ID) as InvestorLayoutReady;
  const payments = useLoaderData() as InvestorPaymentsData | null;

  return (
    <InvestorRouteContent
      data={{ status: 'ready', data: { index: layout.index, payments } }}
    />
  );
}

export function InvestorRouteContent({ data }: { data: InvestorLoaderData }) {
  if (data.status === 'unauthorized') {
    return <InvestorState title="Sign in required" description="Use your investor account to view this panel." />;
  }

  if (data.status === 'forbidden') {
    return <InvestorState title="Investor access required" description="This route is available to investors and admins." />;
  }

  if (data.status === 'not_found') {
    return <InvestorState title="Profile not found" description="Your account does not have a SEEKO profile yet." />;
  }

  return <InvestorOverview index={data.data.index} payments={data.data.payments} />;
}

function InvestorOverview({
  index,
  payments,
}: {
  index: InvestorOverviewData;
  payments: InvestorPaymentsData | null;
}) {
  const { stats, areas } = index;
  const latest = investorLatestRows(index.recentActivity);
  // Only milestones with linked work earn a bar; an all-empty set hides the
  // section entirely (live data is sparse — the chart must never render bare).
  const milestones = (index.milestones ?? []).filter((milestone) => milestone.taskCount > 0);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col">
      {/* No visual hero (user call 2026-07-11): the nav names the place and
          the stat row opens the read. The h1 survives for screen readers. */}
      <h1 className="sr-only">Investor dashboard</h1>

      <FadeRise delay={delay(TIMING.stats)} y={6}>
        <InvestorQuickNav />
        <InvestorStatRow stats={stats} payments={payments} />
      </FadeRise>

      <FadeRise delay={delay(TIMING.chart)} y={6} className="mt-10">
        <CapitalDeployedCard payments={payments} />
      </FadeRise>

      {milestones.length > 0 && (
        <FadeRise delay={delay(TIMING.milestones)} y={6} className="mt-10">
          {/* Barrier: the capital card and the milestone bars are both data-
              dense reads — a hairline (the page's ledger rule) fences them so
              they scan as two sections, not one tall chart stack. */}
          <div aria-hidden className="h-px bg-wash-5" />
          <div className="pt-10">
            <InvestorMilestoneChart milestones={milestones} />
          </div>
        </FadeRise>
      )}

      <FadeRise delay={delay(TIMING.ledgers)} y={6} className="mt-10">
        {/* Same fence as above the milestones — the bars end and the ledgers
            begin, so the rule keeps each read its own section. */}
        <div aria-hidden className="h-px bg-wash-5" />
        <div className="grid gap-x-14 gap-y-10 pt-10 md:grid-cols-2">
          <InvestorProgressLedger areas={areas} />
          <InvestorShippingLedger areas={areas} />
        </div>
      </FadeRise>

      {latest.length > 0 && (
        <FadeRise delay={delay(TIMING.latest)} y={6} className="mt-12">
          <InvestorLatestLedger rows={latest} />
        </FadeRise>
      )}
    </div>
  );
}

/* ── Quick navigation — two quiet pills open the page ─────────────────── */

function InvestorQuickNav() {
  return (
    <div className="flex flex-wrap gap-2">
      <QuickNavPill href="/investor/docs" label="Documents & decks" />
      <QuickNavPill href="/investor/payments" label="Payment history" />
    </div>
  );
}

function QuickNavPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group relative inline-flex h-8 items-center gap-1.5 rounded-full bg-wash-4 pl-3.5 pr-2.5 text-[13px] font-medium leading-none text-ink transition-[background-color,transform] duration-150 ease-out after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:bg-black/[0.07] active:scale-[0.97]"
    >
      {label}
      <ArrowIcon />
    </Link>
  );
}

/* ── Stat row — frameless, hairline-separated, numbers first ──────────── */

function InvestorStatRow({
  stats,
  payments,
}: {
  stats: InvestorOverviewData['stats'];
  payments: InvestorPaymentsData | null;
}) {
  const spend = payments?.stats ?? null;

  const cells: { value: string; label: string; sub: ReactNode }[] = [
    {
      value: `${stats.overallProgress}%`,
      label: 'Overall progress',
      sub: `${stats.activeAreas} active ${stats.activeAreas === 1 ? 'area' : 'areas'}`,
    },
    {
      value: `${stats.completedTasks} of ${stats.totalTasks}`,
      label: 'Tasks shipped',
      sub: stats.completedThisWeek > 0 ? `+${stats.completedThisWeek} this week` : 'none this week',
    },
    {
      // "Deployed", not "burn" — same vocabulary as the capital card below,
      // and it reads as investing in work rather than losing money.
      value: spend ? formatMoney(spend.thisMonth) : '—',
      label: 'Deployed this month',
      sub:
        spend && spend.lastMonth > 0 ? `vs ${formatMoney(spend.lastMonth)} last month` : 'no spend last month',
    },
  ];

  return (
    <div className="mt-9 grid grid-cols-2 gap-y-7 sm:grid-cols-3">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={`flex flex-col ${
            i > 0 ? 'sm:border-l sm:border-wash-6 sm:pl-7' : ''
          } ${i % 2 === 1 ? 'border-l border-wash-6 pl-7 sm:border-l sm:pl-7' : ''}`}
        >
          <p className="text-[24px] font-semibold leading-[28px] tracking-[-0.02em] tabular-nums text-ink-title">
            {cell.value}
          </p>
          <p className="mt-1.5 text-[13px] font-medium leading-[17px] text-ink-muted-strong">{cell.label}</p>
          <p className="mt-0.5 text-[12.5px] leading-[17px] tabular-nums text-ink-faint">{cell.sub}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Capital deployed — cumulative spend area chart ─────────────────── */

type DeployedPoint = { date: Date; deployed: number; label: string };

/** Cumulative paid disbursements bucketed by calendar month, with a zero
 *  baseline month before the first payment so the area has a floor to rise
 *  from. */
function buildDeployedSeries(payments: InvestorPaymentsData['payments']): DeployedPoint[] {
  const paid = payments
    .filter((payment) => payment.paidAt)
    .sort((a, b) => (a.paidAt! < b.paidAt! ? -1 : 1));
  if (paid.length === 0) return [];

  const firstPaid = new Date(paid[0].paidAt!);
  const now = new Date();
  const points: DeployedPoint[] = [];
  let running = 0;
  let index = 0;
  let cursor = new Date(firstPaid.getFullYear(), firstPaid.getMonth() - 1, 1);

  while (cursor <= now) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    while (index < paid.length && new Date(paid[index].paidAt!) < next) {
      running += Number(paid[index].amount);
      index += 1;
    }
    points.push({
      date: cursor,
      deployed: running,
      label: cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });
    cursor = next;
  }

  return points;
}

/**
 * Strip a trailing email address from auto-generated descriptions like
 * "External invoice from foo@bar.com" — machine noise in a three-row digest.
 */
function cleanDescription(description: string): string {
  return description.replace(/\s+from\s+\S+@\S+$/i, '').trim();
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Endpoint marker at the live/right edge of the capital series. Reads the
 *  chart's own scales through context (the same public hooks the built-in
 *  markers use) so the dot stays honest to the last data point — a local
 *  overlay that never touches the shared chart primitives.
 *
 *  Flagged post-overlay (like the built-in ChartMarkers) so it renders OUTSIDE
 *  the grow-reveal clip. The last point sits exactly at the right inner edge
 *  (x = innerWidth); inside the clip its halo would be sliced in half. Post-
 *  overlay keeps it whole, so instead of riding the clip it fades in on its
 *  own, delayed to land as the area sweep reaches the edge. */
function CapitalEndpointDot() {
  const { data, xScale, xAccessor, animationDuration } = useChartStable();
  const reduce = useReducedMotion();
  const yScale = useYScale();
  const last = data.at(-1);
  if (!last) return null;
  const value = last.deployed;
  if (typeof value !== 'number') return null;
  const cx = xScale(xAccessor(last));
  const cy = yScale(value);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  // Opacity-only fade (no scale → no SVG transform-origin guesswork), timed to
  // the reveal finishing. animationDuration is 0 under reduced motion.
  const appearDelay = animationDuration > 0 ? animationDuration / 1000 : 0;
  return (
    <motion.g
      style={{ pointerEvents: 'none' }}
      aria-hidden
      initial={reduce ? false : { opacity: 0 }}
      animate={reduce ? false : { opacity: 1 }}
      transition={
        reduce ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1], delay: appearDelay }
      }
    >
      {/* White halo lifts the ink dot off the area fill (shadow-over-border). */}
      <circle cx={cx} cy={cy} fill="var(--chart-capital-halo)" r={5} />
      <circle cx={cx} cy={cy} fill="var(--chart-capital-ink)" r={3.5} />
    </motion.g>
  );
}
// Render after the interaction overlay (outside the grow-clip) — mirrors how
// the chart's own markers stay whole at the series edge.
(CapitalEndpointDot as { __isPostOverlay?: boolean }).__isPostOverlay = true;

function CapitalDeployedCard({ payments }: { payments: InvestorPaymentsData | null }) {
  const reduce = useReducedMotion();
  const series = useMemo(() => buildDeployedSeries(payments?.payments ?? []), [payments]);
  const stats = payments?.stats ?? null;
  const avgMonthly = stats && stats.monthCount > 0 ? stats.allTime / stats.monthCount : 0;
  const recent = (payments?.payments ?? []).filter((payment) => payment.paidAt).slice(0, 3);

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-6 pb-1 pt-6">
        <div>
          <p className="text-[13px] font-medium leading-[18px] text-ink-muted">Capital deployed</p>
          <h2 className="mt-1 text-[34px] font-semibold leading-[38px] tracking-[-0.02em] tabular-nums text-ink-title">
            {stats ? formatMoney(stats.allTime) : '—'}
          </h2>
        </div>
        {stats && stats.monthCount > 0 && (
          <div className="pb-0.5 text-right text-[12.5px] leading-[17px] tabular-nums text-ink-muted">
            <p>{formatMoney(avgMonthly)}/mo average</p>
            <p>
              across {stats.monthCount} {stats.monthCount === 1 ? 'month' : 'months'}
            </p>
          </div>
        )}
      </div>

      {series.length === 0 ? (
        <div className="px-6 pb-5 pt-3">
          <div className="flex h-[120px] items-center justify-center rounded-xl bg-wash-2">
            <p className="text-[13px] text-ink-faint">
              Deployment history lands here once the first payment is made.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 [--capital-ar:2/1] sm:[--capital-ar:2.7/1]">
          <AreaChart
            data={series as unknown as Record<string, unknown>[]}
            xDataKey="date"
            status="ready"
            aspectRatio="var(--capital-ar, 2.7 / 1)"
            animationDuration={reduce ? 0 : 900}
            margin={{ top: 20, right: 12, bottom: 32, left: 12 }}
          >
            {/* Ghosted horizontal gridlines only — no vertical lines / axis
                border (Grid vertical defaults off). Faint ink so the area, not
                the grid, carries the read. */}
            <Grid horizontal numTicksRows={3} stroke="var(--wash-5)" />
            {/* Native vertical fill gradient: ink ~12% at the top → 0% at the
                baseline (gradientToOpacity). No scoped def needed — the Area
                primitive builds this from its own props. */}
            <Area
              dataKey="deployed"
              fill="var(--chart-capital-ink)"
              stroke="var(--chart-capital-ink)"
              strokeWidth={1.5}
              fillOpacity={0.12}
              gradientToOpacity={0}
              animate={!reduce}
            />
            <CapitalEndpointDot />
            <XAxis numTicks={Math.min(5, series.length)} />
            <ChartTooltip
              content={({ point }) => {
                const p = point as unknown as DeployedPoint;
                return (
                  <TooltipContent
                    title={p.label}
                    rows={[{ color: 'var(--chart-capital-ink)', label: 'Deployed', value: formatMoney(p.deployed) }]}
                  />
                );
              }}
            />
          </AreaChart>
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="mx-6 h-px bg-wash-5" aria-hidden />
          <div className="px-6 pb-4 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-medium leading-[17px] text-ink-muted">Recent payments</p>
              <Link
                href="/investor/payments"
                className="group relative inline-flex items-center gap-1 text-[12.5px] font-medium leading-[17px] text-ink-mark transition-[color,opacity] duration-150 ease-out after:absolute after:-inset-y-2.5 after:-inset-x-2 after:content-[''] hover:text-ink-title active:opacity-60"
              >
                View all
                <ArrowIcon />
              </Link>
            </div>
            <div className="mt-1 flex flex-col">
              {recent.map((payment) => (
                <div
                  key={payment.id}
                  className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b border-wash-5 py-2.5 last:border-0 last:pb-0"
                >
                  <span className="text-[12px] tabular-nums text-ink-muted">
                    {formatShortDate(payment.paidAt!)}
                  </span>
                  <span className="min-w-0 truncate text-[13.5px] leading-[18px] text-ink-title">
                    {cleanDescription(payment.description ?? 'Payment')}
                  </span>
                  <span className="text-right text-[13.5px] tabular-nums text-ink-title">
                    {formatMoney(payment.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Progress — frameless one-line ledger per area ─────────────────────
 * The same two numbers read fast as a segmented notch track (bklit Gauge,
 * linear mode) + tabular percent on a quiet row. Azure stays because on
 * this canvas it already means "progress" (spend is ink). 16 notches
 * quantize the fill, so 0% shows a bare track — no sliver. */

const PROGRESS_TRACK = {
  width: 96,          // px — the old bar was 80; ticks need slot room
  height: 12,         // px — tick length
  notches: 16,        // fill quantum = 6.25%
  notchWidth: 64,     // % of each slot → ~2.9px ticks
  active: '#0d7aff',
  inactive: 'rgba(0,0,0,0.07)',
  // Critically damped pop-in per tick; ×0.6 tightens the stagger tail
  // so the reveal settles ~150ms after the ledger's FadeRise.
  enter: { type: 'spring', stiffness: 550, damping: 46 } as const,
  staggerScale: 0.6,
};

function InvestorProgressLedger({ areas }: { areas: InvestorOverviewData['areas'] }) {
  return (
    <section>
      <h2 className={SECTION_H}>Progress</h2>
      {areas.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[18px] text-ink-faint">
          Progress data will appear here.
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col divide-y divide-wash-5">
          {areas.map((area) => {
            const pct = Math.max(0, Math.min(100, Math.round(area.progress)));
            return (
              <div key={area.id} className="flex items-center gap-4 py-3.5">
                <p className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[18px] text-ink-title">
                  {area.name}
                </p>
                <p className="whitespace-nowrap text-[12.5px] leading-[17px] tabular-nums text-ink-faint">
                  {area.completedTaskCount} of {area.taskCount} tasks
                </p>
                <div
                  className="shrink-0"
                  role="img"
                  aria-label={`${area.name}: ${pct}% complete`}
                >
                  <Gauge
                    orientation="linear"
                    value={pct}
                    width={PROGRESS_TRACK.width}
                    height={PROGRESS_TRACK.height}
                    totalNotches={PROGRESS_TRACK.notches}
                    notchWidthPercent={PROGRESS_TRACK.notchWidth}
                    notchCornerRadius={1}
                    activeFill={PROGRESS_TRACK.active}
                    activeFillOpacity={1}
                    inactiveFill={PROGRESS_TRACK.inactive}
                    inactiveFillOpacity={1}
                    enterTransition={PROGRESS_TRACK.enter}
                    enterStaggerScale={PROGRESS_TRACK.staggerScale}
                  />
                </div>
                <p className="w-9 shrink-0 text-right text-[13.5px] font-medium leading-[18px] tabular-nums text-ink-title">
                  {pct}%
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── What's shipping — dated ship list, soonest first ──────────────────
 * Replaces the three-column phase board (and its "Nothing here yet"
 * ghost cells): only real, dated work earns a row. */

function InvestorShippingLedger({ areas }: { areas: InvestorOverviewData['areas'] }) {
  const dated = areas
    .filter((area) => area.targetDate)
    .sort((a, b) => (a.targetDate! < b.targetDate! ? -1 : 1));

  return (
    <section>
      <h2 className={SECTION_H}>What&apos;s shipping</h2>
      {dated.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[18px] text-ink-faint">No ship dates set yet.</p>
      ) : (
        <div className="mt-1.5 flex flex-col divide-y divide-wash-5">
          {dated.map((area) => (
            <div key={area.id} className="flex items-center gap-4 py-3.5">
              <p className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[18px] text-ink-title">
                {area.name}
              </p>
              {area.phase && (
                <p className="whitespace-nowrap text-[12.5px] leading-[17px] text-ink-faint">
                  {area.phase}
                </p>
              )}
              <p className="w-14 shrink-0 whitespace-nowrap text-right text-[13.5px] leading-[18px] tabular-nums text-ink-title">
                {formatShortDate(area.targetDate!)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Milestones — stacked scope bars (bklit bar kit) ────────────────────
 * Each milestone is one column: bar height = linked tasks (scope), the
 * blue-gradient floor = shipped, the faint ink cap = remaining. Blue is
 * the page's one accent and it only ever means progress — shipped work
 * IS progress, so the floor earns it; remaining stays no-color ink like
 * every other quiet surface. Counts live in the tooltip, so no y-axis. */

const MILESTONE_CHART = {
  // 2px seams split the stack; 4px radius on every segment (stackGap > 0
  // rounds all segments, not just the cap).
  stackGap: 2,
  cornerRadius: 4,
  // Band padding — bars ~45% of their band, centered by the scale, so a
  // 3-milestone chart reads as a skyline instead of slabs.
  barGap: 0.55,
  // Shipped wears a vertical blue gradient (user-supplied ramp): airy at the
  // cap, anchored at the baseline. Spans each bar's own box, so every
  // milestone reads the same ramp regardless of height.
  shippedGradientId: 'ms-shipped-gradient',
  // User-supplied 2-stop ramp (2026-07-11 final): #52ACFF 0% → #359FFF
  // 100%, expressed as exact oklch() conversions.
  shippedStops: [
    { offset: '0%', color: 'oklch(0.7260 0.1487 248.98)' },
    { offset: '100%', color: 'oklch(0.6891 0.1700 250.17)' },
  ],
  remainingFill: 'var(--chart-remaining-fill)',
  // Solid stand-ins for the gradient/translucent fills wherever a dot or
  // legend needs one opaque color.
  shippedInk: 'oklch(0.6891 0.1700 250.17)',
  remainingInk: 'var(--chart-remaining-ink)',
  // No y-axis; bottom rows the BarXAxis labels + date pill.
  margin: { top: 4, right: 0, bottom: 32, left: 0 },
};

type MilestoneRow = {
  name: string;
  tip: string;
  shipped: number;
  remaining: number;
};

/* Name must contain "Gradient" — BarChart hoists such children into the
 * svg <defs>. objectBoundingBox units run the ramp over each bar's own
 * height (top stop at the cap, bottom stop at the baseline). */
function MilestoneShippedGradient() {
  return (
    <linearGradient id={MILESTONE_CHART.shippedGradientId} x1="0" y1="0" x2="0" y2="1">
      {MILESTONE_CHART.shippedStops.map((stop) => (
        <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
      ))}
    </linearGradient>
  );
}

function InvestorMilestoneChart({
  milestones,
}: {
  milestones: InvestorOverviewData['milestones'];
}) {
  const reduce = useReducedMotion();
  const rows: MilestoneRow[] = milestones.map((milestone) => ({
    name: milestone.name,
    tip: milestone.targetDate
      ? `${milestone.name} — ships ${formatShortDate(milestone.targetDate)}`
      : milestone.name,
    shipped: milestone.doneCount,
    remaining: milestone.taskCount - milestone.doneCount,
  }));
  const totalTasks = milestones.reduce((sum, milestone) => sum + milestone.taskCount, 0);
  const totalDone = milestones.reduce((sum, milestone) => sum + milestone.doneCount, 0);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className={SECTION_H}>Milestones</h2>
        <p className="whitespace-nowrap text-[12.5px] leading-[17px] tabular-nums text-ink-faint">
          {totalDone} of {totalTasks} tasks shipped
        </p>
      </div>
      <p className="sr-only">
        {milestones
          .map((milestone) => `${milestone.name}: ${milestone.doneCount} of ${milestone.taskCount} tasks shipped`)
          .join('. ')}
      </p>
      <div aria-hidden className="mt-4 [--ms-ar:2.6/1] sm:[--ms-ar:5/1]">
        <BarChart
          data={rows as unknown as Record<string, unknown>[]}
          xDataKey="name"
          status="ready"
          stacked
          stackGap={MILESTONE_CHART.stackGap}
          barGap={MILESTONE_CHART.barGap}
          aspectRatio="var(--ms-ar, 5 / 1)"
          animationDuration={reduce ? 0 : 900}
          margin={MILESTONE_CHART.margin}
        >
          <MilestoneShippedGradient />
          <Bar
            dataKey="shipped"
            fill={`url(#${MILESTONE_CHART.shippedGradientId})`}
            stroke={MILESTONE_CHART.shippedInk}
            lineCap={MILESTONE_CHART.cornerRadius}
            stackGap={MILESTONE_CHART.stackGap}
            animate={!reduce}
          />
          <Bar
            dataKey="remaining"
            fill={MILESTONE_CHART.remainingFill}
            stroke={MILESTONE_CHART.remainingInk}
            lineCap={MILESTONE_CHART.cornerRadius}
            stackGap={MILESTONE_CHART.stackGap}
            animate={!reduce}
          />
          <BarXAxis showAllLabels />
          <ChartTooltip
            showDots={false}
            content={({ point }) => {
              const row = point as unknown as MilestoneRow;
              const tasks = (count: number) => `${count} ${count === 1 ? 'task' : 'tasks'}`;
              return (
                <TooltipContent
                  title={row.tip}
                  rows={[
                    { color: MILESTONE_CHART.shippedInk, label: 'Shipped', value: tasks(row.shipped) },
                    { color: MILESTONE_CHART.remainingInk, label: 'Remaining', value: tasks(row.remaining) },
                  ]}
                />
              );
            }}
          />
        </BarChart>
      </div>
    </section>
  );
}

/* ── Latest — quiet dated ledger of studio movement ────────────────────
 * The "updates" read, stripped to date + verb + task. No icons, no
 * avatars, no day-grouping — those were the noise the old activity
 * section died for. */

/* activity_log is free-text and mixes human verbs with operational noise
 * ('task.status_changed', 'Deleted task: …') and internal scratch targets
 * ('__…__'). Only human verbs on real work reach investors. */
const INVESTOR_ACTIONS = new Set(['Completed', 'Started']);

function investorLatestRows(activity: InvestorOverviewData['recentActivity']) {
  return activity
    .filter(
      (item) =>
        item.createdAt &&
        INVESTOR_ACTIONS.has(item.action) &&
        !item.target?.startsWith('__')
    )
    .slice(0, 5);
}

function InvestorLatestLedger({
  rows,
}: {
  rows: InvestorOverviewData['recentActivity'];
}) {
  return (
    <section>
      <h2 className={SECTION_H}>Latest</h2>
      <div className="mt-1.5 flex flex-col divide-y divide-wash-5">
        {rows.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[56px_minmax(0,1fr)] items-baseline gap-3 py-3"
          >
            <span className="text-[12px] leading-[17px] tabular-nums text-ink-muted">
              {formatShortDate(item.createdAt!)}
            </span>
            <p className="min-w-0 truncate text-[13.5px] leading-[18px] text-ink-title">
              <span className="text-ink-muted">{item.action}</span> {item.target}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function InvestorState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rr-page">
      <div className="rr-panel">
        <h1>{title}</h1>
        <p className="mt-2 text-sm text-ink-body">{description}</p>
      </div>
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-ink-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5"
      aria-hidden
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
