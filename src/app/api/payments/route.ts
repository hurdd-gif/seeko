import { NextRequest, NextResponse } from 'next/server';
import { requirePaymentsAdminToken, requirePaymentsViewerToken } from '@/lib/payments-auth';

export async function GET(req: NextRequest) {
  const guard = await requirePaymentsViewerToken(req);
  if ('error' in guard) return guard.error;
  const { supabase, isAdmin, isInvestor } = guard.auth;

  let query = supabase
    .from('payments')
    .select('*, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department, paypal_email), items:payment_items(*)')
    .order('created_at', { ascending: false });

  if (isInvestor && !isAdmin) {
    query = query.eq('status', 'paid');
  }

  const { data, error } = await query;
  if (error) {
    console.error('Payments list error:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const guard = await requirePaymentsAdminToken(req);
  if ('error' in guard) return guard.error;
  const { supabase, user } = guard.auth;

  let body: {
    recipient_id: string;
    amount: number;
    description?: string;
    status?: 'pending' | 'paid';
    items: { task_id?: string; label: string; amount: number }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.recipient_id || !body.amount || !body.items?.length) {
    return NextResponse.json({ error: 'recipient_id, amount, and items are required' }, { status: 400 });
  }

  const status = body.status ?? 'pending';

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      recipient_id: body.recipient_id,
      amount: body.amount,
      currency: 'USD',
      description: body.description?.trim() || null,
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      created_by: user.id,
    })
    .select()
    .single();

  if (paymentError) {
    console.error('Payment create error:', paymentError);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }

  const items = body.items.map(item => ({
    payment_id: payment.id,
    task_id: item.task_id || null,
    label: item.label,
    amount: item.amount,
  }));

  const { error: itemsError } = await supabase
    .from('payment_items')
    .insert(items);

  if (itemsError) {
    console.error('Payment items insert error:', itemsError);
    return NextResponse.json({ error: 'Failed to save payment items' }, { status: 500 });
  }

  return NextResponse.json(payment, { status: 201 });
}
