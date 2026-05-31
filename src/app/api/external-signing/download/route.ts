import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { isSigningInvite } from '@/lib/invite-filters';
import type { ExternalSigningInvite } from '@/lib/types';

// Rate limiter: cap fresh signed-URL mints per IP per hour. A download is a
// cheap, idempotent read, but each call asks storage for a brand-new signed URL,
// so we still bound it — a token holder shouldn't be able to hammer the storage
// signer (or harvest an unbounded stream of live URLs) from one address.
const RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isDownloadRateLimited(ip: string): boolean {
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

/**
 * Token-gated signed-copy download for a completed signing.
 *
 * Bearer model: the URL token is the same credential the signer used to sign, so
 * anyone holding it is already authorized to see their own document. We mint a
 * fresh, short-lived (30-minute) storage signed URL per request and 302 to it —
 * never a stable/public link, so a leaked redirect target expires quickly.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const clientIp = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
  if (isDownloadRateLimited(clientIp)) {
    return NextResponse.json({ error: 'Too many download attempts. Try again later.' }, { status: 429 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, token, status, template_type, template_id')
    .eq('token', token)
    .single() as { data: ExternalSigningInvite | null };

  // Unknown tokens AND non-signing rows (invoice / doc-share share this table)
  // collapse to one identical 404 — a signing route must never operate on, or
  // confirm the existence of, a sibling product's token.
  if (!isSigningInvite(invite)) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Only a completed signing has a stored PDF behind it. (Distinguishing 409 from
  // 404 here is safe: it's only reachable once you hold a valid signing token,
  // at which point you're already the authorized party.)
  if (invite.status !== 'signed') {
    return NextResponse.json({ error: 'This agreement has not been signed yet' }, { status: 409 });
  }

  // Unlike the sign route's best-effort convenience URL, fetching the document IS
  // the entire purpose of this request — a mint failure is a hard 502, not a
  // silent fallback.
  const pdfPath = `external/${invite.id}/agreement.pdf`;
  const { data: signed, error } = await service.storage
    .from('agreements')
    .createSignedUrl(pdfPath, 1800);

  if (error || !signed?.signedUrl) {
    console.error('[external-signing/download] signed-URL mint failed:', error?.message ?? 'no signed URL returned');
    return NextResponse.json({ error: 'Could not retrieve the document. Please try again.' }, { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
