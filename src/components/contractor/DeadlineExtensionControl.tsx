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

/* Pending-request amber — reuses the existing awaiting-decision amber already
 * established by LIGHT_SIGNING_STATUS.pending (lightKit.ts:75) rather than
 * inventing a new hue: same "blocked on someone else's decision" semantic
 * (there, an external signer; here, an admin). Still distinct from the neutral
 * grey the light theme uses for payment `pending` (SettingsPanel.tsx) — that's
 * a "waiting in a queue" state, not "waiting on a decision". #946a00 on white
 * ≈ 4.86:1, clears AA (4.5:1) for normal text. */
const PENDING_AMBER = '#946a00';

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
 * "Show N earlier"): ink ramp on hover/active, no scale (this is a quiet
 * inline affordance, not a filled control — the color step already reads as
 * feedback and matches its siblings on the same spine).
 *
 * DEVIATION from those siblings, visual-QA pass 2026-07-06: resting color is
 * `ink` (#3a3a3a, 10.5:1) rather than `ink-faint` (#969696, ~2.96:1) — this is
 * the ONLY entry/recovery path in the control (not decorative sublining), so
 * the resting state itself must clear WCAG AA (4.5:1), not just the
 * hover/active steps. hover/active are unchanged (hover is now a same-tier
 * no-op, active still deepens to #111). Also carries `py-1.5` +
 * `inline-flex items-center` to grow the ~75×16.5px tap target toward the
 * mobile 44px floor without changing the visible text footprint. Local to
 * this file, used only for the two labels below — does not touch the shared
 * `lightKit` ghost-link tokens used elsewhere in the portal. */
const GHOST_LINK =
  'inline-flex items-center py-2 text-[12px] font-medium text-ink transition-colors duration-150 ease-out hover:text-ink active:text-ink-title motion-reduce:transition-none';

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

  // Pending — quiet amber pill, no request affordance. Checked first so a
  // pending request always wins regardless of `open`: there's no "cancel out
  // of pending", the affordance is fully suppressed.
  if (ext && ext.status === 'pending') {
    return (
      <p className="flex min-h-7 items-center gap-1.5 text-[12px] font-medium" style={{ color: PENDING_AMBER }}>
        <CalendarClock className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
        Extension requested — pending
        {/* ink-faint (#969696, ~2.96:1) failed AA on this date — it's the one
         * hard fact in the pending state, not decorative sublining. Raised to
         * ink-muted-strong (#686868, 4.9:1), the token's own documented "AA
         * floor" tier (globals.css) — one step lighter than the ghost-link
         * labels' `ink` since this is supporting data inside an already-amber
         * pill, not the primary actionable text. */}
        <span className="tabular-nums text-ink-muted-strong">· {fmt(ext.requested_deadline)}</span>
      </p>
    );
  }

  async function submit() {
    if (!date) return;
    setSubmitting(true);
    setError(false);
    // Snapshot the resting state — null for a fresh request, the denied
    // record for a "Request again" — so a failed submit restores exactly
    // what was showing before, not a hardcoded "none" that would erase a
    // denial note the contractor still needs to see.
    const restingExt = ext;
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
      setExt(restingExt);
      setError(true);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  // Inline request form — `open` alone controls this overlay. `ext` (e.g. a
  // denied record) is never touched to open it, so Cancel has nothing to
  // restore: closing the form just reveals the untouched resting state below.
  if (open) {
    return (
      <div className="max-w-[320px] rounded-xl bg-surface-1 p-3 ring-1 ring-hairline">
        <label className="block text-[11px] font-medium text-ink-faint" htmlFor={`ext-date-${taskId}`}>
          New deadline
        </label>
        {/* Date + reason fields signal focus with a brand-blue ring-color
         * change, following the LIGHT_INPUT focus idiom (lightKit.ts,
         * user-decided 2026-07-03: border/ring color-change, not a diffuse
         * glow). That's a scoped idiom for this form, not a codebase-wide
         * rule — several inputs elsewhere (e.g. StepNode.tsx in this same
         * contractor/ directory) do use a focus-visible:ring glow. */}
        <input
          id={`ext-date-${taskId}`}
          type="date"
          min={min}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg bg-surface-1 px-2.5 py-1.5 text-[13px] tabular-nums text-ink ring-1 ring-hairline transition-[box-shadow] duration-150 ease-out focus:outline-none focus:ring-seeko-accent motion-reduce:transition-none"
        />
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          aria-label="Reason (optional)"
          rows={2}
          maxLength={500}
          className="mt-2 w-full resize-none rounded-lg bg-surface-1 px-2.5 py-1.5 text-[13px] text-ink ring-1 ring-hairline transition-[box-shadow] duration-150 ease-out placeholder:text-ink-faintest focus:outline-none focus:ring-seeko-accent motion-reduce:transition-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(false);
            }}
            className="inline-flex items-center py-1.5 text-[11px] text-ink-faint transition-colors duration-150 ease-out hover:text-ink active:text-ink-title motion-reduce:transition-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!date || submitting}
            className="inline-flex items-center gap-1 rounded-full bg-ink-title px-3 py-1 text-[11px] font-medium text-surface-1 transition-[transform,background-color] duration-150 ease-out hover:bg-ink-strong active:scale-[0.98] disabled:opacity-100 disabled:bg-wash-6 disabled:text-ink-faintest motion-reduce:transition-none motion-reduce:active:scale-100"
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
        {error && <p className="mt-1 text-[11px] text-danger">Couldn’t request — try again.</p>}
      </div>
    );
  }

  // Denied (latest) — one footer row: the fact on the left (icon-led, same
  // CalendarClock grammar as pending — every footer row is "about the
  // deadline"), the recovery action inline on the right. The old stacked
  // note + link read as loose prose (user call 2026-07-11).
  if (ext && ext.status === 'denied') {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-pretty text-[12px] text-ink-faint">
            <CalendarClock className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="min-w-0">
              Extension denied
              {ext.denial_reason ? <span className="text-ink"> — {ext.denial_reason}</span> : null}
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setError(false);
            }}
            className={`shrink-0 ${GHOST_LINK}`}
          >
            Request again
          </button>
        </div>
        {error && <p className="mt-0.5 text-[11px] text-danger">Couldn’t request — try again.</p>}
      </div>
    );
  }

  // None / approved (superseded) — request affordance, icon-led like its
  // sibling rows so the footer keeps one visual grammar.
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(false);
        }}
        className={`gap-1.5 ${GHOST_LINK}`}
      >
        <CalendarClock className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
        Request more time
      </button>
      {error && <p className="mt-0.5 text-[11px] text-danger">Couldn’t request — try again.</p>}
    </div>
  );
}
