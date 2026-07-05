'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Desktop Header
 *
 *  Mount   fade in (opacity 0 → 1, 150ms delay after nav settles)
 *
 *  The active tab in TopNav now communicates location, so the
 *  old animated page title was redundant and has been removed.
 * ───────────────────────────────────────────────────────── */

import { motion } from 'motion/react';
import { PageHeaderUser } from './PageHeaderUser';
import { TopNav } from './TopNav';
import { Notification } from '@/lib/types';
import { springs } from '@/lib/motion';

const SMOOTH = springs.smooth;

interface DesktopHeaderProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  isContractor?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
  team?: { id: string; display_name?: string | null; avatar_url?: string | null }[];
  areas?: { id: string; name: string }[];
}

export function DesktopHeader(props: DesktopHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...SMOOTH, delay: 0.15 }}
      className="hidden md:flex items-center justify-between px-6 pt-6 pb-3 shrink-0"
    >
      <TopNav isContractor={props.isContractor} />
      <PageHeaderUser {...props} />
    </motion.div>
  );
}
