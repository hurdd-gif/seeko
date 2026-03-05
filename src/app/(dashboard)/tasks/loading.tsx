export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div><div className="h-8 w-48 rounded-md bg-muted" /><div className="mt-2 h-4 w-72 rounded-md bg-muted/80" /></div>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="h-9 flex-1 rounded-md bg-muted/60" />
          <div className="h-9 w-[180px] rounded-md bg-muted/60" />
        </div>
        <div className="flex flex-col divide-y divide-border">
          {[1,2,3,4,5,6].map(i => (
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
