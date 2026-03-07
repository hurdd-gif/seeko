import { Skeleton } from '@/components/ui/skeleton';

export function ActivitySkeleton() {
  return (
    <div className="space-y-6">
      {/* Heading + subtitle */}
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-72 mt-1" />
      </div>

      {/* Activity feed card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 pb-6 last:pb-0">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
