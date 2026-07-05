import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { LightShell } from '@/components/dashboard/LightShell';
import { StudioProgressRing } from '@/components/dashboard/StudioProgressRing';
import { FadeRise } from '@/components/motion';
import type { ProgressViewData } from '@/lib/dashboard-views';
import { PaperState } from './_paper-state';

type ProgressLoaderData =
  | { status: 'ready'; view: ProgressViewData }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function progressLoader(_args: LoaderFunctionArgs): Promise<ProgressLoaderData> {
  const response = await fetch('/api/progress-view');
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response('Unable to load progress', { status: response.status });
  return { status: 'ready', view: (await response.json()) as ProgressViewData };
}

export function ProgressRoute() {
  const data = useLoaderData() as ProgressLoaderData;
  return <ProgressRouteContent data={data} />;
}

export function ProgressRouteContent({ data }: { data: ProgressLoaderData }) {
  if (data.status === 'unauthorized') {
    return <PaperState title="Sign in required" description="Use your SEEKO account to view progress." />;
  }
  if (data.status === 'forbidden') {
    return <PaperState title="Progress unavailable" description="Studio progress is only available to the team." />;
  }
  if (data.status === 'not_found') {
    return <PaperState title="Profile not found" description="Your account does not have a team profile yet." />;
  }

  const { account, areas, milestones, isAdmin } = data.view;

  return (
    <LightShell navLabel="Sections" account={account} fill bordered>
      <main className="scroll-mask-y scrollbar-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <FadeRise y={6} delay={0.08}>
            <div className="mb-8">
              <h1 className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-[#1a1a1a]">
                Progress
              </h1>
              <p className="mt-1 text-[13.5px] text-[#7a7a7a]">
                Overall completion across the studio
                {isAdmin ? ' — click the ring to update an area.' : '.'}
              </p>
            </div>
          </FadeRise>

          <FadeRise y={6} delay={0.12}>
            <section className="flex justify-center rounded-2xl bg-white px-6 pb-16 pt-24 shadow-seeko">
              <StudioProgressRing areas={areas} milestones={milestones} isAdmin={isAdmin} />
            </section>
          </FadeRise>
        </div>
      </main>
    </LightShell>
  );
}
