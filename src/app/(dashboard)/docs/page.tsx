/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   heading fades up
 *   80ms   subtitle fades up
 *  160ms   doc list or empty state rises in
 * ───────────────────────────────────────────────────────── */

import { fetchDocs, fetchProfile, fetchTeam } from '@/lib/supabase/data';
import { createClient } from '@/lib/supabase/server';
import { DocList } from '@/components/dashboard/DocList';
import { FileText } from 'lucide-react';
import { FadeRise } from '@/components/motion';

const TIMING = {
  heading:  0,    // page title
  subtitle: 80,   // description line
  list:     160,  // DocList card container
};

/** FadeRise delay in seconds */
const delay = (ms: number) => ms / 1000;

export default async function DocsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [docs, profile, team] = await Promise.all([
    fetchDocs().catch((e) => { throw new Error('Failed to load documents.'); }),
    user ? fetchProfile(user.id).catch(() => null) : null,
    fetchTeam().catch(() => []),
  ]);
  const userDepartment = profile?.department ?? null;
  const isAdmin = profile?.is_admin ?? false;

  return (
    <div className="space-y-6">
      <div>
        <FadeRise delay={delay(TIMING.heading)}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
        </FadeRise>
        <FadeRise delay={delay(TIMING.subtitle)}>
          <p className="text-sm text-muted-foreground mt-1">Team documents, specs, and shared resources.</p>
        </FadeRise>
      </div>

      <FadeRise delay={delay(TIMING.list)} y={12}>
        <DocList
          docs={docs}
          userDepartment={userDepartment}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? ''}
          team={team}
        />
      </FadeRise>
    </div>
  );
}
