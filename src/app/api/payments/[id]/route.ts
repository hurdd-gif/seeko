import { NextRequest, NextResponse } from 'next/server';
import { getPaymentsAuth } from '@/lib/payments-auth';

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

  return NextResponse.json(data);
}
