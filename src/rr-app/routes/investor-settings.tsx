import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';
import { FadeRise } from '@/components/motion';
import type { Profile } from '@/lib/types';
import type { InvestorProfile, InvestorSettingsData } from '@/lib/investor-index';

/* ─────────────────────────────────────────────────────────
 * Investor Settings — faithful light Paper port.
 *
 * The legacy `(investor)/investor/settings/page.tsx` rendered the SHARED
 * <SettingsPanel> (isAdmin=false) — exactly the same component the team
 * `/settings` page uses, which owns its own full-bleed <LightShell>. For an
 * investor profile (is_investor=true) the panel shows ONLY the Account section
 * (Profile + Change Password); the team-only Payments section and the admin
 * section are hidden. We reproduce that verbatim rather than a bespoke form, so
 * the page looks identical to how it shipped. Mounts as a top-level standalone
 * route (Family A): SettingsPanel's fixed-inset LightShell is its own chrome.
 * ───────────────────────────────────────────────────────── */

type InvestorSettingsLoaderData =
  | { status: 'ready'; index: InvestorSettingsData }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function investorSettingsLoader(_args: LoaderFunctionArgs): Promise<InvestorSettingsLoaderData> {
  const response = await fetch('/api/investor-settings-index');

  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };

  if (!response.ok) {
    throw new Response('Unable to load investor settings', { status: response.status });
  }

  const index = (await response.json()) as InvestorSettingsData;
  return { status: 'ready', index };
}

export function InvestorSettingsRoute() {
  const data = useLoaderData() as InvestorSettingsLoaderData;
  return <InvestorSettingsRouteContent data={data} />;
}

export function InvestorSettingsRouteContent({ data }: { data: InvestorSettingsLoaderData }) {
  if (data.status === 'unauthorized') return <State title="Sign in required" description="Use your investor account to edit settings." />;
  if (data.status === 'forbidden') return <State title="Investor access required" description="Settings are available to investors and admins." />;
  if (data.status === 'not_found') return <State title="Profile not found" description="Your account does not have a SEEKO profile yet." />;

  // The original page rendered SettingsPanel wrapped in a single FadeRise,
  // matching the team `/settings` route.
  return (
    <FadeRise delay={0} y={16}>
      <SettingsPanel profile={toProfile(data.index.profile)} isAdmin={false} team={[]} />
    </FadeRise>
  );
}

/** Bridge the camelCase investor DTO to the snake_case Profile SettingsPanel reads. */
function toProfile(p: InvestorProfile): Profile {
  return {
    id: p.id,
    display_name: p.displayName,
    email: p.email,
    avatar_url: p.avatarUrl,
    timezone: p.timezone,
    paypal_email: p.paypalEmail,
    is_admin: p.isAdmin,
    is_investor: p.isInvestor,
  } as Profile;
}

function State({ title, description }: { title: string; description: string }) {
  return (
    <section className="rr-page">
      <div className="rr-panel">
        <h1>{title}</h1>
        <p className="mt-2 text-sm text-[#9a9a9a]">{description}</p>
      </div>
    </section>
  );
}
