import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { PaymentsAdmin } from '@/components/dashboard/PaymentsAdmin';
import { FadeRise } from '@/components/motion';
import type { PaymentsViewData } from '@/lib/dashboard-views';
import { PaperState } from './_paper-state';

type PaymentsLoaderData =
  | { status: 'ready'; team: PaymentsViewData['team']; isAdmin: boolean; isInvestor: boolean }
  | { status: 'unauthorized' }
  | { status: 'forbidden' };

export async function paymentsLoader(_args: LoaderFunctionArgs): Promise<PaymentsLoaderData> {
  const response = await fetch('/api/payments-view');
  if (response.status === 401) return { status: 'unauthorized' };
  // Team members without investor/admin access are forbidden. Investors get
  // read-only access to the shared payments screen.
  if (response.status === 403) return { status: 'forbidden' };
  if (!response.ok) throw new Response('Unable to load payments', { status: response.status });
  const view = (await response.json()) as PaymentsViewData;
  return { status: 'ready', team: view.team, isAdmin: view.isAdmin, isInvestor: view.isInvestor };
}

export function PaymentsRoute() {
  const data = useLoaderData() as PaymentsLoaderData;
  return <PaymentsRouteContent data={data} />;
}

export function PaymentsRouteContent({ data }: { data: PaymentsLoaderData }) {
  if (data.status === 'unauthorized') {
    return <PaperState title="Sign in required" description="Use your SEEKO account to view payments." />;
  }
  if (data.status === 'forbidden') {
    return <PaperState title="Payments access required" description="Payments are available to studio admins and investors." />;
  }

  return (
    <FadeRise delay={0} y={16}>
      <PaymentsAdmin team={data.team} viewerMode={!data.isAdmin && data.isInvestor} />
    </FadeRise>
  );
}
