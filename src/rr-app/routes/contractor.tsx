import { CircleHelp } from 'lucide-react';
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Link } from '@/lib/react-router-adapters';
import type { ContractorOverviewData } from '@/lib/contractor-index';
import { bucketDeliverables, greetingFor, summarizeDeliverables } from '@/lib/contractor-buckets';
import { DeliverableTimeline } from '@/components/contractor/DeliverableTimeline';

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

export function ContractorRouteContent({ data, now = new Date() }: { data: ContractorData; now?: Date }) {
  if (data.status === 'forbidden') {
    return (
      <div className="overview-light flex min-h-screen items-center justify-center bg-white px-6 antialiased">
        <div className="w-full max-w-md rounded-[20px] border border-[#E8E8E8]/75 bg-white p-6 shadow-[0_10px_20px_#D1D1D126]">
          <h1 className="m-0 text-xl font-semibold text-[#111]">Contractor access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#505050]">
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
  const buckets = bucketDeliverables(deliverables, now);
  const countLabel = `${summary.count} deliverable${summary.count === 1 ? '' : 's'}`;
  const subline = summary.nextDueLabel ? `${countLabel} · next due ${summary.nextDueLabel}` : countLabel;

  return (
    <div className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased [scrollbar-gutter:stable_both-edges]">
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-[#686868]">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20contractor%20help"
          className="flex items-center gap-2 text-base text-[#686868] transition-colors duration-150 hover:text-[#3a3a3a] active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      <main className="mx-auto w-full max-w-[620px] flex-col py-[clamp(5rem,12vh,8rem)]">
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#454545]">
            {greetingFor(now.getHours())}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-[#969696] tabular-nums">{subline}</p>
        </div>
        <DeliverableTimeline buckets={buckets} />
        <p className="mt-10 text-center text-xs text-[#b3b3b3]">
          Questions about a deliverable?{' '}
          <Link to="/legal/terms" className="font-medium text-[#969696] transition-colors hover:text-[#111]">
            Contractor terms
          </Link>
        </p>
      </main>
    </div>
  );
}
