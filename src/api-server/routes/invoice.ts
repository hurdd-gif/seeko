import { Hono } from 'hono';
import type { Context } from 'hono';
import bcrypt from 'bcryptjs';
import { timingSafeEqual, randomBytes, randomInt } from 'node:crypto';
import { getCookie, setCookie } from 'hono/cookie';
import {
  loadInvoiceRequest,
  type InvoiceRequestLoadResult,
} from '@/lib/invoice-request';
import { getServiceClient } from '@/lib/supabase/service';
import { sendInvoiceRequestEmail, sendVerificationCodeEmail } from '@/lib/email';
import { formatCurrency } from '@/lib/format';
import type { ExternalSigningInvite } from '@/lib/types';
import { requireAdmin } from '../auth-utils';

type InvoiceLoader = (token: string, sessionToken?: string | null) => Promise<InvoiceRequestLoadResult>;

type InvoiceRoutesOptions = {
  invoiceLoader?: InvoiceLoader;
};

const CODE_RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
const SUBMIT_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const MAX_ATTEMPTS = 5;
const MAX_ITEMS = 20;
const MAX_AMOUNT = 50_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tokenHits = new Map<string, { count: number; resetAt: number }>();
const ipHits = new Map<string, { count: number; resetAt: number }>();

interface VerifyRow {
  id: string;
  status: string;
  expires_at: string;
  verification_code: string;
  verification_attempts: number;
  prefilled_items: { label: string; amount: number }[] | null;
  personal_note: string | null;
}

const INVOICE_SESSION_COOKIE = 'invoice_request_session';

