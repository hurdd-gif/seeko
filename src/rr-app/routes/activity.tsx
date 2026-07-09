import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { LightShell } from '@/components/dashboard/LightShell';
import { ActivityView } from '@/components/dashboard/ActivityView';
import type { ActivityViewData } from '@/lib/dashboard-views';
import { loadView, type ViewState } from '../load-view';
import { PaperState } from './_paper-state';

type ActivityLoaderData = ViewState<ActivityViewData>;

export async function activityLoader(_args: LoaderFunctionArgs): Promise<ActivityLoaderData> {
  return loadView<ActivityViewData>('/api/activity-view', 'Unable to load activity');
}

export function ActivityRoute() {
  const data = useLoaderData() as ActivityLoaderData;
  return <ActivityRouteContent data={data} />;
}

export function ActivityRouteContent({ data }: { data: ActivityLoaderData }) {
  if (data.status === 'unauthorized') {
    return <PaperState title="Sign in required" description="Use your SEEKO account to view activity." />;
  }
  if (data.status === 'forbidden') {
    return <PaperState title="Activity unavailable" description="The studio activity feed is only available to the team." />;
  }
  if (data.status === 'not_found') {
    return <PaperState title="Profile not found" description="Your account does not have a team profile yet." />;
  }

  const { account } = data.data;

  return (
    <LightShell navLabel="Sections" account={account} fill bordered>
      <main className="scroll-mask-y scrollbar-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <ActivityView view={data.data} />
        </div>
      </main>
    </LightShell>
  );
}
