import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { formatCurrency } from '@/lib/format';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    amount: number;
    description?: string;
    items: { task_id?: string; label: string; amount: number }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.amount || !body.items?.length) {
    return NextResponse.json({ error: 'amount and items are required' }, { status: 400 });
  }
  if (!Number.isFinite(body.amount) || body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (body.items.some(item => !Number.isFinite(item.amount) || item.amount <= 0)) {
    return NextResponse.json({ error: 'each item amount must be a positive number' }, { status: 400 });
  }

  // Use service role to bypass RLS for insert
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: payment, error: paymentError } = await service
    .from('payments')
    .insert({
      recipient_id: user.id,
      amount: body.amount,
      currency: 'USD',
      description: body.description?.trim() || null,
      status: 'pending',
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

  const { error: itemsError } = await service
    .from('payment_items')
    .insert(items);

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  // Notify admins about the payment request
  try {
    const { data: profile } = await service
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const { data: admins } = await service
      .from('profiles')
      .select('id')
      .eq('is_admin', true);

    if (admins?.length) {
      const name = profile?.display_name ?? 'A team member';
      const { error: notifErr } = await service.from('notifications').insert(
        admins.map(({ id }) => ({
          user_id: id,
          kind: 'payment_request',
          title: `${name} requested ${formatCurrency(body.amount)}`,
          body: body.description?.trim() || null,
          link: '/payments',
          read: false,
        }))
      );
      if (notifErr) console.error('[payments/request] notification insert failed:', notifErr);
    }
  } catch {
    // Non-critical
  }

  return NextResponse.json(payment, { status: 201 });
}