export function createInvoiceRoutes(options: InvoiceRoutesOptions = {}) {
  // loadInvoiceRequest takes an options object; adapt to the positional
  // (token, sessionToken) shape used by the route handlers.
  const invoiceLoader =
    options.invoiceLoader ??
    ((token: string, sessionToken?: string | null) => loadInvoiceRequest(token, { sessionToken }));

  return new Hono()
    .post('/invoice-request/invite', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const body = await c.req.json().catch(() => null) as {
        recipientEmail?: unknown;
        items?: unknown;
        personalNote?: unknown;
        expiresAt?: unknown;
      } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);

      const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';
      const personalNote = typeof body.personalNote === 'string' ? body.personalNote : null;
      if (!recipientEmail || recipientEmail.length > 254 || !EMAIL_RE.test(recipientEmail)) {
        return c.json({ error: 'Valid email required' }, 400);
      }

      if (body.items !== undefined) {
        const valid = validateInvoiceItems(body.items, false);
        if (!valid.ok) return c.json({ error: valid.error }, 400);
      }
      if (personalNote && personalNote.length > 1000) {
        return c.json({ error: 'Personal note must be under 1000 characters' }, 400);
      }

      const expiresDate = parseInviteExpiry(body.expiresAt);
      if (!expiresDate.ok) return c.json({ error: expiresDate.error }, 400);

      const token = randomBytes(32).toString('base64url');
      const verificationCode = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(verificationCode, 10);

      const service = getServiceClient();
      const { error } = await service.from('external_signing_invites').insert({
        token,
        recipient_email: recipientEmail,
        template_type: 'invoice',
        purpose: 'invoice',
        prefilled_items: Array.isArray(body.items) ? body.items : null,
        personal_note: personalNote || null,
        expires_at: expiresDate.value.toISOString(),
        verification_code: hashedCode,
        status: 'pending',
        created_by: admin.user.id,
      } as never);

      if (error) {
        console.error('[hono invoice-request/invite] create failed:', error);
        return c.json({ error: 'Failed to create invite' }, 500);
      }

      sendInvoiceRequestEmail({
        recipientEmail,
        token,
        personalNote: personalNote || null,
        expiresAt: expiresDate.value,
      }).catch((err) => console.error('[hono invoice-request/invite] email failed:', err));

      return c.json({ success: true });
    })
    .get('/invoice-request/list', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const service = getServiceClient();
      const { data, error } = await service
        .from('external_signing_invites')
        .select('id, recipient_email, status, prefilled_items, paypal_email, submitted_payment_id, expires_at, created_at')
        .eq('purpose', 'invoice')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[hono invoice-request/list] query failed:', error);
        return c.json({ error: 'Failed to fetch invoice requests' }, 500);
      }

      const invites = (data ?? []) as {
        id: string;
        recipient_email: string;
        status: string;
        prefilled_items: { label: string; amount: number }[] | null;
        paypal_email: string | null;
        submitted_payment_id: string | null;
        expires_at: string;
        created_at: string;
      }[];
      const paymentIds = invites
        .filter((invite) => invite.status === 'signed' && invite.submitted_payment_id)
        .map((invite) => invite.submitted_payment_id as string);

      let paymentStatusMap: Record<string, string> = {};
      if (paymentIds.length > 0) {
        const { data: payments } = await service.from('payments').select('id, status').in('id', paymentIds);
        paymentStatusMap = Object.fromEntries((payments ?? []).map((payment: { id: string; status: string }) => [payment.id, payment.status]));
      }

      return c.json(invites.map((invite) => ({
        ...invite,
        payment_status: invite.submitted_payment_id ? paymentStatusMap[invite.submitted_payment_id] ?? null : null,
      })));
    })
    .post('/invoice-request/resend', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const { invite_id } = await c.req.json().catch(() => ({ invite_id: '' }));
      if (!invite_id) return c.json({ error: 'invite_id required' }, 400);

      const service = getServiceClient();
      const { data: invite } = await service
        .from('external_signing_invites')
        .select('id, token, status, purpose, expires_at, recipient_email, personal_note')
        .eq('id', invite_id)
        .single() as { data: (ExternalSigningInvite & { purpose?: string }) | null };

      if (!invite) return c.json({ error: 'Invite not found' }, 404);
      if (invite.purpose !== 'invoice') return c.json({ error: 'Not an invoice request' }, 400);
      if (invite.status === 'signed') return c.json({ error: 'Already submitted' }, 400);
      if (invite.status === 'revoked') return c.json({ error: 'Invite is revoked' }, 400);
      if (new Date(invite.expires_at) < new Date()) return c.json({ error: 'Invite has expired - create a new one' }, 400);

      const code = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(code, 10);
      await service
        .from('external_signing_invites')
        .update({ verification_code: hashedCode, verification_attempts: 0, status: 'pending', verified_at: null, session_token: null } as never)
        .eq('id', invite_id);

      await sendInvoiceRequestEmail({
        recipientEmail: invite.recipient_email,
        token: invite.token,
        personalNote: invite.personal_note ?? null,
        expiresAt: new Date(invite.expires_at),
      });

      return c.json({ success: true });
    })
    .post('/invoice-request/revoke', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const { invite_id } = await c.req.json().catch(() => ({ invite_id: '' }));
      if (!invite_id) return c.json({ error: 'invite_id required' }, 400);

      const service = getServiceClient();
      const { data: invite } = await service
        .from('external_signing_invites')
        .select('status, purpose')
        .eq('id', invite_id)
        .single() as { data: { status: string; purpose: string } | null };

      if (!invite) return c.json({ error: 'Invite not found' }, 404);
      if (invite.purpose !== 'invoice') return c.json({ error: 'Not an invoice request' }, 400);
      if (invite.status === 'signed') return c.json({ error: 'Cannot revoke a submitted invoice' }, 400);

      await service.from('external_signing_invites').update({ status: 'revoked' } as never).eq('id', invite_id);
      return c.json({ success: true });
    })
    .get('/invoice-request/:token', async (c) => {
      const result = await invoiceLoader(c.req.param('token'), getCookie(c, INVOICE_SESSION_COOKIE));

      if (!result.found) {
        return c.json({ error: 'Invite not found' }, 404);
      }

      return c.json(result.initialData);
    })
    .post('/invoice-request/send-code', async (c) => {
      const { token } = await c.req.json().catch(() => ({ token: '' }));

      if (!token || typeof token !== 'string') {
        return c.json({ error: 'Token required' }, 400);
      }

      if (isRateLimited(tokenHits, token, CODE_RATE_LIMIT)) {
        return c.json({ error: 'Too many code requests. Try again later.' }, 429);
      }

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, recipient_email, status, expires_at')
        .eq('token', token)
        .eq('purpose', 'invoice')
        .single();

      const invite = data as ExternalSigningInvite | null;

      if (!invite) return c.json({ error: 'Invite not found' }, 404);

      if (invite.status !== 'pending') {
        return c.json({ error: 'Invite is no longer available' }, 400);
      }

      if (new Date(invite.expires_at) < new Date()) {
        await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
        return c.json({ error: 'Invite has expired' }, 400);
      }

      const { randomInt } = await import('node:crypto');
      const code = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(code, 10);

      await service
        .from('external_signing_invites')
        .update({ verification_code: hashedCode, verification_attempts: 0, status: 'pending', verified_at: null, session_token: null } as never)
        .eq('id', invite.id);

      await sendVerificationCodeEmail({
        recipientEmail: invite.recipient_email,
        code,
      });

      return c.json({ success: true });
    })
    .post('/invoice-request/verify', async (c) => {
      const { token, code } = await c.req.json().catch(() => ({ token: '', code: '' }));

      if (!token || !code) {
        return c.json({ error: 'Token and code required' }, 400);
      }

      const service = getServiceClient();
      const { data: updated, error: rpcError } = await service.rpc('increment_verification_attempt', {
        p_token: token,
        p_purpose: 'invoice',
        p_max_attempts: MAX_ATTEMPTS,
      }) as { data: VerifyRow[] | null; error: { code?: string; message?: string } | null };

      if (rpcError?.code === '42883') {
        return verifyFallback(c, token, code);
      }

      if (rpcError) {
        console.error('[hono invoice-request/verify] rpc error:', rpcError);
        return c.json({ error: 'Verification failed' }, 500);
      }

      if (!updated || updated.length === 0) {
        const { data: invite } = await service
          .from('external_signing_invites')
          .select('id, status, verification_attempts')
          .eq('token', token)
          .eq('purpose', 'invoice')
          .single();

        if (!invite) return c.json({ error: 'Invite not found' }, 404);
        if (invite.status === 'verified' || invite.status === 'signed') {
          return c.json({ error: 'Invite has already been verified' }, 409);
        }
        if (invite.verification_attempts >= MAX_ATTEMPTS) {
          return c.json({ error: 'Too many attempts. Request a new code.' }, 429);
        }
        return c.json({ error: 'Invite is no longer available' }, 400);
      }

      const invite = updated[0]!;

      if (new Date(invite.expires_at) < new Date()) {
        await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
        return c.json({ error: 'Invite has expired' }, 400);
      }

      const valid = await bcrypt.compare(code, invite.verification_code);
      if (!valid) {
        const remaining = MAX_ATTEMPTS - invite.verification_attempts;
        return c.json(
          { error: `Invalid code. ${Math.max(remaining, 0)} attempt${remaining !== 1 ? 's' : ''} remaining.` },
          400
        );
      }

      await establishInvoiceSession(c, invite.id, invite.expires_at);

      return c.json({
        status: 'verified',
        prefilledItems: invite.prefilled_items,
        personalNote: invite.personal_note,
      });
    })
    .post('/invoice-request/submit', async (c) => {
      const clientIp = getClientIp(c.req.raw);
      if (isRateLimited(ipHits, clientIp, SUBMIT_RATE_LIMIT)) {
        return c.json({ error: 'Too many submit attempts. Try again later.' }, 429);
      }

      const body = await c.req.json().catch(() => null) as {
        token?: unknown;
        items?: unknown;
        paypalEmail?: unknown;
      } | null;

      if (!body) return c.json({ error: 'Invalid JSON' }, 400);

      const { token, items, paypalEmail } = body;

      if (!token || typeof token !== 'string') {
        return c.json({ error: 'Token is required' }, 400);
      }

      if (!Array.isArray(items) || items.length === 0) {
        return c.json({ error: 'At least one item is required' }, 400);
      }
      if (items.length > MAX_ITEMS) {
        return c.json({ error: `Maximum ${MAX_ITEMS} items allowed` }, 400);
      }

      for (const item of items) {
        if (!item || typeof item !== 'object') {
          return c.json({ error: 'Each item must be an object' }, 400);
        }
        const candidate = item as { label?: unknown; amount?: unknown };
        if (!candidate.label || typeof candidate.label !== 'string' || candidate.label.trim().length === 0) {
          return c.json({ error: 'Each item must have a non-empty label' }, 400);
        }
        if (candidate.label.length > 200) {
          return c.json({ error: 'Item label must be under 200 characters' }, 400);
        }
        if (typeof candidate.amount !== 'number' || !Number.isFinite(candidate.amount) || candidate.amount <= 0) {
          return c.json({ error: 'Each item must have a positive amount' }, 400);
        }
      }

      const invoiceItems = items as { label: string; amount: number }[];
      const total = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
      if (total < 0.01 || total > MAX_AMOUNT) {
        return c.json({ error: `Total must be between $0.01 and $${MAX_AMOUNT.toLocaleString()}` }, 400);
      }

      if (
        !paypalEmail ||
        typeof paypalEmail !== 'string' ||
        paypalEmail.length > 254 ||
        !EMAIL_RE.test(paypalEmail)
      ) {
        return c.json({ error: 'Valid PayPal email required' }, 400);
      }

      const service = getServiceClient();
      const { data: invite } = await service
        .from('external_signing_invites')
        .select('id, recipient_email, status, expires_at, created_by, session_token')
        .eq('token', token)
        .eq('purpose', 'invoice')
        .single();

      if (!invite) return c.json({ error: 'Invite not found' }, 404);

      if (invite.status === 'signed') {
        return c.json({ error: 'Invoice already submitted' }, 409);
      }

      if (invite.status !== 'verified') {
        return c.json({ error: 'Invite is not in a submittable state' }, 400);
      }

      if (!isInvoiceSessionValid(c, invite.session_token as string | null)) {
        return c.json({ error: 'session_expired' }, 401);
      }

      if (new Date(invite.expires_at) < new Date()) {
        await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
        return c.json({ error: 'Invite has expired' }, 400);
      }

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
        console.error('[hono invoice-request/submit] payment insert failed:', paymentError);
        return c.json({ error: 'Failed to create payment record' }, 500);
      }

      const paymentItems = invoiceItems.map((item) => ({
        payment_id: payment.id,
        task_id: null,
        label: item.label.trim(),
        amount: item.amount,
      }));

      const { error: itemsError } = await service.from('payment_items').insert(paymentItems as never[]);

      if (itemsError) {
        console.error('[hono invoice-request/submit] payment_items insert failed:', itemsError);
        await service.from('payments').delete().eq('id', payment.id);
        return c.json({ error: 'Failed to save payment items' }, 500);
      }

      await service
        .from('external_signing_invites')
        .update({
          status: 'signed',
          paypal_email: paypalEmail,
          submitted_payment_id: payment.id,
          session_token: null,
          signed_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      try {
        const { data: admins } = await service.from('profiles').select('id').eq('is_admin', true);
        if (admins?.length) {
          const { error: notifErr } = await service.from('notifications').insert(
            admins.map(({ id }) => ({
              user_id: id,
              kind: 'payment_request',
              title: `External invoice: ${formatCurrency(total)}`,
              body: `Invoice submitted by ${invite.recipient_email}`,
              link: '/payments',
              read: false,
            })) as never[]
          );
          if (notifErr) console.error('[hono invoice-request/submit] notification insert failed:', notifErr);
        }
      } catch {
        // Non-critical.
      }

      return c.json({ success: true });
    });
}

