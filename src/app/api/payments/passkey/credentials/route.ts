import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPaymentsAuth } from '@/lib/payments-auth';

async function client() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

export async function GET() {
  const supabase = await client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('passkey_credentials')
    .select('id, device_name, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ credentials: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  // Revoking a passkey requires proof of payments access (held passkey or recovery password),
  // matching the gate on register-options/register-verify. Prevents a hijacked Supabase
  // session from wiping the legitimate admin's enrolled devices.
  const token = req.headers.get('x-payments-token');
  const { supabase, user, tokenValid } = await getPaymentsAuth(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tokenValid) {
    return NextResponse.json({ error: 'Payments token required to revoke a device' }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error, count } = await supabase
    .from('passkey_credentials')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
