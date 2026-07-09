import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { DocList } from '@/components/dashboard/DocList';
import { LightShell } from '@/components/dashboard/LightShell';
import { SidePanelSlot } from '@/components/ui/side-panel';
import type { DocsViewData } from '@/lib/dashboard-views';
import { PaperState } from './_paper-state';

type DocsLoaderData =
  | { status: 'ready'; index: DocsViewData }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function docsLoader(_args: LoaderFunctionArgs): Promise<DocsLoaderData> {
  const response = await fetch('/api/docs-view');
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response('Unable to load documents', { status: response.status });
  return { status: 'ready', index: (await response.json()) as DocsViewData };
}

export function DocsRoute() {
  const data = useLoaderData() as DocsLoaderData;
  return <DocsRouteContent data={data} />;
}

export function DocsRouteContent({ data }: { data: DocsLoaderData }) {
  if (data.status === 'unauthorized') {
    return <PaperState title="Sign in required" description="Use your SEEKO account to view documents." />;
  }
  if (data.status === 'forbidden') {
    return <PaperState title="Documents unavailable" description="The studio docs are only available to the team." />;
  }
  if (data.status === 'not_found') {
    return <PaperState title="Profile not found" description="Your account does not have a team profile yet." />;
  }

  const { account, docs, team, userDepartment, isAdmin, currentUserId } = data.index;

  return (
    <LightShell activeTab="docs" navLabel="Sections" account={account} fill bordered>
      {/* Flex row: scroll column + read-panel slot. The doc read panel portals
          into the slot and pushes the column left as its width springs open. */}
      <div className="flex min-h-0 flex-1">
        <main className="scroll-mask-y scrollbar-paper min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[880px] px-8 py-10 max-lg:px-5 max-lg:py-6">
            <DocList
              docs={docs}
              userDepartment={userDepartment}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              team={team}
            />
          </div>
        </main>
        <SidePanelSlot />
      </div>
    </LightShell>
  );
}
