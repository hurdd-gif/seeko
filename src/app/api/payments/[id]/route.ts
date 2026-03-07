import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getPaymentsAuth } from '@/lib/payments-auth';
import { formatCurrency } from '@/lib/format';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin || !tokenValid) return NextResponse.json({ error: 'Admin + payments token required' }, { status: 403 });

  const { id } = await params;

  let body: { status: 'paid' | 'cancelled' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!['paid', 'cancelled'].includes(body.status)) {
    return NextResponse.json({ error: 'Status must be "paid" or "cancelled"' }, { status: 400 });
  }

  const update: Record<string, unknown> = { status: body.status };
  if (body.status === 'paid') {
    update.paid_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('payments')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  // Notify the recipient about approval/denial (use service role to bypass RLS)
  if (data.recipient_id && data.recipient_id !== user.id) {
    try {
      const service = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const approved = body.status === 'paid';
      await service.from('notifications').insert({
        user_id: data.recipient_id,
        kind: approved ? 'payment_approved' : 'payment_denied',
        title: approved
          ? `Payment accepted: ${formatCurrency(Number(data.amount))}`
          : `Payment denied: ${formatCurrency(Number(data.amount))}`,
        body: data.description || null,
        link: '/settings',
        read: false,
      });
    } catch {
      // Non-critical
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get('x-payments-token');
  const { supabase, user, isAdmin, tokenValid } = await getPaymentsAuth(token);

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin || !tokenValid) return NextResponse.json({ error: 'Admin + payments token required' }, { status: 403 });

  const { id } = await params;

  // Delete line items first (FK constraint)
  await supabase.from('payment_items').delete().eq('payment_id', id);

  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
