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

/* ─────────────────────────────────────────────────────────
 * MOBILE PILL NAV STORYBOARD
 *
 *   tap    tab scale 1 → 0.94 (spring), release → 1
 *   switch active pill background slides to new tab (layoutId spring)
 *   spacing pill padding, item padding, gap all from MOBILE_PILL
 * ───────────────────────────────────────────────────────── */

const MOBILE_PILL = {
  pillPaddingX: 4,     // px — inner horizontal padding of pill (reduced so pill fits iPhone)
  pillPaddingY: 5,     // px — inner vertical padding of pill
  itemGap: 4,         // px — gap between tab items
  itemPaddingX: 8,     // px — each tab horizontal padding
  itemPaddingY: 8,    // px — each tab vertical padding
  itemMinWidth: 44,   // px — minimum width per tab (fits 6 items in ~320px)
  iconLabelGap: 2,    // px — gap between icon and label
  tapScale: 0.94,
  tapSpring: { type: 'spring' as const, stiffness: 450, damping: 28 },
  activeSlideSpring: { type: 'spring' as const, stiffness: 380, damping: 30 },
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
        {/* Chevron toggle — outside overflow-hidden so it renders fully */}
        <AnimatePresence>
          {hovered && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: CHEVRON.duration }}
              onClick={toggleCollapsed}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 flex size-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar shadow-sm text-muted-foreground hover:text-foreground transition-colors"
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
        <div className={`flex items-center py-5 transition-all ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'}`}>
          <div className="flex h-8 w-8 items-center justify-center shrink-0">
            <Image src="/seeko-s.png" alt="SEEKO" width={24} height={24} unoptimized />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={LABEL.enter}
                className="font-semibold text-base tracking-tight text-sidebar-foreground whitespace-nowrap"
              >
                SEEKO
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
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
                  'relative flex items-center rounded-md py-2.5 text-sm',
                  collapsed ? 'justify-center px-0 w-full' : 'gap-3 px-3',
                  isActive
                    ? 'text-seeko-accent font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                ].join(' ')}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-highlight"
                    className="absolute inset-0 rounded-md bg-white/5"
                    transition={NAV_HIGHLIGHT.spring}
                  />
                )}
                <Icon className={`relative h-4 w-4 shrink-0 ${isActive ? 'text-seeko-accent' : ''}`} />
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

        <div className="p-4 border-t border-sidebar-border">
          <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
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
                  'flex items-center gap-2 rounded-md px-0 py-1.5 text-xs transition-colors mb-1',
                  pathname.startsWith('/settings')
                    ? 'text-seeko-accent font-medium'
                    : 'text-muted-foreground hover:text-foreground',
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
                  className="flex items-center gap-2 rounded-md px-0 py-1.5 text-xs text-muted-foreground hover:text-[#f87171] transition-colors w-full"
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

      {/* ── Mobile: no in-app header (avoids double bar with status bar); nav fixed at bottom ── */}
      {mounted && (() => {
        return (
          <>
            {createPortal(
              <nav
                className="mobile-fixed-layer md:hidden fixed bottom-0 left-0 right-0 z-50 mx-auto w-max max-w-[calc(100vw-24px)] flex justify-center items-center"
                style={{ marginBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
              >
                <div
                  className="w-max flex items-center justify-center rounded-full border border-border/50 shadow-lg"
                  style={{
                    background: 'rgba(26, 26, 26, 0.94)',
                    backdropFilter: 'saturate(180%) blur(12px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                    paddingLeft: MOBILE_PILL.pillPaddingX,
                    paddingRight: MOBILE_PILL.pillPaddingX,
                    paddingTop: MOBILE_PILL.pillPaddingY,
                    paddingBottom: MOBILE_PILL.pillPaddingY,
                    gap: MOBILE_PILL.itemGap,
                  }}
                >
                  <LayoutGroup id="mobile-nav">
                  {NAV.map(({ href, mobileLabel, icon: Icon, tourKey }) => {
                    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                    const tourId = tourKey != null ? TOUR_STEP_IDS[tourKey] : undefined;
                    return (
                      <Link
                        key={href}
                        id={tourId}
                        href={href}
                        onClick={() => trigger('selection')}
                        className={[
                          'relative flex flex-col items-center justify-center rounded-full text-[10px] font-medium transition-colors',
                          isActive ? 'text-seeko-accent' : 'text-muted-foreground',
                        ].join(' ')}
                        style={{
                          paddingLeft: MOBILE_PILL.itemPaddingX,
                          paddingRight: MOBILE_PILL.itemPaddingX,
                          paddingTop: MOBILE_PILL.itemPaddingY,
                          paddingBottom: MOBILE_PILL.itemPaddingY,
                          minWidth: MOBILE_PILL.itemMinWidth,
                        }}
                      >
                        <motion.span
                          className="relative flex flex-col items-center justify-center"
                          style={{ gap: MOBILE_PILL.iconLabelGap }}
                          whileTap={{ scale: MOBILE_PILL.tapScale }}
                          transition={MOBILE_PILL.tapSpring}
                        >
                          <Icon className={`h-4 w-4 ${isActive ? 'text-seeko-accent' : ''}`} />
                          {mobileLabel}
                        </motion.span>
                      </Link>
                    );
                  })}
                  </LayoutGroup>
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
