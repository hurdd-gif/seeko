/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Dashboard
 *
 *    0ms   page title + binary status fade up
 *   70ms   KPI cards fade up (0.04s inter-card stagger)
 *  140ms   capital-deployed chart card fades up (area reveal runs inside)
 *  220ms   area progress (rings stagger) + ship forecast fade up together
 *  300ms   quick access fades up
 *
 * Visual language: Paper login reference — white canvas, quiet bordered
 * cards on a two-tier elevation (KPI tiles near-flat, panels lift),
 * monochrome type ladder. The single azure accent (#0d7aff) stays on the
 * area progress rings so the SEEKO accent still means "progress" here; the
 * capital chart is ink (#1f1f1f), because spend is not progress.
 * ───────────────────────────────────────────────────────── */

import { useMemo, type ReactNode } from 'react';
import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { DollarSign, FileText } from 'lucide-react';
import { Link } from '@/lib/react-router-adapters';
import { FadeRise } from '@/components/motion';
import { springs } from '@/lib/motion';
import { clampPercent, ringDashOffset } from '@/components/dashboard/ringGeometry';
import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { XAxis } from '@/components/charts/x-axis';
import { ChartTooltip, TooltipContent } from '@/components/charts/tooltip';
import { useChartStable, useYScale } from '@/components/charts/chart-context';
import { InvestorWhereWereGoing } from '@/components/dashboard/InvestorWhereWereGoing';
import type { Area as AreaType } from '@/lib/types';
import type { InvestorOverviewData, InvestorPaymentsData } from '@/lib/investor-index';

type InvestorLoaderData =
  | { status: 'ready'; index: InvestorOverviewData; payments: InvestorPaymentsData | null }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

const TIMING = {
  hero: 0,
  metrics: 70,
  chart: 140,
  progress: 220,
  access: 300,
};

const delay = (ms: number) => ms / 1000;

/** Paper card anatomy — two-tier elevation.
 *  CARD    → big panels (Capital, Area-progress, Ship-forecast, Quick-access):
 *            a real lift so they read as surfaces above the canvas.
 *  CARD_KPI → the four metric tiles: near-flat, so the panels stay dominant. */
const CARD =
  'rounded-[14px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]';
const CARD_KPI =
  'rounded-[14px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

/** KPI-card entrance stagger — the section still rides FadeRise; the four
 *  tiles cascade within it (transforms, so no destructive opacity compounding
 *  with the parent fade). Guarded at the call site for prefers-reduced-motion. */
const KPI_STAGGER: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};
const KPI_CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springs.snappy },
};

export async function investorLoader(_args: LoaderFunctionArgs): Promise<InvestorLoaderData> {
  const [response, paymentsResponse] = await Promise.all([
    fetch('/api/investor-index'),
    fetch('/api/investor-payments-index'),
  ]);

  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };

  if (!response.ok) {
    throw new Response('Unable to load investor overview', { status: response.status });
  }

  const index = (await response.json()) as InvestorOverviewData;
  const payments = paymentsResponse.ok
    ? ((await paymentsResponse.json()) as InvestorPaymentsData)
    : null;

  return { status: 'ready', index, payments };
}

export function InvestorRoute() {
  const data = useLoaderData() as InvestorLoaderData;
  return <InvestorRouteContent data={data} />;
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

  return <InvestorOverview index={data.index} payments={data.payments} />;
}

