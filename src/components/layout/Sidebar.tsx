'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
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
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Notification } from '@/lib/types';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Image from 'next/image';

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then(m => m.NotificationBell),
  { ssr: false }
);

const NAV_BASE = [
  { href: '/',         label: 'Overview',   mobileLabel: 'Home',   icon: LayoutDashboard, tourKey: 'OVERVIEW' },
  { href: '/tasks',    label: '__TASKS__',  mobileLabel: '__TASKS__', icon: CheckSquare,  tourKey: 'TASKS' },
  { href: '/team',     label: 'Team',       mobileLabel: 'Team',   icon: Users,           tourKey: 'TEAM' },
  { href: '/docs',     label: 'Docs',       mobileLabel: 'Docs',   icon: FileText,        tourKey: 'DOCS' },
  { href: '/activity', label: 'Activity',   mobileLabel: 'Activity', icon: Activity,      tourKey: 'ACTIVITY' },
];

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
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('seeko:sidebar-collapsed') === 'true';
  });
  const [hovered, setHovered] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    tooltipTimerRef.current = setTimeout(() => {
      setTooltip({ label: navLabel, y: rect.top + rect.height / 2 });
    }, 4000);
  };

  const handleNavMouseLeave = () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltip(null);
  };

  const NAV = NAV_BASE
    .filter(item => !(isContractor && item.href === '/activity'))
    .map(item =>
      item.label === '__TASKS__'
        ? { ...item, label: isAdmin ? 'All Tasks' : 'My Tasks', mobileLabel: 'Tasks' }
        : item
    );

  const label = displayName || email;

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 56 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative hidden md:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0 overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center shrink-0">
            <Image src="/seeko-s.png" alt="SEEKO" width={24} height={24} />
          </div>
          <span className="font-semibold text-base tracking-tight text-sidebar-foreground">SEEKO</span>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
          {NAV.map(({ href, label: navLabel, icon: Icon, tourKey }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            const tourId = TOUR_STEP_IDS[tourKey as keyof typeof TOUR_STEP_IDS];
            return (
              <Link
                key={href}
                id={tourId}
                href={href}
                className={[
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-white/5 text-seeko-accent font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                ].join(' ')}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-seeko-accent' : ''}`} />
                {navLabel}
              </Link>
            );
          })}
          {userId && (
            <NotificationBell
              userId={userId}
              initialCount={unreadCount}
              initialNotifications={notifications}
            />
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 mb-3">
            <Avatar className="size-8">
              <AvatarImage src={avatarUrl} alt={label} />
              <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                {getInitials(label)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              {displayName && (
                <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
          </div>
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
        </div>
      </motion.aside>

      {/* ── Mobile top header ─────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <Image src="/seeko-s.png" alt="SEEKO" width={20} height={20} />
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
          <Link href="/settings">
            <Avatar className="size-8">
              <AvatarImage src={avatarUrl} alt={label} />
              <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                {getInitials(label)}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>

      {/* ── Mobile bottom nav ─────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch bg-sidebar border-t border-sidebar-border">
        {NAV.map(({ href, mobileLabel, icon: Icon, tourKey }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const tourId = TOUR_STEP_IDS[tourKey as keyof typeof TOUR_STEP_IDS];
          return (
            <Link
              key={href}
              id={tourId}
              href={href}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                isActive ? 'text-seeko-accent' : 'text-muted-foreground',
              ].join(' ')}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-seeko-accent' : ''}`} />
              {mobileLabel}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
