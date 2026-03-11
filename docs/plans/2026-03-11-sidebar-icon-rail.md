# Sidebar Icon Rail Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 240px desktop sidebar with a floating 48px icon rail and move user controls into page headers.

**Architecture:** The existing `Sidebar.tsx` gets rewritten into two components: `IconRail.tsx` (desktop nav) and `PageHeaderUser.tsx` (avatar + notifications for page headers). Mobile code stays in `Sidebar.tsx` untouched — it becomes `MobileNav.tsx`. The dashboard layout wires both together.

**Tech Stack:** React 19, Next.js 16 App Router, Motion (`motion/react`), Lucide icons, Tailwind v4

**Design doc:** `docs/plans/2026-03-11-sidebar-icon-rail-design.md`

---

### Task 1: Create IconRail component

**Files:**
- Create: `src/components/layout/IconRail.tsx`

**Step 1: Create the IconRail component**

```tsx
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
            // Add separator before admin items
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
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep IconRail || echo "Clean"`

**Step 3: Commit**

```bash
git add src/components/layout/IconRail.tsx
git commit -m "feat: add IconRail component — floating nav rail for desktop"
```

---

### Task 2: Create PageHeaderUser component

**Files:**
- Create: `src/components/layout/PageHeaderUser.tsx`

**Step 1: Create the PageHeaderUser component**

This is the avatar + notification bell + popover that goes in each page header.

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import {
  Settings,
  LogOut,
  Users,
  FileSignature,
  TrendingUp,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Notification } from '@/lib/types';
import dynamic from 'next/dynamic';
import { useHaptics } from '@/components/HapticsProvider';

const NotificationBell = dynamic(
  () => import('@/components/dashboard/NotificationBell').then(m => m.NotificationBell),
  { ssr: false }
);

const SMOOTH = { type: 'spring' as const, stiffness: 300, damping: 25 };

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

interface PageHeaderUserProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}