async function verifyFallback(c: Context, token: string, code: string) {
  const service = getServiceClient();
  const { data } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, verification_code, verification_attempts, prefilled_items, personal_note')
    .eq('token', token)
    .eq('purpose', 'invoice')
    .single();

  const invite = data as (ExternalSigningInvite & {
    verification_code: string;
    prefilled_items: { label: string; amount: number }[] | null;
    personal_note: string | null;
  }) | null;

  if (!invite) return Response.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status === 'verified' || invite.status === 'signed') {
    return Response.json({ error: 'Invite has already been verified' }, { status: 409 });
  }

  if (invite.status !== 'pending') {
    return Response.json({ error: 'Invite is no longer available' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
    return Response.json({ error: 'Invite has expired' }, { status: 400 });
  }

  if (invite.verification_attempts >= MAX_ATTEMPTS) {
    return Response.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  await service
    .from('external_signing_invites')
    .update({ verification_attempts: invite.verification_attempts + 1 })
    .eq('id', invite.id);

  const valid = await bcrypt.compare(code, invite.verification_code);
  if (!valid) {
    const remaining = MAX_ATTEMPTS - 1 - invite.verification_attempts;
    return Response.json(
      { error: `Invalid code. ${Math.max(remaining, 0)} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      { status: 400 }
    );
  }

  await establishInvoiceSession(c, invite.id, invite.expires_at);

  return Response.json({
    status: 'verified',
    prefilledItems: invite.prefilled_items,
    personalNote: invite.personal_note,
  });
}

async function establishInvoiceSession(c: Context, inviteId: string, expiresAt: string) {
  const service = getServiceClient();
  const sessionToken = randomBytes(32).toString('base64url');

  await service
    .from('external_signing_invites')
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
      session_token: sessionToken,
    } as never)
    .eq('id', inviteId);

  setCookie(c, INVOICE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    expires: new Date(expiresAt),
    path: '/',
  });
}

function isInvoiceSessionValid(c: Context, expected: string | null) {
  const actual = getCookie(c, INVOICE_SESSION_COOKIE);
  return (
    !!expected &&
    !!actual &&
    expected.length === actual.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  );
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : 'unknown';
}

function isRateLimited(
  hits: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: { max: number; windowMs: number }
) {
  const now = Date.now();

  if (hits.size > 100) {
    for (const [entryKey, entry] of hits) {
      if (now > entry.resetAt) hits.delete(entryKey);
    }
  }

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + limit.windowMs });
    return false;
  }

  if (entry.count >= limit.max) return true;
  entry.count++;
  return false;
}

function parseInviteExpiry(value: unknown): { ok: true; value: Date } | { ok: false; error: string } {
  const expiresDate = value ? new Date(String(value)) : new Date();
  if (!value) expiresDate.setDate(expiresDate.getDate() + 30);
  if (expiresDate.getHours() === 0 && expiresDate.getMinutes() === 0) {
    expiresDate.setHours(23, 59, 59, 999);
  }
  if (Number.isNaN(expiresDate.getTime())) return { ok: false, error: 'expires_at required' };
  if (expiresDate <= new Date()) return { ok: false, error: 'expires_at must be in the future' };
  return { ok: true, value: expiresDate };
}

function validateInvoiceItems(value: unknown, requireItems: boolean): { ok: true } | { ok: false; error: string } {
  if (value === undefined && !requireItems) return { ok: true };
  if (!Array.isArray(value)) return { ok: false, error: requireItems ? 'At least one item is required' : 'items must be an array' };
  if (requireItems && value.length === 0) return { ok: false, error: 'At least one item is required' };
  if (value.length > MAX_ITEMS) return { ok: false, error: `Maximum ${MAX_ITEMS} items allowed` };

  for (const item of value) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Each item must be an object' };
    const candidate = item as { label?: unknown; amount?: unknown };
    if (!candidate.label || typeof candidate.label !== 'string' || candidate.label.trim().length === 0) {
      return { ok: false, error: 'Each item must have a non-empty label' };
    }
    if (candidate.label.length > 200) return { ok: false, error: 'Item label must be under 200 characters' };
    if (typeof candidate.amount !== 'number' || !Number.isFinite(candidate.amount) || candidate.amount <= 0 || candidate.amount > MAX_AMOUNT) {
      return { ok: false, error: `Each item must have a positive amount (max $${MAX_AMOUNT.toLocaleString()})` };
    }
  }

  return { ok: true };
}
