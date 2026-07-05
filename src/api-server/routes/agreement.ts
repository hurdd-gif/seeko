import { Hono, type Context } from 'hono';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';
import { sendAgreementEmail } from '@/lib/email';
import { getServiceClient } from '@/lib/supabase/service';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type AgreementProfile = {
  is_admin: boolean;
  is_contractor: boolean;
  nda_accepted_at: string | null;
  department: string | null;
  role: string | null;
  onboarded: number;
};

export type AgreementIndexData =
  | { status: 'ready'; userId: string; userEmail: string; title: string; sections: typeof AGREEMENT_SECTIONS; department: string; role: string; isContractor: boolean; onboarded: number }
  | { status: 'admin_exempt'; redirect: string }
  | { status: 'already_signed'; redirect: string };

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;
type AgreementLoader = (user: AuthenticatedUser) => Promise<AgreementIndexData>;
type AgreementSigner = (
  c: Context,
  user: AuthenticatedUser,
  input: { full_name?: string; address?: string; engagement_type?: string },
) => Promise<{ success: true; redirect: string }>;

type AgreementRoutesOptions = {
  authResolver?: AuthResolver;
  agreementLoader?: AgreementLoader;
  agreementSigner?: AgreementSigner;
};

export function createAgreementRoutes(options: AgreementRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const agreementLoader = options.agreementLoader ?? loadAgreementIndex;
  const agreementSigner = options.agreementSigner ?? signAgreement;

  return new Hono()
    .get('/agreement-index', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'unauthorized' }, 401);

      try {
        return c.json(await agreementLoader(user));
      } catch (error) {
        console.error('[hono agreement-index] load failed:', error);
        return c.json({ error: 'Failed to load agreement.' }, 500);
      }
    })
    .post('/agreement/sign', async (c) => {
      const user = await authResolver(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      let input: { full_name?: string; address?: string; engagement_type?: string };
      try {
        input = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }

      const validationError = validateAgreementInput(input);
      if (validationError) return c.json({ error: validationError }, 400);

      try {
        return c.json(await agreementSigner(c, user, input));
      } catch (error) {
        if (error instanceof AgreementSignError) {
          return c.json({ error: error.message }, error.status);
        }

        console.error('[hono agreement/sign] failed:', error);
        return c.json({ error: 'Failed to record agreement' }, 500);
      }
    });
}

async function loadAgreementIndex(user: AuthenticatedUser): Promise<AgreementIndexData> {
  const profile = await loadAgreementProfile(user.id);

  if (profile.is_admin) return { status: 'admin_exempt', redirect: '/tasks' };
  if (profile.nda_accepted_at) {
    return { status: 'already_signed', redirect: profile.onboarded === 0 ? '/onboarding' : '/tasks' };
  }

  return {
    status: 'ready',
    userId: user.id,
    userEmail: user.email ?? '',
    title: AGREEMENT_TITLE,
    sections: AGREEMENT_SECTIONS,
    department: profile.department ?? '',
    role: profile.role ?? '',
    isContractor: profile.is_contractor,
    onboarded: profile.onboarded,
  };
}

async function signAgreement(
  c: Context,
  user: AuthenticatedUser,
  input: { full_name?: string; address?: string; engagement_type?: string },
) {
  const profile = await loadAgreementProfile(user.id);

  if (profile.is_admin) throw new AgreementSignError('Admins are exempt from NDA', 400);
  if (profile.nda_accepted_at) throw new AgreementSignError('Already signed', 400);

  const fullName = input.full_name!.trim();
  const address = input.address!.trim();
  const engagementType = input.engagement_type as 'team_member' | 'contractor';
  // Audit columns: store null (not a sentinel string) when a header is absent,
  // so the legal record never contains fabricated values.
  const ip = c.req.header('x-forwarded-for')?.split(',').pop()?.trim()
    || c.req.header('x-real-ip')
    || null;
  const userAgent = c.req.header('user-agent') || null;
  const now = new Date();
  const service = getServiceClient();

  // Generate the PDF BEFORE recording the signature: a generation failure must
  // not leave the profile signed-but-unrecorded (retry would hit "Already signed").
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateAgreementPdf({
      title: AGREEMENT_TITLE,
      sections: AGREEMENT_SECTIONS,
      signer: {
        fullName,
        address,
        email: user.email ?? '',
        signedAt: now,
        department: profile.department ?? '',
        role: profile.role ?? '',
        engagementType,
      },
    });
  } catch (error) {
    console.error(
      '[hono agreement/sign] PDF generation failed:',
      error instanceof Error ? error.message : error,
    );
    throw new AgreementSignError(
      'We could not generate your NDA PDF. Please check your name and address for unsupported characters.',
      400,
    );
  }

  const { error: updateError } = await service
    .from('profiles')
    .update({
      nda_accepted_at: now.toISOString(),
      nda_signer_name: fullName,
      nda_signer_address: address,
      nda_ip: ip,
      nda_user_agent: userAgent,
    } as never)
    .eq('id', user.id);

  if (updateError) throw updateError;

  const storagePath = `${user.id}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await service.storage
    .from('agreements')
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[hono agreement/sign] failed to upload PDF:', uploadError.message);
  }

  try {
    await sendAgreementEmail({
      recipientEmail: user.email ?? '',
      signerName: fullName,
      pdfBytes,
      title: AGREEMENT_TITLE,
      sections: AGREEMENT_SECTIONS,
    });
  } catch (error) {
    console.error('[hono agreement/sign] failed to send email:', error);
  }

  return { success: true as const, redirect: profile.onboarded === 0 ? '/onboarding' : '/tasks' };
}

async function loadAgreementProfile(userId: string) {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select('is_admin, is_contractor, nda_accepted_at, department, role, onboarded')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as AgreementProfile;
}

function validateAgreementInput(input: { full_name?: string; address?: string; engagement_type?: string }) {
  if (!input.full_name || typeof input.full_name !== 'string' || input.full_name.trim().length === 0) {
    return 'full_name is required';
  }
  if (!input.address || typeof input.address !== 'string' || input.address.trim().length === 0) {
    return 'address is required';
  }
  if (!input.engagement_type || !['team_member', 'contractor'].includes(input.engagement_type)) {
    return 'engagement_type must be team_member or contractor';
  }
  return null;
}

class AgreementSignError extends Error {
  constructor(message: string, public readonly status: 400 | 409) {
    super(message);
    this.name = 'AgreementSignError';
  }
}
