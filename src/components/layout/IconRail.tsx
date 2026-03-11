'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Icon Rail
 *
 *  Mount    rail fades in + slides right (x: -8 → 0, 200ms smooth spring)
 *  Nav      active pill slides between icons via layoutId (snappy spring)
 *  Hover    icon scales 1.1 (snappy), tooltip appears right (snappy)
 *  Tap      icon scales 0.9 (snappy)
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  Activity,
  DollarSign,
} from 'lucide-react';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { useHaptics } from '@/components/HapticsProvider';

const SMOOTH = { type: 'spring' as const, stiffness: 300, damping: 25 };
const SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };

const TOOLTIP = {
  initialX: -4,
  initialScale: 0.95,
  spring: SNAPPY,
};

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, tourKey: 'OVERVIEW' as const },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, tourKey: 'TASKS' as const },
  { href: '/docs', label: 'Docs', icon: FileText, tourKey: 'DOCS' as const },
  { href: '/activity', label: 'Activity', icon: Activity, tourKey: 'ACTIVITY' as const },
];

const ADMIN_NAV = [
  { href: '/payments', label: 'Payments', icon: DollarSign, tourKey: undefined as undefined },
];

interface IconRailProps {
  isAdmin?: boolean;
  isContractor?: boolean;
}

export function IconRail({ isAdmin = false, isContractor = false }: IconRailProps) {
  const pathname = usePathname();
  const { trigger } = useHaptics();
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const items = [
    ...NAV_ITEMS.filter(item => !(isContractor && item.href === '/activity')),
    ...(isAdmin ? ADMIN_NAV : []),
  ];

  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>, label: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, y: rect.top + rect.height / 2 });
  };

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={SMOOTH}
        className="hidden md:flex flex-col items-center gap-1 fixed left-2 top-3 z-30 rounded-xl border border-white/[0.06] bg-card p-1.5 shadow-lg"
      >
        {/* Logo — home link */}
        <Link
          href="/"
          onClick={() => trigger('selection')}
          className="flex items-center justify-center size-9 rounded-lg mb-1"
        >
          <Image src="/seeko-s.png" alt="SEEKO" width={18} height={18} unoptimized />
        </Link>

        <div className="w-5 h-px bg-white/[0.06] mb-0.5" />

        {/* Nav icons */}
        <LayoutGroup id="icon-rail">
          {items.map(({ href, label, icon: Icon, tourKey }, i) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            const tourId = tourKey != null ? TOUR_STEP_IDS[tourKey] : undefined;
            const isFirstAdmin = isAdmin && href === '/payments';

            return (
              <div key={href}>
                {isFirstAdmin && <div className="w-5 h-px bg-white/[0.06] my-0.5" />}
                <Link
                  id={tourId}
                  href={href}
                  onClick={() => trigger('selection')}
                  onMouseEnter={(e) => handleMouseEnter(e, label)}
                  onMouseLeave={() => setTooltip(null)}
                  className="relative flex items-center justify-center size-9 rounded-lg"
                >
                  {isActive && (
                    <motion.div
                      layoutId="rail-active"
                      className="absolute inset-0 rounded-lg bg-muted"
                      transition={SNAPPY}
                    />
                  )}
                  <motion.span
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    transition={SNAPPY}
                    className="relative flex items-center justify-center"
                  >
                    <Icon className={`size-4 ${isActive ? 'text-seeko-accent' : 'text-muted-foreground'}`} />
                  </motion.span>
                </Link>
              </div>
            );
          })}
        </LayoutGroup>
      </motion.nav>

      {/* Tooltip portal */}
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
              style={{ left: 56, top: tooltip.y, transform: 'translateY(-50%)' }}
            >
              <div className="rounded-md bg-card border border-border px-2 py-1 text-xs font-medium text-sidebar-foreground shadow-md whitespace-nowrap">
                {tooltip.label}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
