import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { ExternalSigningAdmin } from '@/components/external-signing/ExternalSigningAdmin';
import { PaperState } from './_paper-state';

type ExternalSigningAdminLoaderData =
  | { status: 'ready' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' };

/**
 * Admin gate only. The original page redirected non-admins to `/` and signed-out
 * visitors to `/login`; here the loader maps those to Paper access states. It
 * carries NO data payload: <ExternalSigningAdmin> composes the real self-fetching
 * <InviteTable> (plus the SendInviteForm inside its New Invite dialog), which pull
 * their own data from the browser Supabase client + the Hono
 * `/api/external-signing/*` routes exactly as the original did. We reuse the
 * existing `/api/external-signing-admin` endpoint purely for its 401/403 gate.
 */
export async function externalSigningAdminLoader(
  _args: LoaderFunctionArgs,
): Promise<ExternalSigningAdminLoaderData> {
  const response = await fetch('/api/external-signing-admin');

  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (!response.ok) {
    throw new Response('Unable to verify signing access', { status: response.status });
  }

  return { status: 'ready' };
}

export function ExternalSigningAdminRoute() {
  const data = useLoaderData() as ExternalSigningAdminLoaderData;
  return <ExternalSigningAdminRouteContent data={data} />;
}

export function ExternalSigningAdminRouteContent({
  data,
}: {
  data: ExternalSigningAdminLoaderData;
}) {
  if (data.status === 'unauthorized') {
    return (
      <PaperState
        title="Sign in required"
        description="Use your SEEKO admin account to manage external signing."
      />
    );
  }
  if (data.status === 'forbidden') {
    return (
      <PaperState
        title="Admin access required"
        description="Only studio admins can manage external signing."
      />
    );
  }

  // The original `(dashboard)/admin/external-signing/page.tsx` rendered
  // <ExternalSigningAdmin /> directly — it owns its own full-bleed <LightShell>
  // and internal entrance motion, so it needs no extra wrapper here.
  return <ExternalSigningAdmin />;
}
