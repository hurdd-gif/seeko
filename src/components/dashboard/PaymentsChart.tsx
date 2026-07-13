'use client';

/**
 * PaymentsChart — 12-month outflow hero for /payments.
 *
 * Stacked monthly bars: Paid (net of refunds, dark) + Pending (mid-grey,
 * folded into the current month — pending money leaves now-or-later, so
 * scattering it across past created_at months would misread as history).
 *
 * Monochrome in BOTH schemes by design: #0d7aff is reserved for the online dot,
 * and a money chart earns attention with height, not hue. Dark is the light
 * palette inverted — white bars fading toward the baseline (see PALETTE).
 */

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { useIsDark } from '@/lib/theme';
import { LinearGradient } from '@visx/gradient';
import { BarChart } from '@/components/charts/bar-chart';
import { Bar } from '@/components/charts/bar';
import { Grid } from '@/components/charts/grid';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import { ChartTooltip, TooltipContent } from '@/components/charts/tooltip';
import { useChart } from '@/components/charts/chart-context';
import type { Payment } from '@/lib/types';

const MONTHS_SHOWN = 12;

/* Loudness ladder: paid = real money left, pending = not yet, one rung
 * quieter — never louder than paid. Solid values anchor the tooltip dots.
 *
 * The ladder lives in LIGHTNESS, not hue, in both schemes — dark is a straight
 * inversion of light, not a different chart. The bars wear a vertical gradient
 * (bklit's gradient variant) with the loudest stop at the tip — the edge the eye
 * reads value from — softening toward the baseline. Light runs near-black→grey on
 * white; dark runs near-white→grey on the canvas, at the same contrast rungs
 * (paid ~16:1 → ~10:1, pending bottoming out at ~3.4:1, clearing the 3:1
 * graphics floor for non-text).
 *
 * Dark was AZURE and is deliberately not any more: a money chart earns attention
 * with height, not hue, and #0d7aff is spent elsewhere (the online dot). The old
 * note here claimed grey bars "vanish against the canvas" — true of DARK grey,
 * which is what an un-inverted light palette gives you. Inverted, the greys run
 * above the canvas instead of below it and the problem doesn't exist.
 *
 * Gradient ids are stable across themes; only the stops swap. */
const PALETTE = {
  light: {
    paidFill: '#1f1f1f',
    pendingFill: '#8c8c8c',
    paid: { from: '#161616', to: '#454545' },
    pending: { from: '#808080', to: '#9a9a9a' },
  },
  dark: {
    paidFill: '#f2f2f2',
    pendingFill: '#8a8a8a',
    paid: { from: '#f2f2f2', to: '#c9c9c9' },
    pending: { from: '#8a8a8a', to: '#757575' },
  },
} as const;

const PAID_GRADIENT_ID = 'outflow-paid-gradient';
const PENDING_GRADIENT_ID = 'outflow-pending-gradient';

const monthLabelFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
const monthTitleFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

function fmtUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/* The library has no numeric axis for vertical bars (BarYAxis is category
 * labels for horizontal charts) — a money chart without a scale is
 * decoration, so this renders the y-scale's ticks as quiet $ labels,
 * portaled out of the SVG the same way BarXAxis does. */
function DollarTicks() {
  const { yScale, margin, containerRef, chartStatus } = useChart();
  const container = containerRef.current;
  if (!container || chartStatus === 'loading') return null;

  const ticks = yScale.ticks(3).filter((t) => t > 0);
  return createPortal(
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute left-0 text-[11px] leading-none tabular-nums text-ink-faint"
          style={{ top: margin.top + yScale(t) - 14 }}
        >
          {compactUsd.format(t)}
        </span>
      ))}
    </div>,
    container,
  );
}

interface MonthBucket extends Record<string, unknown> {
  month: string; // short label for the axis ("Jan")
  title: string; // full label for the tooltip ("January 2026")
  paid: number;
  pending: number;
  paidCount: number;
}

