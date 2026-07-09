import { timingSafeEqual, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getCookie, setCookie } from 'hono/cookie';
import { Hono, type Context } from 'hono';
import { loadDocShare, type DocShareLoadResult } from '@/lib/doc-share';
import { getServiceClient } from '@/lib/supabase/service';
import { sendDocShareEmail, sendVerificationCodeEmail } from '@/lib/email';
import { requireAdmin } from '../auth-utils';

type DocShareLoader = (token: string) => Promise<DocShareLoadResult>;

type DocShareRoutesOptions = {
  docShareLoader?: DocShareLoader;
};

const CODE_RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
const MAX_ATTEMPTS = 5;
const tokenHits = new Map<string, { count: number; resetAt: number }>();

interface VerifyRow {
  id: string;
  status: string;
  expires_at: string;
  verification_code: string;
  verification_attempts: number;
}

export function createDocShareRoutes(options: DocShareRoutesOptions = {}) {
  const docShareLoader = options.docShareLoader ?? loadDocShare;

  return new Hono()
    .post('/doc-share/invite', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const body = await c.req.json().catch(() => null) as {
        recipientEmail?: unknown;
        docId?: unknown;
        personalNote?: unknown;
        expiresAt?: unknown;
      } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);

      const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';
      const docId = typeof body.docId === 'string' ? body.docId : '';
      const personalNote = typeof body.personalNote === 'string' ? body.personalNote : null;
      if (!recipientEmail || recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return c.json({ error: 'Valid email required' }, 400);
      }
      if (!docId) return c.json({ error: 'docId required' }, 400);
      if (personalNote && personalNote.length > 1000) {
        return c.json({ error: 'Personal note must be under 1000 characters' }, 400);
      }

      const service = getServiceClient();
      const { data: doc } = await service.from('docs').select('id, title').eq('id', docId).single();
      if (!doc) return c.json({ error: 'Document not found' }, 404);

      const expiresDate = parseInviteExpiry(body.expiresAt);
      if (!expiresDate.ok) return c.json({ error: expiresDate.error }, 400);

      const token = randomBytes(32).toString('base64url');
      const code = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(code, 10);

      const { error } = await service.from('external_signing_invites').insert({
        token,
        recipient_email: recipientEmail,
        template_type: 'doc_share',
        purpose: 'doc_share',
        shared_doc_id: docId,
        personal_note: personalNote || null,
        expires_at: expiresDate.value.toISOString(),
        verification_code: hashedCode,
        status: 'pending',
        created_by: admin.user.id,
      } as never);

      if (error) {
        console.error('[hono doc-share/invite] create failed:', error);
        return c.json({ error: 'Failed to create invite' }, 500);
      }

      sendDocShareEmail({
        recipientEmail,
        token,
        docTitle: (doc as { title?: string }).title || 'Document',
        personalNote,
        expiresAt: expiresDate.value,
      }).catch((err) => console.error('[hono doc-share/invite] email failed:', err));

      return c.json({ success: true });
    })
    .get('/doc-share/list', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const service = getServiceClient();
      const { data, error } = await service
        .from('external_signing_invites')
        .select('id, recipient_email, status, shared_doc_id, view_count, expires_at, created_at')
        .eq('purpose', 'doc_share')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[hono doc-share/list] query failed:', error);
        return c.json({ error: 'Failed to fetch doc share invites' }, 500);
      }

      const invites = (data ?? []) as {
        id: string;
        recipient_email: string;
        status: string;
        shared_doc_id: string;
        view_count: number;
        expires_at: string;
        created_at: string;
      }[];
      const uniqueDocIds = [...new Set(invites.map((invite) => invite.shared_doc_id).filter(Boolean))];
      let docMap: Record<string, { title: string; type: string }> = {};

      if (uniqueDocIds.length > 0) {
        const { data: docs } = await service.from('docs').select('id, title, type').in('id', uniqueDocIds);
        docMap = Object.fromEntries(
          (docs ?? []).map((doc: { id: string; title: string; type: string }) => [doc.id, { title: doc.title, type: doc.type || 'doc' }])
        );
      }

      return c.json(invites.map((invite) => ({
        ...invite,
        doc_title: docMap[invite.shared_doc_id]?.title ?? null,
        doc_type: docMap[invite.shared_doc_id]?.type ?? null,
      })));
    })
    .post('/doc-share/resend', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const { invite_id } = await c.req.json().catch(() => ({ invite_id: '' }));
      if (!invite_id) return c.json({ error: 'invite_id required' }, 400);

      const service = getServiceClient();
      const { data: invite } = await service
        .from('external_signing_invites')
        .select('id, token, status, purpose, expires_at, recipient_email, personal_note, shared_doc_id')
        .eq('id', invite_id)
        .single() as { data: {
          id: string; token: string; status: string; purpose: string; expires_at: string;
          recipient_email: string; personal_note: string | null; shared_doc_id: string;
        } | null };

      if (!invite) return c.json({ error: 'Invite not found' }, 404);
      if (invite.purpose !== 'doc_share') return c.json({ error: 'Not a doc share invite' }, 400);
      if (invite.status === 'revoked') return c.json({ error: 'Invite is revoked' }, 400);
      if (new Date(invite.expires_at) < new Date()) return c.json({ error: 'Invite has expired - create a new one' }, 400);

      const code = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(code, 10);
      await service
        .from('external_signing_invites')
        .update({ verification_code: hashedCode, verification_attempts: 0, status: 'pending', verified_at: null, session_token: null } as never)
        .eq('id', invite_id);

      const { data: doc } = await service.from('docs').select('title').eq('id', invite.shared_doc_id).single();
      await sendDocShareEmail({
        recipientEmail: invite.recipient_email,
        token: invite.token,
        docTitle: (doc as { title?: string } | null)?.title || 'Document',
        personalNote: invite.personal_note,
        expiresAt: new Date(invite.expires_at),
      });

      return c.json({ success: true });
    })
    .post('/doc-share/revoke', async (c) => {
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
      if (invite.purpose !== 'doc_share') return c.json({ error: 'Not a doc share invite' }, 400);

      await service.from('external_signing_invites').update({ status: 'revoked', session_token: null } as never).eq('id', invite_id);
      return c.json({ success: true });
    })
    .patch('/doc-share/update-deadline', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const { invite_id, expires_at } = await c.req.json().catch(() => ({ invite_id: '', expires_at: '' }));
      if (!invite_id) return c.json({ error: 'invite_id required' }, 400);
      if (!expires_at) return c.json({ error: 'expires_at required' }, 400);
      const newDate = new Date(expires_at);
      if (Number.isNaN(newDate.getTime())) return c.json({ error: 'Invalid date' }, 400);
      if (newDate <= new Date()) return c.json({ error: 'Date must be in the future' }, 400);

      const service = getServiceClient();
      const { data: invite } = await service
        .from('external_signing_invites')
        .select('status, purpose')
        .eq('id', invite_id)
        .single() as { data: { status: string; purpose: string } | null };

      if (!invite) return c.json({ error: 'Invite not found' }, 404);
      if (invite.purpose !== 'doc_share') return c.json({ error: 'Not a doc share invite' }, 400);
      if (invite.status !== 'pending' && invite.status !== 'verified') {
        return c.json({ error: 'Can only update active invites' }, 400);
      }

      const { error } = await service
        .from('external_signing_invites')
        .update({ expires_at: newDate.toISOString() } as never)
        .eq('id', invite_id);
      if (error) {
        console.error('[hono doc-share/update-deadline] update failed:', error);
        return c.json({ error: 'Failed to update deadline' }, 500);
      }

      return c.json({ success: true, expires_at: newDate.toISOString() });
    })
    .get('/doc-share/:token', async (c) => {
      const result = await docShareLoader(c.req.param('token'));

      if (!result.found) {
        return c.json({ error: 'Invite not found' }, 404);
      }

      return c.json(result.initialData);
    })
    .post('/doc-share/send-code', async (c) => {
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
        .eq('purpose', 'doc_share')
        .single();

      const invite = data as {
        id: string;
        recipient_email: string;
        status: string;
        expires_at: string;
      } | null;

      if (!invite) return c.json({ error: 'Invite not found' }, 404);

      if (invite.status !== 'pending') {
        return c.json({ error: 'Invite is no longer available' }, 400);
      }

      if (new Date(invite.expires_at) < new Date()) {
        await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
        return c.json({ error: 'Invite has expired' }, 400);
      }

      const code = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(code, 10);

      await service
        .from('external_signing_invites')
        .update({ verification_code: hashedCode, verification_attempts: 0 })
        .eq('id', invite.id);

      await sendVerificationCodeEmail({
        recipientEmail: invite.recipient_email,
        code,
      });

      return c.json({ success: true });
    })
    .post('/doc-share/verify', async (c) => {
      const { token, code } = await c.req.json().catch(() => ({ token: '', code: '' }));

      if (!token || !code) {
        return c.json({ error: 'Token and code required' }, 400);
      }

      const service = getServiceClient();
      const { data: updated, error: rpcError } = await service.rpc('increment_verification_attempt', {
        p_token: token,
        p_purpose: 'doc_share',
        p_max_attempts: MAX_ATTEMPTS,
      }) as { data: VerifyRow[] | null; error: { code?: string; message?: string } | null };

      if (rpcError?.code === '42883') {
        return verifyFallback(c, token, code);
      }

      if (rpcError) {
        console.error('[hono doc-share/verify] rpc error:', rpcError);
        return c.json({ error: 'Verification failed' }, 500);
      }

      if (!updated || updated.length === 0) {
        const { data: invite } = await service
          .from('external_signing_invites')
          .select('id, status, verification_attempts')
          .eq('token', token)
          .eq('purpose', 'doc_share')
          .single();

        if (!invite) return c.json({ error: 'Invite not found' }, 404);
        if (invite.status === 'verified') {
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

      await establishDocShareSession(c, invite.id, invite.expires_at);

      return c.json({ success: true });
    })
    .post('/doc-share/view', async (c) => {
      const { token } = await c.req.json().catch(() => ({ token: '' }));

      if (!token || typeof token !== 'string') {
        return c.json({ error: 'Token required' }, 400);
      }

      const sessionCookie = getCookie(c, 'doc_share_session');
      if (!sessionCookie) {
        return c.json({ error: 'session_expired' }, 401);
      }

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, status, expires_at, session_token, shared_doc_id, view_count')
        .eq('token', token)
        .eq('purpose', 'doc_share')
        .single();

      const invite = data as {
        id: string;
        status: string;
        expires_at: string;
        session_token: string | null;
        shared_doc_id: string;
        view_count: number;
      } | null;

      if (!invite) return c.json({ error: 'Invite not found' }, 404);

      const tokenValid =
        invite.session_token !== null &&
        invite.session_token.length === sessionCookie.length &&
        timingSafeEqual(Buffer.from(invite.session_token), Buffer.from(sessionCookie));

      if (!tokenValid) {
        return c.json({ error: 'session_expired' }, 401);
      }

      if (invite.status !== 'verified') {
        return c.json({ error: 'Invite is no longer available' }, 400);
      }

      if (new Date(invite.expires_at) < new Date()) {
        await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
        return c.json({ error: 'Invite has expired' }, 400);
      }

      const { data: doc } = await service
        .from('docs')
        .select('id, title, content, type, slides, deck_orientation')
        .eq('id', invite.shared_doc_id)
        .single();

      const sharedDoc = doc as {
        id: string;
        title: string;
        content?: string;
        type?: string;
        slides?: unknown;
        deck_orientation?: string;
      } | null;

      if (!sharedDoc) {
        return c.json({ error: 'Document not found' }, 404);
      }

      await service
        .from('external_signing_invites')
        .update({ view_count: (invite.view_count || 0) + 1 })
        .eq('id', invite.id);

      return c.json({
        title: sharedDoc.title,
        content: sharedDoc.content,
        type: sharedDoc.type || 'doc',
        slides: sharedDoc.slides || null,
        deck_orientation: sharedDoc.deck_orientation || 'horizontal',
      });
    });
}

async function verifyFallback(c: Context, token: string, code: string) {
  const service = getServiceClient();
  const { data } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, verification_code, verification_attempts')
    .eq('token', token)
    .eq('purpose', 'doc_share')
    .single();

  const invite = data as VerifyRow | null;

  if (!invite) return c.json({ error: 'Invite not found' }, 404);

  if (invite.status === 'verified') {
    return c.json({ error: 'Invite has already been verified' }, 409);
  }

  if (invite.status !== 'pending') {
    return c.json({ error: 'Invite is no longer available' }, 400);
  }

  if (new Date(invite.expires_at) < new Date()) {
    await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
    return c.json({ error: 'Invite has expired' }, 400);
  }

  if (invite.verification_attempts >= MAX_ATTEMPTS) {
    return c.json({ error: 'Too many attempts. Request a new code.' }, 429);
  }

  await service
    .from('external_signing_invites')
    .update({ verification_attempts: invite.verification_attempts + 1 })
    .eq('id', invite.id);

  const valid = await bcrypt.compare(code, invite.verification_code);
  if (!valid) {
    const remaining = MAX_ATTEMPTS - 1 - invite.verification_attempts;
    return c.json(
      { error: `Invalid code. ${Math.max(remaining, 0)} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      400
    );
  }

  await establishDocShareSession(c, invite.id, invite.expires_at);

  return c.json({ success: true });
}

async function establishDocShareSession(
  c: Context,
  inviteId: string,
  expiresAt: string
) {
  const service = getServiceClient();
  const sessionToken = randomBytes(32).toString('base64url');
  const forwarded = c.req.header('x-forwarded-for');
  const sessionIp = forwarded ? forwarded.split(',').pop()?.trim() || null : null;
  const sessionUserAgent = c.req.header('user-agent') || null;

  await service
    .from('external_signing_invites')
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
      session_token: sessionToken,
      session_ip: sessionIp,
      session_user_agent: sessionUserAgent,
      session_started_at: new Date().toISOString(),
    })
    .eq('id', inviteId);

  setCookie(c, 'doc_share_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    expires: new Date(expiresAt),
    path: '/',
  });
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
