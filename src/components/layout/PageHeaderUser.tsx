'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Page Header User
 *
 *  Avatar   spring scale 1.05 on hover, 0.95 on tap (snappy)
 *  Popover  scale 0.95 → 1, opacity 0 → 1 (smooth spring)
 *  Links    x: 0 → 2 nudge on hover (snappy)
 *  Sign out AnimatePresence crossfade between button ↔ confirm
 * ───────────────────────────────────────────────────────── */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import {
  Settings,
  LogOut,
  Users,
  FileSignature,
  TrendingUp,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Notification } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { useHaptics } from '@/components/HapticsProvider';

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then(m => m.NotificationBell),
  { ssr: false }
);

const SMOOTH = { type: 'spring' as const, stiffness: 300, damping: 25 };
const SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };

interface PageHeaderUserProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}

export function PageHeaderUser({
  email,
  displayName,
  avatarUrl,
  userId,
  isAdmin = false,
  unreadCount = 0,
  notifications = [],
}: PageHeaderUserProps) {
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const { trigger } = useHaptics();
  const label = displayName || email;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingSignOut(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setConfirmingSignOut(false); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="hidden md:flex items-center gap-2">
      {userId && (
        <NotificationBell
          userId={userId}
          initialCount={unreadCount}
          initialNotifications={notifications}
        />
      )}
      <div className="relative">
        <motion.button
          ref={avatarRef}
          onClick={() => { trigger('selection'); setOpen(prev => !prev); }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={SNAPPY}
          className="rounded-full"
        >
          <Avatar className="size-8">
            <AvatarImage src={avatarUrl} alt={label} />
            <AvatarFallback className="bg-secondary text-foreground text-[10px]">
              {getInitials(label)}
            </AvatarFallback>
          </Avatar>
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={SMOOTH}
              className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/[0.08] bg-popover backdrop-blur-xl backdrop-saturate-150 shadow-xl z-50 overflow-hidden"
            >
              {/* User info */}
              <div className="px-3 py-3 border-b border-white/[0.06]">
                {displayName && (
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                )}
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>

              {/* Links */}
              <div className="py-1">
                <PopoverLink href="/team" icon={Users} label="Team" onClick={() => setOpen(false)} />
                <PopoverLink href="/settings" icon={Settings} label="Settings" onClick={() => setOpen(false)} />
                {isAdmin && (
                  <>
                    <div className="mx-3 my-1 h-px bg-white/[0.06]" />
                    <PopoverLink href="/admin/external-signing" icon={FileSignature} label="External Signing" onClick={() => setOpen(false)} />
                    <PopoverLink href="/investor" icon={TrendingUp} label="Investor Panel" onClick={() => setOpen(false)} />
                  </>
                )}
              </div>

              {/* Sign out */}
              <div className="border-t border-white/[0.06] py-1 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {confirmingSignOut ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ ...SNAPPY, opacity: { duration: 0.12 } }}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <span className="text-xs text-muted-foreground">Sign out?</span>
                      <div className="flex items-center gap-2">
                        <form action="/auth/signout" method="post">
                          <button type="submit" className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors">
                            Yes
                          </button>
                        </form>
                        <button
                          onClick={() => setConfirmingSignOut(false)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="signout"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ ...SNAPPY, opacity: { duration: 0.12 } }}
                      onClick={() => setConfirmingSignOut(true)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-red-400 hover:bg-white/[0.03] transition-colors"
                    >
                      <LogOut className="size-3.5" />
                      Sign out
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const LINK_SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };

function PopoverLink({ href, icon: Icon, label, onClick }: { href: string; icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <motion.div whileHover={{ x: 2 }} transition={LINK_SNAPPY}>
      <Link
        href={href}
        onClick={onClick}
        className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.03] transition-colors"
      >
        <Icon className="size-3.5" />
        {label}
      </Link>
    </motion.div>
  );
}
