'use client';
import { Link } from '@/lib/react-router-adapters';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type RecentPayment = {
  id: string;
  description: string;
  amount: number;
  status: 'paid' | 'pending';
  created_at: string;
  recipient: { id: string; display_name?: string };
};

type Props = {
  paidTotal: number;
  thisMonth: number;
  recent: RecentPayment[];
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

function formatShortDate(iso: string) {
  // Accept either YYYY-MM-DD or a full ISO timestamp; parse the date prefix
  // as a local-time Date so timezone offset doesn't shift the day.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Strip a trailing email address from auto-generated descriptions like
 * "External invoice from foo@bar.com". The recipient column already carries
 * the identity — duplicating the email in the description makes rows wrap
 * awkwardly and reads as machine-generated noise.
 */
function cleanDescription(description: string): string {
  return description.replace(/\s+from\s+\S+@\S+$/i, '').trim();
}

export function InvestorWhatItCost({ paidTotal, thisMonth, recent }: Props) {
  // Decide once: if no row has a recipient, drop the column entirely and let
  // the description rebalance into the freed space. When the column is shown
  // mixed (some named, some null) we render an empty string for the null
  // rows — never an em-dash, which reads as missing-data noise on every row.
  const hasAnyRecipient = recent.some((p) => !!p.recipient?.display_name);

  return (
    <section className="overflow-hidden rounded-2xl bg-white p-6 shadow-seeko">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[13px] font-medium leading-[18px] text-[var(--ov-muted)]">What it cost</p>
          <h2 className="mt-1 text-[20px] font-semibold leading-[24px] text-[#111]">
            Spend snapshot
          </h2>
        </div>
        <Link
          href="/investor/payments"
          className="group inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-[#0000000a] py-2 pl-3.5 pr-3 text-[14px] leading-[18px] text-[#545454] transition-[background-color,transform] duration-150 ease-out hover:bg-[#00000012] active:scale-[0.97]"
        >
          View payments
          <ArrowRight className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SpendStat label="Paid total" value={paidTotal} />
        <SpendStat label="This month" value={thisMonth} />
      </div>

      <div className="mt-6">
        <p className="mb-2 px-1 text-[13px] font-medium leading-[18px] text-[var(--ov-muted)]">
          Recent payments
        </p>
      {recent.length === 0 ? (
          <p className="rounded-xl bg-[#f7f7f7] px-4 py-6 text-center text-[13px] text-[var(--ov-muted)]">
            No recent payments
          </p>
      ) : (
          <div className="flex flex-col divide-y divide-[var(--ov-hairline)] rounded-xl bg-[#f7f7f7] px-4 shadow-[0_0_0_1px_rgba(0,0,0,0.035)]">
            {recent.slice(0, 3).map((p) => (
              <div key={p.id} className="grid grid-cols-[auto_68px_minmax(0,1fr)_auto] items-center gap-3 py-3 md:grid-cols-[auto_68px_minmax(0,1fr)_minmax(80px,120px)_auto]">
                <span
                  data-testid={`status-dot-${p.id}`}
                  className={cn(
                    'size-2 shrink-0 translate-y-px rounded-full',
                    p.status === 'paid' ? 'bg-[--color-seeko-accent]' : 'bg-[var(--ov-muted)]'
                  )}
                />
                <span className="text-[12px] tabular-nums text-[var(--ov-muted)]">
                  {formatShortDate(p.created_at)}
                </span>
                <span className="min-w-0 truncate text-[14px] leading-[18px] text-[#111]">{cleanDescription(p.description)}</span>
                {hasAnyRecipient && (
                  <span className="hidden min-w-0 truncate text-[12px] text-[var(--ov-muted)] md:block" title={p.recipient?.display_name ?? undefined}>
                    {p.recipient?.display_name ?? ''}
                  </span>
                )}
                <span className="text-right text-[14px] tabular-nums text-[#111]">{fmt(p.amount)}</span>
              </div>
            ))}
          </div>
      )}
      </div>
    </section>
  );
}

function SpendStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#f7f7f7] px-4 py-3.5 shadow-[0_0_0_1px_rgba(0,0,0,0.035)]">
      <p className="text-[12px] leading-[16px] text-[var(--ov-muted)]">{label}</p>
      <p className="mt-1 text-[24px] font-semibold leading-[28px] tabular-nums text-[#111]">
        {fmt(value)}
      </p>
    </div>
  );
}
