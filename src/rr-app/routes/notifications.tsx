import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { FadeRise } from '@/components/motion';
import { LightShell } from '@/components/dashboard/LightShell';
import { NotificationsPanel } from '@/components/dashboard/NotificationsPanel';
import type { NotificationsViewData } from '@/lib/dashboard-views';
import { loadView, type ViewState } from '../load-view';
import { PaperState } from './_paper-state';

type NotificationsLoaderData = ViewState<NotificationsViewData>;

export async function notificationsLoader(_args: LoaderFunctionArgs): Promise<NotificationsLoaderData> {
  return loadView<NotificationsViewData>('/api/notifications-view', 'Unable to load notifications');
}

/**
 * Faithful port of the legacy `(dashboard)/notifications/page.tsx`: the original
 * <NotificationsPanel> (a notification-PREFERENCES surface — level cards +
 * channel switches + Save) wrapped in <FadeRise>. The panel holds its own local
 * state; the loader exists only to dress the page in the REAL account chrome —
 * this was the last page wearing the static ShellFrame mirror (hardcoded "SK"
 * monogram, fake identity), so its header never matched the signed-in profile.
 * Now it renders the same <LightShell account> pill as every other Paper page.
 * The inner column reproduces ShellFrame's exact geometry (max-w-5xl, px-6
 * py-8 pb-24, md:px-[52px]) so only the chrome changed, not the content.
 */
export function NotificationsRoute() {
  const data = useLoaderData() as NotificationsLoaderData;
  return <NotificationsRouteContent data={data} />;
}

export function NotificationsRouteContent({ data }: { data: NotificationsLoaderData }) {
  if (data.status === 'unauthorized') {
    return <PaperState title="Sign in required" description="Use your SEEKO account to manage notifications." />;
  }
  if (data.status === 'forbidden') {
    return <PaperState title="Notifications unavailable" description="Notification preferences are only available to the team." />;
  }
  if (data.status === 'not_found') {
    return <PaperState title="Profile not found" description="Your account does not have a team profile yet." />;
  }

  const { account } = data.data;

  return (
    <LightShell navLabel="Sections" account={account} fill bordered>
      <main className="scrollbar-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 md:px-[52px]">
          <FadeRise delay={0} y={16}>
            <NotificationsPanel />
          </FadeRise>
        </div>
      </main>
    </LightShell>
  );
}
