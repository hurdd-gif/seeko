import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchNotifications, fetchUnreadNotificationCount } from '@/lib/supabase/data';
import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardTourWrapper } from '@/components/dashboard/DashboardTourWrapper';
import { PresenceHeartbeat } from '@/components/PresenceHeartbeat';
import { ActivityTracker } from '@/components/ActivityTracker';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (profile?.is_investor && !profile?.is_admin) redirect('/investor');

  const [notifications, unreadCount] = await Promise.all([
    fetchNotifications(user.id, 20).catch(() => []),
    fetchUnreadNotificationCount(user.id).catch(() => 0),
  ]);
  const showTour = profile?.onboarded === 1 && profile?.tour_completed === 0;

  return (
    <DashboardTourWrapper showTour={showTour} userId={user.id}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background md:min-h-screen md:h-auto md:overflow-visible md:flex-row">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden md:flex-row md:overflow-visible">
          <div id="dashboard-mobile-header-slot" className="md:hidden shrink-0" aria-hidden="true" />
          <Sidebar
          email={user.email ?? ''}
          displayName={profile?.display_name ?? undefined}
          avatarUrl={profile?.avatar_url ?? undefined}
          userId={user.id}
          isAdmin={profile?.is_admin ?? false}
          isContractor={profile?.is_contractor ?? false}
          unreadCount={unreadCount}
          notifications={notifications}
        />
        <main className="flex-1 min-w-0 overflow-x-hidden pt-[env(safe-area-inset-top)] md:pt-0 md:overflow-auto" id="tour-main">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
            {children}
          </div>
        </main>
        </div>
      </div>
      <PresenceHeartbeat userId={user.id} />
      <ActivityTracker userId={user.id} />
    </DashboardTourWrapper>
  );
}
