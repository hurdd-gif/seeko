import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { computeAgreementHash } from '@/lib/agreement-hash';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import {
  getTemplateById,
  withGuardianSection,
} from '@/lib/external-agreement-templates';
import {
  createDocusignEnvelope,
  downloadDocusignCompletedPdf,
  getDocusignEnvelopeStatus,
  getSigningProvider,
  normalizeDocusignEnvelopeStatus,
  parseDocusignConnectPayload,
  resendDocusignEnvelope,
  resolveDocusignTransition,
  verifyDocusignConnectHmac,
  voidDocusignEnvelope,
} from '@/lib/docusign';
import {
  loadExternalSigningInvite,
  type ExternalSigningLoadResult,
} from '@/lib/external-signing';
import { sendAgreementEmail, sendExternalInviteEmail, sendVerificationCodeEmail } from '@/lib/email';
import { isSigningInvite } from '@/lib/invite-filters';
import { getServiceClient } from '@/lib/supabase/service';
import type { ExternalAgreementSection, ExternalSigningInvite } from '@/lib/types';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';
import type { Context } from 'hono';

type ExternalSigningLoader = (token: string) => Promise<ExternalSigningLoadResult>;
type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;
type ServiceClient = ReturnType<typeof getServiceClient>;

type ExternalSigningRoutesOptions = {
  authResolver?: AuthResolver;
  externalSigningLoader?: ExternalSigningLoader;
};

const CODE_RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
const SIGN_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const DOWNLOAD_RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };
const MAX_ATTEMPTS = 5;
const MAX_SECTIONS = 30;
const MAX_SECTION_CONTENT_CHARS = 200_000;

const tokenHits = new Map<string, { count: number; resetAt: number }>();
const ipHits = new Map<string, { count: number; resetAt: number }>();
const downloadIpHits = new Map<string, { count: number; resetAt: number }>();

interface VerifyRow {
  id: string;
  status: string;
  expires_at: string;
  verification_code: string;
  verification_attempts: number;
  template_type: ExternalSigningInvite['template_type'];
  template_id: string | null;
  custom_sections: ExternalAgreementSection[] | null;
  custom_title: string | null;
  personal_note: string | null;
}

type InviteBodyValidation =
  | { ok: false; error: string }
  | {
      ok: true;
      value: {
        recipient_email: string;
        template_type: 'preset' | 'custom';
        template_id: string | null;
        custom_sections: ExternalAgreementSection[] | null;
        custom_title: string | null;
        personal_note: string | null;
        expiresDate: Date;
        is_guardian_signing: boolean;
      };
    };

