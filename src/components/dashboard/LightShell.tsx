'use client';

import { Link } from '@/lib/react-router-adapters';
import { FadeRise } from '@/components/motion';
import { AgentCompanion } from '@/components/dashboard/AgentCompanion';
import { EkoBusBridge } from '@/components/dashboard/EkoBusBridge';
import { StudioHeaderActions } from '@/components/dashboard/StudioHeaderActions';

export type AccountPillProps = React.ComponentProps<typeof StudioHeaderActions>;

type TabKey = 'issues' | 'docs';

interface LightShellProps {
  activeTab?: TabKey; // pill active chip; undefined = none active
  navLabel?: string; // <nav aria-label>; default 'Sections'
  account?: AccountPillProps; // when set, render shared account pill (right)
  actions?: React.ReactNode; // page-specific right cluster (e.g. board icons)
  fill?: boolean; // default false; true => outer adds ' flex flex-col'
  bordered?: boolean; // default false; true => header gets border-b
  animatePill?: boolean; // default true; wrap pill (and right cluster) in FadeRise
  headerPadding?: string; // default 'px-[52px] pt-11 pb-3'
  leftSlot?: React.ReactNode; // when set, replaces the pill nav (for breadcrumb/back headers)
  /**
   * A row that unfolds INSIDE the header, under the toolbar and above the
   * hairline (the board's filter chips). Inside, not below, on purpose: a
   * filter row is chrome — it describes what the page is showing, it isn't part
   * of the showing — so the border-b stays the one line between chrome and
   * content, and the board's own top gutter is measured from it either way.
   */
  subBar?: React.ReactNode;
  children: React.ReactNode;
}

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: 'issues', label: 'Issues', href: '/issues' },
  { key: 'docs', label: 'Docs', href: '/docs' },
];

// Flat tabs (no pill frame): active = darker text, inactive = quiet gray.
// Only the Create control is framed (per design call) — nav reads flat on the bar.
const TAB_BASE =
  'flex h-[32px] items-center px-2 text-[13.5px] font-medium leading-[18px] tracking-[-0.27px] transition-[color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]';
const TAB_ACTIVE = 'text-ink';
// Inactive tab must stay clickable, not read as disabled: #8a8a8a ≈ 3.4:1 on
// the near-white bar (clears the 3:1 floor), hover #5a5a5a ≈ 6.9:1 for a clear lift.
const TAB_INACTIVE = 'text-ink-muted hover:text-[#5a5a5a] dark:hover:text-ink-body';

export function LightShell({
  activeTab,
  navLabel = 'Sections',
  account,
  actions,
  fill = false,
  bordered = false,
  animatePill = true,
  headerPadding = 'px-[52px] pt-11 pb-3',
  leftSlot,
  subBar,
  children,
}: LightShellProps) {
  const pill = (
    <nav
      aria-label={navLabel}
      className="-ml-2 flex items-center gap-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            data-testid={`${tab.label} tab`}
            aria-current={isActive ? 'page' : undefined}
            className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );

  const leftElement = leftSlot ?? pill;

  // Page-specific actions (e.g. board toggles) sit just left of the global
  // account cluster, sharing one bar row. Either side may be absent.
  // gap-5 (20px) on the seam — wider than each group's 4–6px internal gaps —
  // so board controls and the account cluster read as two distinct groups,
  // not one undifferentiated strip of icons.
  const rightCluster =
    account || actions ? (
      <div className="flex items-center gap-5">
        {actions}
        {account ? <StudioHeaderActions {...account} /> : null}
      </div>
    ) : null;

  return (
    <div
      className={`overview-light fixed inset-0 z-40 overflow-hidden bg-[var(--ov-bg)] antialiased${
        fill ? ' flex flex-col' : ''
      }`}
    >
      <header
        className={
          bordered ? 'shrink-0 border-b border-wash-6 bg-[var(--ov-bg)]' : undefined
        }
      >
        <div className={`flex w-full items-center justify-between gap-3 ${headerPadding}`}>
          {animatePill ? (
            <FadeRise y={6} delay={0.04}>
              {leftElement}
            </FadeRise>
          ) : (
            leftElement
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
        {subBar}
      </header>
      {children}
      {/* EKO bus: routes tray-emitted `navigate` events (UI choreography only). */}
      <EkoBusBridge />
      <AgentCompanion userKey={account?.email} />
    </div>
  );
}