function InvestorOverview({
  index,
  payments,
}: {
  index: InvestorOverviewData;
  payments: InvestorPaymentsData | null;
}) {
  const { profile, stats, areas } = index;
  const firstName = profile.displayName?.split(' ')[0];
  const riskCount = stats.blockedTasks + stats.overdueTasks;
  const dashboardAreas = areas.map(toDashboardArea);
  const tasksPerArea = Object.fromEntries(
    areas.map((area) => [
      area.id,
      { complete: area.completedTaskCount, total: area.taskCount },
    ]),
  );

  return (
    <div className="flex flex-col gap-6">
      <FadeRise delay={delay(TIMING.hero)}>
        <div className="flex items-center gap-2.5">
          <p className="text-[13px] font-medium leading-[18px] text-[#8a8a8a]">Investor Dashboard</p>
          {/* Binary status only — the quantitative read (blocked/overdue counts)
              is owned by the At-risk KPI card, so this stays count-free. */}
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium leading-[16px] text-[#6b6b6b]">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: riskCount > 0 ? '#d4503e' : '#34a853' }}
            />
            {riskCount > 0 ? 'Needs attention' : 'On track'}
          </span>
        </div>
        <h1 className="mt-2 text-balance text-[30px] font-semibold leading-[36px] text-[#111]">
          Current state of SEEKO
        </h1>
        <p className="mt-1.5 text-[14px] leading-[20px] text-[#8a8a8a]">
          {firstName ? `Welcome back, ${firstName}. ` : ''}{index.healthSummary}
        </p>
      </FadeRise>

      <FadeRise delay={delay(TIMING.metrics)} y={6}>
        <InvestorKpiStrip stats={stats} payments={payments} riskCount={riskCount} />
      </FadeRise>

      <FadeRise delay={delay(TIMING.chart)} y={6}>
        <CapitalDeployedCard payments={payments} />
      </FadeRise>

      <FadeRise delay={delay(TIMING.progress)} y={6}>
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
          <InvestorProgressPanel areas={areas} tasksPerArea={tasksPerArea} />
          <InvestorWhereWereGoing areas={dashboardAreas} />
        </div>
      </FadeRise>

      <FadeRise delay={delay(TIMING.access)} y={6}>
        <InvestorQuickAccess />
      </FadeRise>

    </div>
  );
}

/** Signed-change pill. `tone` drives color, `dir` the arrow. Burn uses
 *  tone="neutral" on purpose — more spend isn't semantically "good", so it
 *  must not read green. */
function DeltaChip({
  tone,
  dir,
  children,
}: {
  tone: 'pos' | 'neg' | 'neutral';
  dir?: 'up' | 'down';
  children: ReactNode;
}) {
  const palette =
    tone === 'pos'
      ? 'bg-[#16a34a]/[0.10] text-[#15803d]'
      : tone === 'neg'
        ? 'bg-[#dc2626]/[0.10] text-[#b91c1c]'
        : 'bg-black/[0.045] text-[#6b7280]';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-[14px] tabular-nums ${palette}`}
    >
      {dir && (
        <svg
          width="9"
          height="9"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className={dir === 'down' ? 'rotate-180' : ''}
        >
          <path
            d="M6 2.75v6.5M6 2.75 3.25 5.5M6 2.75 8.75 5.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {children}
    </span>
  );
}

/** Continuous meter for a 0–100 percentage. */
function GaugeBar({ pct, color = '#0d7aff' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Discrete "k of n" ratio — one tick per unit. Falls back to a continuous
 *  bar past 16 units, where ticks would be too thin to read. */
function SegmentMeter({ filled, total }: { filled: number; total: number }) {
  if (total <= 0) return <GaugeBar pct={0} />;
  if (total > 16) return <GaugeBar pct={(filled / total) * 100} />;
  return (
    <div className="flex w-full items-center gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 flex-1 rounded-full"
          style={{ backgroundColor: i < filled ? '#0d7aff' : 'rgba(0,0,0,0.08)' }}
        />
      ))}
    </div>
  );
}

/** Blocked / overdue split as labeled status dots. */
function RiskBreakdown({ blocked, overdue }: { blocked: number; overdue: number }) {
  if (blocked === 0 && overdue === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] leading-[16px] text-[#4a4a4a]">
        <span className="size-1.5 rounded-full bg-[#34a853]" aria-hidden /> On track
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3 text-[12px] leading-[16px] tabular-nums text-[#6b6b6b]">
      {blocked > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#e0a52e]" aria-hidden /> {blocked} blocked
        </span>
      )}
      {overdue > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#d4503e]" aria-hidden /> {overdue} overdue
        </span>
      )}
    </div>
  );
}

function InvestorKpiStrip({
  stats,
  payments,
  riskCount,
}: {
  stats: InvestorOverviewData['stats'];
  payments: InvestorPaymentsData | null;
  riskCount: number;
}) {
  const burn = payments?.stats ?? null;
  const burnDelta =
    burn && burn.lastMonth > 0
      ? Math.round(((burn.thisMonth - burn.lastMonth) / burn.lastMonth) * 100)
      : null;
  const reduce = useReducedMotion();

  // Footer fallback copy for when there's no prior month to compare against.
  const burnSub = !burn
    ? 'payments unavailable'
    : burnDelta === null
      ? 'no spend last month'
      : 'this month';

  // Each card shares one anatomy — label + secondary (right), big value,
  // then a fixed-height footer band. The footer is chosen per metric so it
  // stays honest: a gauge / ratio ticks / status dots / a quiet current-state
  // line, never a faked trend.
  const cards: {
    label: string;
    value: string;
    valueClass?: string;
    right?: ReactNode;
    footer: ReactNode;
  }[] = [
    {
      label: 'Overall progress',
      value: `${stats.overallProgress}%`,
      right: (
        <span className="shrink-0 text-[11.5px] leading-[15px] tabular-nums text-[#9a9a9a]">
          {stats.activeAreas} active {stats.activeAreas === 1 ? 'area' : 'areas'}
        </span>
      ),
      footer: <GaugeBar pct={stats.overallProgress} />,
    },
    {
      label: 'Tasks shipped',
      value: `${stats.completedTasks} of ${stats.totalTasks}`,
      right:
        stats.completedThisWeek > 0 ? (
          <DeltaChip tone="pos" dir="up">
            {stats.completedThisWeek} this week
          </DeltaChip>
        ) : undefined,
      footer: <SegmentMeter filled={stats.completedTasks} total={stats.totalTasks} />,
    },
    {
      label: 'Burn this month',
      value: burn ? formatMoney(burn.thisMonth) : '—',
      right:
        burnDelta !== null && burnDelta !== 0 ? (
          <DeltaChip tone="neutral" dir={burnDelta > 0 ? 'up' : 'down'}>
            {Math.abs(burnDelta)}%
          </DeltaChip>
        ) : undefined,
      footer:
        burn && burn.lastMonth > 0 ? (
          <span className="text-[12px] leading-[16px] tabular-nums text-[#9a9a9a]">
            {formatMoney(burn.lastMonth)} last month
          </span>
        ) : (
          <span className="text-[12px] leading-[16px] text-[#9a9a9a]">{burnSub}</span>
        ),
    },
    {
      label: 'At risk',
      value: String(riskCount),
      valueClass: riskCount > 0 ? 'text-[#b23b2c]' : 'text-[#111]',
      footer: <RiskBreakdown blocked={stats.blockedTasks} overdue={stats.overdueTasks} />,
    },
  ];

  return (
    <motion.div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      variants={reduce ? undefined : KPI_STAGGER}
      initial={reduce ? false : 'hidden'}
      animate={reduce ? false : 'visible'}
    >
      {cards.map((card) => (
        <motion.div
          key={card.label}
          variants={reduce ? undefined : KPI_CARD_VARIANTS}
          className={`${CARD_KPI} flex flex-col px-6 py-5`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12.5px] leading-[17px] text-[#8a8a8a]">{card.label}</p>
            {card.right}
          </div>
          <p
            className={`mt-1.5 text-[28px] font-semibold leading-[32px] tabular-nums ${
              card.valueClass ?? 'text-[#111]'
            }`}
          >
            {card.value}
          </p>
          <div className="mt-3 flex h-8 items-center">{card.footer}</div>
        </motion.div>
      ))}
    </motion.div>
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
      <circle cx={cx} cy={cy} fill="#fff" r={5} />
      <circle cx={cx} cy={cy} fill="#1f1f1f" r={3.5} />
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
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-6 pb-1 pt-5">
        <div>
          <p className="text-[13px] font-medium leading-[18px] text-[#8a8a8a]">Capital deployed</p>
          <h2 className="mt-1 text-[30px] font-semibold leading-[34px] tabular-nums text-[#111]">
            {stats ? formatMoney(stats.allTime) : '—'}
          </h2>
        </div>
        {stats && stats.monthCount > 0 && (
          <div className="pb-0.5 text-right text-[12.5px] leading-[17px] tabular-nums text-[#8a8a8a]">
            <p>{formatMoney(avgMonthly)}/mo average</p>
            <p>
              across {stats.monthCount} {stats.monthCount === 1 ? 'month' : 'months'}
            </p>
          </div>
        )}
      </div>

      {series.length === 0 ? (
        <div className="px-6 pb-5 pt-3">
          <div className="flex h-[120px] items-center justify-center rounded-xl bg-black/[0.02]">
            <p className="text-[13px] text-[#9a9a9a]">
              Deployment history lands here once the first payment is made.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 [--capital-ar:2.2/1] sm:[--capital-ar:3.4/1]">
          <AreaChart
            data={series as unknown as Record<string, unknown>[]}
            xDataKey="date"
            status="ready"
            aspectRatio="var(--capital-ar, 3.4 / 1)"
            animationDuration={reduce ? 0 : 900}
            margin={{ top: 16, right: 12, bottom: 32, left: 12 }}
          >
            {/* Ghosted horizontal gridlines only — no vertical lines / axis
                border (Grid vertical defaults off). Faint ink so the area, not
                the grid, carries the read. */}
            <Grid horizontal numTicksRows={3} stroke="rgba(17,17,17,0.05)" />
            {/* Native vertical fill gradient: ink ~12% at the top → 0% at the
                baseline (gradientToOpacity). No scoped def needed — the Area
                primitive builds this from its own props. */}
            <Area
              dataKey="deployed"
              fill="#1f1f1f"
              stroke="#1f1f1f"
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
                    rows={[{ color: '#1f1f1f', label: 'Deployed', value: formatMoney(p.deployed) }]}
                  />
                );
              }}
            />
          </AreaChart>
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="mx-6 h-px bg-black/[0.05]" aria-hidden />
          <div className="px-6 pb-4 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-medium leading-[17px] text-[#8a8a8a]">Recent payments</p>
              <Link
                href="/investor/payments"
                className="group inline-flex items-center gap-1 text-[12.5px] font-medium leading-[17px] text-[#545454] transition-colors duration-150 ease-out hover:text-[#111]"
              >
                View all
                <ArrowIcon />
              </Link>
            </div>
            <div className="mt-1 flex flex-col">
              {recent.map((payment) => (
                <div
                  key={payment.id}
                  className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b border-black/[0.05] py-2.5 last:border-0 last:pb-0"
                >
                  <span className="text-[12px] tabular-nums text-[#8a8a8a]">
                    {formatShortDate(payment.paidAt!)}
                  </span>
                  <span className="min-w-0 truncate text-[13.5px] leading-[18px] text-[#111]">
                    {cleanDescription(payment.description ?? 'Payment')}
                  </span>
                  <span className="text-right text-[13.5px] tabular-nums text-[#111]">
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

/* ── Where we are — completion rings per area ──────────────────────────
 * Redesign of the old two-thin-bars list. The neighboring "Ship forecast"
 * card already boards areas by phase + target date, so this panel owns the
 * *completion magnitude* story instead: a radial ring per area (azure arc,
 * top-start clockwise, spring draw-in) sized to fill the card, the big % in
 * the center and the honest task tally beneath. Reuses the Overview ring's
 * percent→arc geometry (ringGeometry) so the math stays consistent. */

const AREA_RING_SIZE = 132;
const AREA_RING_STROKE = 10;
const AREA_RING_RADIUS = (AREA_RING_SIZE - AREA_RING_STROKE) / 2;
const AREA_RING_CENTER = AREA_RING_SIZE / 2;
const AREA_RING_CIRCUMFERENCE = 2 * Math.PI * AREA_RING_RADIUS;
const AREA_RING_ARC = '#0d7aff';
const AREA_RING_TRACK = 'rgba(0,0,0,0.07)';
// Arc sweep lands just after the card fades up (progress stagger = 220ms).
const AREA_RING_SWEEP_DELAY_S = 0.32;

function InvestorProgressPanel({
  areas,
  tasksPerArea,
}: {
  areas: InvestorOverviewData['areas'];
  tasksPerArea: Record<string, { complete: number; total: number }>;
}) {
  return (
    <section className={`${CARD} flex min-w-0 flex-col overflow-hidden`}>
      <div className="px-6 pb-4 pt-5">
        <p className="text-[13px] font-medium leading-[18px] text-[#8a8a8a]">Where we are</p>
        <h2 className="mt-1 text-[20px] font-semibold leading-[24px] text-[#111]">
          Area progress
        </h2>
      </div>
      <div className="h-px bg-black/[0.05]" aria-hidden />

      {areas.length === 0 ? (
        <div className="px-6 py-6">
          <div className="flex min-h-[120px] items-center justify-center rounded-xl bg-black/[0.02]">
            <p className="text-[13px] text-[#9a9a9a]">Progress data will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 justify-center place-items-center gap-x-4 gap-y-7 px-6 py-7 [grid-template-columns:repeat(auto-fit,minmax(132px,180px))]">
          {areas.map((area, index) => (
            <InvestorAreaRing
              key={area.id}
              area={area}
              tasks={tasksPerArea[area.id]}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InvestorAreaRing({
  area,
  tasks,
  index,
}: {
  area: InvestorOverviewData['areas'][number];
  tasks: { complete: number; total: number } | undefined;
  index: number;
}) {
  const reduce = useReducedMotion();
  const total = tasks?.total ?? area.taskCount;
  const complete = tasks?.complete ?? area.completedTaskCount;
  const pct = clampPercent(area.progress);
  const target = ringDashOffset(pct, AREA_RING_CIRCUMFERENCE);

  return (
    <motion.div
      className="flex min-w-0 flex-col items-center text-center"
      initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
      animate={reduce ? false : { opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0 } : { ...springs.gentle, delay: index * 0.04 }}
    >
      <div className="relative" style={{ width: AREA_RING_SIZE, height: AREA_RING_SIZE }}>
        <svg
          width={AREA_RING_SIZE}
          height={AREA_RING_SIZE}
          viewBox={`0 0 ${AREA_RING_SIZE} ${AREA_RING_SIZE}`}
          className="block"
          role="img"
          aria-label={`${area.name}: ${pct}% complete, ${complete} of ${total} tasks`}
        >
          <circle
            cx={AREA_RING_CENTER}
            cy={AREA_RING_CENTER}
            r={AREA_RING_RADIUS}
            fill="none"
            stroke={AREA_RING_TRACK}
            strokeWidth={AREA_RING_STROKE}
          />
          {/* -90 rotate → arc starts at 12 o'clock and sweeps clockwise; motion
              drives only the dash offset. Reduced motion lands at rest. */}
          <g transform={`rotate(-90 ${AREA_RING_CENTER} ${AREA_RING_CENTER})`}>
            <motion.circle
              cx={AREA_RING_CENTER}
              cy={AREA_RING_CENTER}
              r={AREA_RING_RADIUS}
              fill="none"
              stroke={AREA_RING_ARC}
              strokeWidth={AREA_RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={AREA_RING_CIRCUMFERENCE}
              initial={{ strokeDashoffset: reduce ? target : AREA_RING_CIRCUMFERENCE }}
              animate={{ strokeDashoffset: target }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { ...springs.gentle, delay: AREA_RING_SWEEP_DELAY_S + index * 0.08 }
              }
            />
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#111]">
            {pct}
            <span className="text-[16px] text-[#9a9a9a]">%</span>
          </span>
        </div>
      </div>
      <p className="mt-3 max-w-full truncate text-[14px] font-medium leading-[18px] text-[#111]">
        {area.name}
      </p>
      <p className="mt-0.5 text-[12px] leading-[16px] tabular-nums text-[#8a8a8a]">
        {complete} of {total} tasks
      </p>
    </motion.div>
  );
}

function InvestorQuickAccess() {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="px-6 pb-3 pt-5">
        <p className="text-[13px] font-medium leading-[18px] text-[#8a8a8a]">Quick access</p>
      </div>
      <div className="h-px bg-black/[0.05]" aria-hidden />
      <div className="grid md:grid-cols-2">
        <InvestorActionLink
          href="/investor/docs"
          icon={<FileText className="size-4" />}
          label="Documents"
          meta="Shared updates and decks"
        />
        <InvestorActionLink
          href="/investor/payments"
          icon={<DollarSign className="size-4" />}
          label="Payments"
          meta="Invoices and full history"
        />
      </div>
    </section>
  );
}

function InvestorActionLink({
  href,
  icon,
  label,
  meta,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[76px] items-center justify-between gap-4 border-t border-black/[0.05] px-6 py-4 transition-[background-color,transform] duration-150 ease-out first:border-t-0 hover:bg-black/[0.02] active:scale-[0.99] md:border-l md:border-t-0 md:first:border-l-0"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-[#8a8a8a]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-[18px] text-[#111]">{label}</p>
          <p className="mt-0.5 truncate text-[13px] leading-[18px] text-[#8a8a8a]">{meta}</p>
        </div>
      </div>
      <ArrowIcon />
    </Link>
  );
}

function InvestorState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rr-page">
      <div className="rr-panel">
        <h1>{title}</h1>
        <p className="mt-2 text-sm text-[#505050]">{description}</p>
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
      stroke="#848484"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
      aria-hidden
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function toDashboardArea(area: InvestorOverviewData['areas'][number]): AreaType {
  return {
    id: area.id,
    name: area.name,
    status: area.status ?? 'Active',
    progress: area.progress,
    description: area.description ?? undefined,
    phase: area.phase ?? undefined,
    target_date: area.targetDate ?? undefined,
  };
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

