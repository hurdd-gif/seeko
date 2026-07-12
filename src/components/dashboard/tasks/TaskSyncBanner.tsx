/* ─────────────────────────────────────────────────────────
 * Issue-column banner pills (Figma node 4:4935's "Issue synced with
 * GitHub #109" anatomy — 12px-radius pill, 16px leading icon, 13px
 * medium two-tone copy (tinted lead + muted tail), two 24px round
 * trailing icon buttons — restyled from the dark capture onto the
 * light paper language: white + shadow-seeko instead of a 0.5px border).
 *
 * Two occupants of that anatomy:
 *   TaskSyncBanner   — provenance: tasks EKO filed itself
 *   TaskClosedBanner — status: Done/Canceled/Duplicate reminder that
 *                      closed issues shouldn't be updated
 * ───────────────────────────────────────────────────────── */

'use client';

import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles, CircleCheck, CircleSlash, Link as LinkIcon, Check, X } from 'lucide-react';
import { springs } from '@/lib/motion';

function BannerPill({
  taskId,
  icon,
  iconClassName,
  children,
}: {
  taskId: string;
  icon: ReactNode;
  iconClassName: string;
  children: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const shouldReduce = useReducedMotion();

  if (dismissed) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tasks/${taskId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — stay quiet.
    }
  };

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.smooth, delay: 0.06 }}
      className="mb-4 flex items-center gap-2 rounded-[12px] bg-surface-1 py-[8.5px] pl-[12.5px] pr-[8.5px] shadow-seeko">
      <span className={`flex size-4 shrink-0 items-center justify-center ${iconClassName}`}>
        {icon}
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[18px] tracking-[-0.01em]">
        {children}
      </p>
      <button
        type="button"
        aria-label={copied ? 'Link copied' : 'Copy link to issue'}
        onClick={() => void copyLink()}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-faint transition-[background-color,color,scale] duration-150 ease-out hover:bg-wash-4 hover:text-ink active:scale-[0.96]"
      >
        {copied ? <Check className="size-3.5 text-seeko-accent" /> : <LinkIcon className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-faint transition-[background-color,color,scale] duration-150 ease-out hover:bg-wash-4 hover:text-ink active:scale-[0.96]"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}

export function TaskSyncBanner({ taskId }: { taskId: string }) {
  return (
    <BannerPill
      taskId={taskId}
      icon={<Sparkles className="size-3.5" />}
      iconClassName="text-seeko-accent"
    >
      <span className="text-seeko-accent">Issue created by EKO</span>
      <span className="text-ink-faint"> — filed automatically from an agent run</span>
    </BannerPill>
  );
}

/** Statuses whose banner reminds that the issue is closed. */
const CLOSED_BANNER_COPY: Record<string, { lead: string; tone: 'done' | 'muted' }> = {
  Done: { lead: 'This issue is done', tone: 'done' },
  Canceled: { lead: 'This issue was canceled', tone: 'muted' },
  Duplicate: { lead: 'This issue is a duplicate', tone: 'muted' },
};

export function TaskClosedBanner({ taskId, status }: { taskId: string; status: string }) {
  const copy = CLOSED_BANNER_COPY[status];
  if (!copy) return null;

  const done = copy.tone === 'done';
  return (
    <BannerPill
      // Keyed by status so a re-close after reopening resurfaces a dismissed pill.
      key={status}
      taskId={taskId}
      icon={done ? <CircleCheck className="size-3.5" /> : <CircleSlash className="size-3.5" />}
      iconClassName={done ? 'text-seeko-accent' : 'text-ink-faint'}
    >
      <span className={done ? 'text-seeko-accent' : 'text-ink'}>{copy.lead}</span>
      <span className="text-ink-faint"> — closed issues can no longer be updated</span>
    </BannerPill>
  );
}
