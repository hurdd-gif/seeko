'use client';

/* ─────────────────────────────────────────────────────────
 * STUDIO HEADER ACTIONS — global light chrome cluster (Frame 6)
 *
 *   Pill   [🔔 NotificationBell in 30px ring] [+ Create]
 *   Photo  standalone avatar button on the far right — the ONE menu
 *
 * Pressing the photo reveals a single menu UNDER it that holds
 * everything:
 *
 *   identity (name · email)
 *   ── nav ──  Activity · Team · Settings (Progress disabled 2026-07)
 *   ── admin ──  Payments · External Signing · Investor Panel
 *   ── Sign out (confirm toggle)
 *
 * The panel is revealed by a CLIP-PATH CIRCLE that grows from the
 * avatar as its origin (the photo is the seed the menu blooms out
 * of), and the rows rise + stagger in just behind it. Reduced-motion
 * collapses both to a plain opacity fade.
 * ───────────────────────────────────────────────────────── */

import { useState, useRef, useEffect } from 'react';
import { dynamic } from '@/lib/react-router-adapters';
import { Link } from '@/lib/react-router-adapters';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'motion/react';
import {
  Inbox,
  Settings,
  LogOut,
  Users,
  FileSignature,
  TrendingUp,
  CreditCard,
  Activity,
  BadgePlus,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Notification } from '@/lib/types';
import { springs } from '@/lib/motion';
import { QuickCreateMorph } from '@/components/dashboard/QuickCreateMorph';

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then((m) => m.NotificationBell),
  { ssr: false },
);

const SNAPPY = springs.snappy;

/* ── Avatar menu motion ─────────────────────────────────────
 * The panel is `right-0 top-full mt-2`, w-[244px]. The avatar (36px)
 * sits directly above the panel's top-right, so the clip-path circle
 * originates at the avatar's centre: x = 244 − 18 = 226px from the
 * panel's left, y = −26px (18px half-avatar + 8px mt gap) above its top.
 *
 * STORYBOARD (ms after open):
 *     0ms   PANEL  clip-path circle 18px → 720px at the avatar, opacity 0→1
 *            (starts at avatar radius, never 0 — "nothing scales from 0";
 *             720px covers the panel + its shadow bleed)
 *            spring: visualDuration .40 · bounce 0 (a reveal, not a snap)
 *    60ms   ROWS   opacity 0→1 · y 24→0, staggered 45ms, crisp 460/34
 *            → the list rises out of the growing circle
 *   exit    PANEL only · circle → 18px · opacity→0 · 200ms accelerate-out
 *            (quieter + faster than enter; rows vanish under the clip)
 *   reduced-motion → opacity-only 110ms, no clip-path, no stagger
 */
const MENU_ORIGIN = '226px -26px';
const MENU_R_OPEN = 720;
const MENU_R_CLOSED = 18;
const MENU_CIRCLE_SPRING = { type: 'spring' as const, visualDuration: 0.4, bounce: 0 };
const MENU_CIRCLE_EXIT = { duration: 0.2, ease: [0.4, 0, 1, 1] as const };

/** Stagger orchestrator for the row list (no visual props of its own). */
const MENU_LIST: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
};

/** Each row rises in; no exit (rows disappear under the closing clip). */
const MENU_ROW: Variants = {
  hidden: { opacity: 0, y: 24 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 460, damping: 34 },
  },
};

type OpenMenu = 'account' | null;

interface StudioHeaderActionsProps {
  email: string;
  initials: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
  team?: { id: string; display_name?: string | null }[];
  areas?: { id: string; name: string }[];
}

