'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Desktop Header
 *
 *  Mount     fade in (opacity 0 → 1, 150ms delay after rail)
 *  Navigate  page title crossfades vertically (snappy spring)
 * ───────────────────────────────────────────────────────── */

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { PageHeaderUser } from './PageHeaderUser';
import { Notification } from '@/lib/types';

const SMOOTH = { type: 'spring' as const, stiffness: 300, damping: 25 };
const SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };

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
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
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
  const prevPath = useRef(pathname);

  // Determine direction: compare route indices for vertical slide direction
  const routeOrder = ['/', '/tasks', '/docs', '/activity', '/team', '/settings', '/payments', '/admin/external-signing', '/investor'];
  const prevIdx = routeOrder.findIndex(r => r !== '/' ? prevPath.current.startsWith(r) : prevPath.current === '/');
  const currIdx = routeOrder.findIndex(r => r !== '/' ? pathname.startsWith(r) : pathname === '/');
  const direction = currIdx >= prevIdx ? 1 : -1;
  if (pathname !== prevPath.current) prevPath.current = pathname;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...SMOOTH, delay: 0.15 }}
      className="hidden md:flex items-center justify-between px-14 py-3 shrink-0 border-b border-white/[0.04]"
    >
      <div className="relative h-5 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.h1
            key={title}
            custom={direction}
            initial={{ opacity: 0, y: direction * 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction * -12 }}
            transition={{ ...SNAPPY, opacity: { duration: 0.15 } }}
            className="text-sm font-medium text-muted-foreground tracking-wide"
          >
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>
      <PageHeaderUser {...props} />
    </motion.div>
  );
}
