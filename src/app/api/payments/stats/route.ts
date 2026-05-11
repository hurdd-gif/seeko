import { NextRequest, NextResponse } from 'next/server';
import { requirePaymentsViewerToken } from '@/lib/payments-auth';

export async function GET(req: NextRequest) {
  const guard = await requirePaymentsViewerToken(req);
  if ('error' in guard) return guard.error;
  const { supabase, isAdmin } = guard.auth;

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
