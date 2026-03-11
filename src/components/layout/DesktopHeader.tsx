'use client';

import { usePathname } from 'next/navigation';
import { PageHeaderUser } from './PageHeaderUser';
import { Notification } from '@/lib/types';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/tasks': 'Tasks',
  '/docs': 'Docs',
  '/activity': 'Activity',
  '/team': 'Team',
  '/settings': 'Settings',
  '/payments': 'Payments',
  '/admin/external-signing': 'External Signing',
  '/investor': 'Investor Panel',
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match (e.g. /docs/123 → "Docs")
  const prefix = Object.keys(PAGE_TITLES).find(
    key => key !== '/' && pathname.startsWith(key)
  );
  return prefix ? PAGE_TITLES[prefix] : '';
}

interface DesktopHeaderProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}

export function DesktopHeader(props: DesktopHeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <div className="hidden md:flex items-center justify-between pl-14 pr-6 py-3 shrink-0">
      <h1 className="text-sm font-medium text-muted-foreground tracking-wide">
        {title}
      </h1>
      <PageHeaderUser {...props} />
    </div>
  );
}
