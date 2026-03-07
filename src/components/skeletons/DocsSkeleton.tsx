import { Skeleton } from '@/components/ui/skeleton';

export function DocsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" style={{ marginLeft: i % 3 === 0 ? 0 : 24 }} />
        ))}
      </div>
    </div>
  );
}
