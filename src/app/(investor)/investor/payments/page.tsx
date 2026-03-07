import { createClient } from '@/lib/supabase/server';
import { fetchProfile } from '@/lib/supabase/data';
import { redirect } from 'next/navigation';
import { PaymentsInvestor } from '@/components/dashboard/PaymentsInvestor';
import { FadeRise } from '@/components/motion';
import type { Payment } from '@/lib/types';

export const dynamic = 'force-dynamic';

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
  const thisMonthPayments = payments.filter(p => p.paid_at && p.paid_at >= monthStart);

  const stats = {
    thisMonth: thisMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    allTime: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    peoplePaid: new Set(payments.map(p => p.recipient_id)).size,
  };

  return (
    <div className="flex flex-col gap-6">
      <FadeRise delay={0}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Completed payments to the team.
        </p>
      </FadeRise>

      <PaymentsInvestor payments={payments} stats={stats} />
    </div>
  );
}
