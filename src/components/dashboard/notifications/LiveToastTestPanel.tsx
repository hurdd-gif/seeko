'use client';

/* ─────────────────────────────────────────────────────────
 * LIVE TOAST TEST PANEL — DialKit for previewing toasts
 *
 * Floating button (bottom-left) that triggers fake
 * notifications so you can see how live toasts look.
 * Only rendered in development.
 * ───────────────────────────────────────────────────────── */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, X } from 'lucide-react';
import { useLiveToast } from './LiveToastContext';
import type { Notification, NotificationKind } from '@/lib/types';

const SAMPLE_NOTIFICATIONS: Array<{ kind: NotificationKind; title: string; body?: string; link?: string }> = [
  { kind: 'task_assigned', title: 'You were assigned "Design Landing Page"', body: 'Due in 3 days', link: '/tasks' },
  { kind: 'mentioned', title: 'Karti mentioned you in a comment', body: 'Hey, can you check this out?', link: '/tasks' },
  { kind: 'comment_reply', title: 'New reply on "API Integration"', body: 'Looks good, ship it!', link: '/tasks' },
  { kind: 'task_completed', title: '"Logo Design" was marked complete', link: '/tasks' },
  { kind: 'payment_request', title: 'Payment request: $450.00', body: 'For character animation work', link: '/payments' },
  { kind: 'deliverable_uploaded', title: 'New deliverable on "3D Models"', body: 'character_v2.fbx uploaded', link: '/tasks' },
  { kind: 'task_handoff', title: '"Sound Design" was handed off to you', link: '/tasks' },
  { kind: 'payment_approved', title: 'Payment of $1,200 approved', link: '/payments' },
  { kind: 'task_submitted_review', title: '"UI Mockups" submitted for review', link: '/tasks' },
  { kind: 'task_review_approved', title: '"UI Mockups" review approved', body: 'Great work!', link: '/tasks' },
];

let counter = 0;

function makeFakeNotification(sample: typeof SAMPLE_NOTIFICATIONS[number]): Notification {
  counter++;
  return {
    id: `test-${Date.now()}-${counter}`,
    user_id: 'test-user',
    kind: sample.kind,
    title: sample.title,
    body: sample.body,
    link: sample.link,
    read: false,
    created_at: new Date().toISOString(),
  };
}

export function LiveToastTestPanel() {
  const [expanded, setExpanded] = useState(false);
  const { addLiveToast } = useLiveToast();

  const fireRandom = useCallback(() => {
    const sample = SAMPLE_NOTIFICATIONS[Math.floor(Math.random() * SAMPLE_NOTIFICATIONS.length)];
    addLiveToast(makeFakeNotification(sample));
  }, [addLiveToast]);

  const fireBurst = useCallback(() => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const sample = SAMPLE_NOTIFICATIONS[Math.floor(Math.random() * SAMPLE_NOTIFICATIONS.length)];
        addLiveToast(makeFakeNotification(sample));
      }, i * 300);
    }
  }, [addLiveToast]);

  const fireSpecific = useCallback((kind: NotificationKind) => {
    const sample = SAMPLE_NOTIFICATIONS.find(s => s.kind === kind) ?? SAMPLE_NOTIFICATIONS[0];
    addLiveToast(makeFakeNotification(sample));
  }, [addLiveToast]);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="mb-2 w-64 rounded-xl bg-[#1a1a1a] border border-white/[0.08] p-3 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-foreground">Toast Tester</span>
              <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={fireRandom}
                className="w-full rounded-lg bg-seeko-accent/15 px-3 py-2 text-left text-xs font-medium text-seeko-accent hover:bg-seeko-accent/25 transition-colors"
              >
                Fire random notification
              </button>
              <button
                onClick={fireBurst}
                className="w-full rounded-lg bg-amber-500/15 px-3 py-2 text-left text-xs font-medium text-amber-400 hover:bg-amber-500/25 transition-colors"
              >
                Fire burst (5 rapid)
              </button>

              <div className="pt-2 border-t border-white/[0.06]">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">By kind</p>
                <div className="grid grid-cols-2 gap-1">
                  {(['task_assigned', 'mentioned', 'comment_reply', 'payment_request', 'task_completed', 'deliverable_uploaded'] as NotificationKind[]).map(kind => (
                    <button
                      key={kind}
                      onClick={() => fireSpecific(kind)}
                      className="rounded-md bg-white/[0.04] px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-colors truncate"
                    >
                      {kind.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setExpanded(v => !v)}
        className="flex size-10 items-center justify-center rounded-full bg-seeko-accent text-black shadow-lg"
      >
        <Zap className="size-4" />
      </motion.button>
    </div>
  );
}
