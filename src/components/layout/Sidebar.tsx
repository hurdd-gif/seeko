'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Sidebar
 *
 * Collapse / expand (on toggle click):
 *    +0ms   sidebar width springs 240px ↔ 56px
 *    +0ms   labels fade out (80ms) / fade in (150ms)
 *    +0ms   icons re-center via layout animation
 *
 * Tooltip (instant on hover, collapsed only):
 *    +0ms   scale 0.88 → 1, opacity 0 → 1, x −6 → 0  (spring)
 *   exit    scale → 0.88, opacity → 0, x → −6         (spring)
 *
 * Chevron (on sidebar hover):
 *    +0ms   opacity 0 → 1 (150ms)
 *   exit    opacity → 0   (150ms)
 * ───────────────────────────────────────────────────────── */

const SIDEBAR = {
  expandedWidth:  240,   // px — full sidebar
  collapsedWidth:  56,   // px — icon rail
  spring: { type: 'spring' as const, stiffness: 320, damping: 28 },
};

const LABEL = {
  enter: { duration: 0.15 },   // s — fade in
  exit:  { duration: 0.08 },   // s — fade out (faster)
};

const TOOLTIP = {
  initialX:     -6,     // px — slides in from left
  initialScale: 0.88,   // scale before appearing
  spring: { type: 'spring' as const, stiffness: 420, damping: 26 },
};

const CHEVRON = {
  duration: 0.15,  // s — fade in/out
};

const NAV_HIGHLIGHT = {
  spring: { type: 'spring' as const, stiffness: 380, damping: 30 },
};

const AVATAR = {
  hoverScale:  1.1,    // scale up on hover
  hoverRing:   2,      // ring width px (applied via boxShadow)
  spring: { type: 'spring' as const, stiffness: 400, damping: 20 },
};

const BOTTOM_NAV = {
  tapSpring: { type: 'spring' as const, stiffness: 450, damping: 28 },
  tapScale: 0.92,
};

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  FileText,
  LogOut,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Notification } from '@/lib/types';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Image from 'next/image';
import { useHaptics } from '@/components/HapticsProvider';

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then(m => m.NotificationBell),
  { ssr: false }
);

const NAV_BASE = [
  { href: '/',         label: 'Overview',   mobileLabel: 'Home',   icon: LayoutDashboard, tourKey: 'OVERVIEW' as const },
  { href: '/tasks',    label: '__TASKS__',  mobileLabel: '__TASKS__', icon: CheckSquare,  tourKey: 'TASKS' as const },
  { href: '/team',     label: 'Team',       mobileLabel: 'Team',   icon: Users,           tourKey: 'TEAM' as const },
  { href: '/docs',     label: 'Docs',       mobileLabel: 'Docs',   icon: FileText,        tourKey: 'DOCS' as const },
  { href: '/activity', label: 'Activity',   mobileLabel: 'Activity', icon: Activity,      tourKey: 'ACTIVITY' as const },
];

const NAV_INVESTOR = { href: '/investor', label: 'Investor Panel', mobileLabel: 'Investors', icon: TrendingUp, tourKey: undefined as undefined };

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

interface SidebarProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  isContractor?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}

