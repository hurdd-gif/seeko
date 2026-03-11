import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  interface InviteRow {
    id: string;
    recipient_email: string;
    status: string;
    prefilled_items: { label: string; amount: number }[] | null;
    paypal_email: string | null;
    submitted_payment_id: string | null;
    expires_at: string;
    created_at: string;
  }

  const service = getServiceClient();
  const { data, error } = await (service
    .from('external_signing_invites') as any)
    .select('id, recipient_email, status, prefilled_items, paypal_email, submitted_payment_id, expires_at, created_at')
    .eq('purpose', 'invoice')
    .order('created_at', { ascending: false }) as { data: InviteRow[] | null; error: any };

  if (error) {
    console.error('[invoice-request/list] query failed:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice requests' }, { status: 500 });
  }

  // Enrich submitted invoices with their linked payment status
  const invites = data ?? [];
  const paymentIds = invites
    .filter((inv) => inv.status === 'signed' && inv.submitted_payment_id)
    .map((inv) => inv.submitted_payment_id as string);

  let paymentStatusMap: Record<string, string> = {};
  if (paymentIds.length > 0) {
    const { data: payments } = await service
      .from('payments')
      .select('id, status')
      .in('id', paymentIds);
    if (payments) {
      paymentStatusMap = Object.fromEntries(payments.map((p: { id: string; status: string }) => [p.id, p.status]));
    }
  }

  const enriched = invites.map((inv) => ({
    ...inv,
    payment_status: inv.submitted_payment_id ? paymentStatusMap[inv.submitted_payment_id] ?? null : null,
  }));

  return NextResponse.json(enriched);
}
