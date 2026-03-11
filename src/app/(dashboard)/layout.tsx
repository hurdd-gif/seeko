import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchNotifications, fetchUnreadNotificationCount, fetchTeam, fetchAllDocs } from '@/lib/supabase/data';
import { IconRail } from '@/components/layout/IconRail';
import { MobileNav } from '@/components/layout/MobileNav';
import { DesktopHeader } from '@/components/layout/DesktopHeader';
import { DashboardTourWrapper } from '@/components/dashboard/DashboardTourWrapper';
import { PresenceHeartbeat } from '@/components/PresenceHeartbeat';
import { ActivityTracker } from '@/components/ActivityTracker';
import { PageTransition } from '@/components/layout/PageTransition';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { BugReportFAB } from '@/components/BugReportFAB';

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
  const [team, allDocs] = await Promise.all([
    fetchTeam().catch(() => []),
    fetchAllDocs().catch(() => []),
  ]);

  // Filter docs by access: admins see all; others only see unrestricted docs,
  // docs matching their department, or docs they're explicitly granted access to.
  const isAdmin = profile?.is_admin ?? false;
  const userDept = profile?.department ?? '';
  const accessibleDocs = isAdmin ? allDocs : allDocs.filter((d) => {
    if (!d.restricted_department?.length) return true;
    if (d.restricted_department.includes(userDept)) return true;
    if (d.granted_user_ids?.includes(user.id)) return true;
    return false;
  });

  const showTour = profile?.onboarded === 1 && (profile?.tour_completed ?? 0) === 0;

  return (
    <DashboardTourWrapper showTour={showTour} userId={user.id} isContractor={profile?.is_contractor ?? false} isAdmin={isAdmin}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background md:min-h-screen md:h-auto md:overflow-visible">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden md:overflow-visible">
          <div id="dashboard-mobile-header-slot" className="md:hidden shrink-0 pt-[env(safe-area-inset-top)]" aria-hidden="true" />
          <IconRail isAdmin={isAdmin} isContractor={profile?.is_contractor ?? false} />
          <MobileNav
            email={user.email ?? ''}
            displayName={profile?.display_name ?? undefined}
            avatarUrl={profile?.avatar_url ?? undefined}
            userId={user.id}
            isAdmin={isAdmin}
            isContractor={profile?.is_contractor ?? false}
            unreadCount={unreadCount}
            notifications={notifications}
          />
          <DesktopHeader
            email={user.email ?? ''}
            displayName={profile?.display_name ?? undefined}
            avatarUrl={profile?.avatar_url ?? undefined}
            userId={user.id}
            isAdmin={isAdmin}
            unreadCount={unreadCount}
            notifications={notifications}
          />
          <main className="flex-1 min-w-0 overflow-x-hidden md:overflow-auto md:pl-14 md:pr-14" id="tour-main">
            <div className="max-w-5xl mx-auto px-5 md:px-6 py-4 md:py-8 pb-24 md:pb-8">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
        </div>
      </div>
      <PresenceHeartbeat userId={user.id} />
      <ActivityTracker userId={user.id} />
      <CommandPalette
        team={team.map((m) => ({ id: m.id, display_name: m.display_name }))}
        docs={accessibleDocs.filter((d) => d.type !== 'deck').map((d) => ({ id: d.id, title: d.title }))}
        decks={accessibleDocs.filter((d) => d.type === 'deck').map((d) => ({ id: d.id, title: d.title }))}
        isContractor={profile?.is_contractor ?? false}
        isAdmin={isAdmin}
      />
      <BugReportFAB
        displayName={profile?.display_name ?? 'Unknown'}
        email={user.email ?? ''}
      />
    </DashboardTourWrapper>
  );
}
