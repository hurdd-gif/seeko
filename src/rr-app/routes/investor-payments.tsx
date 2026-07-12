/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Payments (light Paper port)
 *
 *    0ms   heading + summary line fade up
 *    0ms   stat cards stagger in (80ms apart)
 *  150ms   monthly breakdown card fades up
 *  300ms   department + top recipients side-by-side fade up
 *  450ms   recent payments card fades up
 *
 * Faithful migration of the legacy dark `(investor)/investor/payments/page.tsx`
 * + its `<PaymentsInvestor>` component: the smart summary line, the three stat
 * cards (This Month / Avg / Month / People Paid), the Monthly Breakdown bars,
 * the proportional By-Department bar + legend, Top Recipients, and the
 * expandable Recent Payments list are reproduced verbatim — only the palette
 * moved dark→light (Paper `--ov-*` surfaces, #111/#808080 ink, azure accent).
 * Every aggregate is recomputed client-side from the flat payments list, exactly
 * like the original. The expandable detail shows the full description + a
 * department badge; per-line-item rows are omitted because the investor DTO
 * carries only an item COUNT, not the items themselves.
 * ───────────────────────────────────────────────────────── */

import { type ReactNode, useState } from 'react';
import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { springs } from '@/lib/motion';
import type { InvestorPaymentsData } from '@/lib/investor-index';
import { loadView, type ViewState } from '../load-view';

type PaymentRow = InvestorPaymentsData['payments'][number];

type InvestorPaymentsLoaderData = ViewState<InvestorPaymentsData>;

export async function investorPaymentsLoader(_args: LoaderFunctionArgs): Promise<InvestorPaymentsLoaderData> {
  return loadView<InvestorPaymentsData>('/api/investor-payments-index', 'Unable to load investor payments');
}

export function InvestorPaymentsRoute() {
  const data = useLoaderData() as InvestorPaymentsLoaderData;
  return <InvestorPaymentsRouteContent data={data} />;
}

export function InvestorPaymentsRouteContent({ data }: { data: InvestorPaymentsLoaderData }) {
  if (data.status === 'unauthorized') return <State title="Sign in required" description="Use your investor account to view payments." />;
  if (data.status === 'forbidden') return <State title="Investor access required" description="Payments are available to investors and admins." />;
  if (data.status === 'not_found') return <State title="Profile not found" description="Your account does not have a SEEKO profile yet." />;

  return <InvestorPaymentsIndex index={data.data} />;
}

/* ─── Helpers ─────────────────────────────────────────────── */

const DEPT_COLORS: Record<string, string> = {
  Coding: '#0d7aff',
  'Visual Art': '#93c5fd',
  'UI/UX': '#c4b5fd',
  Animation: '#fbbf24',
  'Asset Creation': '#f9a8d4',
};

function deptColor(dept: string): string {
  return DEPT_COLORS[dept] ?? '#0d7aff';
}

function getInitials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatCompact(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return formatCurrency(amount);
}

const INITIAL_VISIBLE = 10;

function InvestorPaymentsIndex({ index }: { index: InvestorPaymentsData }) {
  const { stats, payments } = index;
  const [showAll, setShowAll] = useState(false);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);

  /* ── Smart summary line (verbatim logic from the original page) ── */
  const summaryLine =
    stats.thisMonth > 0
      ? `${formatCurrency(stats.thisMonth)} disbursed this month to ${stats.thisMonthRecipients} team member${stats.thisMonthRecipients !== 1 ? 's' : ''}.`
      : payments.length > 0
        ? `${formatCurrency(stats.allTime)} disbursed across ${stats.peoplePaid} team member${stats.peoplePaid !== 1 ? 's' : ''} total.`
        : 'No payments recorded yet.';

  /* ── Monthly breakdown with bars ─────────────────────── */
  const monthlyBreakdown = payments.reduce<Record<string, { total: number; count: number }>>((acc, p) => {
    if (!p.paidAt) return acc;
    const date = new Date(p.paidAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = { total: 0, count: 0 };
    acc[key].total += Number(p.amount);
    acc[key].count += 1;
    return acc;
  }, {});

  const months = Object.entries(monthlyBreakdown)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, data]) => {
      // Build the label from the key's own integers via the LOCAL Date
      // constructor — matching the local-time aggregation key. Re-parsing
      // `key + '-01'` as a string treats it as UTC midnight, which renders the
      // previous month in any negative-UTC timezone.
      const [year, month] = key.split('-').map(Number);
      return {
        key,
        label: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        ...data,
      };
    });
  const maxMonthTotal = Math.max(...months.map((m) => m.total), 1);

  /* ── Department breakdown (proportional) ───────────────── */
  const deptTotals = payments.reduce<Record<string, number>>((acc, p) => {
    const dept = p.recipientDepartment ?? 'Other';
    acc[dept] = (acc[dept] ?? 0) + Number(p.amount);
    return acc;
  }, {});
  const deptEntries = Object.entries(deptTotals).sort(([, a], [, b]) => b - a);
  const deptGrandTotal = deptEntries.reduce((sum, [, v]) => sum + v, 0) || 1;

  /* ── Per-person spend breakdown ────────────────────────── */
  const personTotals = payments.reduce<Record<string, { name: string; avatar_url?: string | null; total: number; count: number }>>(
    (acc, p) => {
      const id = p.recipientId ?? 'unknown';
      if (!acc[id]) acc[id] = { name: p.recipientName ?? 'Unknown', avatar_url: p.recipientAvatarUrl, total: 0, count: 0 };
      acc[id].total += Number(p.amount);
      acc[id].count += 1;
      return acc;
    },
    {},
  );
  const topRecipients = Object.entries(personTotals).sort(([, a], [, b]) => b.total - a.total).slice(0, 5);

  /* ── Recent payments ─────────────────────────────────── */
  const visiblePayments = showAll ? payments : payments.slice(0, INITIAL_VISIBLE);
  const hasMore = payments.length > INITIAL_VISIBLE;

  /* ── Stat cards ────────────────────────────────────────── */
  const monthDelta =
    stats.lastMonth > 0 ? Math.round(((stats.thisMonth - stats.lastMonth) / stats.lastMonth) * 100) : null;
  const avgMonthly = stats.monthCount > 0 ? stats.allTime / stats.monthCount : stats.allTime;

  const statCards = [
    { label: 'This Month', value: stats.thisMonth, icon: Calendar, format: true, delta: monthDelta },
    { label: 'Avg / Month', value: avgMonthly, icon: TrendingUp, format: true, delta: null },
    { label: 'People Paid', value: stats.peoplePaid, icon: Users, format: false, delta: null },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Heading + summary ─────────────────────────────── */}
      <FadeRise delay={0}>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-title">Payments</h1>
        <p className="mt-1 text-sm text-ink-muted">{summaryLine}</p>
      </FadeRise>

      {/* ── Stat cards ────────────────────────────────────── */}
      <FadeRise delay={0}>
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3" staggerMs={0.08}>
          {statCards.map((stat) => (
            <StaggerItem key={stat.label}>
              <HoverCard>
                <div className="h-full rounded-2xl border-0 bg-[var(--ov-panel)]" style={{ boxShadow: 'var(--ov-shadow-panel)' }}>
                  <div className="flex flex-row items-center justify-between p-6 pb-2">
                    <p className="text-sm font-medium text-ink-muted">{stat.label}</p>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--ov-chip-bg)]">
                      <stat.icon className="size-4 text-ink-muted" />
                    </div>
                  </div>
                  <div className="p-6 pt-0">
                    <span className="text-2xl font-semibold tracking-tight tabular-nums text-ink-title">
                      {stat.format ? formatCurrency(stat.value) : stat.value}
                    </span>
                    {stat.delta != null && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-ink-muted">
                        {stat.delta >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                        {Math.abs(stat.delta)}% vs last month
                      </p>
                    )}
                  </div>
                </div>
              </HoverCard>
            </StaggerItem>
          ))}
        </Stagger>
      </FadeRise>

      {/* ── Monthly Breakdown ─────────────────────────────── */}
      <FadeRise delay={0.15}>
        <Panel title="Monthly Breakdown" description="Spend aggregated by month.">
          {months.length === 0 ? (
            <CardEmpty text="Monthly spend will appear here." />
          ) : (
            <div className="flex flex-col gap-0">
              {months.map((month) => (
                <div key={month.key} className="border-b border-wash-6 py-3 last:border-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm text-ink-title">{month.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums text-ink-title">{formatCurrency(month.total)}</span>
                      <span className="w-20 text-right text-xs tabular-nums text-ink-muted">
                        {month.count} payment{month.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-wash-8">
                    <div
                      className="h-full rounded-full bg-seeko-accent transition-all duration-500"
                      style={{ width: `${(month.total / maxMonthTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </FadeRise>

      {/* ── By Department + Top Recipients ────────────────── */}
      <FadeRise delay={0.3}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Panel title="By Department" description="Allocation across teams.">
            {deptEntries.length === 0 ? (
              <CardEmpty text="Department breakdown will appear here." />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-wash-6">
                  {deptEntries.map(([dept, total]) => (
                    <div
                      key={dept}
                      className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${(total / deptGrandTotal) * 100}%`, backgroundColor: deptColor(dept) }}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {deptEntries.map(([dept, total]) => {
                    const pct = Math.round((total / deptGrandTotal) * 100);
                    return (
                      <div key={dept} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: deptColor(dept) }} />
                          <span className="text-sm text-ink-title">{dept}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tabular-nums text-ink-faint">{pct}%</span>
                          <span className="w-20 text-right text-sm tabular-nums text-ink-muted">{formatCompact(total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Top Recipients" description="Highest paid team members.">
            {topRecipients.length === 0 ? (
              <CardEmpty text="Recipient breakdown will appear here." />
            ) : (
              <div className="flex flex-col gap-0">
                {topRecipients.map(([id, person], idx) => (
                  <div key={id} className="flex items-center gap-3 border-b border-wash-6 py-2.5 last:border-0">
                    <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-[#b0b0b0]">{idx + 1}</span>
                    <Avatar className="size-7 shrink-0">
                      <AvatarImage src={person.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-[var(--ov-chip-bg)] text-[10px] text-ink-body">
                        {getInitials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-title">{person.name}</p>
                      <p className="text-xs text-ink-muted">
                        {person.count} payment{person.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-ink-title">{formatCurrency(person.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </FadeRise>

      {/* ── Recent Payments ───────────────────────────────── */}
      <FadeRise delay={0.45}>
        <Panel
          title="Recent Payments"
          description={`${payments.length} completed payment${payments.length !== 1 ? 's' : ''} total.`}
        >
          {payments.length === 0 ? (
            <CardEmpty text="Completed payments will appear here." />
          ) : (
            <div className="flex flex-col gap-0">
              {visiblePayments.map((payment) => (
                <RecentPaymentRow
                  key={payment.id}
                  payment={payment}
                  expanded={expandedPayment === payment.id}
                  onToggle={() => setExpandedPayment(expandedPayment === payment.id ? null : payment.id)}
                />
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                  className="w-full py-3 text-sm font-medium text-seeko-accent transition-colors hover:text-seeko-accent-ink"
                >
                  {showAll ? 'Show less' : `Show all ${payments.length} payments`}
                </button>
              )}
            </div>
          )}
        </Panel>
      </FadeRise>
    </div>
  );
}

function RecentPaymentRow({
  payment,
  expanded,
  onToggle,
}: {
  payment: PaymentRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDesc = !!payment.description;
  const isClickable = hasDesc;
  const name = payment.recipientName ?? 'Unknown';

  return (
    <div className="border-b border-wash-6 last:border-0">
      <button
        type="button"
        onClick={() => isClickable && onToggle()}
        className={`w-full py-3 text-left ${isClickable ? 'cursor-pointer transition-colors hover:bg-wash-2' : 'cursor-default'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src={payment.recipientAvatarUrl ?? undefined} />
              <AvatarFallback className="bg-[var(--ov-chip-bg)] text-[10px] text-ink-body">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-title">{name}</p>
              {hasDesc && <p className="mt-0.5 truncate text-xs text-ink-muted">{payment.description}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="text-right">
              <span className="text-sm font-medium tabular-nums text-ink-title">{formatCurrency(Number(payment.amount))}</span>
              <p className="text-xs tabular-nums text-ink-muted">
                {payment.paidAt
                  ? new Date(payment.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </p>
            </div>
            {isClickable &&
              (expanded ? (
                <ChevronUp className="size-3.5 text-ink-muted" />
              ) : (
                <ChevronDown className="size-3.5 text-ink-muted" />
              ))}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.smooth}
            className="overflow-hidden"
          >
            <div className="pb-3 pl-11 pr-2">
              <div className="flex flex-col gap-1.5 rounded-lg border border-wash-6 bg-wash-2 p-3">
                {payment.description && <p className="text-xs text-ink-muted">{payment.description}</p>}
                {payment.recipientDepartment && (
                  <div className="mt-1.5 border-t border-wash-6 pt-1.5">
                    <span className="inline-flex items-center rounded-full border border-wash-8 px-1.5 py-0 text-[10px] font-normal text-ink-muted">
                      {payment.recipientDepartment}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-[var(--ov-panel)] p-6" style={{ boxShadow: 'var(--ov-shadow-panel)' }}>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-ink-title">{title}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function CardEmpty({ text }: { text: string }) {
  return <p className="py-8 text-center text-[13px] text-ink-muted">{text}</p>;
}

function State({ title, description }: { title: string; description: string }) {
  return (
    <section className="rr-page">
      <div className="rr-panel">
        <h1>{title}</h1>
        <p className="mt-2 text-sm text-ink-body">{description}</p>
      </div>
    </section>
  );
}
