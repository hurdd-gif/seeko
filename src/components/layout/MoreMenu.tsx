'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — More Menu (navigation)
 *
 *  Button   spring scale 1.05 on hover, 0.95 on tap (snappy)
 *  Popover  scale 0.95 → 1, opacity 0 → 1 (smooth spring)
 *  Links    x: 0 → 2 nudge on hover (snappy); active item tinted accent
 *
 *  This is the navigation half of the top-bar chrome — every destination that
 *  doesn't earn a spot in the Issues·Docs nav pill lives here. Identity/account
 *  actions live in the sibling ProfileMenu.
 * ───────────────────────────────────────────────────────── */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MoreHorizontal,
  Users,
  Activity,
  TrendingUp,
  DollarSign,
  FileSignature,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/components/HapticsProvider';
import { springs } from '@/lib/motion';

const SMOOTH = springs.smooth;
const SNAPPY = springs.snappy;

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
  show: boolean;
}

interface MoreMenuProps {
  isAdmin?: boolean;
  isInvestor?: boolean;
  isContractor?: boolean;
  /** id used by the onboarding tour to anchor on this trigger */
  triggerId?: string;
}

export function MoreMenu({ isAdmin = false, isInvestor = false, isContractor = false, triggerId }: MoreMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { trigger } = useHaptics();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const links: NavLink[] = [
    { href: '/team', label: 'Team', icon: Users, show: true },
    { href: '/activity', label: 'Activity', icon: Activity, show: !isContractor },
    { href: '/progress', label: 'Progress', icon: TrendingUp, show: isAdmin || isInvestor },
    { href: '/payments', label: 'Payments', icon: DollarSign, show: isAdmin },
    { href: '/admin/external-signing', label: 'External Signing', icon: FileSignature, show: isAdmin },
    { href: '/investor', label: 'Investor Panel', icon: TrendingUp, show: isAdmin },
  ].filter(l => l.show);

  return (
    <div className="relative">
      <motion.button
        ref={triggerRef}
        id={triggerId}
        onClick={() => { trigger('selection'); setOpen(prev => !prev); }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={SNAPPY}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
        aria-label="More navigation"
      >
        <MoreHorizontal className="size-4" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={SMOOTH}
            className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/[0.08] bg-popover backdrop-blur-xl backdrop-saturate-150 shadow-xl z-50 overflow-hidden py-1"
          >
            {links.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <motion.div key={href} whileHover={{ x: 2 }} transition={SNAPPY}>
                  <Link
                    href={href}
                    onClick={() => { trigger('selection'); setOpen(false); }}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'text-seeko-accent'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
