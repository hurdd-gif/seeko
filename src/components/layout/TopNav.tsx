'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Top Nav
 *
 *  Mount   pill fades in + settles (y: -4 → 0, smooth spring)
 *  Nav     active backdrop slides between tabs via layoutId (snappy)
 *  Hover   inactive label lifts to foreground (color, 150ms)
 *  Tap     tab scales 0.97 (press feedback)
 *
 *  Reduced motion: no transforms, no sliding backdrop — color only.
 * ───────────────────────────────────────────────────────── */

import { motion, LayoutGroup, useReducedMotion } from 'motion/react';
import { Link } from '@/lib/react-router-adapters';
import { usePathname } from '@/lib/react-router-adapters';
import { TOUR_STEP_IDS } from '@/lib/tour-constants';
import { springs } from '@/lib/motion';

const SMOOTH = springs.smooth;
const SNAPPY = springs.snappy;

const NAV_ITEMS = [
  { href: '/tasks', label: 'Tasks', tourKey: 'TASKS' as const },
  { href: '/docs', label: 'Docs', tourKey: 'DOCS' as const },
  { href: '/activity', label: 'Activity', tourKey: 'ACTIVITY' as const },
];

interface TopNavProps {
  isContractor?: boolean;
}

export function TopNav({ isContractor = false }: TopNavProps) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const items = NAV_ITEMS.filter(
    (item) => !(isContractor && item.href === '/activity'),
  );

  return (
    <motion.nav
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SMOOTH}
      aria-label="Primary"
      className="hidden h-[54px] items-center gap-6 rounded-full bg-[#212020] px-3 antialiased md:flex"
      style={{ borderWidth: '0.5px', borderStyle: 'solid', borderColor: '#F7F5F31F' }}
    >
      <LayoutGroup id="top-nav">
        {items.map(({ href, label, tourKey }) => {
          const isActive = pathname.startsWith(href);
          const tourId = tourKey != null ? TOUR_STEP_IDS[tourKey] : undefined;

          return (
            <Link
              key={href}
              id={tourId}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center rounded-full px-3 py-1.5 text-[14px] font-medium tracking-[-0.28px] transition-[color,transform] duration-150 ease-out active:scale-[0.97] ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="top-nav-active"
                  className="absolute inset-0 rounded-full bg-white/[0.05]"
                  transition={reduce ? { duration: 0 } : SNAPPY}
                  aria-hidden
                />
              )}
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </LayoutGroup>
    </motion.nav>
  );
}
