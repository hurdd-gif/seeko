import { useLoaderData, useParams, type LoaderFunctionArgs } from 'react-router';
import { InvoicePageClient } from '../clients/invoice-client';
import type { InvoiceRequestInitialData } from '@/lib/invoice-request';

type InvoiceLoaderData = InvoiceRequestInitialData;

export async function invoiceLoader({ params }: LoaderFunctionArgs): Promise<InvoiceLoaderData> {
  const token = params.token;

  if (!token) {
    return { status: 'not_found' };
  }

  const response = await fetch(`/api/invoice-request/${encodeURIComponent(token)}`);

  if (response.status === 404) {
    return { status: 'not_found' };
  }

  if (!response.ok) {
    throw new Response('Unable to load invoice request', { status: response.status });
  }

  return response.json() as Promise<InvoiceLoaderData>;
}

export function InvoiceRoute() {
  const data = useLoaderData() as InvoiceLoaderData;
  const { token = '' } = useParams();

  return <InvoiceRouteContent token={token} initialData={data} />;
}

export function InvoiceRouteContent({
  token,
  initialData,
}: {
  token: string;
  initialData: InvoiceLoaderData;
}) {
  if (initialData.status === 'not_found') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This invoice link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  return <InvoicePageClient token={token} initialData={initialData} />;
}
