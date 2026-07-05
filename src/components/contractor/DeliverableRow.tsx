// src/components/contractor/DeliverableRow.tsx
import { useId, useRef, useState } from 'react';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import { CARD_DESC, CARD_TITLE, LIGHT_DEPT_BADGE, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { formatDueLabel, parseDeadline } from '@/lib/contractor-buckets';

const STATUS_DOT: Record<string, string> = {
  Backlog: '#c4c4c4',
  Todo: '#c4c4c4',
  'In Progress': '#fbbf24',
  'In Review': '#93c5fd',
  Done: '#0d7aff',
  Canceled: '#c4c4c4',
  Duplicate: '#c4c4c4',
};

const STATUS_PILL: Record<string, string> = {
  Backlog: 'text-[#808080] border-black/[0.08]',
  Todo: 'text-[#808080] border-black/[0.08]',
  'In Progress': 'text-[#946a00] border-[#b8801a]/40 bg-[#b8801a]/10',
  'In Review': 'text-[#3f5fb5] border-[#3f5fb5]/30 bg-[#3f5fb5]/10',
  Done: 'text-[#0a63cc] border-[#0a63cc]/30 bg-[#0a63cc]/10',
  Canceled: 'text-[#9a9a9a] border-black/[0.08]',
  Duplicate: 'text-[#9a9a9a] border-black/[0.08]',
};

async function defaultProgressCommit(id: string, progress: number): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress }),
  });
  if (!res.ok) throw new Error('progress_failed');
}

async function defaultUpload(id: string, files: File[]): Promise<void> {
  const form = new FormData();
  form.append('file', files[0]);
  const res = await fetch(`/api/tasks/${id}/deliverables`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('upload_failed');
}

export type DeliverableRowProps = {
  deliverable: ContractorDeliverable;
  overdue?: boolean;
  delivered?: boolean;
  onProgressCommit?: (id: string, progress: number) => Promise<void>;
  onUpload?: (id: string, files: File[]) => Promise<void>;
};

export function DeliverableRow({
  deliverable,
  overdue = false,
  delivered = false,
  onProgressCommit = defaultProgressCommit,
  onUpload = defaultUpload,
}: DeliverableRowProps) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(deliverable.progress);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const fileInputId = useId();
  const committed = useRef(deliverable.progress);
  const latest = useRef(deliverable.progress);
  const committing = useRef(false);

  const dotColor = overdue && !delivered ? '#f87171' : STATUS_DOT[deliverable.status] ?? '#c4c4c4';
  const deptBadge = deliverable.department ? LIGHT_DEPT_BADGE[deliverable.department] : undefined;
  const dueLabel = deliverable.deadline ? formatDueLabel(parseDeadline(deliverable.deadline)) : 'No deadline';

  async function commitProgress() {
    if (committing.current) return; // a drain loop is already running; it will pick up latest
    if (latest.current === committed.current) return;
    committing.current = true;
    setSaving('saving');
    try {
      while (latest.current !== committed.current) {
        const target = latest.current;
        await onProgressCommit(deliverable.id, target);
        committed.current = target;
      }
      setSaving('idle');
    } catch {
      setSaving('error');
    } finally {
      committing.current = false;
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadState('uploading');
    try {
      await onUpload(deliverable.id, Array.from(files));
      setUploadState('done');
    } catch {
      setUploadState('error');
    }
  }

  return (
    <li className="relative">
      {/* node dot on the spine */}
      <span
        className="absolute -left-[19px] top-[18px] size-2.5 rounded-full ring-4 ring-white"
        style={{ backgroundColor: dotColor }}
        aria-hidden
      />
      <div className="rounded-[14px] border border-[#E8E8E8]/75 bg-white shadow-[0_10px_20px_#D1D1D126]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors active:bg-black/[0.02] ${LIGHT_FOCUS_RING} rounded-[14px]`}
        >
          <span className="flex w-full items-center gap-3">
            <span className={`min-w-0 flex-1 truncate ${CARD_TITLE}`}>{deliverable.name}</span>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL[deliverable.status] ?? STATUS_PILL.Todo}`}
            >
              {deliverable.status}
            </span>
          </span>
          <span className={`flex items-center gap-2 ${CARD_DESC}`}>
            {deptBadge && (
              <span className={`inline-flex items-center rounded-full px-1.5 text-[10px] ${deptBadge}`}>
                {deliverable.department}
              </span>
            )}
            <span className={overdue && !delivered ? 'text-[#d4503e] tabular-nums' : 'tabular-nums'}>
              due {dueLabel}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/[0.06]">
                <span
                  className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(2, Math.min(100, progress))}%`, backgroundColor: dotColor }}
                />
              </span>
              <span className="w-9 text-right text-[11px] tabular-nums text-[#808080]">{progress}%</span>
            </span>
          </span>
        </button>

        {open && (
          <div className="border-t border-black/[0.06] px-4 py-3">
            {deliverable.description && (
              <p className="text-[13px] leading-relaxed text-[#505050]">{deliverable.description}</p>
            )}

            <label htmlFor={`${fileInputId}-range`} className="mt-3 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#969696]">
              Progress
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id={`${fileInputId}-range`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                aria-label="Progress"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setProgress(v);
                  latest.current = v;
                }}
                onPointerUp={commitProgress}
                onKeyUp={commitProgress}
                onBlur={commitProgress}
                className="h-1.5 flex-1 accent-[#0d7aff]"
              />
              <span className="w-10 text-right text-[13px] tabular-nums text-[#111]">{progress}%</span>
            </div>
            {saving === 'saving' && <p className="mt-1 text-[11px] text-[#969696]">Saving…</p>}
            {saving === 'error' && <p className="mt-1 text-[11px] text-[#d4503e]">Couldn’t save — try again.</p>}

            <div className="mt-4">
              <label
                htmlFor={fileInputId}
                className="inline-flex cursor-pointer items-center rounded-[14px] bg-[#f4f4f4] px-4 py-2 text-[13px] font-medium text-[#2a2a2a] transition-colors hover:bg-[#ececec] active:bg-[#e4e4e4]"
              >
                Upload deliverable
              </label>
              <input
                id={fileInputId}
                type="file"
                aria-label="Upload deliverable"
                className="sr-only"
                onChange={(e) => handleUpload(e.target.files)}
              />
              {uploadState === 'uploading' && <span className="ml-3 text-[12px] text-[#969696]">Uploading…</span>}
              {uploadState === 'done' && <span className="ml-3 text-[12px] text-[#15803d]">Uploaded ✓</span>}
              {uploadState === 'error' && <span className="ml-3 text-[12px] text-[#d4503e]">Upload failed</span>}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