export function StudioHeaderActions({
  email,
  initials,
  displayName,
  avatarUrl,
  userId,
  isAdmin = false,
  unreadCount = 0,
  notifications = [],
}: StudioHeaderActionsProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const reduce = useReducedMotion();

  const accountRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpenMenu(null);
    setConfirmingSignOut(false);
  }

  useEffect(() => {
    if (!openMenu) return;
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (accountRef.current && !accountRef.current.contains(t)) {
        close();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [openMenu]);

  // Clip-path circle reveal (or plain fade under reduced-motion).
  const panelMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: { duration: 0.11 } },
        transition: { duration: 0.11 },
      }
    : {
        initial: { clipPath: `circle(${MENU_R_CLOSED}px at ${MENU_ORIGIN})`, opacity: 0 },
        animate: { clipPath: `circle(${MENU_R_OPEN}px at ${MENU_ORIGIN})`, opacity: 1 },
        exit: {
          clipPath: `circle(${MENU_R_CLOSED}px at ${MENU_ORIGIN})`,
          opacity: 0,
          transition: { clipPath: MENU_CIRCLE_EXIT, opacity: { duration: 0.12 } },
        },
        transition: { clipPath: MENU_CIRCLE_SPRING, opacity: { duration: 0.16 } },
      };

  return (
    <div className="flex items-center gap-1.5">
      {/* ── Flat actions: bell · Create (the one framed pill) ──── */}
      <span className="flex size-9 items-center justify-center text-[#808080]">
        {userId ? (
          <NotificationBell
            userId={userId}
            initialCount={unreadCount}
            initialNotifications={notifications}
            light
          />
        ) : (
          <Inbox className="size-4" strokeWidth={2} aria-hidden />
        )}
      </span>

      <QuickCreateMorph onOpenChange={() => close()} />

      {/* ── Profile photo — the single menu (identity + nav + Sign out) ── */}
      <div ref={accountRef} className="relative">
        <motion.button
          type="button"
          aria-label="Open menu"
          aria-expanded={openMenu === 'account'}
          onClick={() => setOpenMenu((p) => (p === 'account' ? null : 'account'))}
          whileHover={reduce ? undefined : { scale: 1.05 }}
          whileTap={reduce ? undefined : { scale: 0.95 }}
          transition={SNAPPY}
          className="relative z-[60] rounded-full"
        >
          <Avatar className="size-9 ring-[0.5px] ring-inset ring-[#0000001f]">
            <AvatarImage src={avatarUrl} alt={displayName || email} />
            <AvatarFallback className="bg-[#262626] text-[11px] font-medium leading-[13px] text-[#f0f0f0]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </motion.button>

        <AnimatePresence>
          {openMenu === 'account' && (
            <motion.div
              {...panelMotion}
              className="group/menu absolute right-0 top-full z-[95] mt-2 flex w-[244px] flex-col overflow-hidden rounded-[20px] bg-white p-1 shadow-seeko"
            >
              <motion.div
                variants={reduce ? undefined : MENU_LIST}
                initial={reduce ? undefined : 'hidden'}
                animate={reduce ? undefined : 'shown'}
                className="flex flex-col gap-1"
              >
                {/* Identity header — name + email */}
                <motion.div
                  variants={reduce ? undefined : MENU_ROW}
                  className="flex items-center px-3 py-2.5"
                >
                  <div className="min-w-0">
                    {displayName && (
                      <p className="truncate text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d]">
                        {displayName}
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-[13px] text-[#808080]">{email}</p>
                  </div>
                </motion.div>

                <div className="mx-4 h-px bg-[#0000000d]" />

                {/* Navigation */}
                <div className="flex flex-col">
                  <PopoverLink href="/activity" icon={Activity} label="Activity" reduce={reduce} onClick={close} />
                  <PopoverLink href="/team" icon={Users} label="Team" reduce={reduce} onClick={close} />
                  {/* Progress disabled 2026-07 — restore the PopoverLink (icon={Gauge}) to re-enable */}
                  <PopoverLink href="/settings" icon={Settings} label="Settings" reduce={reduce} onClick={close} />
                </div>

                {/* Admin-only surfaces */}
                {isAdmin && (
                  <>
                    <div className="mx-4 h-px bg-[#0000000d]" />
                    <div className="flex flex-col">
                      <PopoverLink href="/payments" icon={CreditCard} label="Payments" reduce={reduce} onClick={close} />
                      {/* Deep link: /payments?new=1 auto-opens the create dialog after the passkey gate */}
                      <PopoverLink href="/payments?new=1" icon={BadgePlus} label="New payment" reduce={reduce} onClick={close} />
                      <PopoverLink href="/admin/external-signing" icon={FileSignature} label="External Signing" reduce={reduce} onClick={close} />
                      <PopoverLink href="/investor" icon={TrendingUp} label="Investor Panel" reduce={reduce} onClick={close} />
                    </div>
                  </>
                )}

                <div className="mx-4 h-px bg-[#0000000d]" />

                {/* Sign out — destructive, last */}
                <motion.div variants={reduce ? undefined : MENU_ROW} className="flex flex-col overflow-hidden">
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
                        <span className="text-[14px] font-medium tracking-[-0.28px] text-[#808080]">
                          Sign out?
                        </span>
                        <div className="flex items-center gap-3">
                          <form action="/auth/signout" method="post">
                            <button
                              type="submit"
                              className="text-[14px] font-medium text-[#e5484d] transition-colors hover:text-[#d33b40]"
                            >
                              Yes
                            </button>
                          </form>
                          <button
                            type="button"
                            onClick={() => setConfirmingSignOut(false)}
                            className="text-[14px] text-[#808080] transition-colors hover:text-[#0d0d0d]"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="signout"
                        type="button"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ ...SNAPPY, opacity: { duration: 0.12 } }}
                        onClick={() => setConfirmingSignOut(true)}
                        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d] transition-[color,background-color] hover:bg-[rgba(229,72,77,0.08)] hover:text-[#e5484d]"
                      >
                        <span>Sign out</span>
                        <LogOut className="size-5" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}

function PopoverLink({
  href,
  icon: Icon,
  label,
  reduce,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  reduce: boolean | null;
  onClick: () => void;
}) {
  return (
    <motion.div variants={reduce ? undefined : MENU_ROW}>
      <motion.div whileHover={reduce ? undefined : { x: 2 }} transition={SNAPPY}>
        <Link
          href={href}
          onClick={onClick}
          className="flex items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d] opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-[#0000000a] hover:opacity-100!"
        >
          <span>{label}</span>
          <Icon className="size-5 text-[#808080]" />
        </Link>
      </motion.div>
    </motion.div>
  );
}
