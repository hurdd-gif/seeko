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
import { Link } from '@/lib/react-router-adapters';
import {
  Settings,
  LogOut,
  Users,
  FileSignature,
  TrendingUp,
  CreditCard,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Notification } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import { dynamic } from '@/lib/react-router-adapters';
import { useHaptics } from '@/components/HapticsProvider';
import { springs } from '@/lib/motion';
import { QuickCreateMorph } from '@/components/dashboard/QuickCreateMorph';

type PillTeamMember = { id: string; display_name?: string | null; avatar_url?: string | null };
type PillArea = { id: string; name: string };

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then(m => m.NotificationBell),
  { ssr: false }
);

const SMOOTH = springs.smooth;
const SNAPPY = springs.snappy;

interface PageHeaderUserProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
  team?: PillTeamMember[];
  areas?: PillArea[];
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
    <>
    <div className="relative hidden md:block">
    <div
      className="flex h-[54px] items-center gap-3 rounded-full bg-[#212020] pl-3 pr-4 antialiased"
      style={{ borderWidth: '0.5px', borderStyle: 'solid', borderColor: '#F7F5F31F' }}
    >
      {userId && (
        <span
          className="flex size-7.5 items-center justify-center rounded-full"
          style={{ borderWidth: '0.5px', borderStyle: 'solid', borderColor: '#F7F5F31F' }}
        >
          <NotificationBell
            userId={userId}
            initialCount={unreadCount}
            initialNotifications={notifications}
          />
        </span>
      )}

      {isAdmin && (
        <QuickCreateMorph onOpenChange={(isOpen) => { if (isOpen) trigger('selection'); }} />
      )}

      <div className="flex items-center gap-1">
        <motion.button
          ref={avatarRef}
          onClick={() => { trigger('selection'); setOpen(prev => !prev); }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={SNAPPY}
          className="rounded-full"
        >
          <Avatar className="size-7">
            <AvatarImage src={avatarUrl} alt={label} />
            <AvatarFallback className="bg-secondary text-foreground text-[10px]">
              {getInitials(label)}
            </AvatarFallback>
          </Avatar>
        </motion.button>

        <button
          type="button"
          aria-label="Open menu"
          onClick={() => { trigger('selection'); setOpen((prev) => !prev); }}
          className="-mr-1 flex size-7 items-center justify-center rounded-full transition-colors duration-100 ease-out hover:bg-white/5 active:scale-[0.95]"
        >
          <span className="flex flex-col items-center justify-center gap-[3px]">
            <span className="block h-[1.5px] w-3.5 rounded-full bg-[#918F8F]" />
            <span className="block h-[1.5px] w-3.5 rounded-full bg-[#918F8F]" />
          </span>
        </button>
      </div>
    </div>

        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={SMOOTH}
              style={{ transformOrigin: 'top center' }}
              className="group/menu absolute inset-x-0 top-full z-50 mt-[9px] flex flex-col gap-1 overflow-hidden rounded-[20px] bg-overlay p-1 shadow-seeko-pop"
            >
              {/* User info */}
              <div className="px-4 py-3">
                {displayName && (
                  <p className="truncate text-[14px] font-medium tracking-[-0.02em] text-ink-title">{displayName}</p>
                )}
                <p className="mt-0.5 truncate text-[13px] text-ink-muted">{email}</p>
              </div>

              <div className="mx-4 h-px bg-wash-5" />

              {/* Links */}
              <div className="flex flex-col">
                <PopoverLink href="/team" icon={Users} label="Team" onClick={() => setOpen(false)} />
                <PopoverLink href="/settings" icon={Settings} label="Settings" onClick={() => setOpen(false)} />
              </div>
              {isAdmin && (
                <>
                  <div className="mx-4 h-px bg-wash-5" />
                  <div className="flex flex-col">
                    <PopoverLink href="/payments" icon={CreditCard} label="Payments" onClick={() => setOpen(false)} />
                    <PopoverLink href="/admin/external-signing" icon={FileSignature} label="External Signing" onClick={() => setOpen(false)} />
                    <PopoverLink href="/investor" icon={TrendingUp} label="Investor Panel" onClick={() => setOpen(false)} />
                  </div>
                </>
              )}

              <div className="mx-4 h-px bg-wash-5" />

              {/* Sign out */}
              <div className="flex flex-col overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {confirmingSignOut ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ ...SNAPPY, opacity: { duration: 0.12 } }}
                      className="flex items-center justify-between rounded-2xl px-4 py-3"
                    >
                      <span className="text-[14px] font-medium tracking-[-0.02em] text-ink-muted">Sign out?</span>
                      <div className="flex items-center gap-3">
                        <form action="/auth/signout" method="post">
                          <button type="submit" className="text-[14px] font-medium text-[#e5484d] transition-colors hover:text-[#d33b40]">
                            Yes
                          </button>
                        </form>
                        <button
                          onClick={() => setConfirmingSignOut(false)}
                          className="text-[14px] text-ink-muted transition-colors hover:text-ink-title"
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
                      className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.02em] text-ink-title opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-wash-4 hover:text-[#e5484d] hover:opacity-100!"
                    >
                      <span>Sign out</span>
                      <LogOut className="size-5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
    </>
  );
}

const LINK_SNAPPY = springs.snappy;

function PopoverLink({ href, icon: Icon, label, onClick }: { href: string; icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <motion.div whileHover={{ x: 2 }} transition={LINK_SNAPPY}>
      <Link
        href={href}
        onClick={onClick}
        className="flex items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.02em] text-ink-title opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-wash-4 hover:opacity-100!"
      >
        <span>{label}</span>
        <Icon className="size-5 text-ink-muted" />
      </Link>
    </motion.div>
  );
}
