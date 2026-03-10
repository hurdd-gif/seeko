import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('payments')
    .select('id, amount, currency, description, status, paid_at, created_at, items:payment_items(id, label, amount, task_id)')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Payments query error:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
