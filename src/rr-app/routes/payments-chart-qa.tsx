import { useState } from 'react';
import { PaymentsChart } from '@/components/dashboard/PaymentsChart';
import type { Payment } from '@/lib/types';

/* No-backend visual-QA preview for the payments Outflow chart, reachable at
 * /payments-chart-qa WITHOUT the passkey gate. Exercises loading shimmer,
 * loaded bars (sparse + spiky months, refund netting, pending stack), and the
 * empty state. NOT a migration target — deliberately absent from
 * routeInventory. */

function iso(monthsAgo: number, day = 12): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, day).toISOString();
}

function payment(p: Partial<Payment>): Payment {
  return {
    id: crypto.randomUUID(),
    recipient_id: 'r1',
    amount: 0,
    currency: 'USD',
    status: 'paid',
    created_by: 'admin',
    created_at: iso(0),
    ...p,
  };
}

/* Representative shape: quiet months, one spike, a tiny payout next to a big
 * month, a refund that nets down, and pending stacked on the current month. */
const MOCK: Payment[] = [
  payment({ amount: 850, paid_at: iso(11) }),
  payment({ amount: 1200, paid_at: iso(9) }),
  payment({ amount: 300, paid_at: iso(9, 25) }),
  payment({ amount: 4200, paid_at: iso(6) }), // spike month
  payment({ amount: 40, paid_at: iso(6, 27) }), // tiny payout, same month
  payment({ amount: 900, paid_at: iso(4), refund_amount: 400 }), // nets to 500
  payment({ amount: 1750, paid_at: iso(2) }),
  payment({ amount: 620, paid_at: iso(0, 3) }),
  payment({ amount: 480, status: 'pending' }),
  payment({ amount: 260, status: 'pending' }),
];

export function PaymentsChartQaRoute() {
  const [mode, setMode] = useState<'loaded' | 'loading' | 'empty'>('loaded');
  return (
    <div className="min-h-screen bg-[#fcfcfc] p-12 antialiased">
      <div className="mx-auto max-w-[1116px]">
        <div className="mb-6 flex gap-2">
          {(['loaded', 'loading', 'empty'] as const).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`${m} mode`}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-[13px] transition-[background-color,color] duration-150 ease-out ${
                mode === m ? 'bg-ink-title text-surface-1' : 'bg-wash-5 text-ink-body'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <PaymentsChart
          key={mode}
          payments={mode === 'loaded' ? MOCK : []}
          loading={mode === 'loading'}
        />
      </div>
    </div>
  );
}
