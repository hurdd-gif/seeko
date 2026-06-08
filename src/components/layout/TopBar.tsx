'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Top Bar (Frame 6 chrome)
 *
 *  Mount     bar fades in (opacity 0 → 1, 150ms delay)
 *  Nav pill  active segment slides via layoutId (snappy spring)
 *  Create    Plus button scales 1.05 hover / 0.95 tap (snappy)
 *
 *  Layout (left → right):
 *    [logo]  [ Issues | Docs ]  ……spacer……  🔔  ＋(admin)  ⋯More  ◔Profile
 *  Navigation lives in the pill + MoreMenu; identity lives in ProfileMenu.
 * ───────────────────────────────────────────────────────── */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { motion, LayoutGroup } from 'motion/react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Notification } from '@/lib/types';
import { springs } from '@/lib/motion';
import { useHaptics } from '@/components/HapticsProvider';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { MoreMenu } from './MoreMenu';
import { ProfileMenu } from './ProfileMenu';

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then(m => m.NotificationBell),
  { ssr: false }
);

const SMOOTH = springs.smooth;
const SNAPPY = springs.snappy;

const NAV_PILL = [
  { href: '/', label: 'Issues', tourId: TOUR_STEP_IDS.TASKS },
  { href: '/docs', label: 'Docs', tourId: TOUR_STEP_IDS.DOCS },
];

interface TopBarProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  isInvestor?: boolean;
  isContractor?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}

export function TopBar({
  email,
  displayName,
  avatarUrl,
  userId,
  isAdmin = false,
  isInvestor = false,
  isContractor = false,
  unreadCount = 0,
  notifications = [],
}: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { trigger } = useHaptics();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...SMOOTH, delay: 0.15 }}
      className="hidden md:flex items-center justify-between gap-4 px-6 py-3 shrink-0 border-b border-white/[0.04]"
    >
      {/* Left: logo + nav pill */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          onClick={() => trigger('selection')}
          className="flex items-center justify-center size-8 rounded-lg shrink-0"
          aria-label="Home"
        >
          <Image src="/seeko-s.png" alt="SEEKO" width={18} height={18} unoptimized />
        </Link>

        <LayoutGroup id="nav-pill">
          <nav className="flex items-center gap-0.5 rounded-xl bg-white/[0.03] p-1">
            {NAV_PILL.map(({ href, label, tourId }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  id={tourId}
                  href={href}
                  onClick={() => trigger('selection')}
                  className="relative px-4 py-1.5 text-sm font-medium rounded-lg"
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill-active"
                      className="absolute inset-0 rounded-lg bg-white/[0.06] border border-seeko-accent/20"
                      transition={SNAPPY}
                    />
                  )}
                  <span className={cn('relative', isActive ? 'text-seeko-accent' : 'text-muted-foreground hover:text-foreground transition-colors')}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </LayoutGroup>
      </div>

      {/* Right: notifications · create · more · profile */}
      <div className="flex items-center gap-2">
        {userId && (
          <NotificationBell
            userId={userId}
            initialCount={unreadCount}
            initialNotifications={notifications}
          />
        )}

        {isAdmin && (
          <motion.button
            onClick={() => { trigger('selection'); router.push('/?new=1'); }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={SNAPPY}
            className="flex size-8 items-center justify-center rounded-lg bg-seeko-accent/10 text-seeko-accent hover:bg-seeko-accent/20 transition-colors"
            aria-label="Create issue"
          >
            <Plus className="size-4" />
          </motion.button>
        )}

        <MoreMenu
          isAdmin={isAdmin}
          isInvestor={isInvestor}
          isContractor={isContractor}
          triggerId={TOUR_STEP_IDS.MORE}
        />

        <ProfileMenu email={email} displayName={displayName} avatarUrl={avatarUrl} />
      </div>
    </motion.div>
  );
}
