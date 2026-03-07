'use client';

/* ─────────────────────────────────────────────────────────
 * NOTIFICATION BELL — ANIMATION STORYBOARD
 *
 *   open    panel scales 0.95 → 1.0, opacity 0 → 1 (spring)
 *           origin from bell position (left top)
 *   rows    stagger in from left with 30ms delay per row
 *   new     real-time notification slides in from top (spring)
 *   close   scale 1.0 → 0.97, opacity 1 → 0 (120ms ease-out)
 *   badge   unread count pops in with scale spring
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckSquare, AtSign, MessageSquare, CheckCheck, CheckCircle2, Package, ArrowRightLeft, DollarSign, CircleCheck, CircleX } from 'lucide-react';
import { Notification, NotificationKind } from '@/lib/types';

const PANEL_SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };
const ROW_STAGGER = 0.03; // 30ms per row

const KIND_CONFIG: Record<NotificationKind, { icon: typeof Bell; className: string; bg: string }> = {
  task_assigned:       { icon: CheckSquare,  className: 'text-seeko-accent',  bg: 'bg-emerald-500/10' },
  mentioned:           { icon: AtSign,       className: 'text-blue-400',      bg: 'bg-blue-500/10' },
  comment_reply:       { icon: MessageSquare, className: 'text-amber-400',    bg: 'bg-amber-500/10' },
  task_completed:      { icon: CheckCircle2, className: 'text-emerald-500',   bg: 'bg-emerald-500/10' },
  deliverable_uploaded:{ icon: Package,      className: 'text-violet-400',    bg: 'bg-violet-500/10' },
  task_handoff:        { icon: ArrowRightLeft, className: 'text-seeko-accent', bg: 'bg-emerald-500/10' },
  payment_request:     { icon: DollarSign,    className: 'text-amber-400',    bg: 'bg-amber-500/10' },
  payment_approved:    { icon: CircleCheck,   className: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
  payment_denied:      { icon: CircleX,       className: 'text-red-400',      bg: 'bg-red-500/10' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getTimeGroup(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  if (date >= todayStart) return 'Today';
  if (date >= yesterdayStart) return 'Yesterday';
  return 'Earlier';
}

interface GroupedNotification {
  label: string;
  items: Notification[];
}

function groupNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups = new Map<string, Notification[]>();
  const order = ['Today', 'Yesterday', 'Earlier'];

  for (const n of notifications) {
    const group = getTimeGroup(n.created_at);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(n);
  }

  return order
    .filter(label => groups.has(label))
    .map(label => ({ label, items: groups.get(label)! }));
}

interface NotificationBellProps {
  userId: string;
  initialCount: number;
  initialNotifications: Notification[];
  collapsed?: boolean;
}

export function NotificationBell({ userId, initialCount, initialNotifications, collapsed = false }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [tooltipY, setTooltipY] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const tooltipLabel = unreadCount > 0
    ? `${unreadCount} notification${unreadCount === 1 ? '' : 's'}`
    : 'No notifications';

  function handleBellMouseEnter() {
    if (!collapsed || !bellRef.current) return;
    const rect = bellRef.current.getBoundingClientRect();
    setTooltipY(rect.top + rect.height / 2);
  }

  function handleBellMouseLeave() {
    setTooltipY(null);
  }

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        bellRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase]);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  }, [notifications, userId, supabase]);

  const markOneRead = useCallback(async (notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    await supabase.from('notifications').update({ read: true }).eq('id', notifId);
  }, [supabase]);

  function handleToggle() {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      const panelWidth = 340;
      const panelHeight = 460;
      const margin = 8;

      // Find sidebar right edge (parent container)
      const sidebar = bellRef.current.closest('nav, aside, [data-sidebar]');
      const sidebarRight = sidebar ? sidebar.getBoundingClientRect().right : rect.right;

      // Anchor left edge to sidebar right
      let left = sidebarRight + 4;
      if (left + panelWidth > window.innerWidth - margin) {
        left = window.innerWidth - panelWidth - margin;
      }
      if (left < margin) left = margin;

      // Align top with the bell button
      let top = rect.top;
      if (top + panelHeight > window.innerHeight - margin) {
        top = window.innerHeight - panelHeight - margin;
      }
      if (top < margin) top = margin;

      setPanelPos({ left, top });
    }
    setOpen(v => !v);
  }

  const grouped = useMemo(() => groupNotifications(notifications), [notifications]);

  // Track cumulative row index for stagger
  let rowIndex = 0;

  const panel = (
    <AnimatePresence>
      {open && panelPos && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={PANEL_SPRING}
          style={{ left: panelPos.left, top: panelPos.top, transformOrigin: 'left center' }}
          className="fixed w-[340px] rounded-xl border border-white/[0.08] bg-popover/80 backdrop-blur-xl backdrop-saturate-150 shadow-xl z-[9999] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-medium text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-colors"
              >
                <CheckCheck className="size-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="size-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">We&apos;ll let you know when something happens.</p>
              </div>
            ) : (
              grouped.map(group => {
                const groupRows = group.items.map(notif => {
                  const cfg = KIND_CONFIG[notif.kind] ?? KIND_CONFIG.comment_reply;
                  const Icon = cfg.icon;
                  const currentIndex = rowIndex++;
                  return (
                    <motion.button
                      key={notif.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...PANEL_SPRING, delay: currentIndex * ROW_STAGGER }}
                      onClick={() => {
                        if (!notif.read) markOneRead(notif.id);
                        if (notif.link) { router.push(notif.link); setOpen(false); }
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06] ${!notif.read ? 'bg-white/[0.04]' : ''}`}
                    >
                      <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${cfg.bg} ${cfg.className}`}>
                        <Icon className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${!notif.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={PANEL_SPRING}
                              className="size-1.5 shrink-0 rounded-full bg-seeko-accent"
                            />
                          )}
                        </div>
                        {notif.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/50 mt-1">{timeAgo(notif.created_at)}</p>
                      </div>
                    </motion.button>
                  );
                });

                return (
                  <div key={group.label}>
                    <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {group.label}
                    </div>
                    {groupRows}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={bellRef}
        onClick={handleToggle}
        onMouseEnter={handleBellMouseEnter}
        onMouseLeave={handleBellMouseLeave}
        className={[
          'relative flex items-center rounded-lg py-2 text-sm transition-colors text-muted-foreground hover:text-sidebar-foreground w-full',
          collapsed ? 'justify-center px-0' : 'gap-3 px-3',
        ].join(' ')}
      >
        <span className="relative flex items-center justify-center size-7 shrink-0">
          <Bell className="h-4 w-4" />
          {collapsed && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-seeko-accent" />
          )}
        </span>
        {!collapsed && (
          <>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-seeko-accent px-1.5 text-[10px] font-semibold text-black"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </>
        )}
      </button>
      {mounted && typeof document !== 'undefined' && createPortal(panel, document.body)}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {collapsed && tooltipY !== null && (
            <motion.div
              key="bell-tooltip"
              initial={{ opacity: 0, x: -6, scale: 0.88 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -6, scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              className="fixed z-[9999] pointer-events-none"
              style={{ left: 64, top: tooltipY, transform: 'translateY(-50%)' }}
            >
              <div className="rounded-lg bg-popover/80 backdrop-blur-xl border border-white/[0.08] px-2 py-1 text-xs font-medium text-sidebar-foreground shadow-xl whitespace-nowrap">
                {tooltipLabel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
