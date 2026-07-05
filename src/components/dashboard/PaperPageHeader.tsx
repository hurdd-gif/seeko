/* ─────────────────────────────────────────────────────────
 * PaperPageHeader — unified chrome for the paper-family pages.
 *
 * Renders the three-tab pill nav (Overview · Tasks · Docs) on the
 * left, an optional `pageActions` slot in the middle (filter /
 * view-toggle / rail-toggle on the tasks page), and the global
 * right cluster (notifications + Create + avatar + menu) on the
 * right.
 *
 * Use on every `.overview-light` page so the chrome flows. Activity
 * lives in the avatar dropdown (admin-only), not in the tab bar.
 * ───────────────────────────────────────────────────────── */

'use client';

import { Link } from '@/lib/react-router-adapters';
import type { ReactNode } from 'react';
// NOTE: PaperPageHeader is orphaned — superseded by LightShell. No live
// importer (only self-referenced). Kept building until deletion; candidate
// for removal alongside the Overview cleanup.
import { StudioHeaderActions } from './StudioHeaderActions';
import { FadeRise } from '@/components/motion';
import type { Notification } from '@/lib/types';

export type PaperPageTab = 'overview' | 'tasks' | 'docs';

const TABS: { id: PaperPageTab; label: string; href: string }[] = [
  { id: 'overview', label: 'Overview', href: '/' },
  { id: 'tasks', label: 'Tasks', href: '/tasks' },
  { id: 'docs', label: 'Docs', href: '/docs' },
];

export function PaperPageHeader({
  active,
  pageActions,
  email,
  initials,
  displayName,
  avatarUrl,
  userId,
  isAdmin = false,
  unreadCount = 0,
  notifications = [],
  team = [],
  areas = [],
}: {
  active: PaperPageTab;
  /** Optional page-specific actions rendered between the nav and the global cluster. */
  pageActions?: ReactNode;
  email: string;
  initials: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
  team?: { id: string; display_name?: string | null }[];
  areas?: { id: string; name: string }[];
}) {
  return (
    <header className="shrink-0 bg-[var(--ov-bg)]">
      <FadeRise y={6} delay={0.04}>
        <div className="flex w-full items-center justify-between gap-3 px-[52px] pt-6 pb-3">
          <nav
            aria-label="Sections"
            className="flex h-[54px] items-center gap-6 rounded-full bg-white px-3 shadow-seeko"
          >
            {TABS.map((t) =>
              t.id === active ? (
                <Link
                  key={t.id}
                  href={t.href}
                  aria-current="page"
                  className="flex h-[37px] items-center rounded-full bg-[#0000000d] px-3 py-1.5 text-[14px] font-medium leading-[18px] tracking-[-0.28px] text-[#626262]"
                >
                  {t.label}
                </Link>
              ) : (
                <Link
                  key={t.id}
                  href={t.href}
                  className="flex items-center px-3 py-1.5 text-[14px] font-medium leading-[18px] tracking-[-0.28px] text-[#c5c5c5] transition-colors duration-150 ease-out hover:text-[#808080]"
                >
                  {t.label}
                </Link>
              ),
            )}
          </nav>

          <div className="flex items-center gap-3">
            {pageActions && <div className="flex items-center gap-1">{pageActions}</div>}

            <StudioHeaderActions
              email={email}
              initials={initials}
              displayName={displayName}
              avatarUrl={avatarUrl}
              userId={userId}
              isAdmin={isAdmin}
              unreadCount={unreadCount}
              notifications={notifications}
              team={team}
              areas={areas}
            />
          </div>
        </div>
      </FadeRise>
    </header>
  );
}
