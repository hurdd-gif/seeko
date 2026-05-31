import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getTemplateById, withGuardianSection } from '@/lib/external-agreement-templates';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import { computeAgreementHash } from '@/lib/agreement-hash';
import { sendAgreementEmail } from '@/lib/email';
import { isSigningInvite } from '@/lib/invite-filters';
import type { ExternalSigningInvite } from '@/lib/types';

// Defensive caps on DB-sourced custom agreement content before it reaches pdf-lib.
// custom_sections originate from parse-pdf (uploaded PDF → Claude → stored, never
// sanitized at insert), so they are attacker-influenced; an unbounded array or a
// multi-megabyte body would let a signer DoS the (expensive) PDF generation.
const MAX_SECTIONS = 30;
const MAX_SECTION_CONTENT_CHARS = 200_000;

// Rate limiter: max 5 sign attempts per IP per hour (PDF generation is expensive)
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isSignRateLimited(ip: string): boolean {
  const now = Date.now();
  if (ipHits.size > 100) {
    for (const [key, entry] of ipHits) { if (now > entry.resetAt) ipHits.delete(key); }
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, full_name, address, minor_name } = body;

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const clientIp = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
  if (isSignRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Too many sign attempts. Try again later.' }, { status: 429 });
  }
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return NextResponse.json({ error: 'Full name required' }, { status: 400 });
  }
  if (full_name.length > 200) {
    return NextResponse.json({ error: 'Full name must be under 200 characters' }, { status: 400 });
  }
  if (!address || typeof address !== 'string' || !address.trim()) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }
  if (address.length > 500) {
    return NextResponse.json({ error: 'Address must be under 500 characters' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, token, status, expires_at, recipient_email, template_type, template_id, custom_sections, custom_title, personal_note, is_guardian_signing')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  // Unknown tokens AND non-signing rows (invoice / doc-share share this table)
  // collapse to one identical 404 — a signing route must never operate on, or
  // confirm the existence of, a sibling product's token.
  if (!isSigningInvite(invite)) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  if (invite.status === 'signed') {
    return NextResponse.json({ error: 'This agreement has already been signed' }, { status: 409 });
  }

  if (invite.status !== 'verified') {
    return NextResponse.json({ error: 'Invite must be verified before signing' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await (service.from('external_signing_invites') as any).update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  if (invite.is_guardian_signing) {
    if (!minor_name || typeof minor_name !== 'string' || !minor_name.trim()) {
      return NextResponse.json({ error: "Minor's full name is required for guardian signing" }, { status: 400 });
    }
    if (minor_name.length > 200) {
      return NextResponse.json({ error: "Minor's full name must be under 200 characters" }, { status: 400 });
    }
  }

  // Capture IP + user agent for the legal audit trail. Persist `null` (not the
  // string 'unknown', and not a spoofable raw header) when the IP is unavailable:
  // a fabricated value would poison the ESIGN/UETA audit record. The certificate
  // renders "Not recorded" for null fields.
  const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
    || request.headers.get('x-real-ip')
    || null;
  const userAgent = request.headers.get('user-agent') || null;

  // Resolve sections
  let sections;
  let title;
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

  // Defensive cap on the (DB-sourced) agreement body before it reaches pdf-lib.
  // Reject — never silently truncate — so a signer is never handed a document
  // missing clauses they're agreeing to.
  if (Array.isArray(sections)) {
    const totalChars = sections.reduce(
      (n, s) => n + (typeof s?.content === 'string' ? s.content.length : 0),
      0,
    );
    if (sections.length > MAX_SECTIONS || totalChars > MAX_SECTION_CONTENT_CHARS) {
      return NextResponse.json({ error: 'This agreement is too large to process.' }, { status: 422 });
    }
  }

  // Integrity hash over the EXACT content being signed (title + final, guardian-
  // injected sections). Printed on the certificate so the stored document is
  // self-verifying — re-hashing the agreement text must reproduce this value.
  const integrityHash = await computeAgreementHash(title, sections);

  // Generate PDF. pdf-lib's StandardFonts are Latin1-only, so a name/address with
  // characters outside that set (CJK, emoji, some control chars) throws — return a
  // clear 422 instead of an unhandled 500, and leave the invite 'verified' so the
  // signer can correct their input and retry (never a half-committed signed state).
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
        minorName: invite.is_guardian_signing ? minor_name.trim() : undefined,
      },
      // Certificate of Completion audit trail. `ip`/`userAgent` may be null
      // (missing headers) → the certificate prints "Not recorded" rather than a
      // fabricated value.
      envelopeId: invite.id,
      integrityHash,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error('[external-signing/sign] PDF generation failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'We could not generate your document. Please check your name and address for unsupported characters.' },
      { status: 422 },
    );
  }

  // Upload to storage
  const pdfPath = `external/${invite.id}/agreement.pdf`;
  const { error: uploadError } = await service.storage
    .from('agreements')
    .upload(pdfPath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    // Do NOT mark the invite signed or email a copy if we couldn't store the
    // PDF — that would leave the DB claiming "signed" with no document behind
    // it (and a later download 404). Keep the invite 'verified' so the signer
    // can retry, and surface a 502 so the client shows a retryable error.
    console.error('PDF upload error:', uploadError);
    return NextResponse.json(
      { error: 'Could not store the signed document. Please try again.' },
      { status: 502 }
    );
  }

  // Update invite record
  await (service
    .from('external_signing_invites') as any)
    .update({
      status: 'signed',
      signer_name: full_name.trim(),
      signer_address: address.trim(),
      minor_name: invite.is_guardian_signing ? minor_name.trim() : null,
      signer_ip: ip,
      signer_user_agent: userAgent,
      signed_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  // Send emails (non-blocking)
  sendAgreementEmail({
    recipientEmail: invite.recipient_email,
    signerName: full_name.trim(),
    pdfBytes,
    title,
    sections,
  }).catch(console.error);

  // Mint a short-lived (30-minute) signed URL so the signer can download their
  // own copy from the success screen. A failure here must NOT fail the signing
  // the signer already completed (and was emailed) — fall back to a null
  // downloadUrl, which the success screen handles by showing the email path only.
  let downloadUrl: string | null = null;
  try {
    const { data: signed } = await service.storage
      .from('agreements')
      .createSignedUrl(pdfPath, 1800);
    downloadUrl = signed?.signedUrl ?? null;
  } catch (err) {
    console.error('[external-signing/sign] signed-URL mint failed:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ success: true, downloadUrl });
}
