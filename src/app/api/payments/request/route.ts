import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { formatCurrency } from '@/lib/format';

// Rate limiter: 5 payment requests per user per hour
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const userHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  // Prune expired entries to prevent memory growth
  if (userHits.size > 100) {
    for (const [key, entry] of userHits) { if (now > entry.resetAt) userHits.delete(key); }
  }
  const entry = userHits.get(userId);
  if (!entry || now > entry.resetAt) {
    userHits.set(userId, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

const MAX_PAYMENT_AMOUNT = 50000; // $50,000 ceiling

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Investors cannot request payments
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_investor, display_name')
    .eq('id', user.id)
    .single();

  if (profile?.is_investor) {
    return NextResponse.json({ error: 'Investors cannot request payments' }, { status: 403 });
  }

  if (isRateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many payment requests. Try again later.' }, { status: 429 });
  }

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

  if (!Number.isFinite(body.amount) || body.amount <= 0 || body.amount > MAX_PAYMENT_AMOUNT) {
    return NextResponse.json({ error: `Amount must be between $0.01 and $${MAX_PAYMENT_AMOUNT.toLocaleString()}` }, { status: 400 });
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

  if (paymentError) {
    console.error('Payment request create error:', paymentError);
    return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 });
  }

  const items = body.items.map(item => ({
    payment_id: payment.id,
    task_id: item.task_id || null,
    label: item.label,
    amount: item.amount,
  }));

  const { error: itemsError } = await service
    .from('payment_items')
    .insert(items);

  if (itemsError) {
    console.error('Payment request items error:', itemsError);
    return NextResponse.json({ error: 'Failed to save payment items' }, { status: 500 });
  }

  // Notify admins about the payment request
  try {
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
