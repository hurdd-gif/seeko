import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { LightShell } from '@/components/dashboard/LightShell';
import { StudioProgressRing } from '@/components/dashboard/StudioProgressRing';
import { FadeRise } from '@/components/motion';
import type { ProgressViewData } from '@/lib/dashboard-views';
import { loadView, type ViewState } from '../load-view';
import { PaperState } from './_paper-state';

type ProgressLoaderData = ViewState<ProgressViewData>;

export async function progressLoader(_args: LoaderFunctionArgs): Promise<ProgressLoaderData> {
  return loadView<ProgressViewData>('/api/progress-view', 'Unable to load progress');
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

  const { account, areas, milestones, isAdmin } = data.data;

  return (
    <LightShell navLabel="Sections" account={account} fill bordered>
      <main className="scroll-mask-y scrollbar-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <FadeRise y={6} delay={0.08}>
            <div className="mb-8">
              <h1 className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-title">
                Progress
              </h1>
              <p className="mt-1 text-[13.5px] text-ink-muted">
                Overall completion across the studio
                {isAdmin ? ' — click the ring to update an area.' : '.'}
              </p>
            </div>
          </FadeRise>

          <FadeRise y={6} delay={0.12}>
            <section className="flex justify-center rounded-2xl bg-surface-1 px-6 pb-16 pt-24 shadow-seeko">
              <StudioProgressRing areas={areas} milestones={milestones} isAdmin={isAdmin} />
            </section>
          </FadeRise>
        </div>
      </main>
    </LightShell>
  );
}
