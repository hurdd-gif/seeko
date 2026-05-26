'use client';

import Link from 'next/link';
import { FadeRise } from '@/components/motion';
import { OverviewHeaderActions } from '@/components/dashboard/OverviewHeaderActions';

export type AccountPillProps = React.ComponentProps<typeof OverviewHeaderActions>;

type TabKey = 'overview' | 'issues' | 'docs';

interface LightShellProps {
  activeTab?: TabKey; // pill active chip; undefined = none active
  navLabel?: string; // <nav aria-label>; default 'Sections'
  account?: AccountPillProps; // when set, render shared account pill (right)
  actions?: React.ReactNode; // page-specific right cluster (e.g. board icons)
  fill?: boolean; // default false; true => outer adds ' flex flex-col'
  bordered?: boolean; // default false; true => header gets border-b
  animatePill?: boolean; // default true; wrap pill (and right cluster) in FadeRise
  headerPadding?: string; // default 'px-[52px] pt-6 pb-3'
  children: React.ReactNode;
}

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: 'overview', label: 'Overview', href: '/' },
  { key: 'issues', label: 'Issues', href: '/tasks' },
  { key: 'docs', label: 'Docs', href: '/docs' },
];

const TAB_BASE =
  'flex h-[32px] items-center rounded-full px-3 text-[13.5px] font-medium leading-[18px] tracking-[-0.27px]';
const TAB_ACTIVE = 'bg-[#0000000d] text-[#626262]';
const TAB_INACTIVE = 'text-[#c5c5c5] transition-colors duration-150 ease-out hover:text-[#808080]';

export function LightShell({
  activeTab,
  navLabel = 'Sections',
  account,
  actions,
  fill = false,
  bordered = false,
  animatePill = true,
  headerPadding = 'px-[52px] pt-6 pb-3',
  children,
}: LightShellProps) {
  const pill = (
    <nav
      aria-label={navLabel}
      className="flex h-[44px] items-center gap-1 rounded-full bg-white px-1.5 shadow-seeko"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );

  const rightCluster = account ? (
    <OverviewHeaderActions {...account} />
  ) : actions ? (
    actions
  ) : null;

  return (
    <div
      className={`overview-light fixed inset-0 z-40 overflow-hidden bg-[var(--ov-bg)] antialiased${
        fill ? ' flex flex-col' : ''
      }`}
    >
      <header
        className={
          bordered ? 'shrink-0 border-b border-black/[0.06] bg-[var(--ov-bg)]' : undefined
        }
      >
        <div className={`flex w-full items-center justify-between gap-3 ${headerPadding}`}>
          {animatePill ? (
            <FadeRise y={6} delay={0.04}>
              {pill}
            </FadeRise>
          ) : (
            pill
          )}
          {rightCluster &&
            (animatePill ? (
              <FadeRise y={6} delay={0.08}>
                {rightCluster}
              </FadeRise>
            ) : (
              rightCluster
            ))}
        </div>
      </header>
      {children}
    </div>
  );
}
