import { Hono, type Context } from 'hono';
import { setCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { loadPaymentsIndex, type PaymentsIndexData } from '@/lib/payments-index';
import {
  getHonoPaymentsAuth,
  requireHonoPaymentsAdminToken,
  requireHonoPaymentsRecoveryAdmin,
  requireHonoPaymentsViewerToken,
  type PaymentsAdminAuth,
  type PaymentsAuthResult,
} from '../payments-auth';
import { deriveDeviceName, getRpConfig, issuePaymentsCookie } from '@/lib/payments-passkey';
import { getServiceClient } from '@/lib/supabase/service';
import { formatCurrency } from '@/lib/format';
import { getAuthenticatedUser } from '../supabase';
import { isRateLimited } from '../auth-utils';

type PaymentsIndexLoader = (user: PaymentsAdminAuth['user']) => Promise<PaymentsIndexData>;
type PaymentsAuthResolver = (c: Context) => Promise<PaymentsAuthResult>;

type PaymentsRoutesOptions = {
  paymentsAuthResolver?: PaymentsAuthResolver;
  paymentsIndexLoader?: PaymentsIndexLoader;
};

const requestHits = new Map<string, { count: number; resetAt: number }>();
const verifyAttempts = new Map<string, number[]>();
const MAX_PAYMENT_AMOUNT = 50_000;
const ALLOWED_TRANSPORTS = new Set(['usb', 'nfc', 'ble', 'internal', 'hybrid']);
const REFUND_ERROR = 'Refund amount must be between $0.00 and the payment amount';
const ADJUST_ERROR = 'Enter a different amount between $0.01 and $50,000.00';

export function createPaymentsRoutes(options: PaymentsRoutesOptions = {}) {
  const paymentsAuthResolver = options.paymentsAuthResolver ?? requireHonoPaymentsAdminToken;
  const paymentsIndexLoader = options.paymentsIndexLoader ?? loadPaymentsIndex;

  return new Hono()
    .get('/payments-index', async (c) => {
      const guard = await paymentsAuthResolver(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      try {
        return c.json(await paymentsIndexLoader(guard.auth.user));
      } catch (error) {
        console.error('[hono payments-index] load failed:', error);
        return c.json({ error: 'Failed to load payments.' }, 500);
      }
    })
    .get('/payments', async (c) => {
      const guard = await requireHonoPaymentsViewerToken(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const { supabase, isAdmin, isInvestor } = guard.auth;
      let query = supabase
        .from('payments')
        .select('*, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department, paypal_email), items:payment_items(*), adjustments:payment_adjustments(*)')
        .order('created_at', { ascending: false });

      if (isInvestor && !isAdmin) query = query.eq('status', 'paid');

      const { data, error } = await query;
      if (error) {
        console.error('[hono payments] list failed:', error);
        return c.json({ error: 'Failed to fetch payments' }, 500);
      }
      return c.json(data ?? []);
    })
    .post('/payments', async (c) => {
      const guard = await requireHonoPaymentsAdminToken(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const body = await c.req.json().catch(() => null) as {
        recipient_id?: string;
        payee_name?: string;
        amount?: number;
        description?: string;
        status?: 'pending' | 'paid';
        items?: { task_id?: string; label: string; amount: number }[];
      } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      const payeeName = body.payee_name?.trim() || null;
      // Exactly one payee identity: a team profile OR an external payee name.
      if (!body.recipient_id === !payeeName) {
        return c.json({ error: 'Provide either recipient_id or payee_name (not both)' }, 400);
      }
      if (!body.amount || !body.items?.length) {
        return c.json({ error: 'amount and items are required' }, 400);
      }

      const status = body.status ?? 'pending';
      const { data: payment, error: paymentError } = await guard.auth.supabase
        .from('payments')
        .insert({
          recipient_id: body.recipient_id ?? null,
          payee_name: payeeName,
          amount: body.amount,
          currency: 'USD',
          description: body.description?.trim() || null,
          status,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
          created_by: guard.auth.user.id,
        } as never)
        .select()
        .single();

      if (paymentError || !payment) {
        console.error('[hono payments] create failed:', paymentError);
        return c.json({ error: 'Failed to create payment' }, 500);
      }

      const { error: itemsError } = await guard.auth.supabase.from('payment_items').insert(
        body.items.map((item) => ({
          payment_id: payment.id,
          task_id: item.task_id || null,
          label: item.label,
          amount: item.amount,
        })) as never[]
      );
      if (itemsError) {
        console.error('[hono payments] items failed:', itemsError);
        return c.json({ error: 'Failed to save payment items' }, 500);
      }

      return c.json(payment, 201);
    })
    .patch('/payments/:id', async (c) => {
      const guard = await requireHonoPaymentsAdminToken(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const body = await c.req.json().catch(() => null) as {
        status?: 'paid' | 'cancelled';
        refund_amount?: number;
        refund_note?: string | null;
        amount?: number;
        adjustment_note?: string | null;
      } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);

      const id = c.req.param('id');
      const { data: current } = await guard.auth.supabase
        .from('payments')
        .select('id, status, amount, recipient_id, refund_amount')
        .eq('id', id)
        .single();
      if (!current) return c.json({ error: 'Payment not found' }, 404);

      // Amount adjustment — a restatement, not a second payout. adjust_payment
      // appends the history row and moves payments.amount inside one transaction,
      // so the ledger can never half-update. These checks exist for the message;
      // the function re-checks every one of them for the guarantee.
      if (body.amount !== undefined) {
        if (current.status !== 'paid') {
          return c.json({ error: 'Only paid payments can be adjusted' }, 409);
        }
        if (Number(current.refund_amount ?? 0) > 0) {
          return c.json({ error: 'Remove the refund before adjusting' }, 409);
        }

        const nextAmount = Number(body.amount);
        if (
          !Number.isFinite(nextAmount) ||
          nextAmount <= 0 ||
          nextAmount > MAX_PAYMENT_AMOUNT ||
          nextAmount === Number(current.amount)
        ) {
          return c.json({ error: ADJUST_ERROR }, 400);
        }

        const { data, error } = await guard.auth.supabase.rpc('adjust_payment', {
          p_payment_id: id,
          p_amount: nextAmount,
          p_note: body.adjustment_note?.trim() || null,
          p_actor: guard.auth.user.id,
        } as never);

        if (error || !data) {
          console.error('[hono payments/:id] adjust failed:', error);
          return c.json({ error: 'Failed to adjust payment' }, 500);
        }
        return c.json(data);
      }

      if (body.refund_amount !== undefined) {
        if (current.status !== 'paid') {
          return c.json({ error: 'Only paid payments can be refunded' }, 409);
        }

        const paymentAmount = Number(current.amount);
        const refundAmount = Number(body.refund_amount);
        if (!Number.isFinite(refundAmount) || refundAmount < 0 || refundAmount > paymentAmount) {
          return c.json({ error: REFUND_ERROR }, 400);
        }

        const refundNote = body.refund_note?.trim() || null;
        const { data, error } = await guard.auth.supabase
          .from('payments')
          .update({
            refund_amount: refundAmount,
            refund_note: refundNote,
            refunded_at: refundAmount > 0 ? new Date().toISOString() : null,
          } as never)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error('[hono payments/:id] refund update failed:', error);
          return c.json({ error: 'Failed to update refund' }, 500);
        }
        return c.json(data);
      }

      if (body.status !== 'paid' && body.status !== 'cancelled') {
        return c.json({ error: 'Status must be "paid" or "cancelled"' }, 400);
      }

      if (current.status !== 'pending') return c.json({ error: `Payment is already ${current.status}` }, 409);

      const update: Record<string, unknown> = { status: body.status };
      if (body.status === 'paid') update.paid_at = new Date().toISOString();

      const { data, error } = await guard.auth.supabase
        .from('payments')
        .update(update as never)
        .eq('id', id)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) {
        console.error('[hono payments/:id] update failed:', error);
        return c.json({ error: 'Failed to update payment' }, 500);
      }
      if (!data) return c.json({ error: 'Payment was already processed' }, 409);

      if (data.recipient_id && data.recipient_id !== guard.auth.user.id) {
        try {
          await getServiceClient().from('notifications').insert({
            user_id: data.recipient_id,
            kind: body.status === 'paid' ? 'payment_approved' : 'payment_denied',
            title: body.status === 'paid'
              ? `Payment accepted: ${formatCurrency(Number(data.amount))}`
              : `Payment denied: ${formatCurrency(Number(data.amount))}`,
            body: data.description || null,
            link: '/settings',
            read: false,
          } as never);
        } catch {
          // Non-critical.
        }
      }

      return c.json(data);
    })
    .delete('/payments/:id', async (c) => {
      const guard = await requireHonoPaymentsAdminToken(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const id = c.req.param('id');
      await guard.auth.supabase.from('payment_items').delete().eq('payment_id', id);
      const { error } = await guard.auth.supabase.from('payments').delete().eq('id', id);
      if (error) {
        console.error('[hono payments/:id] delete failed:', error);
        return c.json({ error: 'Failed to delete payment' }, 500);
      }
      return c.json({ ok: true });
    })
    .get('/payments/mine', async (c) => {
      const user = await getAuthenticatedUser(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const { data, error } = await getServiceClient()
        .from('payments')
        .select('id, amount, currency, description, status, paid_at, created_at, items:payment_items(id, label, amount, task_id)')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[hono payments/mine] query failed:', error);
        return c.json({ error: 'Failed to fetch payments' }, 500);
      }
      return c.json(data ?? []);
    })
    .post('/payments/request', async (c) => {
      const user = await getAuthenticatedUser(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const service = getServiceClient();
      const { data: profile } = await service.from('profiles').select('is_investor, display_name').eq('id', user.id).single();
      if (profile?.is_investor) return c.json({ error: 'Investors cannot request payments' }, 403);
      if (isRateLimited(requestHits, user.id, { max: 5, windowMs: 60 * 60 * 1000 })) {
        return c.json({ error: 'Too many payment requests. Try again later.' }, 429);
      }

      const body = await c.req.json().catch(() => null) as {
        amount?: number;
        description?: string;
        items?: { task_id?: string; label: string; amount: number }[];
      } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.amount || !body.items?.length) return c.json({ error: 'amount and items are required' }, 400);
      if (!Number.isFinite(body.amount) || body.amount <= 0 || body.amount > MAX_PAYMENT_AMOUNT) {
        return c.json({ error: `Amount must be between $0.01 and $${MAX_PAYMENT_AMOUNT.toLocaleString()}` }, 400);
      }

      const { data: payment, error: paymentError } = await service
        .from('payments')
        .insert({
          recipient_id: user.id,
          amount: body.amount,
          currency: 'USD',
          description: body.description?.trim() || null,
          status: 'pending',
          created_by: user.id,
        } as never)
        .select()
        .single();
      if (paymentError || !payment) {
        console.error('[hono payments/request] create failed:', paymentError);
        return c.json({ error: 'Failed to create payment request' }, 500);
      }

      const { error: itemsError } = await service.from('payment_items').insert(
        body.items.map((item) => ({
          payment_id: payment.id,
          task_id: item.task_id || null,
          label: item.label,
          amount: item.amount,
        })) as never[]
      );
      if (itemsError) {
        console.error('[hono payments/request] items failed:', itemsError);
        return c.json({ error: 'Failed to save payment items' }, 500);
      }

      try {
        const { data: admins } = await service.from('profiles').select('id').eq('is_admin', true);
        if (admins?.length) {
          const name = profile?.display_name ?? 'A team member';
          await service.from('notifications').insert(
            admins.map(({ id }) => ({
              user_id: id,
              kind: 'payment_request',
              title: `${name} requested ${formatCurrency(body.amount!)}`,
              body: body.description?.trim() || null,
              link: '/payments',
              read: false,
            })) as never[]
          );
        }
      } catch {
        // Non-critical.
      }

      return c.json(payment, 201);
    })
    .get('/payments/stats', async (c) => {
      const guard = await requireHonoPaymentsViewerToken(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const { supabase, isAdmin } = guard.auth;
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      if (isAdmin) {
        const [pendingRes, paidMonthRes, allPaidRes] = await Promise.all([
          supabase.from('payments').select('amount, recipient_id').eq('status', 'pending'),
          supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart),
          supabase.from('payments').select('id').eq('status', 'paid').gte('paid_at', monthStart),
        ]);
        const pendingPayments = pendingRes.data ?? [];
        return c.json({
          pendingTotal: pendingPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
          paidThisMonth: (paidMonthRes.data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0),
          peopleOwed: new Set(pendingPayments.map((payment) => payment.recipient_id)).size,
          paymentsThisMonth: allPaidRes.data?.length ?? 0,
        });
      }

      const [paidMonthRes, allTimeRes] = await Promise.all([
        supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart),
        supabase.from('payments').select('amount, recipient_id').eq('status', 'paid'),
      ]);
      const allTimePayments = allTimeRes.data ?? [];
      return c.json({
        thisMonth: (paidMonthRes.data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0),
        allTime: allTimePayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
        peoplePaid: new Set(allTimePayments.map((payment) => payment.recipient_id)).size,
      });
    })
    .post('/payments/verify', async (c) => {
      const guard = await requireHonoPaymentsRecoveryAdmin(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const rate = recordRecoveryAttempt(guard.auth.user.id);
      if (!rate.ok) {
        c.header('Retry-After', String(rate.retryAfterSec));
        return c.json({ error: 'Too many attempts. Try again later.' }, 429);
      }

      const body = await c.req.json().catch(() => null) as { password?: string } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.password) return c.json({ error: 'Password required' }, 400);
      const hash = process.env.PAYMENTS_ACCESS_HASH;
      if (!hash) return c.json({ error: 'Payments not configured' }, 500);
      if (!(await bcrypt.compare(body.password, hash))) return c.json({ error: 'Invalid password' }, 401);

      const cookie = await issuePaymentsCookie(guard.auth.user.id);
      setCookie(c, cookie.name, cookie.value, cookie.options);
      return c.json({ success: true, recovered: true });
    })
    .post('/payments/passkey/auth-options', async (c) => {
      const guard = await requireHonoPaymentsRecoveryAdmin(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);

      const service = getServiceClient();
      const { data: creds } = await service.from('passkey_credentials').select('credential_id, transports').eq('user_id', guard.auth.user.id);
      const { rpId } = getRpConfig(c.req.header('origin') ?? new URL(c.req.url).origin);
      const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: 'required',
        allowCredentials: (creds ?? []).map((cred: { credential_id: string; transports: string[] | null }) => ({
          id: cred.credential_id,
          transports: (cred.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
        })),
      });

      const { error } = await service.from('passkey_challenges').upsert({
        user_id: guard.auth.user.id,
        kind: 'auth',
        challenge: options.challenge,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      } as never);
      if (error) return c.json({ error: 'Failed to store challenge' }, 500);
      return c.json(options);
    })
    .post('/payments/passkey/auth-verify', async (c) => {
      const guard = await requireHonoPaymentsRecoveryAdmin(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const body = await c.req.json().catch(() => null) as { assertion?: { id?: string } & Record<string, unknown> } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.assertion?.id) return c.json({ error: 'assertion required' }, 400);

      const service = getServiceClient();
      const { data: challenge } = await service.from('passkey_challenges').select('challenge, expires_at').eq('user_id', guard.auth.user.id).eq('kind', 'auth').single();
      if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) return c.json({ error: 'Challenge missing or expired' }, 400);
      const { data: cred } = await service
        .from('passkey_credentials')
        .select('id, credential_id, public_key, counter, transports')
        .eq('user_id', guard.auth.user.id)
        .eq('credential_id', body.assertion.id)
        .single();
      if (!cred) return c.json({ error: 'Unknown credential' }, 400);

      const { rpId, origin: expectedOrigin } = getRpConfig(c.req.header('origin') ?? new URL(c.req.url).origin);
      let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
      try {
        verification = await verifyAuthenticationResponse({
          response: body.assertion as unknown as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
          expectedChallenge: challenge.challenge,
          expectedOrigin,
          expectedRPID: rpId,
          requireUserVerification: true,
          credential: {
            id: cred.credential_id,
            publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
            counter: Number(cred.counter),
            transports: (cred.transports as AuthenticatorTransportFuture[] | null) ?? undefined,
          },
        });
      } catch {
        return c.json({ error: 'Verification failed' }, 400);
      }
      if (!verification.verified) return c.json({ error: 'Verification failed' }, 400);
      const newCounter = verification.authenticationInfo.newCounter;
      if (newCounter !== 0 && newCounter <= Number(cred.counter)) {
        await service.from('passkey_credentials').delete().eq('id', cred.id);
        return c.json({ error: 'untrusted-device' }, 401);
      }
      await service.from('passkey_credentials').update({ counter: newCounter, last_used_at: new Date().toISOString() } as never).eq('id', cred.id);
      await service.from('passkey_challenges').delete().eq('user_id', guard.auth.user.id).eq('kind', 'auth');
      const cookie = await issuePaymentsCookie(guard.auth.user.id);
      setCookie(c, cookie.name, cookie.value, cookie.options);
      return c.json({ success: true });
    })
    .post('/payments/passkey/register-options', async (c) => {
      const auth = await getHonoPaymentsAuth(c);
      if (!auth.user) return c.json({ error: 'Unauthorized' }, 401);
      if (!auth.isAdmin) return c.json({ error: 'Admin access required' }, 403);
      if (!auth.tokenValid) return c.json({ error: 'Payments token required to enroll a device' }, 401);

      const service = getServiceClient();
      const { data: existing } = await service.from('passkey_credentials').select('credential_id, transports').eq('user_id', auth.user.id);
      const { rpId, rpName } = getRpConfig(c.req.header('origin') ?? new URL(c.req.url).origin);
      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName: auth.user.email ?? auth.user.id,
        userDisplayName: auth.user.email ?? 'admin',
        attestationType: 'none',
        excludeCredentials: (existing ?? []).map((cred: { credential_id: string; transports: string[] | null }) => ({
          id: cred.credential_id,
          transports: (cred.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
        })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      });
      const { error } = await service.from('passkey_challenges').upsert({
        user_id: auth.user.id,
        kind: 'register',
        challenge: options.challenge,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      } as never);
      if (error) return c.json({ error: 'Failed to store challenge' }, 500);
      return c.json(options);
    })
    .post('/payments/passkey/register-verify', async (c) => {
      const auth = await getHonoPaymentsAuth(c);
      if (!auth.user) return c.json({ error: 'Unauthorized' }, 401);
      if (!auth.isAdmin) return c.json({ error: 'Admin access required' }, 403);
      if (!auth.tokenValid) return c.json({ error: 'Payments token required to enroll a device' }, 401);

      const body = await c.req.json().catch(() => null) as { attestation?: unknown; deviceName?: string } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.attestation) return c.json({ error: 'attestation required' }, 400);

      const service = getServiceClient();
      const { data: challenge } = await service.from('passkey_challenges').select('challenge, expires_at').eq('user_id', auth.user.id).eq('kind', 'register').single();
      if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) return c.json({ error: 'Challenge missing or expired' }, 400);
      const { rpId, origin: expectedOrigin } = getRpConfig(c.req.header('origin') ?? new URL(c.req.url).origin);

      let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
      try {
        verification = await verifyRegistrationResponse({
          response: body.attestation as Parameters<typeof verifyRegistrationResponse>[0]['response'],
          expectedChallenge: challenge.challenge,
          expectedOrigin,
          expectedRPID: rpId,
          requireUserVerification: true,
        });
      } catch {
        return c.json({ error: 'Attestation verification failed' }, 400);
      }
      if (!verification.verified || !verification.registrationInfo) return c.json({ error: 'Attestation rejected' }, 400);

      const regInfo = verification.registrationInfo as Record<string, unknown>;
      const cred = (regInfo.credential as Record<string, unknown> | undefined) ?? regInfo;
      const credentialIdRaw = cred.id ?? cred.credentialID;
      const publicKeyRaw = cred.publicKey ?? cred.credentialPublicKey;
      const rawTransports = (body.attestation as { response?: { transports?: string[] } })?.response?.transports;
      const transports = Array.isArray(rawTransports)
        ? rawTransports.filter((transport): transport is string => typeof transport === 'string' && ALLOWED_TRANSPORTS.has(transport))
        : null;
      const credentialId = typeof credentialIdRaw === 'string'
        ? credentialIdRaw
        : Buffer.from(credentialIdRaw as Uint8Array).toString('base64url');
      const publicKey = typeof publicKeyRaw === 'string'
        ? publicKeyRaw
        : Buffer.from(publicKeyRaw as Uint8Array).toString('base64url');
      const deviceName = body.deviceName?.trim() || deriveDeviceName(c.req.header('user-agent'));

      const { error } = await service.from('passkey_credentials').insert({
        user_id: auth.user.id,
        credential_id: credentialId,
        public_key: publicKey,
        counter: (cred.counter as number | undefined) ?? 0,
        transports: transports && transports.length > 0 ? transports : null,
        device_name: deviceName,
      } as never);
      if (error) {
        if ((error as { code?: string }).code === '23505') return c.json({ error: 'Already registered' }, 409);
        return c.json({ error: 'Failed to store credential' }, 500);
      }

      await service.from('passkey_challenges').delete().eq('user_id', auth.user.id).eq('kind', 'register');
      const cookie = await issuePaymentsCookie(auth.user.id);
      setCookie(c, cookie.name, cookie.value, cookie.options);
      return c.json({ success: true, deviceName });
    })
    .get('/payments/passkey/credentials', async (c) => {
      const user = await getAuthenticatedUser(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      const { data, error } = await getServiceClient()
        .from('passkey_credentials')
        .select('id, device_name, created_at, last_used_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ credentials: data ?? [] });
    })
    .delete('/payments/passkey/credentials', async (c) => {
      const user = await getAuthenticatedUser(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      const id = c.req.query('id');
      if (!id) return c.json({ error: 'id required' }, 400);
      const { error, count } = await getServiceClient()
        .from('passkey_credentials')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) return c.json({ error: error.message }, 500);
      if (!count) return c.json({ error: 'Not found' }, 404);
      return c.json({ success: true });
    });
}

function recordRecoveryAttempt(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - 15 * 60 * 1000;
  const recent = (verifyAttempts.get(userId) ?? []).filter((time) => time > cutoff);
  if (recent.length >= 5) {
    verifyAttempts.set(userId, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + 15 * 60 * 1000 - now) / 1000)) };
  }
  recent.push(now);
  verifyAttempts.set(userId, recent);
  return { ok: true };
}
