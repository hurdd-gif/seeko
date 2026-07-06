// src/components/contractor/DeadlineExtensionControl.tsx
import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import type { LatestExtension } from '@/lib/contractor-index';

export type DeadlineExtensionControlProps = {
  taskId: string;
  deadline: string; // current deadline YYYY-MM-DD (caller guarantees non-null)
  latestExtension: LatestExtension | null;
  now: Date;
  onRequest?: (taskId: string, requestedDeadline: string, reason: string) => Promise<LatestExtension>;
};

/* Pending-request amber — deliberately distinct from the neutral grey the rest of
 * the light theme uses for payment `pending` (SettingsPanel.tsx): this pending
 * state is "awaiting an admin decision on a request", not "awaiting payment", so
 * it earns its own hue rather than reusing that neutral. AA on white (~5.9:1). */
const PENDING_AMBER = '#a16207';

async function defaultRequest(
  taskId: string,
  requestedDeadline: string,
  reason: string,
): Promise<LatestExtension> {
  const res = await fetch('/api/deadline-extensions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, requestedDeadline, reason: reason || undefined }),
  });
  if (!res.ok) throw new Error('request_failed');
  const data = (await res.json()) as {
    extension: { id: string; requested_deadline: string; reason: string | null; status: string };
  };
  return {
    id: data.extension.id,
    status: data.extension.status as LatestExtension['status'],
    requested_deadline: data.extension.requested_deadline,
    reason: data.extension.reason ?? null,
    denial_reason: null,
  };
}

const fmt = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Day after the current deadline, as YYYY-MM-DD — the min selectable date. */
function dayAfter(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0]!;
}

/* Ghost text-button — matches the established sibling pattern in this same
 * directory (DeliverableSteps.tsx "N done" toggle, CompletedTimeline.tsx
 * "Show N earlier"): three-step ink ramp on hover/active, no scale (this is a
 * quiet inline affordance, not a filled control — the color step already reads
 * as feedback and matches its siblings on the same spine). */
const GHOST_LINK =
  'text-[11px] font-medium text-ink-faint transition-colors duration-150 ease-out hover:text-ink active:text-[#111] motion-reduce:transition-none';

/**
 * Contractor-facing deadline-extension affordance for one deliverable heading.
 * Quiet by design — no card, no modal. Renders one of four shapes depending on
 * the latest extension request for this task:
 *   - none, or the latest was `approved` (superseded — deadline already moved)
 *       → "Request more time" link that expands an inline date+reason form
 *   - `pending`  → an amber pill, request affordance suppressed
 *   - `denied`   → a muted note (+ denial reason) and a "Request again" link
 * A deliverable with no deadline can't be extended, so callers render this
 * only when `deadline` is non-null (see DeliverableSteps.tsx).
 */
export function DeadlineExtensionControl({
  taskId,
  deadline,
  latestExtension,
  onRequest = defaultRequest,
}: DeadlineExtensionControlProps) {
  const [ext, setExt] = useState<LatestExtension | null>(latestExtension);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const min = dayAfter(deadline);

  // Pending — quiet amber pill, no request affordance.
  if (ext && ext.status === 'pending') {
    return (
      <p className="mt-1 flex items-center gap-1.5 pl-6 text-[11px] font-medium" style={{ color: PENDING_AMBER }}>
        <CalendarClock className="size-3" strokeWidth={2.5} aria-hidden />
        Extension requested — pending
        <span className="tabular-nums text-ink-faint">· {fmt(ext.requested_deadline)}</span>
      </p>
    );
  }

  // Denied (latest) — subtle note + optional denial reason + request again.
  if (ext && ext.status === 'denied') {
    return (
      <div className="mt-1 pl-6">
        <p className="text-[11px] text-ink-faint">
          Extension denied
          {ext.denial_reason ? <span className="text-ink"> — {ext.denial_reason}</span> : null}
        </p>
        <button
          type="button"
          onClick={() => {
            setExt(null);
            setOpen(true);
          }}
          className={`mt-0.5 ${GHOST_LINK}`}
        >
          Request again
        </button>
      </div>
    );
  }

  // None / approved (superseded) — request affordance.
  async function submit() {
    if (!date) return;
    setSubmitting(true);
    setError(false);
    const optimistic: LatestExtension = {
      id: 'optimistic',
      status: 'pending',
      requested_deadline: date,
      reason: reason.trim() || null,
      denial_reason: null,
    };
    setExt(optimistic);
    try {
      const saved = await onRequest(taskId, date, reason.trim());
      setExt(saved);
      setOpen(false);
    } catch {
      // Revert all the way back to the closed "none" state — the error reads
      // against the request affordance the contractor will retry from, not
      // against a form they might assume is still mid-submit.
      setExt(null);
      setError(true);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(false);
          }}
          className={`ml-6 ${GHOST_LINK}`}
        >
          Request more time
        </button>
        {error && <p className="ml-6 mt-0.5 text-[11px] text-[#d4503e]">Couldn’t request — try again.</p>}
      </div>
    );
  }

  return (
    <div className="mt-1.5 ml-6 max-w-[320px] rounded-xl bg-[#fafafa] p-3 ring-1 ring-hairline">
      <label className="block text-[11px] font-medium text-ink-faint" htmlFor={`ext-date-${taskId}`}>
        New deadline
      </label>
      <input
        id={`ext-date-${taskId}`}
        type="date"
        min={min}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mt-1 w-full rounded-lg bg-white px-2.5 py-1.5 text-[13px] tabular-nums text-ink ring-1 ring-hairline transition-[box-shadow] duration-150 ease-out focus:outline-none focus:ring-[#0d7aff] motion-reduce:transition-none"
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        aria-label="Reason (optional)"
        rows={2}
        maxLength={500}
        className="mt-2 w-full resize-none rounded-lg bg-white px-2.5 py-1.5 text-[13px] text-ink ring-1 ring-hairline transition-[box-shadow] duration-150 ease-out placeholder:text-ink-faintest focus:outline-none focus:ring-[#0d7aff] motion-reduce:transition-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(false);
          }}
          className="text-[11px] text-ink-faint transition-colors duration-150 ease-out hover:text-ink active:text-[#111] motion-reduce:transition-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!date || submitting}
          className="inline-flex items-center gap-1 rounded-full bg-[#111] px-3 py-1 text-[11px] font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-[#2a2a2a] active:scale-[0.98] disabled:opacity-100 disabled:bg-black/[0.06] disabled:text-black/35 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          {submitting ? (
            'Submitting…'
          ) : (
            <>
              <Check className="size-3" strokeWidth={2.5} aria-hidden /> Submit
            </>
          )}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-[#d4503e]">Couldn’t request — try again.</p>}
    </div>
  );
}
