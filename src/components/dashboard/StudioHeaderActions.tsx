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
  Moon,
  Sun,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Notification } from '@/lib/types';
import { getStoredTheme, setTheme, subscribeTheme, type Theme } from '@/lib/theme';
import { springs, shellEntrance, DROPDOWN } from '@/lib/motion';
import { QuickCreateMorph } from '@/components/dashboard/QuickCreateMorph';

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then((m) => m.NotificationBell),
  { ssr: false },
);

const SNAPPY = springs.snappy;

/* ── Avatar menu motion ─────────────────────────────────────
 * This menu is on the CANONICAL dropdown entrance (`DROPDOWN` in
 * @/lib/motion) — the same one the notification panel two buttons over
 * already uses. It used to run a bespoke clip-path circle that wiped open
 * from the avatar over 400ms while the rows rose 24px behind it on a 45ms
 * stagger. That's a reveal, and a reveal is the wrong genre for a surface
 * you open dozens of times a day: it made a routine menu into an event.
 *
 * Simpler and shared beats bespoke here. Two menus that hang off the same
 * bar should open the same way, or the bar reads as two components.
 *
 * STORYBOARD (ms after open) — spec lives in DROPDOWN, not re-inlined:
 *     0ms   SHELL  opacity 0→1 · scale .96→1 · y −6→0, origin top-right
 *            → unfurls from under the avatar (~190ms, bounce .08)
 *    20ms   ROWS   opacity 0→1 · y 6→0, staggered 18ms
 *            → shell + content read as ONE arrival, no "opens … then fills"
 *   exit    SHELL only · 130ms accelerate-out (leaving never makes you wait)
 *   reduced-motion → opacity-only 110ms, no transform, no stagger
 *
 * The rows keep a variants orchestrator rather than DROPDOWN's index-based
 * `rowEntrance()` because two of them live inside PopoverLink/AppearanceToggle
 * — variants inherit down through those children, an index would have to be
 * threaded through their props. Same numbers, different plumbing.
 */
const MENU_LIST: Variants = {
  hidden: {},
  shown: {
    transition: {
      staggerChildren: DROPDOWN.row.stagger,
      delayChildren: DROPDOWN.row.baseDelay,
    },
  },
};

