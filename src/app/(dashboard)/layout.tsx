import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile } from '@/lib/supabase/data';
import { Sidebar } from '@/components/layout/Sidebar';
import { GettingStarted } from '@/components/dashboard/GettingStarted';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  const showTour = profile?.onboarded === 1 && profile?.tour_completed === 0;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        email={user.email ?? ''}
        displayName={profile?.display_name ?? undefined}
        avatarUrl={profile?.avatar_url ?? undefined}
      />
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
      {showTour && <GettingStarted userId={user.id} />}
    </div>
  );
}
