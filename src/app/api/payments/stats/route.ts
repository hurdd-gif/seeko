import { NextRequest, NextResponse } from 'next/server';
import { getPaymentsAuth } from '@/lib/payments-auth';

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, isInvestor, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin && !isInvestor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (isAdmin && !tokenValid) return NextResponse.json({ error: 'Payments token required' }, { status: 401 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  if (isAdmin) {
    const [pendingRes, paidMonthRes, allPaidRes] = await Promise.all([
      supabase.from('payments').select('amount, recipient_id').eq('status', 'pending'),
      supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart),
      supabase.from('payments').select('id').eq('status', 'paid').gte('paid_at', monthStart),
    ]);

    const pendingPayments = pendingRes.data ?? [];
    const pendingTotal = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const peopleOwed = new Set(pendingPayments.map(p => p.recipient_id)).size;
    const paidThisMonth = (paidMonthRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    const paymentsThisMonth = allPaidRes.data?.length ?? 0;

    return NextResponse.json({ pendingTotal, paidThisMonth, peopleOwed, paymentsThisMonth });
  }

  const [paidMonthRes, allTimeRes] = await Promise.all([
    supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart),
    supabase.from('payments').select('amount, recipient_id').eq('status', 'paid'),
  ]);

  const thisMonth = (paidMonthRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const allTimePayments = allTimeRes.data ?? [];
  const allTime = allTimePayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const peoplePaid = new Set(allTimePayments.map(p => p.recipient_id)).size;

  return NextResponse.json({ thisMonth, allTime, peoplePaid });
}
