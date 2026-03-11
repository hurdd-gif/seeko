import { InvoicePageClient } from './client';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvoicePage({ params }: Props) {
  const { token } = await params;

  // Fetch initial data server-side
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/invoice-request/${token}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This invoice link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const initialData = await res.json();

  return <InvoicePageClient token={token} initialData={initialData} />;
}
