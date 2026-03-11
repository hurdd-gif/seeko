'use client';

/* ─────────────────────────────────────────────────────────
 * NOTIFICATION BELL — ANIMATION STORYBOARD
 *
 * Desktop:
 *   open    panel scales 0.95 → 1.0, opacity 0 → 1 (spring)
 *           origin from bell position (left top)
 *   rows    stagger in from left with 30ms delay per row
 *   new     real-time notification slides in from top (spring)
 *   close   scale 1.0 → 0.97, opacity 1 → 0 (120ms ease-out)
 *   badge   unread count pops in with scale spring
 *
 * Mobile:
 *   open    full-screen sheet slides up from bottom (spring)
 *   rows    stagger in from bottom with 20ms delay per row
 *   swipe   row slides right to dismiss (drag threshold 100px)
 *   close   sheet slides down + backdrop fades out (200ms)
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'motion/react';
import { Bell, CheckSquare, AtSign, MessageSquare, CheckCheck, CheckCircle2, Package, ArrowRightLeft, Receipt, CircleCheck, CircleX, Clock, AlertCircle, X } from 'lucide-react';
import { Notification, NotificationKind } from '@/lib/types';
import { useIsDesktop } from '@/lib/hooks/useIsDesktop';

const PANEL_SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };
const SHEET_SPRING = { type: 'spring' as const, visualDuration: 0.35, bounce: 0.05 };
const ROW_STAGGER = 0.03; // 30ms per row (desktop)
const MOBILE_ROW_STAGGER = 0.02; // 20ms per row (mobile)
const SWIPE_DISMISS_THRESHOLD = 100; // px to dismiss

const KIND_CONFIG: Record<NotificationKind, { icon: typeof Bell; className: string; bg: string }> = {
  task_assigned:       { icon: CheckSquare,  className: 'text-seeko-accent',  bg: 'bg-emerald-500/10' },
  mentioned:           { icon: AtSign,       className: 'text-blue-400',      bg: 'bg-blue-500/10' },
  comment_reply:       { icon: MessageSquare, className: 'text-amber-400',    bg: 'bg-amber-500/10' },
  task_completed:      { icon: CheckCircle2, className: 'text-emerald-500',   bg: 'bg-emerald-500/10' },
  deliverable_uploaded:{ icon: Package,      className: 'text-violet-400',    bg: 'bg-violet-500/10' },
  task_handoff:        { icon: ArrowRightLeft, className: 'text-seeko-accent', bg: 'bg-emerald-500/10' },
  payment_request:     { icon: Receipt,        className: 'text-cyan-400',     bg: 'bg-cyan-500/10' },
  payment_approved:    { icon: CircleCheck,   className: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
  payment_denied:      { icon: CircleX,       className: 'text-red-400',      bg: 'bg-red-500/10' },
  deadline_extension_requested: { icon: Clock,       className: 'text-amber-400',    bg: 'bg-amber-500/10' },
  deadline_extension_approved:  { icon: CheckCircle2, className: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
  deadline_extension_denied:    { icon: CircleX,      className: 'text-red-400',      bg: 'bg-red-500/10' },
  task_submitted_review:        { icon: AlertCircle,  className: 'text-blue-400',     bg: 'bg-blue-500/10' },
  task_review_approved:         { icon: CheckCircle2, className: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
  task_review_denied:           { icon: CircleX,      className: 'text-red-400',      bg: 'bg-red-500/10' },
};

/** #6 — Show time-of-day within a date group, "Xd ago" only for Earlier */
function formatTime(dateStr: string, group: string): string {
  const date = new Date(dateStr);
  if (group === 'Earlier') {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    return `${days}d ago`;
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

/** #4 — Collapsed notification: groups repeated same-kind notifications from same sender */
interface DisplayNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  created_at: string;
  count: number;
  ids: string[];
}

function collapseNotifications(items: Notification[]): DisplayNotification[] {
  const result: DisplayNotification[] = [];
  const seen = new Map<string, number>(); // key → index in result

  for (const n of items) {
    // Group key: same kind + same title prefix (e.g. "testinguser requested")
    const titlePrefix = n.title.replace(/\$[\d,.]+/, '').trim();
    const key = `${n.kind}:${titlePrefix}`;

    const existingIdx = seen.get(key);
    if (existingIdx !== undefined && result[existingIdx]) {
      const existing = result[existingIdx];
      existing.count++;
      existing.ids.push(n.id);
      if (!n.read) existing.read = false;
      // Sum dollar amounts if payment
      if (n.kind === 'payment_request') {
        const existAmount = parseFloat(existing.title.match(/\$([\d,.]+)/)?.[1]?.replace(',', '') ?? '0');
        const newAmount = parseFloat(n.title.match(/\$([\d,.]+)/)?.[1]?.replace(',', '') ?? '0');
        const total = existAmount + newAmount;
        existing.title = existing.title.replace(/\$[\d,.]+/, `$${total.toFixed(2)}`);
        existing.body = `${existing.count} payments`;
      }
    } else {
      seen.set(key, result.length);
      result.push({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        created_at: n.created_at,
        count: 1,
        ids: [n.id],
      });
    }
  }
  return result;
}

interface GroupedNotification {
  label: string;
  items: DisplayNotification[];
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
    .map(label => ({ label, items: collapseNotifications(groups.get(label)!) }));
}

/* ─────────────────────────────────────────────────────────
 * Swipeable Row — #2 swipe-to-dismiss on mobile
 * ───────────────────────────────────────────────────────── */

function SwipeableRow({
  children,
  onDismiss,
  enabled,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
  enabled: boolean;
}) {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, SWIPE_DISMISS_THRESHOLD], [1, 0.3]);
  const bg = useTransform(x, [0, SWIPE_DISMISS_THRESHOLD], ['rgba(239,68,68,0)', 'rgba(239,68,68,0.15)']);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_DISMISS_THRESHOLD) {
      onDismiss();
    }
  }

  if (!enabled) return <>{children}</>;

  return (
    <motion.div style={{ x, opacity, backgroundColor: bg }} drag="x" dragConstraints={{ left: 0, right: 200 }} dragElastic={0.1} onDragEnd={handleDragEnd}>
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────
 * NotificationBell
 * ───────────────────────────────────────────────────────── */

interface NotificationBellProps {
  userId: string;
  initialCount: number;
  initialNotifications: Notification[];
  collapsed?: boolean;
}

export function NotificationBell({ userId, initialCount, initialNotifications, collapsed = false }: NotificationBellProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [tooltipY, setTooltipY] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // #1 — Lock body scroll + hide bottom nav when mobile sheet is open
  useEffect(() => {
    if (!isDesktop && open) {
      document.documentElement.setAttribute('data-modal-open', '');
      document.body.style.overflow = 'hidden';
      return () => {
        document.documentElement.removeAttribute('data-modal-open');
        document.body.style.overflow = '';
      };
    }
  }, [isDesktop, open]);

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
      if (!isDesktop) return; // Mobile uses backdrop tap
      const target = e.target as Node;
      if (
        bellRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, isDesktop]);

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

  /** #2 — Dismiss (mark read) on swipe */
  const dismissNotification = useCallback(async (ids: string[]) => {
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    setUnreadCount(c => Math.max(0, c - ids.length));
    for (const id of ids) {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
    }
  }, [supabase]);

  function handleToggle() {
    if (!open && bellRef.current && isDesktop) {
      const rect = bellRef.current.getBoundingClientRect();
      const panelWidth = 340;
      const panelHeight = 460;
      const margin = 8;

      const sidebar = bellRef.current.closest('nav, aside, [data-sidebar]');
      const sidebarRight = sidebar ? sidebar.getBoundingClientRect().right : rect.right;

      let left = sidebarRight + 4;
      if (left + panelWidth > window.innerWidth - margin) {
        left = window.innerWidth - panelWidth - margin;
      }
      if (left < margin) left = margin;

      let top = rect.top;
      if (top + panelHeight > window.innerHeight - margin) {
        top = window.innerHeight - panelHeight - margin;
      }
      if (top < margin) top = margin;

      setPanelPos({ left, top });
    }
    setOpen(v => !v);
  }

  /** #5 — Navigate on tap */
  function handleNotificationTap(notif: DisplayNotification) {
    for (const id of notif.ids) {
      if (!notifications.find(n => n.id === id)?.read) markOneRead(id);
    }
    if (notif.link) {
      router.push(notif.link);
      setOpen(false);
    }
  }

  const grouped = useMemo(() => groupNotifications(notifications), [notifications]);

  // Shared notification row renderer
  function renderNotificationRow(notif: DisplayNotification, index: number, group: string) {
    const cfg = KIND_CONFIG[notif.kind] ?? KIND_CONFIG.comment_reply;
    const Icon = cfg.icon;
    const stagger = isDesktop ? ROW_STAGGER : MOBILE_ROW_STAGGER;

    const row = (
      <motion.button
        key={notif.id}
        initial={{ opacity: 0, x: isDesktop ? -12 : 0, y: isDesktop ? 0 : 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, x: 80 }}
        transition={{ ...PANEL_SPRING, delay: index * stagger }}
        onClick={() => handleNotificationTap(notif)}
        className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors active:bg-white/[0.08] hover:bg-white/[0.06] ${!notif.read ? 'bg-white/[0.04]' : ''}`}
      >
        <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${cfg.bg} ${cfg.className}`}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm leading-snug ${!notif.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
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
          <div className="flex items-center gap-2 mt-1">
            <p className="text-[11px] text-muted-foreground/50">{formatTime(notif.created_at, group)}</p>
            {notif.count > 1 && (
              <span className="text-[10px] text-muted-foreground/40 bg-white/[0.06] px-1.5 py-0.5 rounded-full">{notif.count} items</span>
            )}
          </div>
        </div>
      </motion.button>
    );

    return (
      <SwipeableRow
        key={notif.id}
        enabled={!isDesktop}
        onDismiss={() => dismissNotification(notif.ids)}
      >
        {row}
      </SwipeableRow>
    );
  }

  // ── Desktop panel ──────────────────────────────────────
  let rowIndex = 0;
  const desktopPanel = (
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
          <div className="max-h-[360px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="size-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">We&apos;ll let you know when something happens.</p>
              </div>
            ) : (
              <AnimatePresence>
                {grouped.map(group => (
                  <div key={group.label}>
                    <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {group.label}
                    </div>
                    {group.items.map(notif => renderNotificationRow(notif, rowIndex++, group.label))}
                  </div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Mobile sheet (#1 full-screen, #3 opaque bg) ───────
  let mobileRowIndex = 0;
  const mobileSheet = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9998]"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setOpen(false)}
          />
          {/* Sheet */}
          <motion.div
            ref={panelRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SHEET_SPRING}
            className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col rounded-t-2xl overflow-hidden"
            style={{
              backgroundColor: '#1a1a1a',
              maxHeight: '85dvh',
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-base font-semibold text-foreground">Notifications</h3>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground active:text-foreground transition-colors"
                  >
                    <CheckCheck className="size-3.5" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex size-8 items-center justify-center rounded-full bg-white/[0.08] text-muted-foreground active:bg-white/[0.15]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Bell className="size-10 text-muted-foreground/20" />
                  <p className="mt-3 text-sm text-muted-foreground">No notifications yet</p>
                  <p className="mt-1 text-xs text-muted-foreground/50">We&apos;ll let you know when something happens.</p>
                </div>
              ) : (
                <AnimatePresence>
                  {grouped.map(group => (
                    <div key={group.label}>
                      <div className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        {group.label}
                      </div>
                      {group.items.map(notif => renderNotificationRow(notif, mobileRowIndex++, group.label))}
                    </div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </>
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
      {mounted && typeof document !== 'undefined' && createPortal(
        isDesktop ? desktopPanel : mobileSheet,
        document.body
      )}
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