export function PageHeaderUser({
  email,
  displayName,
  avatarUrl,
  userId,
  isAdmin = false,
  unreadCount = 0,
  notifications = [],
}: PageHeaderUserProps) {
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const { trigger } = useHaptics();
  const label = displayName || email;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingSignOut(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setConfirmingSignOut(false); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="hidden md:flex items-center gap-2">
      {userId && (
        <NotificationBell
          userId={userId}
          initialCount={unreadCount}
          initialNotifications={notifications}
        />
      )}
      <div className="relative">
        <button
          ref={avatarRef}
          onClick={() => { trigger('selection'); setOpen(prev => !prev); }}
          className="rounded-full transition-shadow hover:ring-2 hover:ring-seeko-accent/30"
        >
          <Avatar className="size-8">
            <AvatarImage src={avatarUrl} alt={label} />
            <AvatarFallback className="bg-secondary text-foreground text-[10px]">
              {getInitials(label)}
            </AvatarFallback>
          </Avatar>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={SMOOTH}
              className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/[0.08] bg-popover backdrop-blur-xl shadow-xl z-50 overflow-hidden"
            >
              {/* User info */}
              <div className="px-3 py-3 border-b border-white/[0.06]">
                {displayName && (
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                )}
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>

              {/* Links */}
              <div className="py-1">
                <PopoverLink href="/team" icon={Users} label="Team" onClick={() => setOpen(false)} />
                <PopoverLink href="/settings" icon={Settings} label="Settings" onClick={() => setOpen(false)} />
                {isAdmin && (
                  <>
                    <div className="mx-3 my-1 h-px bg-white/[0.06]" />
                    <PopoverLink href="/admin/external-signing" icon={FileSignature} label="External Signing" onClick={() => setOpen(false)} />
                    <PopoverLink href="/investor" icon={TrendingUp} label="Investor Panel" onClick={() => setOpen(false)} />
                  </>
                )}
              </div>

              {/* Sign out */}
              <div className="border-t border-white/[0.06] py-1">
                {confirmingSignOut ? (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">Sign out?</span>
                    <div className="flex items-center gap-2">
                      <form action="/auth/signout" method="post">
                        <button type="submit" className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors">
                          Yes
                        </button>
                      </form>
                      <button
                        onClick={() => setConfirmingSignOut(false)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingSignOut(true)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-red-400 hover:bg-white/[0.03] transition-colors"
                  >
                    <LogOut className="size-3.5" />
                    Sign out
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PopoverLink({ href, icon: Icon, label, onClick }: { href: string; icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.03] transition-colors"
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/layout/PageHeaderUser.tsx
git commit -m "feat: add PageHeaderUser component — avatar popover for page headers"
```

---

### Task 3: Extract MobileNav from Sidebar

**Files:**
- Create: `src/components/layout/MobileNav.tsx`

**Step 1: Extract all mobile code from Sidebar.tsx into MobileNav.tsx**

Move lines 405-589 of the current `Sidebar.tsx` (the entire mobile section including header portal, bottom tab nav, and more menu) into a new `MobileNav.tsx` component. The props it needs:

```tsx
interface MobileNavProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  userId?: string;
  isAdmin?: boolean;
  isContractor?: boolean;
  unreadCount?: number;
  notifications?: Notification[];
}
```

Keep all the same imports it needs (motion, Link, usePathname, lucide icons, etc.), the `NAV` items logic, the `BOTTOM_NAV` spring config, the mobile header portal, the bottom nav, and the more menu overlay. This is a direct extraction — no behavior changes.

**Step 2: Commit**

```bash
git add src/components/layout/MobileNav.tsx
git commit -m "refactor: extract MobileNav from Sidebar into its own component"
```

---

### Task 4: Update dashboard layout to use new components

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Update layout imports and structure**

Replace the single `<Sidebar>` with the three new components. The key layout change: on desktop, the main content area needs `md:pl-14` (48px rail width + 8px margin) instead of being a flex sibling of the sidebar.

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchNotifications, fetchUnreadNotificationCount, fetchTeam, fetchAllDocs } from '@/lib/supabase/data';
import { IconRail } from '@/components/layout/IconRail';
import { MobileNav } from '@/components/layout/MobileNav';
import { PageHeaderUser } from '@/components/layout/PageHeaderUser';
import { DashboardTourWrapper } from '@/components/dashboard/DashboardTourWrapper';
import { PresenceHeartbeat } from '@/components/PresenceHeartbeat';
import { ActivityTracker } from '@/components/ActivityTracker';
import { PageTransition } from '@/components/layout/PageTransition';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { BugReportFAB } from '@/components/BugReportFAB';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (profile?.is_investor && !profile?.is_admin) redirect('/investor');

  const [notifications, unreadCount] = await Promise.all([
    fetchNotifications(user.id, 20).catch(() => []),
    fetchUnreadNotificationCount(user.id).catch(() => 0),
  ]);
  const [team, allDocs] = await Promise.all([
    fetchTeam().catch(() => []),
    fetchAllDocs().catch(() => []),
  ]);

  const isAdmin = profile?.is_admin ?? false;
  const userDept = profile?.department ?? '';
  const accessibleDocs = isAdmin ? allDocs : allDocs.filter((d) => {
    if (!d.restricted_department?.length) return true;
    if (d.restricted_department.includes(userDept)) return true;
    if (d.granted_user_ids?.includes(user.id)) return true;
    return false;
  });

  const showTour = profile?.onboarded === 1 && (profile?.tour_completed ?? 0) === 0;

  const userProps = {
    email: user.email ?? '',
    displayName: profile?.display_name ?? undefined,
    avatarUrl: profile?.avatar_url ?? undefined,
    userId: user.id,
    isAdmin,
    isContractor: profile?.is_contractor ?? false,
    unreadCount,
    notifications,
  };

  return (
    <DashboardTourWrapper showTour={showTour} userId={user.id} isContractor={profile?.is_contractor ?? false} isAdmin={isAdmin}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background md:min-h-screen md:h-auto md:overflow-visible">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden md:overflow-visible">
          <div id="dashboard-mobile-header-slot" className="md:hidden shrink-0 pt-[env(safe-area-inset-top)]" aria-hidden="true" />
          <IconRail isAdmin={isAdmin} isContractor={userProps.isContractor} />
          <MobileNav {...userProps} />
          <main className="flex-1 min-w-0 overflow-x-hidden md:overflow-auto md:pl-14" id="tour-main">
            <div className="max-w-5xl mx-auto px-5 md:px-6 py-4 md:py-8 pb-24 md:pb-8">
              {/* Page header with user controls — injected above page content on desktop */}
              <div className="hidden md:flex items-center justify-end mb-4">
                <PageHeaderUser {...userProps} />
              </div>
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
        </div>
      </div>
      <PresenceHeartbeat userId={user.id} />
      <ActivityTracker userId={user.id} />
      <CommandPalette
        team={team.map((m) => ({ id: m.id, display_name: m.display_name }))}
        docs={accessibleDocs.filter((d) => d.type !== 'deck').map((d) => ({ id: d.id, title: d.title }))}
        decks={accessibleDocs.filter((d) => d.type === 'deck').map((d) => ({ id: d.id, title: d.title }))}
        isContractor={profile?.is_contractor ?? false}
        isAdmin={isAdmin}
      />
      <BugReportFAB
        displayName={profile?.display_name ?? 'Unknown'}
        email={user.email ?? ''}
      />
    </DashboardTourWrapper>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "refactor: wire IconRail + MobileNav + PageHeaderUser into dashboard layout"
```

---

### Task 5: Delete old Sidebar.tsx

**Files:**
- Delete: `src/components/layout/Sidebar.tsx`

**Step 1: Remove the old sidebar**

After verifying the app works with the new components, delete `Sidebar.tsx` and remove any stale imports.

```bash
rm src/components/layout/Sidebar.tsx
```

**Step 2: Search for remaining Sidebar imports**

Run: `grep -r "from.*Sidebar" src/ --include="*.tsx" --include="*.ts"`

Fix any remaining imports (there should be none after Task 4 updated the layout).

**Step 3: Commit**

```bash
git add -A src/components/layout/Sidebar.tsx
git commit -m "refactor: remove old Sidebar component — replaced by IconRail + MobileNav"
```

---

### Task 6: Visual QA and fix spacing

**Files:**
- Possibly modify: `src/components/layout/IconRail.tsx`, `src/app/(dashboard)/layout.tsx`

**Step 1: Run dev server and check**

Run: `npm run dev`

Verify visually:
- Rail floats on the left with gap from edge
- Icons are vertically centered in rail
- Active indicator pill slides between icons on navigation
- Tooltips appear on hover
- Avatar + bell appear in top-right of each page
- Avatar popover opens/closes correctly
- Sign out flow works
- Mobile nav is completely unchanged
- `md:pl-14` gives enough clearance so content doesn't overlap the rail
- Tour still highlights correct elements

**Step 2: Adjust spacing values as needed**

The `md:pl-14` (56px) should clear the 48px rail + 8px margin. If it overlaps, bump to `md:pl-16` (64px).

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: adjust rail spacing and visual QA fixes"
```

---

### Task 7: Run interface-craft critique

**Step 1: Take a screenshot of the new desktop layout**

**Step 2: Run `/interface-craft critique` on the screenshot**

Evaluate visual hierarchy, spacing, alignment, consistency with SEEKO design language.

**Step 3: Fix any issues identified by the critique**

**Step 4: Commit**

```bash
git add -A
git commit -m "polish: address design critique feedback for icon rail"
```
