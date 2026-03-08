import { NextRequest, NextResponse } from 'next/server';
import { getPaymentsAuth } from '@/lib/payments-auth';

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, isInvestor, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin && !isInvestor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!tokenValid) return NextResponse.json({ error: 'Payments token required' }, { status: 401 });

  let query = supabase
    .from('payments')
    .select('*, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department, paypal_email), items:payment_items(*)')
    .order('created_at', { ascending: false });

  if (isInvestor && !isAdmin) {
    query = query.eq('status', 'paid');
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin || !tokenValid) return NextResponse.json({ error: 'Admin + payments token required' }, { status: 403 });

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
  if (!Number.isFinite(body.amount) || body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (body.items.some(item => !Number.isFinite(item.amount) || item.amount <= 0)) {
    return NextResponse.json({ error: 'each item amount must be a positive number' }, { status: 400 });
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

  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });

  const items = body.items.map(item => ({
    payment_id: payment.id,
    task_id: item.task_id || null,
    label: item.label,
    amount: item.amount,
  }));

  const { error: itemsError } = await supabase
    .from('payment_items')
    .insert(items);

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  return NextResponse.json(payment, { status: 201 });
}
