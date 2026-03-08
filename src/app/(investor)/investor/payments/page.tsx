import { createClient } from '@/lib/supabase/server';
import { fetchProfile } from '@/lib/supabase/data';
import { redirect } from 'next/navigation';
import { PaymentsInvestor } from '@/components/dashboard/PaymentsInvestor';
import { FadeRise } from '@/components/motion';
import type { Payment } from '@/lib/types';

export const dynamic = 'force-dynamic';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default async function InvestorPaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (!profile?.is_investor && !profile?.is_admin) redirect('/');

  const { data } = await supabase
    .from('payments')
    .select('*, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department), items:payment_items(*)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });

  const payments = (data ?? []) as Payment[];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const thisMonthPayments = payments.filter(p => p.paid_at && p.paid_at >= monthStart);
  const lastMonthPayments = payments.filter(p => p.paid_at && p.paid_at >= lastMonthStart && p.paid_at < monthStart);

  const stats = {
    thisMonth: thisMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    allTime: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    peoplePaid: new Set(payments.map(p => p.recipient_id)).size,
  };

  const lastMonthTotal = lastMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Count distinct months for average calculation
  const distinctMonths = new Set(
    payments
      .filter(p => p.paid_at)
      .map(p => {
        const d = new Date(p.paid_at!);
        return `${d.getFullYear()}-${d.getMonth()}`;
      })
  ).size;

  // Smart summary line
  const thisMonthRecipients = new Set(thisMonthPayments.map(p => p.recipient_id)).size;
  const summaryLine = stats.thisMonth > 0
    ? `${formatCurrency(stats.thisMonth)} disbursed this month to ${thisMonthRecipients} team member${thisMonthRecipients !== 1 ? 's' : ''}.`
    : payments.length > 0
      ? `${formatCurrency(stats.allTime)} disbursed across ${stats.peoplePaid} team member${stats.peoplePaid !== 1 ? 's' : ''} total.`
      : 'No payments recorded yet.';

  return (
    <div className="flex flex-col gap-6">
      <FadeRise delay={0}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {summaryLine}
        </p>
      </FadeRise>

      <PaymentsInvestor
        payments={payments}
        stats={stats}
        lastMonthTotal={lastMonthTotal}
        monthCount={distinctMonths}
      />
    </div>
  );
}
