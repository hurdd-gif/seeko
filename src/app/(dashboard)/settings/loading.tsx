export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div><div className="h-8 w-48 rounded-md bg-muted" /><div className="mt-2 h-4 w-72 rounded-md bg-muted/80" /></div>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-20 rounded bg-muted" /><div className="mt-1 h-4 w-72 rounded bg-muted/80" />
        <div className="mt-6 flex items-center gap-4">
          <div className="size-16 shrink-0 rounded-full bg-muted/60" />
          <div className="space-y-1"><div className="h-4 w-32 rounded bg-muted/60" /><div className="h-3 w-48 rounded bg-muted/40" /></div>
        </div>
      </div>
    </div>
  );
}