export function createExternalSigningRoutes(options: ExternalSigningRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const externalSigningLoader = options.externalSigningLoader ?? loadExternalSigningInvite;

  return new Hono()
    .post('/external-signing/invite', async (c) => {
      const admin = await requireAdmin(c, authResolver);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const body = await c.req.json().catch(() => null);
      const validation = validateInviteBody(body);
      if (!validation.ok) return c.json({ error: validation.error }, 400);

      const {
        recipient_email,
        template_type,
        template_id,
        custom_sections,
        custom_title,
        personal_note,
        expiresDate,
        is_guardian_signing,
      } = validation.value;

      const token = randomBytes(32).toString('base64url');
      const verificationCode = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(verificationCode, 10);
      const { title: templateName, sections } = resolveInviteAgreement({
        template_type,
        template_id,
        custom_sections,
        custom_title,
      });
      const signingProvider = getSigningProvider();

      const service = getServiceClient();
      const { data: inserted, error: insertError } = await service
        .from('external_signing_invites')
        .insert({
          token,
          recipient_email,
          template_type,
          template_id: template_type === 'preset' ? template_id : null,
          custom_sections: template_type === 'custom' ? custom_sections : null,
          custom_title: template_type === 'custom' ? custom_title : null,
          personal_note: personal_note || null,
          is_guardian_signing,
          expires_at: expiresDate.toISOString(),
          verification_code: hashedCode,
          status: 'pending',
          created_by: admin.user.id,
          signing_provider: signingProvider,
        } as never)
        .select('id')
        .single();

      const inviteId = (inserted as { id?: string } | null)?.id;
      if (insertError || !inviteId) {
        console.error('[hono external-signing/invite] create failed:', insertError);
        return c.json({ error: 'Failed to create invite' }, 500);
      }

      if (signingProvider === 'docusign') {
        try {
          const envelope = await createDocusignEnvelope({
            inviteId,
            recipientEmail: recipient_email,
            title: templateName,
            sections,
            personalNote: personal_note || null,
            isGuardianSigning: is_guardian_signing,
          });

          await service
            .from('external_signing_invites')
            .update({
              signing_provider: 'docusign',
              docusign_envelope_id: envelope.envelopeId,
              docusign_status: envelope.status,
            } as never)
            .eq('id', inviteId);
        } catch (error) {
          console.error('[hono external-signing/invite] DocuSign envelope failed:', error);
          await service
            .from('external_signing_invites')
            .update({ status: 'revoked', docusign_status: 'create_failed' } as never)
            .eq('id', inviteId);
          return c.json({ error: 'Failed to create DocuSign envelope' }, 502);
        }
      } else {
        await sendExternalInviteEmail({
          recipientEmail: recipient_email,
          token,
          personalNote: personal_note ?? undefined,
          templateName,
          expiresAt: expiresDate,
        });
      }

      return c.json({ success: true });
    })
    .post('/external-signing/parse-pdf', async (c) => {
      const admin = await requireAdmin(c, authResolver);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const formData = await c.req.formData();
      const file = formData.get('file');
      if (!(file instanceof File) || file.type !== 'application/pdf') {
        return c.json({ error: 'PDF file required' }, 400);
      }

      const maxPdfSize = 10 * 1024 * 1024;
      if (file.size > maxPdfSize) {
        return c.json({ error: 'PDF must be under 10 MB' }, 413);
      }

      const { PDFParse } = await import('pdf-parse');
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfParser = new PDFParse({ data: buffer });
      const parsed = await pdfParser.getText();
      const rawText = parsed.text;

      if (!rawText.trim()) {
        return c.json({ error: 'Could not extract text from PDF' }, 422);
      }

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `Parse the following legal document text into numbered sections. Extract each section's title and body content. Format the body as HTML with <p> for paragraphs and <ul>/<li> for lists.

Return ONLY a JSON array with this exact format, no markdown code fences:
[{"number": 1, "title": "Section Title", "content": "<p>HTML content...</p>"}]

If the document has no clear sections, create logical sections based on content breaks.

Document text:
${rawText}`,
          },
        ],
      });

      const textContent = response.content.find((part) => part.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        return c.json({ error: 'Failed to parse document' }, 500);
      }

      try {
        const sections = JSON.parse(textContent.text) as ExternalAgreementSection[];
        return c.json({ sections, title: file.name.replace(/\.pdf$/i, '') });
      } catch {
        return c.json({ error: 'Failed to parse AI response' }, 500);
      }
    })
    .get('/external-signing/download', async (c) => {
      const token = c.req.query('token');
      if (!token) return c.json({ error: 'Token required' }, 400);

      const clientIp = getClientIp(c.req.raw);
      if (isRateLimited(downloadIpHits, clientIp, DOWNLOAD_RATE_LIMIT)) {
        return c.json({ error: 'Too many download attempts. Try again later.' }, 429);
      }

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, token, status, template_type, template_id')
        .eq('token', token)
        .single();

      const invite = data as ExternalSigningInvite | null;
      if (!isSigningInvite(invite)) return c.json({ error: 'Document not found' }, 404);
      if (invite.status !== 'signed') {
        return c.json({ error: 'This agreement has not been signed yet' }, 409);
      }

      const pdfPath = `external/${invite.id}/agreement.pdf`;
      const { data: signed, error } = await service.storage
        .from('agreements')
        .createSignedUrl(pdfPath, 1800);

      if (error || !signed?.signedUrl) {
        console.error('[hono external-signing/download] signed-URL mint failed:', error?.message ?? 'no signed URL returned');
        return c.json({ error: 'Could not retrieve the document. Please try again.' }, 502);
      }

      return c.redirect(signed.signedUrl, 302);
    })
    .post('/external-signing/sync', async (c) => {
      const admin = await requireAdmin(c, authResolver);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const { invite_id } = await c.req.json().catch(() => ({ invite_id: '' }));
      if (!invite_id) return c.json({ error: 'invite_id required' }, 400);

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, status, expires_at, template_type, signing_provider, docusign_envelope_id')
        .eq('id', invite_id)
        .single();

      const invite = data as ({
        id: string;
        status: ExternalSigningInvite['status'];
        expires_at: string;
        template_type: ExternalSigningInvite['template_type'];
        signing_provider?: string | null;
        docusign_envelope_id?: string | null;
      }) | null;

      if (!isSigningInvite(invite)) return c.json({ error: 'Invite not found' }, 404);
      if (invite.signing_provider !== 'docusign' || !invite.docusign_envelope_id) {
        return c.json({ error: 'Invite is not DocuSign-backed' }, 400);
      }

      const envelope = await getDocusignEnvelopeStatus(invite.docusign_envelope_id);
      const status = await persistDocusignEnvelopeStatus({
        service,
        inviteId: invite.id,
        envelopeId: invite.docusign_envelope_id,
        currentStatus: invite.status,
        expiresAt: invite.expires_at,
        docusignStatus: envelope.status,
        completedAt: envelope.completedAt,
        logPrefix: '[hono external-signing/sync]',
      });

      if (!status.ok) return c.json({ error: status.error }, 502);

      return c.json({ success: true, status: status.localStatus, docusignStatus: envelope.status });
    })
    .post('/external-signing/reissue', async (c) => {
      const { token } = await c.req.json().catch(() => ({ token: '' }));
      if (!token || typeof token !== 'string') return c.json({ error: 'Token required' }, 400);

      return c.json({ error: 'Public link reissue is disabled. Contact the sender for a new link.' }, 403);
    })
    .post('/external-signing/docusign-connect', async (c) => {
      const body = await c.req.text();
      const signature = c.req.header('x-docusign-signature-1');

      if (!verifyDocusignConnectHmac(body, signature, process.env.DOCUSIGN_CONNECT_HMAC_SECRET)) {
        return c.json({ error: 'Invalid DocuSign signature' }, 401);
      }

      let event;
      try {
        event = parseDocusignConnectPayload(body);
      } catch (error) {
        console.error('[hono docusign-connect] invalid payload:', error instanceof Error ? error.message : error);
        return c.json({ error: 'Invalid payload' }, 400);
      }

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, status, expires_at, template_type, signing_provider')
        .eq('docusign_envelope_id', event.envelopeId)
        .single();

      const invite = data as {
        id: string;
        status: ExternalSigningInvite['status'];
        expires_at: string;
        template_type: ExternalSigningInvite['template_type'];
        signing_provider?: string | null;
      } | null;
      if (!isSigningInvite(invite) || invite.signing_provider !== 'docusign') {
        return c.json({ error: 'Invite not found' }, 404);
      }

      const status = await persistDocusignEnvelopeStatus({
        service,
        inviteId: invite.id,
        envelopeId: event.envelopeId,
        currentStatus: invite.status,
        expiresAt: invite.expires_at,
        docusignStatus: event.status,
        completedAt: event.completedAt,
        logPrefix: '[hono docusign-connect]',
      });

      if (!status.ok) return c.json({ error: status.error }, 502);
      if (status.ignored) {
        return c.json({ success: true, ignored: true, reason: status.reason });
      }

      return c.json({ success: true });
    })
    .get('/external-signing/:token', async (c) => {
      const result = await externalSigningLoader(c.req.param('token'));

      if (!result.found) {
        return c.json({ error: 'Invite not found' }, 404);
      }

      return c.json(result.initialData);
    })
    .post('/external-signing/resend', async (c) => {
      const admin = await requireAdmin(c, authResolver);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const { invite_id } = await c.req.json().catch(() => ({ invite_id: '' }));
      if (!invite_id) return c.json({ error: 'invite_id required' }, 400);

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, token, status, expires_at, recipient_email, template_type, template_id, custom_title, personal_note, signing_provider, docusign_envelope_id')
        .eq('id', invite_id)
        .single();

      const invite = data as (ExternalSigningInvite & {
        signing_provider?: string | null;
        docusign_envelope_id?: string | null;
      }) | null;

      if (!isSigningInvite(invite)) return c.json({ error: 'Invite not found' }, 404);
      if (invite.status === 'signed') return c.json({ error: 'Already signed' }, 400);
      if (invite.status === 'revoked') return c.json({ error: 'Invite is revoked' }, 400);
      if (new Date(invite.expires_at) < new Date()) return c.json({ error: 'Invite has expired - create a new one' }, 400);

      if (invite.signing_provider === 'docusign' && invite.docusign_envelope_id) {
        try {
          await resendDocusignEnvelope(invite.docusign_envelope_id);
        } catch (error) {
          console.error('[hono external-signing/resend] DocuSign resend failed:', error);
          return c.json({ error: 'Failed to resend DocuSign envelope' }, 502);
        }

        await service
          .from('external_signing_invites')
          .update({ docusign_last_event_at: new Date().toISOString() } as never)
          .eq('id', invite_id);

        return c.json({ success: true });
      }

      const code = String(randomInt(100000, 1000000));
      const hashedCode = await bcrypt.hash(code, 10);

      await service
        .from('external_signing_invites')
        .update({
          verification_code: hashedCode,
          verification_attempts: 0,
          status: 'pending',
          verified_at: null,
        } as never)
        .eq('id', invite_id);

      let templateName = invite.custom_title || 'Document';
      if (invite.template_type === 'preset' && invite.template_id) {
        const template = getTemplateById(invite.template_id);
        templateName = template?.name || 'Document';
      }

      await sendExternalInviteEmail({
        recipientEmail: invite.recipient_email,
        token: invite.token,
        personalNote: invite.personal_note,
        templateName,
        expiresAt: new Date(invite.expires_at),
      });

      return c.json({ success: true });
    })
    .post('/external-signing/revoke', async (c) => {
      const admin = await requireAdmin(c, authResolver);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);

      const { invite_id } = await c.req.json().catch(() => ({ invite_id: '' }));
      if (!invite_id) return c.json({ error: 'invite_id required' }, 400);

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, status, template_type, signing_provider, docusign_envelope_id')
        .eq('id', invite_id)
        .single();

      const invite = data as ({
        id: string;
        status: string;
        template_type: ExternalSigningInvite['template_type'];
        signing_provider?: string | null;
        docusign_envelope_id?: string | null;
      }) | null;

      if (!isSigningInvite(invite)) return c.json({ error: 'Invite not found' }, 404);
      if (invite.status === 'signed') return c.json({ error: 'Cannot revoke a signed invite' }, 400);

      if (invite.signing_provider === 'docusign' && invite.docusign_envelope_id) {
        try {
          await voidDocusignEnvelope(invite.docusign_envelope_id, 'Revoked from SEEKO Studio');
        } catch (error) {
          console.error('[hono external-signing/revoke] DocuSign void failed:', error);
          return c.json({ error: 'Failed to void DocuSign envelope' }, 502);
        }
      }

      await service
        .from('external_signing_invites')
        .update({
          status: 'revoked',
          ...(invite.signing_provider === 'docusign'
            ? { docusign_status: 'voided', docusign_last_event_at: new Date().toISOString() }
            : {}),
        } as never)
        .eq('id', invite_id);

      return c.json({ success: true });
    })
    .post('/external-signing/send-code', async (c) => {
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
        .select('id, recipient_email, status, expires_at, template_type')
        .eq('token', token)
        .single();

      const invite = data as ExternalSigningInvite | null;

      if (!isSigningInvite(invite)) return c.json({ error: 'Invite not found' }, 404);

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
    .post('/external-signing/verify', async (c) => {
      const { token, code } = await c.req.json().catch(() => ({ token: '', code: '' }));

      if (!token || !code) {
        return c.json({ error: 'Token and code required' }, 400);
      }

      const service = getServiceClient();
      const { data: updated, error: rpcError } = await service.rpc('increment_verification_attempt', {
        p_token: token,
        p_purpose: 'signing',
        p_max_attempts: MAX_ATTEMPTS,
      }) as { data: VerifyRow[] | null; error: { code?: string; message?: string } | null };

      if (rpcError?.code === '42883') {
        return verifyFallback(token, code);
      }

      if (rpcError) {
        console.error('[hono external-signing/verify] rpc error:', rpcError);
        return c.json({ error: 'Verification failed' }, 500);
      }

      if (!updated || updated.length === 0) {
        const { data: invite } = await service
          .from('external_signing_invites')
          .select('id, status, verification_attempts, template_type')
          .eq('token', token)
          .single() as { data: Pick<ExternalSigningInvite, 'id' | 'status' | 'verification_attempts' | 'template_type'> | null };

        if (!isSigningInvite(invite)) return c.json({ error: 'Invite not found' }, 404);
        if (invite.status === 'verified' || invite.status === 'signed') {
          return c.json({ error: 'Invite has already been verified' }, 409);
        }
        if (invite.verification_attempts >= MAX_ATTEMPTS) {
          return c.json({ error: 'Too many attempts. Request a new code.' }, 429);
        }
        return c.json({ error: 'Invite is no longer available' }, 400);
      }

      const invite = updated[0]!;

      if (!isSigningInvite(invite)) {
        return c.json({ error: 'Invite not found' }, 404);
      }

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

      await service
        .from('external_signing_invites')
        .update({ status: 'verified', verified_at: new Date().toISOString() })
        .eq('id', invite.id);

      return c.json(getVerifiedAgreementPayload(invite));
    })
    .post('/external-signing/sign', async (c) => {
      const body = await c.req.json().catch(() => null) as {
        token?: unknown;
        full_name?: unknown;
        address?: unknown;
        minor_name?: unknown;
      } | null;

      if (!body) return c.json({ error: 'Invalid JSON' }, 400);

      const { token, full_name, address, minor_name } = body;

      if (!token || typeof token !== 'string') return c.json({ error: 'Token required' }, 400);

      const clientIp = getClientIp(c.req.raw);
      if (isRateLimited(ipHits, clientIp, SIGN_RATE_LIMIT)) {
        return c.json({ error: 'Too many sign attempts. Try again later.' }, 429);
      }
      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return c.json({ error: 'Full name required' }, 400);
      }
      if (full_name.length > 200) {
        return c.json({ error: 'Full name must be under 200 characters' }, 400);
      }
      if (!address || typeof address !== 'string' || !address.trim()) {
        return c.json({ error: 'Address required' }, 400);
      }
      if (address.length > 500) {
        return c.json({ error: 'Address must be under 500 characters' }, 400);
      }

      const service = getServiceClient();
      const { data } = await service
        .from('external_signing_invites')
        .select('id, token, status, expires_at, recipient_email, template_type, template_id, custom_sections, custom_title, personal_note, is_guardian_signing')
        .eq('token', token)
        .single();

      const invite = data as ExternalSigningInvite | null;

      if (!isSigningInvite(invite)) {
        return c.json({ error: 'Invite not found' }, 404);
      }

      if (invite.status === 'signed') {
        return c.json({ error: 'This agreement has already been signed' }, 409);
      }

      if (invite.status !== 'verified') {
        return c.json({ error: 'Invite must be verified before signing' }, 400);
      }

      if (new Date(invite.expires_at) < new Date()) {
        await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
        return c.json({ error: 'Invite has expired' }, 400);
      }

      if (invite.is_guardian_signing) {
        if (!minor_name || typeof minor_name !== 'string' || !minor_name.trim()) {
          return c.json({ error: "Minor's full name is required for guardian signing" }, 400);
        }
        if (minor_name.length > 200) {
          return c.json({ error: "Minor's full name must be under 200 characters" }, 400);
        }
      }

      const ip = getClientIp(c.req.raw) === 'unknown' ? c.req.header('x-real-ip') || null : getClientIp(c.req.raw);
      const userAgent = c.req.header('user-agent') || null;
      const { title, sections } = resolveAgreement(invite);

      if (Array.isArray(sections)) {
        const totalChars = sections.reduce(
          (n, section) => n + (typeof section?.content === 'string' ? section.content.length : 0),
          0
        );
        if (sections.length > MAX_SECTIONS || totalChars > MAX_SECTION_CONTENT_CHARS) {
          return c.json({ error: 'This agreement is too large to process.' }, 422);
        }
      }

      const integrityHash = await computeAgreementHash(title, sections);

      let pdfBytes: Uint8Array;
      try {
        pdfBytes = await generateAgreementPdf({
          title,
          sections,
          signer: {
            fullName: full_name.trim(),
            address: address.trim(),
            email: invite.recipient_email,
            signedAt: new Date(),
            minorName: invite.is_guardian_signing ? String(minor_name).trim() : undefined,
          },
          envelopeId: invite.id,
          integrityHash,
          ip,
          userAgent,
        });
      } catch (err) {
        console.error('[hono external-signing/sign] PDF generation failed:', err instanceof Error ? err.message : err);
        return c.json(
          { error: 'We could not generate your document. Please check your name and address for unsupported characters.' },
          422
        );
      }

      const pdfPath = `external/${invite.id}/agreement.pdf`;
      const { error: uploadError } = await service.storage
        .from('agreements')
        .upload(pdfPath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.error('[hono external-signing/sign] PDF upload error:', uploadError);
        return c.json({ error: 'Could not store the signed document. Please try again.' }, 502);
      }

      await service
        .from('external_signing_invites')
        .update({
          status: 'signed',
          signer_name: full_name.trim(),
          signer_address: address.trim(),
          minor_name: invite.is_guardian_signing ? String(minor_name).trim() : null,
          signer_ip: ip,
          signer_user_agent: userAgent,
          signed_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      sendAgreementEmail({
        recipientEmail: invite.recipient_email,
        signerName: full_name.trim(),
        pdfBytes,
        title,
        sections,
      }).catch(console.error);

      let downloadUrl: string | null = null;
      try {
        const { data: signed } = await service.storage
          .from('agreements')
          .createSignedUrl(pdfPath, 1800);
        downloadUrl = signed?.signedUrl ?? null;
      } catch (err) {
        console.error('[hono external-signing/sign] signed-URL mint failed:', err instanceof Error ? err.message : err);
      }

      return c.json({ success: true, downloadUrl });
    });
}

async function verifyFallback(token: string, code: string) {
  const service = getServiceClient();
  const { data } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, verification_code, verification_attempts, template_type, template_id, custom_sections, custom_title, personal_note')
    .eq('token', token)
    .single();

  const invite = data as (ExternalSigningInvite & { verification_code: string }) | null;

  if (!isSigningInvite(invite)) return Response.json({ error: 'Invite not found' }, { status: 404 });

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

  await service
    .from('external_signing_invites')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', invite.id);

  return Response.json(getVerifiedAgreementPayload(invite));
}

function getVerifiedAgreementPayload(invite: VerifyRow | (ExternalSigningInvite & { verification_code: string })) {
  const { title, sections } = resolveAgreement(invite);

  return {
    status: 'verified',
    sections,
    title,
    personalNote: invite.personal_note,
  };
}

function resolveAgreement(invite: {
  template_type: ExternalSigningInvite['template_type'];
  template_id?: string | null;
  custom_sections?: ExternalAgreementSection[] | null;
  custom_title?: string | null;
  is_guardian_signing?: boolean | null;
}) {
  let sections: ExternalAgreementSection[];
  let title: string;

  if (invite.template_type === 'preset') {
    const template = getTemplateById(invite.template_id!);
    sections = template!.sections;
    title = template!.name;
  } else {
    sections = invite.custom_sections || [];
    title = invite.custom_title || 'Agreement';
  }

  if (invite.is_guardian_signing) {
    sections = withGuardianSection(sections);
  }

  return { title, sections };
}

function resolveInviteAgreement(invite: {
  template_type: 'preset' | 'custom';
  template_id?: string | null;
  custom_sections?: ExternalAgreementSection[] | null;
  custom_title?: string | null;
}) {
  if (invite.template_type === 'preset') {
    const template = getTemplateById(invite.template_id!);
    return {
      title: template!.name,
      sections: template!.sections,
    };
  }

  return {
    title: invite.custom_title || 'Document',
    sections: invite.custom_sections || [],
  };
}

function validateInviteBody(body: unknown): InviteBodyValidation {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid JSON' };

  const value = body as Record<string, unknown>;
  const recipientEmail = typeof value.recipient_email === 'string' ? value.recipient_email.trim() : '';
  const templateType = value.template_type;
  const templateId = typeof value.template_id === 'string' ? value.template_id : null;
  const customSections = value.custom_sections;
  const customTitle = typeof value.custom_title === 'string' ? value.custom_title.trim() : null;
  const personalNote = typeof value.personal_note === 'string' ? value.personal_note : null;
  const expiresAt = value.expires_at;

  if (!recipientEmail || recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, error: 'Valid email required' };
  }

  if (personalNote && personalNote.length > 1000) {
    return { ok: false, error: 'Personal note must be under 1000 characters' };
  }

  if (customTitle && customTitle.length > 200) {
    return { ok: false, error: 'Title must be under 200 characters' };
  }

  if (templateType !== 'preset' && templateType !== 'custom') {
    return { ok: false, error: 'template_type must be "preset" or "custom"' };
  }

  if (templateType === 'preset' && (!templateId || !getTemplateById(templateId))) {
    return { ok: false, error: 'Invalid template_id' };
  }

  let sections: ExternalAgreementSection[] | null = null;
  if (templateType === 'custom') {
    if (!Array.isArray(customSections) || customSections.length === 0) {
      return { ok: false, error: 'custom_sections required for custom template' };
    }
    if (customSections.length > 20) {
      return { ok: false, error: 'Maximum 20 sections allowed' };
    }

    sections = [];
    for (const section of customSections) {
      if (!section || typeof section !== 'object') {
        return { ok: false, error: 'Each section must be an object' };
      }

      const candidate = section as Record<string, unknown>;
      const title = typeof candidate.title === 'string' ? candidate.title : '';
      const content = typeof candidate.content === 'string' ? candidate.content : '';
      const number = typeof candidate.number === 'number' ? candidate.number : sections.length + 1;

      if (title.length > 200) return { ok: false, error: 'Section title must be under 200 characters' };
      if (content.length > 10000) return { ok: false, error: 'Section content must be under 10000 characters' };

      sections.push({ number, title, content });
    }
  }

  if (!expiresAt || typeof expiresAt !== 'string') return { ok: false, error: 'expires_at required' };

  const expiresDate = new Date(expiresAt);
  if (Number.isNaN(expiresDate.getTime())) return { ok: false, error: 'expires_at required' };
  if (expiresDate.getHours() === 0 && expiresDate.getMinutes() === 0) {
    expiresDate.setHours(23, 59, 59, 999);
  }
  if (expiresDate <= new Date()) return { ok: false, error: 'expires_at must be in the future' };

  return {
    ok: true,
    value: {
      recipient_email: recipientEmail,
      template_type: templateType,
      template_id: templateId,
      custom_sections: sections,
      custom_title: customTitle,
      personal_note: personalNote,
      expiresDate,
      is_guardian_signing: value.is_guardian_signing === true,
    },
  };
}

async function persistDocusignEnvelopeStatus({
  service,
  inviteId,
  envelopeId,
  currentStatus,
  expiresAt,
  docusignStatus,
  completedAt,
  logPrefix,
}: {
  service: ServiceClient;
  inviteId: string;
  envelopeId: string;
  currentStatus: ExternalSigningInvite['status'];
  expiresAt: string;
  docusignStatus: string;
  completedAt?: string;
  logPrefix: string;
}): Promise<
  | { ok: true; localStatus: ExternalSigningInvite['status']; ignored?: boolean; reason?: string }
  | { ok: false; error: string }
> {
  const now = new Date().toISOString();
  const transition = resolveDocusignTransition({
    currentStatus,
    expiresAt,
    docusignStatus,
    now: new Date(now),
  });

  if (transition.action === 'sign') {
    const pdfBytes = await downloadDocusignCompletedPdf(envelopeId);
    const { error: uploadError } = await service.storage
      .from('agreements')
      .upload(`external/${inviteId}/agreement.pdf`, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error(`${logPrefix} completed PDF upload failed:`, uploadError);
      return { ok: false, error: 'Could not store completed document' };
    }
  }

  if (transition.action === 'expire' && normalizeDocusignEnvelopeStatus(docusignStatus) === 'pending') {
    try {
      await voidDocusignEnvelope(envelopeId, 'Expired in SEEKO Studio');
    } catch (error) {
      console.error(`${logPrefix} DocuSign void on expiry failed:`, error);
      return { ok: false, error: 'Failed to void expired DocuSign envelope' };
    }
  }

  if (transition.action === 'ignore') {
    await service
      .from('external_signing_invites')
      .update({
        docusign_status: docusignStatus,
        docusign_last_event_at: now,
      } as never)
      .eq('id', inviteId);

    return { ok: true, localStatus: currentStatus, ignored: true, reason: transition.reason };
  }

  const localStatus =
    transition.action === 'sign' ? 'signed' :
    transition.action === 'revoke' ? 'revoked' :
    transition.action === 'expire' ? 'expired' :
    currentStatus;

  await service
    .from('external_signing_invites')
    .update({
      status: localStatus,
      docusign_status: docusignStatus,
      docusign_completed_at: localStatus === 'signed' ? completedAt || now : null,
      docusign_last_event_at: now,
      signed_at: localStatus === 'signed' ? completedAt || now : null,
    } as never)
    .eq('id', inviteId);

  return { ok: true, localStatus };
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : 'unknown';
}

async function requireAdmin(c: Context, authResolver: AuthResolver) {
  const user = await authResolver(c);
  if (!user) return { ok: false as const, status: 401 as const, error: 'Unauthorized' };

  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  if (!(data as { is_admin?: boolean } | null)?.is_admin) {
    return { ok: false as const, status: 403 as const, error: 'Forbidden' };
  }

  return { ok: true as const, user };
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
