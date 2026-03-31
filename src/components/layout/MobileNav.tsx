'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  FileText,
  Activity,
  TrendingUp,
  DollarSign,
  FileSignature,
  MoreHorizontal,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Notification } from '@/lib/types';
import { getInitials } from '@/lib/utils';
import { TOUR_STEP_IDS_MOBILE } from '@/lib/tour-constants';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Image from 'next/image';
import { useHaptics } from '@/components/HapticsProvider';
import { springs } from '@/lib/motion';

const BOTTOM_NAV = {
  tapSpring: springs.snappy,
  tapScale: 0.92,
};

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

interface MobileNavProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  isContractor?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}

export function MobileNav({
  email, displayName, avatarUrl, userId, isAdmin = false, isContractor = false, unreadCount = 0, notifications = [],
}: MobileNavProps) {
  const pathname = usePathname();
  const { trigger } = useHaptics();
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  // Watch for data-modal-open attribute on <html> to hide bottom nav
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setModalOpen(document.documentElement.hasAttribute('data-modal-open'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-modal-open'] });
    return () => observer.disconnect();
  }, []);

  const NAV = [
    ...NAV_BASE
      .filter(item => !(isContractor && item.href === '/activity'))
      .map(item =>
        item.label === '__TASKS__'
          ? { ...item, label: isAdmin ? 'All Tasks' : 'My Tasks', mobileLabel: 'Tasks' as const }
          : item
      ),
    ...(isAdmin ? [
      { href: '/payments', label: 'Payments', mobileLabel: 'Pay' as const, icon: DollarSign, tourKey: undefined as undefined },
      { href: '/admin/external-signing', label: 'External Signing', mobileLabel: 'Sign' as const, icon: FileSignature, tourKey: undefined as undefined },
      NAV_INVESTOR,
    ] : []),
  ];

  const label = displayName || email;

  if (!mounted) return null;

  const headerSlot = typeof document !== 'undefined' ? document.getElementById('dashboard-mobile-header-slot') : null;
  const headerEl = headerSlot ?? document.body;
  const useHeaderSlot = Boolean(headerSlot);

  return (
    <>
      {createPortal(
        <header
          className={`md:hidden flex items-center justify-between px-4 h-14 w-full shrink-0 border-b border-border/50 ${!useHeaderSlot ? 'fixed top-0 left-0 right-0 z-40 mobile-fixed-layer' : ''}`}
          style={{
            background: 'rgba(26, 26, 26, 0.92)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          }}
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
        <>
          <nav
            className={`md:hidden fixed bottom-0 left-0 right-0 z-50 transition-opacity duration-150 mobile-bottom-nav ${moreOpen || modalOpen ? 'opacity-0 pointer-events-none' : ''}`}
            style={{
              background: 'rgba(26, 26, 26, 0.96)',
              backdropFilter: 'saturate(180%) blur(16px)',
              WebkitBackdropFilter: 'saturate(180%) blur(16px)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Active indicator bar */}
            <div className="relative flex items-stretch h-14">
              {(() => {
                const MAX_MOBILE_TABS = 5;
                const primaryNav = NAV.slice(0, MAX_MOBILE_TABS - (NAV.length > MAX_MOBILE_TABS ? 1 : 0));
                const overflowNav = NAV.length > MAX_MOBILE_TABS ? NAV.slice(MAX_MOBILE_TABS - 1) : [];
                const hasOverflow = overflowNav.length > 0;
                const isOverflowActive = overflowNav.some(({ href }) =>
                  href === '/' ? pathname === '/' : pathname.startsWith(href)
                );

                return (
                  <>
                    {primaryNav.map(({ href, mobileLabel, icon: Icon, tourKey }) => {
                      const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                      const tourId = tourKey != null ? (TOUR_STEP_IDS_MOBILE as Record<string, string>)[tourKey] : undefined;
                      return (
                        <motion.div key={href} className="flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                          <Link
                            id={tourId}
                            href={href}
                            onClick={() => { trigger('selection'); setMoreOpen(false); }}
                            className={[
                              'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors relative',
                              isActive ? 'text-seeko-accent' : 'text-muted-foreground',
                            ].join(' ')}
                          >
                            {isActive && (
                              <motion.div
                                layoutId="mobile-nav-indicator"
                                className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-seeko-accent"
                                transition={BOTTOM_NAV.tapSpring}
                              />
                            )}
                            <Icon className="size-5" />
                            {mobileLabel}
                          </Link>
                        </motion.div>
                      );
                    })}
                    {hasOverflow && (
                      <motion.div className="flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                        <button
                          id={TOUR_STEP_IDS_MOBILE.MORE}
                          onClick={() => { trigger('selection'); setMoreOpen(prev => !prev); }}
                          className={[
                            'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors relative',
                            moreOpen || isOverflowActive ? 'text-seeko-accent' : 'text-muted-foreground',
                          ].join(' ')}
                        >
                          {isOverflowActive && !moreOpen && (
                            <motion.div
                              layoutId="mobile-nav-indicator"
                              className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-seeko-accent"
                              transition={BOTTOM_NAV.tapSpring}
                            />
                          )}
                          <MoreHorizontal className="size-5" />
                          More
                        </button>
                      </motion.div>
                    )}
                  </>
                );
              })()}
            </div>
          </nav>
          {/* More menu overlay */}
          <AnimatePresence>
            {moreOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="md:hidden fixed inset-0 z-[60] bg-black/40"
                  onClick={() => setMoreOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 60 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 60 }}
                  transition={springs.firm}
                  className="md:hidden fixed bottom-0 left-0 right-0 z-[61] rounded-t-2xl border-t border-border/50 overflow-hidden"
                  style={{
                    background: 'rgba(26, 26, 26, 0.98)',
                    backdropFilter: 'saturate(180%) blur(20px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                  }}
                >
                  {/* Drag handle */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-9 h-1 rounded-full bg-white/[0.15]" />
                  </div>
                  <div className="flex items-center justify-between px-5 pb-2">
                    <span className="text-sm font-semibold text-foreground">More</span>
                    <button
                      onClick={() => setMoreOpen(false)}
                      className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 px-3 pb-4">
                    {NAV.slice(4).map(({ href, mobileLabel, icon: Icon }) => {
                      const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => { trigger('selection'); setMoreOpen(false); }}
                          className={[
                            'flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors',
                            isActive ? 'bg-seeko-accent/10 text-seeko-accent' : 'text-foreground hover:bg-white/[0.04]',
                          ].join(' ')}
                        >
                          <Icon className="size-5" />
                          {mobileLabel}
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}
    </>
  );
}
