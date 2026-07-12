// src/components/dashboard/tasks/DeadlineExtensionBanner.tsx
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { PendingExtension } from '@/lib/types';

export type DeadlineExtensionBannerProps = {
  extension: PendingExtension;
  onDecide?: (action: 'approve' | 'deny', reason?: string) => Promise<void>;
};

const fmt = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* Awaiting-decision amber — reuses the codebase's established shared
 * "pending decision" amber (LIGHT_SIGNING_STATUS.pending, the sibling
 * DeadlineExtensionControl's own pending pill) rather than inventing a new
 * one, for cross-surface consistency. Note this value also equals
 * lightKit.ts's LIGHT_DEPT_COLOR.Animation — that's an existing coincidence
 * in the palette, not something this reuse avoids. It's harmless here: this
 * page's department dots render Animation as `#fbbf24`, so nothing on this
 * screen collides with it. */
const PENDING_AMBER = '#946a00';

async function defaultDecide(id: string, action: 'approve' | 'deny', reason?: string): Promise<void> {
  const res = await fetch(`/api/deadline-extensions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason: action === 'deny' ? (reason?.trim() || undefined) : undefined }),
  });
  if (!res.ok) throw new Error('decision_failed');
}

export function DeadlineExtensionBanner({ extension, onDecide }: DeadlineExtensionBannerProps) {
  const [denyMode, setDenyMode] = useState(false);
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  if (done) return null;

  async function decide(action: 'approve' | 'deny') {
    setDeciding(true);
    setError(false);
    try {
      if (onDecide) await onDecide(action, action === 'deny' ? reason : undefined);
      else await defaultDecide(extension.id, action, reason);
      // Settle out instead of vanishing instantly — matches this page's other
      // entrances (FadeRise) with a symmetric, subtle exit. The 180ms delay
      // mirrors the CSS transition duration below so unmount lands after the
      // fade completes; reduced-motion users skip the animated step (the CSS
      // transition is a no-op for them) but still get the same timed handoff.
      setLeaving(true);
      window.setTimeout(() => setDone(true), 180);
    } catch {
      setError(true);
    } finally {
      setDeciding(false);
    }
  }

  return (
    <section
      className={`mb-4 rounded-2xl bg-[#fffaf0] dark:bg-dept-wash-animation/[0.08] p-4 ring-1 ring-[#f0d9a8] dark:ring-dept-wash-animation/25 shadow-seeko transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
        leaving ? 'pointer-events-none scale-[0.98] opacity-0' : 'scale-100 opacity-100'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <CalendarClock className="mt-0.5 size-4 shrink-0" style={{ color: PENDING_AMBER }} strokeWidth={2} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-[1.4] text-ink-title">
            <span className="font-medium">{extension.requesterName}</span> requested a deadline extension
          </p>
          <p className="mt-0.5 text-[12px] tabular-nums text-ink-muted">
            {fmt(extension.originalDeadline)} → {fmt(extension.requestedDeadline)}
          </p>
          {extension.reason && (
            <p className="mt-1 text-[13px] leading-[1.5] text-ink">“{extension.reason}”</p>
          )}
        </div>
      </div>

      {denyMode ? (
        <div className="mt-3 space-y-2 pl-[26px]">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-lg bg-surface-1 px-2.5 py-1.5 text-[13px] text-ink-title ring-1 ring-wash-8 transition-[box-shadow] duration-150 ease-out placeholder:text-ink-faintest focus:outline-none focus:ring-2 focus:ring-ink-title/15 motion-reduce:transition-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => decide('deny')}
              disabled={deciding}
              className="rounded-full bg-[#c0392b] px-3 py-1.5 text-[12px] font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-[#a93226] active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {deciding ? 'Denying…' : 'Confirm deny'}
            </button>
            <button
              type="button"
              onClick={() => { setDenyMode(false); setReason(''); }}
              className="text-[12px] text-ink-muted transition-colors duration-150 ease-out hover:text-ink-title motion-reduce:transition-none"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 pl-[26px]">
          <button
            type="button"
            onClick={() => decide('approve')}
            disabled={deciding}
            className="rounded-full bg-ink-title px-3.5 py-1.5 text-[12px] font-medium text-surface-1 transition-[transform,background-color] duration-150 ease-out hover:bg-[#000] active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {deciding ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => setDenyMode(true)}
            disabled={deciding}
            className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-ink ring-1 ring-wash-10 transition-[background-color,transform] duration-150 ease-out hover:bg-wash-3 active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Deny
          </button>
        </div>
      )}
      {error && <p className="mt-2 pl-[26px] text-[12px] text-[#c0392b]">Couldn’t save — try again.</p>}
    </section>
  );
}
