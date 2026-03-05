export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div><div className="h-8 w-48 rounded-md bg-muted" /><div className="mt-2 h-4 w-72 rounded-md bg-muted/80" /></div>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-36 rounded bg-muted" /><div className="mt-1 h-4 w-64 rounded bg-muted/80" />
        <div className="mt-6 space-y-0">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex gap-3 pb-6 last:pb-0">
              <div className="size-8 shrink-0 rounded-full bg-muted/60" />
              <div className="flex-1 space-y-1 pt-0.5"><div className="h-4 w-full max-w-md rounded bg-muted/60" /><div className="h-3 w-16 rounded bg-muted/40" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
