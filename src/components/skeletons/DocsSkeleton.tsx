import { Skeleton } from '@/components/ui/skeleton';

export function DocsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Heading + subtitle */}
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 mt-1" />
      </div>

      {/* Doc list card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-5 w-5 rounded shrink-0" />
            <Skeleton className="h-4 flex-1 max-w-[200px]" />
            <Skeleton className="h-4 w-16 rounded-full ml-auto hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
