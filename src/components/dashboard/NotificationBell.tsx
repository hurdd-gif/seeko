'use client';

/* ─────────────────────────────────────────────────────────
 * NOTIFICATION BELL — ANIMATION STORYBOARD
 *
 * Desktop:
 *   bell     morphs to X icon when panel is open (rotate + crossfade)
 *   panel    drops down from bell, scale 0.95 → 1 (smooth spring)
 *   cards    stagger fade+rise, 30ms per card
 *   dismiss  hover-reveal X + drag-to-dismiss (snappy spring)
 *   stacks   ghost cards peek behind grouped notifications
 *   new      real-time notification slides in from top (spring)
 *   close    scale 1 → 0.95, opacity 1 → 0 (smooth spring)
 *
 * Mobile:
 *   open     full-screen sheet slides up from bottom (spring)
 *   cards    stagger fade+rise, 20ms per card
 *   swipe    drag-to-dismiss (threshold 100px)
 *   close    sheet slides down + backdrop fades (200ms)
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useRouter } from '@/lib/react-router-adapters';
import { createBrowserClient } from '@supabase/ssr';
import { Notification } from '@/lib/types';
import { useIsDesktop } from '@/lib/hooks/useIsDesktop';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { BellToggle } from './notifications/BellToggle';
import { DesktopNotificationPanel } from './notifications/DesktopNotificationPanel';
import { MobileNotificationSheet } from './notifications/MobileNotificationSheet';
import { groupNotificationsFlat } from './notifications/utils';
import type { DisplayNotification } from './notifications/types';
import { useLiveToast } from './notifications/LiveToastContext';
import { LiveToastContainer } from './notifications/LiveToastContainer';

interface NotificationBellProps {
  userId: string;
  initialCount: number;
  initialNotifications: Notification[];
  /** Relight the trigger for a light surface (StudioHeaderActions). Default dark. */
  light?: boolean;
}

export function NotificationBell({ userId, initialCount, initialNotifications, light = false }: NotificationBellProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [mounted, setMounted] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { addLiveToast, setSuppress } = useLiveToast();

  useEffect(() => { setMounted(true); }, []);

  // Suppress toasts when notification panel is open
  useEffect(() => {
    setSuppress(open);
  }, [open, setSuppress]);

  // Lock body scroll on mobile when sheet is open
  useEffect(() => {
    if (!isDesktop && open) {
      acquireScrollLock();
      document.body.style.overflow = 'hidden';
      return () => {
        releaseScrollLock();
        document.body.style.overflow = '';
      };
    }
  }, [isDesktop, open]);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  // Close on click outside (desktop)
  useEffect(() => {
    if (!open || !isDesktop) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (bellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, isDesktop]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const notif = payload.new as Notification;
          setNotifications(prev => [notif, ...prev].slice(0, 20));
          setUnreadCount(c => c + 1);
          addLiveToast(notif);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev => {
            const next = prev.map(n => n.id === updated.id ? { ...n, read: updated.read } : n);
            setUnreadCount(next.filter(n => !n.read).length);
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setNotifications(prev => {
            const next = prev.filter(n => n.id !== deletedId);
            setUnreadCount(next.filter(n => !n.read).length);
            return next;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase]);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  }, [notifications, userId, supabase]);

  const markOneRead = useCallback(async (notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    await supabase.from('notifications').update({ read: true }).eq('id', notifId);
  }, [supabase]);

  // Click notification = mark read + navigate
  const handleNotificationTap = useCallback((notif: DisplayNotification) => {
    for (const id of notif.ids) {
      if (!notifications.find(n => n.id === id)?.read) markOneRead(id);
    }
    if (notif.link) {
      router.push(notif.link);
      setOpen(false);
    }
  }, [notifications, markOneRead, router]);

  const grouped = useMemo(() => groupNotificationsFlat(notifications), [notifications]);

  return (
    // `relative` so the desktop panel anchors to the inbox trigger itself, not
    // the pill's outer `.relative`. Right-aligning the panel to a 244px pill
    // when the trigger sits on its LEFT edge puts the panel's content 300px
    // away from where the user just clicked.
    <div className="relative">
      {/* Bell button — always rendered, morphs icon to X when open.
          Raised to the panel's z-[9999] ONLY while open on desktop, so the active
          trigger stays lit above the scrim (z-[9998]) and its X-to-close affordance
          stays clickable.
          IMPORTANT — this elevation is gated, not unconditional: NotificationBell
          is a shared component mounted twice on desktop (the visible LightShell
          cluster AND the legacy DesktopHeader/PageHeaderUser cluster, which sits
          hidden behind LightShell's opaque `fixed inset-0 z-40` overlay). An
          unconditional z-[9999] here lifts the hidden legacy bell THROUGH that
          overlay, producing a phantom duplicate bell over the bar. Gating on
          `isDesktop && open` keeps the legacy bell at its natural z (it's never
          open — unclickable behind the overlay) so only the active visible bell
          ever rises. */}
      <div className={`relative${isDesktop && open ? ' z-[9999]' : ''}`}>
        <BellToggle
          ref={bellRef}
          open={open}
          unreadCount={unreadCount}
          onClick={() => setOpen(o => !o)}
          light={light}
        />
      </div>

      {/* Desktop: dim the page behind the open panel; click-away to dismiss.
          Sits just under the panel/bell (z-[9998] < z-[9999]). It's an
          inline `fixed inset-0` (not portaled) for the same reason the panel's
          own z-[9999] already wins over page content — no transformed ancestor
          traps it here, so it covers the viewport and the panel paints on top. */}
      {isDesktop && (
        <AnimatePresence>
          {open && (
            <motion.div
              key="notif-scrim"
              aria-hidden
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: reduce ? { duration: 0 } : { duration: 0.13, ease: [0.4, 0, 1, 1] } }}
              transition={reduce ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-[9998] bg-black/20"
            />
          )}
        </AnimatePresence>
      )}

      {/* Desktop: dropdown panel */}
      {isDesktop && (
        <DesktopNotificationPanel
          ref={panelRef}
          open={open}
          grouped={grouped}
          isEmpty={notifications.length === 0}
          unreadCount={unreadCount}
          onMarkAllRead={markAllRead}
          onTap={handleNotificationTap}
        />
      )}

      {/* Mobile: portal the sheet to body */}
      {mounted && typeof document !== 'undefined' && !isDesktop && createPortal(
        <MobileNotificationSheet
          ref={panelRef}
          open={open}
          grouped={grouped}
          isEmpty={notifications.length === 0}
          unreadCount={unreadCount}
          onClose={() => setOpen(false)}
          onMarkAllRead={markAllRead}
          onTap={handleNotificationTap}
        />,
        document.body
      )}
      {mounted && typeof document !== 'undefined' && (
        <LiveToastContainer
          onTapToast={(toast) => {
            handleNotificationTap({
              id: toast.notification.id,
              kind: toast.notification.kind,
              title: toast.notification.title,
              body: toast.notification.body,
              link: toast.notification.link,
              read: toast.notification.read,
              created_at: toast.notification.created_at,
              count: 1,
              ids: [toast.notification.id],
            });
          }}
          onOpenPanel={() => setOpen(true)}
        />
      )}
    </div>
  );
}
