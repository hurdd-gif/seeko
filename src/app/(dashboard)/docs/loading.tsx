export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div><div className="h-8 w-48 rounded-md bg-muted" /><div className="mt-2 h-4 w-72 rounded-md bg-muted/80" /></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="h-9 flex-1 rounded-md bg-muted/60" /><div className="h-9 w-[180px] rounded-md bg-muted/60" />
      </div>
      <div className="flex flex-col gap-3">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="size-9 shrink-0 rounded-md bg-muted/60" />
              <div className="flex-1 space-y-2"><div className="h-4 w-48 rounded bg-muted/60" /><div className="h-3 w-24 rounded bg-muted/40" /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