/** Each row rides in with the shell; no exit (the shell fades out over them). */
const MENU_ROW: Variants = {
  hidden: DROPDOWN.row.initial,
  shown: { opacity: 1, y: 0, transition: DROPDOWN.row.spring },
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


  return (
    <div className="flex items-center gap-1.5">
      {/* ── Flat actions: bell · Create (the one framed pill) ──── */}
      <span className="flex size-9 items-center justify-center text-ink-muted">
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
          <Avatar className="size-9 ring-[0.5px] ring-inset ring-[#0000001f] dark:ring-white/10">
            <AvatarImage src={avatarUrl} alt={displayName || email} />
            <AvatarFallback className="bg-[#262626] text-[11px] font-medium leading-[13px] text-[#f0f0f0]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </motion.button>

        <AnimatePresence>
          {openMenu === 'account' && (
            <>
              {/*
                The page recedes while the menu is open. In dark this is doing
                real work, not decoration: the menu clears the cards beneath it
                by only ~0.025 L, and darkening everything else is what widens
                that gap into an unmistakable one — the same separation a shadow
                would give you on a light canvas, which a dark canvas can't.

                It lives INSIDE accountRef, so the outside-click listener treats
                a click on it as a click *on* the menu and won't close it. Hence
                the explicit onMouseDown, matching the refund menu's scrim.

                Eased in and out, not sprung: a scrim has no mass and nothing to
                overshoot — it's a light level changing, and a spring on a light
                level reads as a flicker. z-40 keeps it under the avatar (z-60),
                so the thing you pressed stays lit while its surroundings drop
                away.

                Exit is shorter than enter, and deliberately ~= the panel's own
                130ms accelerate-out: a scrim that outlives the menu it dimmed
                for reads as the page being slow to come back.
              */}
              <motion.div
                key="account-menu-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14, ease: 'easeInOut' } }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="fixed inset-0 z-40 bg-scrim"
                onMouseDown={close}
                aria-hidden
              />
              <motion.div
                {...shellEntrance(reduce)}
                style={{ transformOrigin: DROPDOWN.shell.transformOrigin }}
                className="group/menu absolute right-0 top-full z-[95] mt-2 flex w-[244px] flex-col overflow-hidden rounded-[20px] bg-overlay p-1 shadow-seeko-pop"
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
                      <p className="truncate text-[14px] font-medium tracking-[-0.28px] text-ink-title">
                        {displayName}
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-[13px] text-ink-muted">{email}</p>
                  </div>
                </motion.div>

                <div className="mx-4 h-px bg-wash-5" />

                {/* Navigation */}
                <div className="flex flex-col">
                  <PopoverLink href="/activity" icon={Activity} label="Activity" reduce={reduce} onClick={close} />
                  <PopoverLink href="/team" icon={Users} label="Team" reduce={reduce} onClick={close} />
                  {/* Progress disabled 2026-07 — restore the PopoverLink (icon={Gauge}) to re-enable */}
                  <PopoverLink href="/settings" icon={Settings} label="Settings" reduce={reduce} onClick={close} />
                  <AppearanceToggle reduce={reduce} />
                </div>

                {/* Admin-only surfaces */}
                {isAdmin && (
                  <>
                    <div className="mx-4 h-px bg-wash-5" />
                    <div className="flex flex-col">
                      <PopoverLink href="/payments" icon={CreditCard} label="Payments" reduce={reduce} onClick={close} />
                      {/* Deep link: /payments?new=1 auto-opens the create dialog after the passkey gate */}
                      <PopoverLink href="/payments?new=1" icon={BadgePlus} label="New payment" reduce={reduce} onClick={close} />
                      <PopoverLink href="/admin/external-signing" icon={FileSignature} label="External Signing" reduce={reduce} onClick={close} />
                      <PopoverLink href="/investor" icon={TrendingUp} label="Investor Panel" reduce={reduce} onClick={close} />
                    </div>
                  </>
                )}

                <div className="mx-4 h-px bg-wash-5" />

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
                        <span className="text-[14px] font-medium tracking-[-0.28px] text-ink-muted">
                          Sign out?
                        </span>
                        <div className="flex items-center gap-3">
                          <form action="/auth/signout" method="post">
                            <button
                              type="submit"
                              className="text-[14px] font-medium text-[#e5484d] dark:text-danger transition-colors hover:text-[#d33b40] dark:hover:text-danger-strong"
                            >
                              Yes
                            </button>
                          </form>
                          <button
                            type="button"
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
                        type="button"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ ...SNAPPY, opacity: { duration: 0.12 } }}
                        onClick={() => setConfirmingSignOut(true)}
                        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-ink-title transition-[color,background-color] hover:bg-[rgba(229,72,77,0.08)] hover:text-[#e5484d] dark:hover:text-danger"
                      >
                        <span>Sign out</span>
                        <LogOut className="size-5" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}

/* Icon crossfade for the theme swap: both glyphs stay mounted and retarget
 * opacity/scale/blur from their current values, so rapid toggling stays
 * interruptible instead of restarting. Spring 0.3/bounce 0 per the craft kit. */
const THEME_ICON_SPRING = { type: 'spring' as const, duration: 0.3, bounce: 0 };

/** Appearance row — same grammar as PopoverLink, but a toggle that keeps the
 *  menu open so the flip is visible in place. Sun = light, Moon = dark. */
function AppearanceToggle({ reduce }: { reduce: boolean | null }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => subscribeTheme(setThemeState), []);

  const isDark = theme === 'dark';

  return (
    <motion.div variants={reduce ? undefined : MENU_ROW}>
      <motion.div whileHover={reduce ? undefined : { x: 2 }} transition={SNAPPY}>
        <button
          type="button"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-ink-title opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-wash-4 hover:opacity-100!"
        >
          <span>Appearance</span>
          <span className="relative size-5 text-ink-muted" aria-hidden>
            <motion.span
              className="absolute inset-0"
              initial={false}
              animate={
                reduce
                  ? { opacity: isDark ? 0 : 1 }
                  : { opacity: isDark ? 0 : 1, scale: isDark ? 0.25 : 1, filter: isDark ? 'blur(4px)' : 'blur(0px)' }
              }
              transition={reduce ? { duration: 0 } : THEME_ICON_SPRING}
            >
              <Sun className="size-5" />
            </motion.span>
            <motion.span
              className="absolute inset-0"
              initial={false}
              animate={
                reduce
                  ? { opacity: isDark ? 1 : 0 }
                  : { opacity: isDark ? 1 : 0, scale: isDark ? 1 : 0.25, filter: isDark ? 'blur(0px)' : 'blur(4px)' }
              }
              transition={reduce ? { duration: 0 } : THEME_ICON_SPRING}
            >
              <Moon className="size-5" />
            </motion.span>
          </span>
        </button>
      </motion.div>
    </motion.div>
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
          className="flex items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-ink-title opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-wash-4 hover:opacity-100!"
        >
          <span>{label}</span>
          <Icon className="size-5 text-ink-muted" />
        </Link>
      </motion.div>
    </motion.div>
  );
}
