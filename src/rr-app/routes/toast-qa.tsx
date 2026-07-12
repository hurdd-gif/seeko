import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { showRichToast } from '@/components/ui/rich-toast';
import {
  TaskDeleteUndoToastSlot,
  UNDO_WINDOW_MS,
} from '@/components/dashboard/tasks/TaskDeleteUndoToast';
import { LiveToastContainer } from '@/components/dashboard/notifications/LiveToastContainer';
import { useLiveToast } from '@/components/dashboard/notifications/LiveToastContext';
import type { Notification, NotificationKind } from '@/lib/types';

/* No-backend visual-QA preview for ALL THREE toast systems (sonner defaults,
 * showRichToast cards, realtime LiveToastCard popups), reachable at /toast-qa
 * WITHOUT any loader gate. All three follow the Delphi alert language — warm
 * off-white flat card, 18px radius, no shadow; error takes the red tint.
 *
 * The dark/light split background checks the floating card against both kinds
 * of underlying content. NOT a migration target — absent from routeInventory. */

const LIVE_KINDS: NotificationKind[] = [
  'task_assigned',
  'payment_denied',
  'comment_reply',
  'deliverable_uploaded',
];

let qaSeq = 0;

function makeNotification(kind: NotificationKind): Notification {
  qaSeq += 1;
  return {
    id: `toast-qa-${qaSeq}`,
    user_id: 'qa-user',
    kind,
    title:
      kind === 'payment_denied'
        ? 'Payment denied'
        : kind === 'comment_reply'
          ? 'New reply on your comment'
          : kind === 'deliverable_uploaded'
            ? 'Deliverable uploaded'
            : 'New task assigned to you',
    body: '#204 · Boss arena lighting pass',
    link: '/tasks',
    read: false,
    created_at: new Date().toISOString(),
  } as Notification;
}

function QaButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[13px] text-white/80 transition-colors hover:bg-white/[0.12] active:scale-95"
    >
      {label}
    </button>
  );
}

export function ToastQaRoute() {
  const { addLiveToast } = useLiveToast();
  const [kindIdx, setKindIdx] = useState(0);

  // Task-delete undo toast — in the app the parent (TasksBoard) owns the
  // window timer; here a local timeout mirrors it so the drain lines up.
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showUndoToast = () => {
    clearTimeout(undoTimerRef.current);
    setPendingDeleteName('Boss arena lighting pass');
    undoTimerRef.current = setTimeout(() => setPendingDeleteName(null), UNDO_WINDOW_MS);
  };
  const clearUndoToast = () => {
    clearTimeout(undoTimerRef.current);
    setPendingDeleteName(null);
  };
  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Dark half — the app's primary surface */}
      <div className="flex flex-1 flex-col gap-6 bg-[#111110] p-10">
        <p className="text-sm text-white/50">
          Toast QA — sonner (top-center), rich toast (top-center), live toast (bottom-center)
        </p>
        <div className="flex flex-wrap gap-2">
          <QaButton label="sonner success" onClick={() => toast.success('Task updated')} />
          <QaButton
            label="sonner success + desc"
            onClick={() =>
              toast.success('Invite sent', { description: 'ada@seeko.studio will get an email shortly.' })
            }
          />
          <QaButton
            label="sonner error"
            onClick={() =>
              toast.error('Failed to save changes', { description: 'The server rejected the request. Try again.' })
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <QaButton
            label="rich success"
            onClick={() =>
              showRichToast({
                variant: 'success',
                title: 'Issue created',
                subject: { identifier: 'DIH-29', label: 'Contract_portal' },
                action: { label: 'View issue', href: '/tasks' },
              })
            }
          />
          <QaButton
            label="rich error"
            onClick={() =>
              showRichToast({
                variant: 'error',
                title: 'Payment failed',
                subject: { identifier: 'PAY-114', label: 'June contractor invoice' },
                action: { label: 'Retry payment', href: '/payments' },
              })
            }
          />
          <QaButton
            label="rich info"
            onClick={() => showRichToast({ variant: 'info', title: 'Sync in progress' })}
          />
          <QaButton
            label="rich warning"
            onClick={() =>
              showRichToast({
                variant: 'warning',
                title: 'Storage almost full',
                subject: { label: '92% of 10 GB used' },
              })
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <QaButton label="task delete undo" onClick={showUndoToast} />
          <QaButton
            label="live toast (cycles kind)"
            onClick={() => {
              addLiveToast(makeNotification(LIVE_KINDS[kindIdx % LIVE_KINDS.length]!));
              setKindIdx((i) => i + 1);
            }}
          />
        </div>
      </div>

      {/* Light half — checks the card against light content too */}
      <div className="flex-1 bg-[#f4f2ee] p-10">
        <p className="text-sm text-[#807e78]">
          Light surface — toasts float over this half when stacked low / bottom.
        </p>
      </div>

      <TaskDeleteUndoToastSlot
        pendingTaskName={pendingDeleteName}
        onUndo={clearUndoToast}
        onCommit={clearUndoToast}
      />
      <LiveToastContainer onTapToast={() => {}} onOpenPanel={() => {}} />
    </div>
  );
}
