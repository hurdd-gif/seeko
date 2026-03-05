'use client';

import { usePathname } from 'next/navigation';

/**
 * Route-specific loading skeletons so each page shows a skeleton that matches its layout.
 */
export default function DashboardLoading() {
  const pathname = usePathname();

  if (pathname === '/' || pathname === '') {
    return <OverviewSkeleton />;
  }
  if (pathname.startsWith('/tasks')) {
    return <TasksSkeleton />;
  }
  if (pathname.startsWith('/team')) {
    return <TeamSkeleton />;
  }
  if (pathname.startsWith('/docs')) {
    return <DocsSkeleton />;
  }
  if (pathname.startsWith('/activity')) {
    return <ActivitySkeleton />;
  }
  if (pathname.startsWith('/settings')) {
    return <SettingsSkeleton />;
  }

  return <GenericSkeleton />;
}

function SkeletonTitle() {
  return (
    <div>
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="mt-2 h-4 w-72 rounded-md bg-muted/80" />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <SkeletonTitle />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-3 h-8 w-16 rounded bg-muted/80" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-3">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="mt-1 h-4 w-56 rounded bg-muted/80" />
          <div className="mt-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-md bg-muted/60" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <div className="h-5 w-36 rounded bg-muted" />
          <div className="mt-1 h-4 w-44 rounded bg-muted/80" />
          <div className="mt-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted/60" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-full rounded bg-muted/60" />
                  <div className="h-3 w-24 rounded bg-muted/40" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TasksSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <SkeletonTitle />
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="h-9 flex-1 rounded-md bg-muted/60" />
          <div className="h-9 w-[180px] rounded-md bg-muted/60" />
        </div>
        <div className="flex flex-col divide-y divide-border">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-4 w-4 shrink-0 rounded bg-muted/60" />
              <div className="h-4 w-4 shrink-0 rounded bg-muted/60" />
              <div className="h-4 flex-1 max-w-xs rounded bg-muted/60" />
              <div className="h-5 w-16 rounded bg-muted/40" />
              <div className="h-5 w-14 rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <SkeletonTitle />
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="mt-1 h-4 w-48 rounded bg-muted/80" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-muted/60" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 rounded bg-muted/60" />
                <div className="h-3 w-48 rounded bg-muted/40" />
              </div>
              <div className="h-6 w-20 rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="mt-1 h-4 w-40 rounded bg-muted/80" />
        <div className="mt-6 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-muted/60" />
              <div className="h-4 w-28 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <SkeletonTitle />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="h-9 flex-1 rounded-md bg-muted/60" />
        <div className="h-9 w-[180px] rounded-md bg-muted/60" />
      </div>
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="size-9 shrink-0 rounded-md bg-muted/60" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-muted/60" />
                <div className="h-3 w-24 rounded bg-muted/40" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <SkeletonTitle />
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="mt-1 h-4 w-64 rounded bg-muted/80" />
        <div className="relative mt-6 space-y-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 pb-6 last:pb-0">
              <div className="relative z-10 size-8 shrink-0 rounded-full bg-muted/60" />
              <div className="flex-1 space-y-1 pt-0.5">
                <div className="h-4 w-full max-w-md rounded bg-muted/60" />
                <div className="h-3 w-16 rounded bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <SkeletonTitle />
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="mt-1 h-4 w-72 rounded bg-muted/80" />
        <div className="mt-6 flex items-center gap-4">
          <div className="size-16 shrink-0 rounded-full bg-muted/60" />
          <div className="space-y-1">
            <div className="h-4 w-32 rounded bg-muted/60" />
            <div className="h-3 w-48 rounded bg-muted/40" />
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-muted/60" />
            <div className="h-9 w-full rounded-md bg-muted/60" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-muted/60" />
            <div className="h-9 w-full rounded-md bg-muted/60" />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <div className="h-9 w-28 rounded-md bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

function GenericSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <SkeletonTitle />
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="mt-1 h-4 w-56 rounded bg-muted/80" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-md bg-muted/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
