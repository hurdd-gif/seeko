import { CircleHelp } from 'lucide-react';
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Link } from '@/lib/react-router-adapters';
import type { ContractorOverviewData } from '@/lib/contractor-index';
import { greetingFor, splitDeliverables, summarizeDeliverables } from '@/lib/contractor-buckets';
import { StepDeliverableTimeline } from '@/components/contractor/StepDeliverableTimeline';

/**
 * Contractor home per the login reference (Paper 27P-0): white canvas, quiet top
 * bar, a centered column. Instead of an auth card it renders the signed-in
 * contractor's own deliverables as a vertical-breadcrumb timeline. Access is
 * loader-gated against /api/contractor-index (401 → /login, 403|404 → forbidden).
 */

export type ContractorData =
  | { status: 'ready'; index: ContractorOverviewData }
  | { status: 'forbidden' };

export async function contractorLoader(_args: LoaderFunctionArgs): Promise<ContractorData | Response> {
  const response = await fetch('/api/contractor-index');
  if (response.status === 401) return redirect('/login');
  if (response.status === 403 || response.status === 404) return { status: 'forbidden' };
  if (!response.ok) {
    throw new Response('Unable to load contractor portal', { status: response.status });
  }
  const index = (await response.json()) as ContractorOverviewData;
  return { status: 'ready', index };
}

export function ContractorRoute() {
  const data = useLoaderData() as ContractorData;
  return <ContractorRouteContent data={data} />;
}

async function defaultAdvanceCommit(taskId: string, stepId: string): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('advance_failed');
}

export function ContractorRouteContent({
  data,
  now = new Date(),
  onAdvance = defaultAdvanceCommit,
}: {
  data: ContractorData;
  now?: Date;
  onAdvance?: (taskId: string, stepId: string) => void | Promise<void>;
}) {
  if (data.status === 'forbidden') {
    return (
      <div className="overview-light flex min-h-screen items-center justify-center bg-white px-6 antialiased">
        <div className="w-full max-w-md rounded-[20px] border border-hairline bg-white p-6 shadow-float">
          <h1 className="m-0 text-xl font-semibold text-[#111]">Contractor access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            This portal is available to contractors and admins. If you think this is a
            mistake, ask a SEEKO admin to enable contractor access on your profile.
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex h-9 items-center rounded-full bg-[#111] px-4 text-sm font-medium text-white transition-[transform,background-color] hover:bg-[#000] active:scale-[0.98]"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  const { profile, deliverables } = data.index;
  const firstName = (profile.displayName ?? '').trim().split(' ')[0] || 'there';
  const summary = summarizeDeliverables(deliverables, now);
  const { active, timeline } = splitDeliverables(deliverables, now);
  const countLabel = `${summary.count} deliverable${summary.count === 1 ? '' : 's'}`;
  const subline = summary.nextDueLabel ? `${countLabel} · next due ${summary.nextDueLabel}` : countLabel;

  return (
    <div className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased [scrollbar-gutter:stable_both-edges]">
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-ink-muted-strong">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20contractor%20help"
          className="flex items-center gap-2 text-base text-ink-muted-strong transition-colors duration-150 hover:text-ink active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      <main className="mx-auto w-full max-w-[620px] flex-col pt-[clamp(5rem,11vh,6.5rem)] pb-16">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-heading">
            {greetingFor(now.getHours())}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-ink-faint tabular-nums">{subline}</p>
        </div>
        <StepDeliverableTimeline active={active} timeline={timeline} now={now} onAdvance={onAdvance} />
        <p className="mt-10 text-center text-xs text-ink-faintest">
          Questions about a deliverable?{' '}
          <Link to="/legal/terms" className="font-medium text-ink-faint transition-colors hover:text-[#111]">
            Contractor terms
          </Link>
        </p>
      </main>
    </div>
  );
}
