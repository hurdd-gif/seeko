import { useLoaderData, useParams, type LoaderFunctionArgs } from 'react-router';
import { SharedDocClient } from '../clients/shared-doc-client';
import type { DocShareInitialData } from '@/lib/doc-share';

type SharedDocLoaderData = DocShareInitialData;

export async function sharedDocLoader({ params }: LoaderFunctionArgs): Promise<SharedDocLoaderData> {
  const token = params.token;

  if (!token) {
    return { status: 'not_found' };
  }

  const response = await fetch(`/api/doc-share/${encodeURIComponent(token)}`);

  if (response.status === 404) {
    return { status: 'not_found' };
  }

  if (!response.ok) {
    throw new Response('Unable to load shared document', { status: response.status });
  }

  return response.json() as Promise<SharedDocLoaderData>;
}

export function SharedDocRoute() {
  const data = useLoaderData() as SharedDocLoaderData;
  const { token = '' } = useParams();

  return <SharedDocRouteContent token={token} initialData={data} />;
}

export function SharedDocRouteContent({
  token,
  initialData,
}: {
  token: string;
  initialData: SharedDocLoaderData;
}) {
  if (initialData.status === 'not_found') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This document link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  return <SharedDocClient token={token} initialData={initialData} />;
}
