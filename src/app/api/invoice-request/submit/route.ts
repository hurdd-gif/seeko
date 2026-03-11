import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { formatCurrency } from '@/lib/format';

/* ─── In-memory rate limiter ────────────────────────────────
 * 5 submits per IP per hour.
 * Use rightmost IP in x-forwarded-for (trusted proxy appends last).
 * Prune expired entries to avoid unbounded memory growth.
 * Fine for a single Render instance; swap for Upstash if horizontal scale.
 * ─────────────────────────────────────────────────────────── */
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // Prune expired entries to prevent memory growth
  if (ipHits.size > 100) {
    for (const [key, entry] of ipHits) {
      if (now > entry.resetAt) ipHits.delete(key);
    }
  }
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  if (entry.count >= RATE_LIMIT.max) return true;
  entry.count++;
  return false;
}

/* ─── Validation helpers ──────────────────────────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 20;
const MAX_AMOUNT = 50_000;

export async function POST(request: NextRequest) {
  // 1. Rate limit by IP
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: 'Too many submit attempts. Try again later.' },
      { status: 429 },
    );
  }

  // 2. Parse + validate body
  let body: {
    token: string;
    items: { label: string; amount: number }[];
    paypalEmail: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token, items, paypalEmail } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  // Items validation
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Maximum ${MAX_ITEMS} items allowed` }, { status: 400 });
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return NextResponse.json({ error: 'Each item must be an object' }, { status: 400 });
    }
    if (!item.label || typeof item.label !== 'string' || item.label.trim().length === 0) {
      return NextResponse.json({ error: 'Each item must have a non-empty label' }, { status: 400 });
    }
    if (item.label.length > 200) {
      return NextResponse.json({ error: 'Item label must be under 200 characters' }, { status: 400 });
    }
    if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
      return NextResponse.json({ error: 'Each item must have a positive amount' }, { status: 400 });
    }
  }

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  if (total < 0.01 || total > MAX_AMOUNT) {
    return NextResponse.json(
      { error: `Total must be between $0.01 and $${MAX_AMOUNT.toLocaleString()}` },
      { status: 400 },
    );
  }

  // PayPal email validation
  if (!paypalEmail || typeof paypalEmail !== 'string' || paypalEmail.length > 254 || !EMAIL_RE.test(paypalEmail)) {
    return NextResponse.json({ error: 'Valid PayPal email required' }, { status: 400 });
  }

  // 3. Fetch invite
  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, created_by')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  // 4. Status checks
  if (invite.status === 'signed') {
    return NextResponse.json({ error: 'Invoice already submitted' }, { status: 409 });
  }

  if (invite.status !== 'verified') {
    return NextResponse.json({ error: 'Invite is not in a submittable state' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any)
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // 5. Create payment record
  const { data: payment, error: paymentError } = await service
    .from('payments')
    .insert({
      recipient_id: null,
      recipient_email: invite.recipient_email,
      amount: total,
      currency: 'USD',
      description: `External invoice from ${invite.recipient_email}`,
      status: 'pending',
      created_by: invite.created_by,
    } as never)
    .select()
    .single();

  if (paymentError || !payment) {
    console.error('[invoice-request/submit] payment insert failed:', paymentError);
    return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
  }

  // 6. Create payment items
  const paymentItems = items.map((item) => ({
    payment_id: payment.id,
    task_id: null,
    label: item.label.trim(),
    amount: item.amount,
  }));

  const { error: itemsError } = await service
    .from('payment_items')
    .insert(paymentItems as never[]);

  if (itemsError) {
    console.error('[invoice-request/submit] payment_items insert failed:', itemsError);
    // 7. Clean up the payment record on items failure
    await service.from('payments').delete().eq('id', payment.id);
    return NextResponse.json({ error: 'Failed to save payment items' }, { status: 500 });
  }

  // 8. Update invite → signed
  await (service.from('external_signing_invites') as any)
    .update({
      status: 'signed',
      paypal_email: paypalEmail,
      submitted_payment_id: payment.id,
      signed_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  // 9. Notify all admins
  try {
    const { data: admins } = await service
      .from('profiles')
      .select('id')
      .eq('is_admin', true);

    if (admins?.length) {
      const { error: notifErr } = await service.from('notifications').insert(
        admins.map(({ id }) => ({
          user_id: id,
          kind: 'payment_request',
          title: `External invoice: ${formatCurrency(total)}`,
          body: `Invoice submitted by ${invite.recipient_email}`,
          link: '/payments',
          read: false,
        })) as never[],
      );
      if (notifErr) console.error('[invoice-request/submit] notification insert failed:', notifErr);
    }
  } catch {
    // Non-critical — don't fail the request
  }

  // 10. Success
  return NextResponse.json({ success: true });
}
