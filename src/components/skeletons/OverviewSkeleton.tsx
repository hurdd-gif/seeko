import { Skeleton } from '@/components/ui/skeleton';

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Stat cards — 1 col mobile, 2 col sm, 4 col lg */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>

      {/* Game Areas card */}
      <Skeleton className="h-[280px] rounded-xl" />

      {/* Tasks + Activity — 5-col split on lg */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Skeleton className="lg:col-span-3 h-[300px] rounded-xl" />
        <Skeleton className="lg:col-span-2 h-[300px] rounded-xl" />
      </div>
    </div>
  );
}
