import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile } from '@/lib/supabase/data';
import { InvestorSidebar } from '@/components/layout/InvestorSidebar';

export default async function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (!profile?.is_investor && !profile?.is_admin) redirect('/');

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background md:min-h-screen md:h-auto md:overflow-visible md:flex-row">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-visible">
        <div id="investor-mobile-header-slot" className="md:hidden shrink-0" aria-hidden="true" />
        <InvestorSidebar
        email={user.email ?? ''}
        displayName={profile?.display_name ?? undefined}
        avatarUrl={profile?.avatar_url ?? undefined}
        isAdmin={profile?.is_admin ?? false}
      />
        <main className="flex-1 min-w-0 overflow-visible pt-0 md:overflow-auto">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-[max(14rem,calc(14rem+env(safe-area-inset-bottom)))] md:pb-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
