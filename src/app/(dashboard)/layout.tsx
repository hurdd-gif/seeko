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
  const [notifications, unreadCount] = await Promise.all([
    fetchNotifications(user.id, 20).catch(() => []),
    fetchUnreadNotificationCount(user.id).catch(() => 0),
  ]);
  const showTour = profile?.onboarded === 1 && profile?.tour_completed === 0;

  return (
    <DashboardTourWrapper showTour={showTour} userId={user.id}>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          email={user.email ?? ''}
          displayName={profile?.display_name ?? undefined}
          avatarUrl={profile?.avatar_url ?? undefined}
          userId={user.id}
          isAdmin={profile?.is_admin ?? false}
          unreadCount={unreadCount}
          notifications={notifications}
        />
        <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0" id="tour-main">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>
      <PresenceHeartbeat userId={user.id} />
      <ActivityTracker userId={user.id} />
    </DashboardTourWrapper>
  );
}
