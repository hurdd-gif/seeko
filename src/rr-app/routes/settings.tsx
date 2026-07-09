import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';
import { FadeRise } from '@/components/motion';
import type { SettingsViewData } from '@/lib/dashboard-views';
import { PaperState } from './_paper-state';

type SettingsLoaderData =
  | { status: 'ready'; view: SettingsViewData }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function settingsLoader(_args: LoaderFunctionArgs): Promise<SettingsLoaderData> {
  const response = await fetch('/api/settings-view');
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response('Unable to load settings', { status: response.status });
  return { status: 'ready', view: (await response.json()) as SettingsViewData };
}

export function SettingsRoute() {
  const data = useLoaderData() as SettingsLoaderData;
  return <SettingsRouteContent data={data} />;
}

export function SettingsRouteContent({ data }: { data: SettingsLoaderData }) {
  if (data.status === 'unauthorized') {
    return <PaperState title="Sign in required" description="Use your SEEKO account to manage settings." />;
  }
  if (data.status === 'forbidden') {
    return <PaperState title="Settings unavailable" description="Investor accounts manage settings from the investor panel." />;
  }
  if (data.status === 'not_found') {
    return <PaperState title="Profile not found" description="Your account does not have a team profile yet." />;
  }

  const { profile, isAdmin, team, completedTasks } = data.view;

  // The original `(dashboard)/settings/page.tsx` rendered the SettingsPanel —
  // which owns its own full-bleed <LightShell> — wrapped in a single FadeRise.
  return (
    <FadeRise delay={0} y={16}>
      <SettingsPanel
        profile={profile}
        isAdmin={isAdmin}
        team={team}
        completedTasks={completedTasks}
      />
    </FadeRise>
  );
}
