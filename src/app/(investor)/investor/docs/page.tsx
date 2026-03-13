/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Documents
 *
 *    0ms   heading fades up
 *   80ms   subtitle fades up
 *  160ms   doc list rises in
 * ───────────────────────────────────────────────────────── */

import { fetchDocs, fetchProfile, fetchTeam } from '@/lib/supabase/data';
import { createClient } from '@/lib/supabase/server';
import { DocList } from '@/components/dashboard/DocList';
import { FadeRise } from '@/components/motion';

const TIMING = {
  heading:  0,
  subtitle: 80,
  list:     160,
};

const delay = (ms: number) => ms / 1000;

export default async function InvestorDocsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [docs, profile, team] = await Promise.all([
    fetchDocs().catch(() => []),
    user ? fetchProfile(user.id).catch(() => null) : null,
    fetchTeam().catch(() => []),
  ]);
  const userDepartment = profile?.department ?? null;
  const isAdmin = profile?.is_admin ?? false;

  return (
    <div className="space-y-6">
      <div>
        <FadeRise delay={delay(TIMING.heading)}>
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">Documents</h1>
        </FadeRise>
        <FadeRise delay={delay(TIMING.subtitle)}>
          <p className="text-sm text-muted-foreground mt-1">Documents, decks, and shared resources.</p>
        </FadeRise>
      </div>

      <FadeRise delay={delay(TIMING.list)} y={12}>
        <DocList
          docs={docs}
          userDepartment={userDepartment}
          isAdmin={isAdmin}
          isInvestor
          currentUserId={user?.id ?? ''}
          team={team}
        />
      </FadeRise>
    </div>
  );
}
