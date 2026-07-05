import { FadeRise } from '@/components/motion';
import { NotificationsPanel } from '@/components/dashboard/NotificationsPanel';

/**
 * Faithful port of the legacy `(dashboard)/notifications/page.tsx`, which simply
 * rendered the original <NotificationsPanel> (a notification-PREFERENCES surface
 * — level cards + channel switches + Save) wrapped in <FadeRise>. It is a Family
 * B page: it owns no shell, so it mounts inside RootLayout's ShellFrame. The
 * panel holds its own local state and needs no server data, so this route has no
 * loader (the former scaffold's `/api/notifications-index` fetch + "Inbox" table
 * were a fabrication that never existed in the refreshed design).
 */
export function NotificationsRoute() {
  return (
    <FadeRise delay={0} y={16}>
      <NotificationsPanel />
    </FadeRise>
  );
}
