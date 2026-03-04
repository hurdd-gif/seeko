'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckSquare, AtSign, MessageSquare, CheckCheck } from 'lucide-react';
import { Notification, NotificationKind } from '@/lib/types';

const KIND_CONFIG: Record<NotificationKind, { icon: typeof Bell; className: string }> = {
  task_assigned: { icon: CheckSquare, className: 'text-seeko-accent' },
  mentioned: { icon: AtSign, className: 'text-blue-400' },
  comment_reply: { icon: MessageSquare, className: 'text-amber-400' },
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

interface NotificationBellProps {
  userId: string;
  initialCount: number;
  initialNotifications: Notification[];
}

export function NotificationBell({ userId, initialCount, initialNotifications }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
      const panelHeight = 420;
      const margin = 8;
      let top = rect.bottom - panelHeight;
      if (top < margin) top = margin;
      if (top + panelHeight > window.innerHeight - margin) {
        top = window.innerHeight - panelHeight - margin;
      }
      setPanelPos({
        left: rect.right + 8,
        top,
      });
    }
    setOpen(v => !v);
  }

  const panel = (
    <AnimatePresence>
      {open && panelPos && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: -8, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -8, scale: 0.97 }}
          transition={{ duration: 0.12, ease: [0.25, 1, 0.5, 1] }}
          style={{ left: panelPos.left, top: panelPos.top }}
          className="fixed w-80 rounded-xl border border-border bg-card shadow-xl z-[9999] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCheck className="size-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell className="size-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map(notif => {
                const cfg = KIND_CONFIG[notif.kind] ?? KIND_CONFIG.comment_reply;
                const Icon = cfg.icon;
                return (
                  <button
                    key={notif.id}
                    onClick={() => { if (!notif.read) markOneRead(notif.id); if (notif.link) { router.push(notif.link); setOpen(false); } }}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${!notif.read ? 'bg-muted/20' : ''}`}
                  >
                    <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary ${cfg.className}`}>
                      <Icon className="size-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${!notif.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="size-1.5 shrink-0 rounded-full bg-seeko-accent" />
                        )}
                      </div>
                      {notif.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground/60 mt-1">{timeAgo(notif.created_at)}</p>
                    </div>
                  </button>
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
        className="relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 w-full"
      >
        <Bell className="h-4 w-4 shrink-0" />
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
      </button>
      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </>
  );
}
