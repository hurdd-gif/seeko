export default function InvestorDashboardLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Hero */}
      <div className="pb-4">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="mt-2 h-4 w-72 max-w-full rounded-md bg-muted/80" />
        <div className="mt-1.5 h-3 w-24 rounded bg-muted/60" />
      </div>

      {/* Game Areas card */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-6 pb-2">
          <div className="flex items-center gap-2">
            <div className="size-4 rounded bg-muted/80" />
            <div className="h-6 w-32 rounded bg-muted" />
          </div>
          <div className="mt-1.5 h-4 w-64 rounded bg-muted/70" />
        </div>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-5 w-14 rounded bg-muted/70" />
                </div>
                <div className="h-3 w-full rounded bg-muted/50" />
                <div className="h-3 w-[85%] rounded bg-muted/40" />
                <div>
                  <div className="flex justify-between mb-1.5">
                    <div className="h-3 w-14 rounded bg-muted/50" />
                    <div className="h-3 w-8 rounded bg-muted/50" />
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Tasks + This Week grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent Tasks card */}
        <div className="rounded-xl border border-border bg-card lg:col-span-3">
          <div className="p-6 pb-2">
            <div className="flex items-center gap-2">
              <div className="size-4 rounded bg-muted/80" />
              <div className="h-6 w-36 rounded bg-muted" />
            </div>
            <div className="mt-1.5 h-4 w-72 max-w-full rounded bg-muted/70" />
          </div>
          <div className="px-6 pb-6">
            <div className="flex flex-col divide-y divide-border">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 py-4">
                  <div className="h-4 flex-1 max-w-[80%] rounded bg-muted" />
                  <div className="h-5 w-16 rounded bg-muted/70" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* This Week card */}
        <div className="rounded-xl border border-border bg-card lg:col-span-2">
          <div className="p-6 pb-2">
            <div className="flex items-center gap-2">
              <div className="size-4 rounded bg-muted/80" />
              <div className="h-6 w-28 rounded bg-muted" />
            </div>
            <div className="mt-1.5 h-4 w-40 rounded bg-muted/70" />
          </div>
          <div className="px-6 pb-6">
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted/70" />
                  <div className="h-4 flex-1 rounded bg-muted/60" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
