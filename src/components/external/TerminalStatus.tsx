'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/motion';
import {
  LIGHT_TERMINAL_ICON,
  LIGHT_RECIPIENT_TITLE,
  LIGHT_RECIPIENT_MUTED,
} from '@/components/dashboard/lightKit';

interface TerminalStatusProps {
  /** Selects the icon-chip color from the terminal ladder (signed/expired/revoked/notfound). */
  iconKey: keyof typeof LIGHT_TERMINAL_ICON;
  /** The chip glyph; inherits the ladder color via `currentColor`. */
  icon: ReactNode;
  title: string;
  description: string;
  /** Optional CTA slot (e.g. the expired "Request a new link" action). */
  action?: ReactNode;
}

/**
 * The signer ceremony's end state: a centered icon chip + headline + line of
 * copy, rendered inside the RecipientSheet. Light-only and reused by every
 * terminal screen (signed / expired / revoked / not-found) so they read as one
 * coherent family. A Phase-5 primitive pulled forward — the chrome is being
 * rebuilt anyway, so the shared shape lands now rather than twice.
 */
export function TerminalStatus({ iconKey, icon, title, description, action }: TerminalStatusProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      // The app fade (springs.smooth opacity+y rise), riding in just behind the
      // sheet surface; opacity-only under prefers-reduced-motion.
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.12 } : { ...springs.smooth, delay: 0.04 }}
      className="flex flex-col items-center gap-5 py-6 text-center"
    >
      <div className={cn('flex size-14 items-center justify-center rounded-full', LIGHT_TERMINAL_ICON[iconKey])}>
        {icon}
      </div>
      <div className="flex flex-col gap-2">
        <h1 className={cn('text-[26px] leading-[1.15] tracking-[-0.02em]', LIGHT_RECIPIENT_TITLE)}>{title}</h1>
        <p className={cn('mx-auto max-w-[30ch] text-[16px] leading-relaxed', LIGHT_RECIPIENT_MUTED)}>
          {description}
        </p>
      </div>
      {action && <div className="w-full pt-1">{action}</div>}
    </motion.div>
  );
}
