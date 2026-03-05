'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log for debugging
    console.error('Dashboard error:', error.message);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="size-12 text-destructive/80" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {error.message || 'We couldn’t load this page.'}
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={reset}>
          Retry
        </Button>
        <Button variant="ghost" onClick={() => router.push('/')}>
          Back to Overview
        </Button>
      </div>
    </div>
  );
}