function bucketPayments(payments: Payment[]): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  const indexByKey = new Map<string, number>();

  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    indexByKey.set(`${d.getFullYear()}-${d.getMonth()}`, buckets.length);
    buckets.push({
      month: monthLabelFmt.format(d),
      title: monthTitleFmt.format(d),
      paid: 0,
      pending: 0,
      paidCount: 0,
    });
  }

  const currentBucket = buckets[buckets.length - 1];

  for (const payment of payments) {
    if (payment.status === 'paid' && payment.paid_at) {
      const d = new Date(payment.paid_at);
      const idx = indexByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx === undefined) continue; // older than the window
      const net = Math.max(Number(payment.amount) - Number(payment.refund_amount ?? 0), 0);
      buckets[idx].paid += net;
      buckets[idx].paidCount += 1;
    } else if (payment.status === 'pending') {
      currentBucket.pending += Number(payment.amount);
    }
  }

  return buckets;
}

export function PaymentsChart({
  payments,
  loading = false,
  className,
}: {
  payments: Payment[];
  /** Shimmer instead of an empty flatline until the first fetch resolves. */
  loading?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const palette = useIsDark() ? PALETTE.dark : PALETTE.light;
  const data = useMemo(() => bucketPayments(payments), [payments]);
  const hasAnything = data.some((b) => b.paid > 0 || b.pending > 0);

  // Ready + genuinely nothing to plot: a 12-month grid of nothing reads as an
  // error, not an answer. Quiet local empty block instead (page pattern).
  if (!loading && !hasAnything) {
    return (
      <div className={className}>
        <div className="flex h-[120px] items-center justify-center rounded-xl bg-wash-2">
          <p className="text-[13px] text-ink-faint">
            Outflow lands here once the first payment is made.
          </p>
        </div>
      </div>
    );
  }

  return (
    /* 4.5/1 is right at content width but squashes the plot to ~80px on
     * phones — small screens get a taller ratio via the CSS var the chart's
     * inline aspect-ratio resolves. */
    <div className={`[--outflow-ar:2.4/1] sm:[--outflow-ar:4.5/1] ${className ?? ''}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium text-ink-body">Outflow</h2>
        <span className="text-[12px] text-ink-faint">
          Last 12 months · paid net of refunds
        </span>
      </div>
      <BarChart
        data={data}
        xDataKey="month"
        stacked
        status={loading ? 'loading' : 'ready'}
        aspectRatio="var(--outflow-ar, 4.5 / 1)"
        animationDuration={reduce ? 0 : 700}
        margin={{ top: 8, right: 0, bottom: 28, left: 0 }}
        barGap={0.55}
      >
        <Grid horizontal numTicksRows={3} />
        <DollarTicks />
        <LinearGradient id={PAID_GRADIENT_ID} {...palette.paid} />
        <LinearGradient id={PENDING_GRADIENT_ID} {...palette.pending} />
        <Bar dataKey="paid" fill={`url(#${PAID_GRADIENT_ID})`} lineCap={3} animate={!reduce} />
        <Bar dataKey="pending" fill={`url(#${PENDING_GRADIENT_ID})`} lineCap={3} animate={!reduce} />
        <BarXAxis showAllLabels />
        <ChartTooltip
          showDatePill={false}
          dotVariant="ring"
          content={({ point }) => {
            const bucket = point as MonthBucket;
            const rows = [
              {
                color: palette.paidFill,
                label: `Paid · ${bucket.paidCount} payment${bucket.paidCount === 1 ? '' : 's'}`,
                value: fmtUsd(bucket.paid),
              },
            ];
            if (bucket.pending > 0) {
              rows.push({ color: palette.pendingFill, label: 'Pending', value: fmtUsd(bucket.pending) });
            }
            return <TooltipContent title={bucket.title} rows={rows} />;
          }}
        />
      </BarChart>
    </div>
  );
}
