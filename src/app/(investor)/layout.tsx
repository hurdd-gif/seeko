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
    <div className="flex min-h-screen bg-background">
      <InvestorSidebar
        email={user.email ?? ''}
        displayName={profile?.display_name ?? undefined}
        avatarUrl={profile?.avatar_url ?? undefined}
        isAdmin={profile?.is_admin ?? false}
      />
      <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
