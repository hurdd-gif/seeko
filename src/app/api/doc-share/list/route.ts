import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  interface InviteRow {
    id: string;
    recipient_email: string;
    status: string;
    shared_doc_id: string;
    view_count: number;
    expires_at: string;
    created_at: string;
  }

  const service = getServiceClient();
  const { data, error } = await (service
    .from('external_signing_invites') as any)
    .select('id, recipient_email, status, shared_doc_id, view_count, expires_at, created_at')
    .eq('purpose', 'doc_share')
    .order('created_at', { ascending: false }) as { data: InviteRow[] | null; error: any };

  if (error) {
    console.error('[doc-share/list] query failed:', error);
    return NextResponse.json({ error: 'Failed to fetch doc share invites' }, { status: 500 });
  }

  const invites = data ?? [];

  // Batch-fetch doc titles by unique doc IDs
  const uniqueDocIds = [...new Set(invites.map((inv) => inv.shared_doc_id).filter(Boolean))];
  let docMap: Record<string, { title: string; type: string }> = {};

  if (uniqueDocIds.length > 0) {
    const { data: docs } = await service
      .from('docs')
      .select('id, title, type')
      .in('id', uniqueDocIds);

    if (docs) {
      docMap = Object.fromEntries(
        docs.map((d: { id: string; title: string; type: string }) => [d.id, { title: d.title, type: d.type || 'doc' }])
      );
    }
  }

  const enriched = invites.map((inv) => ({
    ...inv,
    doc_title: docMap[inv.shared_doc_id]?.title ?? null,
    doc_type: docMap[inv.shared_doc_id]?.type ?? null,
  }));

  return NextResponse.json(enriched);
}
