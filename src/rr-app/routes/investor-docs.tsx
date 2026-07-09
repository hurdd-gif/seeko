import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { DocList } from '@/components/dashboard/DocList';
import { FadeRise } from '@/components/motion';
import type { InvestorDocsData } from '@/lib/investor-index';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Documents
 *
 *    0ms   heading fades up
 *   80ms   subtitle fades up
 *  160ms   doc list rises in
 *
 * Faithful light Paper port. The legacy `(investor)/investor/docs/page.tsx`
 * rendered the SHARED <DocList isInvestor> — the exact component the team
 * `/docs` page uses — passing the full doc set so the read/deck view works.
 * We reproduce that verbatim (real DocList, not a bespoke card grid) so the
 * page looks identical to how it shipped. It mounts INSIDE the investor
 * sidebar chrome (InvestorShell, the parent layout route), so this route owns
 * only the heading + the DocList, not a shell of its own.
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  heading: 0,
  subtitle: 80,
  list: 160,
};

const delay = (ms: number) => ms / 1000;

type InvestorDocsLoaderData =
  | { status: 'ready'; index: InvestorDocsData }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function investorDocsLoader(_args: LoaderFunctionArgs): Promise<InvestorDocsLoaderData> {
  const response = await fetch('/api/investor-docs-index');

  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };

  if (!response.ok) {
    throw new Response('Unable to load investor docs', { status: response.status });
  }

  const index = (await response.json()) as InvestorDocsData;
  return { status: 'ready', index };
}

export function InvestorDocsRoute() {
  const data = useLoaderData() as InvestorDocsLoaderData;
  return <InvestorDocsRouteContent data={data} />;
}

export function InvestorDocsRouteContent({ data }: { data: InvestorDocsLoaderData }) {
  if (data.status === 'unauthorized') return <State title="Sign in required" description="Use your investor account to view documents." />;
  if (data.status === 'forbidden') return <State title="Investor access required" description="Documents are available to investors and admins." />;
  if (data.status === 'not_found') return <State title="Profile not found" description="Your account does not have a SEEKO profile yet." />;

  const { docs, team, profile } = data.index;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <FadeRise delay={delay(TIMING.heading)}>
          <h1 className="text-3xl font-bold tracking-tight text-[#111] text-balance">Documents</h1>
        </FadeRise>
        <FadeRise delay={delay(TIMING.subtitle)}>
          <p className="mt-1 text-sm text-[#808080]">Documents, decks, and shared resources.</p>
        </FadeRise>
      </div>

      <FadeRise delay={delay(TIMING.list)} y={12}>
        <DocList
          docs={docs}
          userDepartment={null}
          isAdmin={false}
          isInvestor
          currentUserId={profile.id}
          team={team}
        />
      </FadeRise>
    </div>
  );
}

function State({ title, description }: { title: string; description: string }) {
  return (
    <section className="rr-page">
      <div className="rr-panel">
        <h1>{title}</h1>
        <p className="mt-2 text-sm text-[#505050]">{description}</p>
      </div>
    </section>
  );
}
