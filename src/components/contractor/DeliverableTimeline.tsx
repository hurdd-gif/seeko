import type { Bucket } from '@/lib/contractor-buckets';
import { DeliverableRow } from './DeliverableRow';

export type DeliverableTimelineProps = {
  buckets: Bucket[];
  onProgressCommit?: (id: string, progress: number) => Promise<void>;
  onUpload?: (id: string, files: File[]) => Promise<void>;
};

export function DeliverableTimeline({ buckets, onProgressCommit, onUpload }: DeliverableTimelineProps) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-[20px] border border-[#E8E8E8]/75 bg-white px-6 py-10 text-center shadow-[0_10px_20px_#D1D1D126]">
        <p className="text-[15px] font-medium text-[#454545]">No deliverables assigned yet</p>
        <p className="mt-1 text-sm text-[#969696]">New work will show up here.</p>
      </div>
    );
  }

  return (
    <div>
      {buckets.map((b) => (
        <section key={b.key} className="mb-6 last:mb-0">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#969696]">{b.label}</h2>
          <div className="relative pl-5">
            <div className="absolute bottom-2 left-[4px] top-2 w-px bg-black/[0.08]" aria-hidden />
            <ul className="space-y-3">
              {b.items.map((d) => (
                <DeliverableRow
                  key={d.id}
                  deliverable={d}
                  overdue={b.key === 'overdue'}
                  delivered={b.key === 'delivered'}
                  onProgressCommit={onProgressCommit}
                  onUpload={onUpload}
                />
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
