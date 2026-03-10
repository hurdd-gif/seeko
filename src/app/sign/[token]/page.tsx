import { SigningPageClient } from './client';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ExternalSignPage({ params }: Props) {
  const { token } = await params;

  // Fetch initial status server-side
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/external-signing/${token}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Link not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This signing link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const data = await res.json();
  return <SigningPageClient token={token} initialData={data} />;
}
