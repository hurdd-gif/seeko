import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Link } from '@/lib/react-router-adapters';
import type { ContractorOverviewData } from '@/lib/contractor-index';
import { greetingFor, splitDeliverables, summarizeDeliverables } from '@/lib/contractor-buckets';
import { StepDeliverableTimeline } from '@/components/contractor/StepDeliverableTimeline';
import { JourneyRail } from '@/components/contractor/JourneyRail';

/**
 * Contractor home on the shared light-canvas language (--ov-bg, task-detail
 * lineage): quiet scroll-edge top bar, a centered column, active work on one
 * white shadow-seeko surface with delivered history frameless below. Renders
 * the signed-in contractor's own deliverables as a vertical-breadcrumb
 * timeline. Access is loader-gated against /api/contractor-index
 * (401 → /login, 403|404 → forbidden).
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
  // Scroll-edge veil on the sticky header (login/legal precedent): transparent
  // at rest, canvas-tinted blur once content slides underneath.
  const [scrolled, setScrolled] = useState(false);

  if (data.status === 'forbidden') {
    return (
      <div className="overview-light flex min-h-screen items-center justify-center bg-[var(--ov-bg)] px-6 antialiased">
        <div className="w-full max-w-md rounded-[20px] bg-surface-1 p-6 shadow-seeko">
          <h1 className="m-0 text-xl font-semibold text-ink-title">Contractor access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            This portal is available to contractors and admins. If you think this is a
            mistake, ask a SEEKO admin to enable contractor access on your profile.
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex h-9 items-center rounded-full bg-ink-title px-4 text-sm font-medium text-surface-1 transition-[transform,background-color] hover:bg-[#000] dark:hover:bg-white active:scale-[0.98]"
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

  return (
    // The scroll fade is a mask → transparent, so the canvas must be painted
    // by an UNMASKED parent — masking the element that owns bg-[var(--ov-bg)]
    // would fade the page into the dark app body behind it.
    <div className="overview-light h-dvh bg-[var(--ov-bg)] antialiased">
    <div
      data-contractor-scroll
      className="scroll-mask-b relative flex h-dvh flex-col overflow-y-auto px-4 [scrollbar-gutter:stable_both-edges]"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
    >
      <header
        className={`sticky top-0 z-10 -mx-4 flex items-center justify-between px-6 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] transition-[background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none sm:px-10 ${
          scrolled ? 'bg-[rgba(238,238,238,0.86)] shadow-[0_1px_0_rgba(0,0,0,0.05)] backdrop-blur-md' : ''
        }`}
      >
        <div className="flex items-center gap-2.5">
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-ink-muted-strong">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20contractor%20help"
          className="flex items-center gap-2 text-base text-ink-muted-strong transition-colors duration-150 hover:text-ink active:text-ink-title"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      {/* Whole-page composition (Meridian reference, phase 3): on lg+ the
       * journey rail carries the macro spine on the left — one stop per
       * deliverable, identity chip at the foot — while the cards keep the
       * right column. Below lg the rail hides and the single centered
       * column stands unchanged (mobile-first). 948px = 264 rail + 64 gap
       * + 620 column, so the pair centers as one object. */}
      <div className="mx-auto flex w-full max-w-[620px] grow items-start lg:max-w-[948px] lg:gap-16">
        {/* pb-16 keeps the identity chip above the container's 56px bottom
         * scroll fade (.scroll-mask-b) — the rail is sticky, so it would
         * otherwise sit permanently inside the faded band. */}
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[264px] shrink-0 pt-[clamp(2rem,5vh,3.5rem)] pb-16 lg:flex lg:flex-col">
          <JourneyRail
            active={active}
            deliveredCount={timeline.reduce((n, m) => n + m.items.length, 0)}
            profile={profile}
            now={now}
          />
        </aside>
        <main className="w-full min-w-0 max-w-[620px] flex-1 pt-[clamp(2rem,5vh,3.5rem)] pb-16">
          {/* mb-10 — the greeting is the page's one display moment; extra air
           * before the first card keeps it from crowding the work below. */}
          <div className="mb-10">
            {/* Sentence-case date above the greeting (Asana Home) — the one
             * humane line on an otherwise utilitarian page. Plain text, not
             * tracked-uppercase chrome. */}
            <p className="text-[13px] text-ink-faint tabular-nums">
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="mt-1 text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink-heading">
              {greetingFor(now.getHours())}, {firstName}
            </h1>
            {/* Overdue is the one fact the greeting must not bury — it renders in
             * the status red (state, not decoration) between the count and the
             * forward-looking next-due. */}
            {/* ink-muted, not ink-faint — the count/next-due are the page's key
             * facts, not decorative sublining; faint sat ~2.96:1. */}
            <p className="mt-1.5 text-sm text-ink-muted tabular-nums">
              {countLabel}
              {summary.overdueCount > 0 && (
                <>
                  {' · '}
                  <span className="font-medium text-danger">
                    {summary.overdueCount} overdue
                  </span>
                </>
              )}
              {summary.nextDueLabel && ` · next due ${summary.nextDueLabel}`}
            </p>
          </div>
          <StepDeliverableTimeline active={active} timeline={timeline} now={now} onAdvance={onAdvance} />
          <p className="mt-10 text-center text-xs text-ink-faintest">
            Questions about a deliverable?{' '}
            <Link to="/legal/terms" className="font-medium text-ink-faint transition-colors hover:text-ink-title">
              Contractor terms
            </Link>
          </p>
        </main>
      </div>
    </div>
    </div>
  );
}