export function Sidebar({
  email, displayName, avatarUrl, userId, isAdmin = false, isContractor = false, unreadCount = 0, notifications = [],
}: SidebarProps) {
  const pathname = usePathname();
  const { trigger } = useHaptics();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  // Always start expanded for SSR/hydration; sync from localStorage after mount to avoid mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('seeko:sidebar-collapsed') === 'true';
    setCollapsed(stored);
  }, []);
  const [hovered, setHovered] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('seeko:sidebar-collapsed', String(next));
      return next;
    });
  };

  const handleNavMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>, navLabel: string) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label: navLabel, y: rect.top + rect.height / 2 });
  };

  const handleNavMouseLeave = () => {
    setTooltip(null);
  };

  const NAV = [
    ...NAV_BASE
      .filter(item => !(isContractor && item.href === '/activity'))
      .map(item =>
        item.label === '__TASKS__'
          ? { ...item, label: isAdmin ? 'All Tasks' : 'My Tasks', mobileLabel: 'Tasks' as const }
          : item
      ),
    ...(isAdmin ? [NAV_INVESTOR] : []),
  ];

  const label = displayName || email;

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? SIDEBAR.collapsedWidth : SIDEBAR.expandedWidth }}
        transition={SIDEBAR.spring}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ width: collapsed ? SIDEBAR.collapsedWidth : SIDEBAR.expandedWidth }}
        className="relative hidden md:flex shrink-0 border-r border-sidebar-border bg-sidebar h-screen sticky top-0"
      >
        {/* Subtle inner glow for depth */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
        {/* Chevron toggle — outside overflow-hidden so it renders fully */}
        <AnimatePresence>
          {hovered && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: CHEVRON.duration }}
              onClick={toggleCollapsed}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 flex size-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar shadow-md text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <motion.span
                animate={{ rotate: collapsed ? 180 : 0 }}
                transition={SIDEBAR.spring}
                className="flex"
              >
                <ChevronLeft className="size-3.5" />
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Inner wrapper clips text overflow during width animation */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className={`flex items-center py-4 transition-all ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'}`}>
          <div className="flex h-8 w-8 items-center justify-center shrink-0 rounded-lg bg-white/[0.04]">
            <Image src="/seeko-s.png" alt="SEEKO" width={20} height={20} unoptimized />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={LABEL.enter}
                className="font-semibold text-sm tracking-widest uppercase text-sidebar-foreground whitespace-nowrap"
              >
                SEEKO
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1">
          <LayoutGroup id="sidebar-nav">
          {NAV.map(({ href, label: navLabel, icon: Icon, tourKey }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            const tourId = tourKey != null ? TOUR_STEP_IDS[tourKey] : undefined;
            return (
              <Link
                key={href}
                id={tourId}
                href={href}
                onMouseEnter={e => handleNavMouseEnter(e, navLabel)}
                onMouseLeave={handleNavMouseLeave}
                className={[
                  'relative flex items-center rounded-lg py-2 text-sm transition-colors',
                  collapsed ? 'justify-center px-0 w-full' : 'gap-3 px-3',
                  isActive
                    ? 'text-seeko-accent font-medium'
                    : 'text-muted-foreground hover:text-sidebar-foreground',
                ].join(' ')}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-highlight"
                    className="absolute inset-0 rounded-lg bg-seeko-accent/[0.08]"
                    transition={NAV_HIGHLIGHT.spring}
                  />
                )}
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="nav-accent-bar"
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-seeko-accent"
                    transition={NAV_HIGHLIGHT.spring}
                  />
                )}
                <span className={`relative flex items-center justify-center size-7 rounded-md shrink-0 ${isActive ? 'bg-seeko-accent/[0.12]' : ''}`}>
                  <Icon className={`h-4 w-4 ${isActive ? 'text-seeko-accent' : ''}`} />
                </span>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={LABEL.enter}
                      className="relative whitespace-nowrap"
                    >
                      {navLabel}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
          </LayoutGroup>
          {userId && (
            <NotificationBell
              userId={userId}
              initialCount={unreadCount}
              initialNotifications={notifications}
              collapsed={collapsed}
            />
          )}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2 mb-2'}`}>
            {collapsed ? (
              <Link href="/settings">
                <motion.div
                  whileHover={{
                    scale: AVATAR.hoverScale,
                    boxShadow: `0 0 0 ${AVATAR.hoverRing}px var(--color-seeko-accent)`,
                  }}
                  transition={AVATAR.spring}
                  className="rounded-full"
                >
                  <Avatar className="size-8">
                    <AvatarImage src={avatarUrl} alt={label} />
                    <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                      {getInitials(label)}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
              </Link>
            ) : (
              <Avatar className="size-8">
                <AvatarImage src={avatarUrl} alt={label} />
                <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                  {getInitials(label)}
                </AvatarFallback>
              </Avatar>
            )}
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={LABEL.enter}
                  className="flex-1 min-w-0"
                >
                  {displayName && (
                    <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{email}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {!collapsed && (
            <>
              <Link
                href="/settings"
                className={[
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                  pathname.startsWith('/settings')
                    ? 'text-seeko-accent font-medium bg-seeko-accent/[0.06]'
                    : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-white/[0.03]',
                ].join(' ')}
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
              {confirmingSignOut ? (
                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-xs text-muted-foreground">Sign out?</span>
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
              ) : (
                <button
                  onClick={() => setConfirmingSignOut(true)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-[#f87171] hover:bg-red-500/[0.06] transition-colors w-full"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              )}
            </>
          )}
        </div>
        </div>{/* end inner overflow wrapper */}

        {mounted && typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {tooltip && (
              <motion.div
                key={tooltip.label}
                initial={{ opacity: 0, x: TOOLTIP.initialX, scale: TOOLTIP.initialScale }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: TOOLTIP.initialX, scale: TOOLTIP.initialScale }}
                transition={TOOLTIP.spring}
                className="fixed z-[9999] pointer-events-none"
                style={{ left: 64, top: tooltip.y, transform: 'translateY(-50%)' }}
              >
                <div className="rounded-md bg-card border border-border px-2 py-1 text-xs font-medium text-sidebar-foreground shadow-md whitespace-nowrap">
                  {tooltip.label}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </motion.aside>

      {/* ── Mobile: header in-flow (logo, notifications, profile); nav fixed at bottom ── */}
      {mounted && (() => {
        const headerSlot = typeof document !== 'undefined' ? document.getElementById('dashboard-mobile-header-slot') : null;
        const headerEl = headerSlot ?? document.body;
        const useHeaderSlot = Boolean(headerSlot);
        return (
          <>
            {createPortal(
              <header
                className={`md:hidden flex items-center justify-between px-4 h-14 w-full shrink-0 ${!useHeaderSlot ? 'fixed top-0 left-0 right-0 z-40 mobile-fixed-layer' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <Image src="/seeko-s.png" alt="SEEKO" width={20} height={20} unoptimized />
                  <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">SEEKO</span>
                </div>
                <div className="flex items-center gap-2">
                  {userId && (
                    <NotificationBell
                      userId={userId}
                      initialCount={unreadCount}
                      initialNotifications={notifications}
                    />
                  )}
                  <Link href="/settings" onClick={() => trigger('selection')}>
                    <Avatar className="size-10">
                      <AvatarImage src={avatarUrl} alt={label} />
                      <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                        {getInitials(label)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                </div>
              </header>,
              headerEl
            )}
            {createPortal(
              <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-50"
                style={{
                  background: 'rgba(26, 26, 26, 0.96)',
                  backdropFilter: 'saturate(180%) blur(16px)',
                  WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                }}
              >
                <div className="flex items-stretch h-14">
                  {NAV.map(({ href, mobileLabel, icon: Icon, tourKey }) => {
                    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                    const tourId = tourKey != null ? TOUR_STEP_IDS[tourKey] : undefined;
                    return (
                      <motion.div key={href} className="flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                        <Link
                          id={tourId}
                          href={href}
                          onClick={() => trigger('selection')}
                          className={[
                            'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                            isActive ? 'text-seeko-accent' : 'text-muted-foreground',
                          ].join(' ')}
                        >
                          <Icon className="size-5" />
                          {mobileLabel}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </nav>,
              document.body
            )}
          </>
        );
      })()}
    </>
  );
}
