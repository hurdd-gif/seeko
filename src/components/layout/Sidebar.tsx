'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Notification } from '@/lib/types';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';

const NotificationBell = dynamic(() => import('@/components/dashboard/NotificationBell').then(m => m.NotificationBell), { ssr: false });
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const NAV_BASE = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/tasks', label: '__TASKS__', icon: CheckSquare },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/docs', label: 'Docs', icon: FileText },
  { href: '/activity', label: 'Activity', icon: Activity },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

interface SidebarProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}

export function Sidebar({ email, displayName, avatarUrl, userId, isAdmin = false, unreadCount = 0, notifications = [] }: SidebarProps) {
  const pathname = usePathname();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const NAV = NAV_BASE.map(item => item.label === '__TASKS__' ? { ...item, label: isAdmin ? 'All Tasks' : 'My Tasks' } : item);
  const label = displayName || email;

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center shrink-0">
          <img src="/seeko-logo.png" alt="SEEKO" className="h-6 w-6 invert" />
        </div>
        <span className="font-semibold text-base tracking-tight text-sidebar-foreground">
          SEEKO
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
        {NAV.map(({ href, label: navLabel, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const tourId = href === '/' ? TOUR_STEP_IDS.OVERVIEW
            : href.startsWith('/tasks') ? TOUR_STEP_IDS.TASKS
            : href.startsWith('/team') ? TOUR_STEP_IDS.TEAM
            : href.startsWith('/docs') ? TOUR_STEP_IDS.DOCS
            : href.startsWith('/activity') ? TOUR_STEP_IDS.ACTIVITY
            : undefined;
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
              <button
                type="submit"
                className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
              >
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
    </aside>
  );
}
