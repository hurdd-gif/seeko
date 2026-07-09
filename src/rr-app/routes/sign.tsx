import { useLoaderData, useParams, type LoaderFunctionArgs } from 'react-router';
import { SigningPageClient } from '../clients/signing-page-client';
import type { ExternalSigningInitialData } from '@/lib/external-signing';

type SignLoaderData = ExternalSigningInitialData;

export async function signLoader({ params }: LoaderFunctionArgs): Promise<SignLoaderData> {
  const token = params.token;

  if (!token) {
    return { status: 'notfound' };
  }

  const response = await fetch(`/api/external-signing/${encodeURIComponent(token)}`);

  if (response.status === 404) {
    return { status: 'notfound' };
  }

  if (!response.ok) {
    throw new Response('Unable to load signing request', { status: response.status });
  }

  return response.json() as Promise<SignLoaderData>;
}

export function SignRoute() {
  const data = useLoaderData() as SignLoaderData;
  const { token = '' } = useParams();

  return <SignRouteContent token={token} initialData={data} />;
}

export function SignRouteContent({
  token,
  initialData,
}: {
  token: string;
  initialData: SignLoaderData;
}) {
  return <SigningPageClient token={token} initialData={initialData} />;
}
