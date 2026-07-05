import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Link,
  Navigate,
  Outlet,
  useLocation,
  useRouteError,
} from 'react-router';
import {
  Activity as ActivityIcon,
  ChevronDown,
  CreditCard,
  FileSignature,
  Inbox,
  LogOut,
  Plus,
  RotateCw,
  Settings,
  TrendingUp,
  Users,
} from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

export const routeInventory = [
  {
    path: '/',
    label: 'Overview',
    nextFile: 'src/app/(dashboard)/page.tsx',
    migrationOrder: 3,
  },
  {
    path: '/login',
    label: 'Login',
    nextFile: 'src/app/(auth)/login/page.tsx',
    migrationOrder: 6,
    showInNav: false,
  },
  {
    path: '/set-password',
    label: 'Set Password',
    nextFile: 'src/app/set-password/page.tsx',
    migrationOrder: 6,
    showInNav: false,
  },
  {
    path: '/onboarding',
    label: 'Onboarding',
    nextFile: 'src/app/onboarding/page.tsx',
    migrationOrder: 6,
    showInNav: false,
  },
  {
    path: '/agreement',
    label: 'Agreement',
    nextFile: 'src/app/agreement/page.tsx',
    migrationOrder: 6,
    showInNav: false,
  },
  {
    path: '/docs',
    label: 'Docs',
    nextFile: 'src/app/(dashboard)/docs/page.tsx',
    migrationOrder: 4,
  },
  {
    path: '/issues',
    label: 'Issues',
    nextFile: 'src/app/(dashboard)/tasks/page.tsx',
    migrationOrder: 4,
  },
  {
    path: '/tasks/:id',
    label: 'Task Detail',
    nextFile: 'src/app/(dashboard)/tasks/[id]/page.tsx',
    migrationOrder: 4,
    showInNav: false,
  },
  {
    path: '/team',
    label: 'Team',
    nextFile: 'src/app/(dashboard)/team/page.tsx',
    migrationOrder: 4,
  },
  {
    path: '/payments',
    label: 'Payments',
    nextFile: 'src/app/(dashboard)/payments/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/activity',
    label: 'Activity',
    nextFile: 'src/app/(dashboard)/activity/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/notifications',
    label: 'Notifications',
    nextFile: 'src/app/(dashboard)/notifications/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/progress',
    label: 'Progress',
    nextFile: 'src/app/(dashboard)/progress/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/settings',
    label: 'Settings',
    nextFile: 'src/app/(dashboard)/settings/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/admin/external-signing',
    label: 'External Signing',
    nextFile: 'src/app/(dashboard)/admin/external-signing/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/investor',
    label: 'Investor',
    nextFile: 'src/app/(investor)/investor/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/investor/docs',
    label: 'Investor Docs',
    nextFile: 'src/app/(investor)/investor/docs/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/investor/payments',
    label: 'Investor Payments',
    nextFile: 'src/app/(investor)/investor/payments/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/investor/settings',
    label: 'Investor Settings',
    nextFile: 'src/app/(investor)/investor/settings/page.tsx',
    migrationOrder: 5,
  },
  {
    path: '/investor-preview',
    label: 'Investor Preview',
    nextFile: 'src/app/investor-preview/page.tsx',
    migrationOrder: 7,
    showInNav: false,
  },
  {
    path: '/invoice/:token',
    label: 'Invoice',
    nextFile: 'src/app/invoice/[token]/page.tsx',
    migrationOrder: 1,
    showInNav: false,
  },
  {
    path: '/shared/:token',
    label: 'Shared Doc',
    nextFile: 'src/app/shared/[token]/page.tsx',
    migrationOrder: 1,
    showInNav: false,
  },
  {
    path: '/sign/:token',
    label: 'Signature',
    nextFile: 'src/app/sign/[token]/page.tsx',
    migrationOrder: 1,
    showInNav: false,
  },
  {
    path: '/sign/qa',
    label: 'Signer QA',
    nextFile: 'src/app/sign/qa/page.tsx',
    migrationOrder: 7,
    showInNav: false,
  },
  {
    path: '*',
    label: 'Not Found',
    nextFile: 'src/app/not-found.tsx',
    migrationOrder: 7,
    showInNav: false,
  },
] as const;

/* ── Shell tabs + account-cluster menu (faithful to the shipped chrome) ──────────
 * The refreshed site's chrome is NOT a wide link bar. It is two flat tabs
 * (Issues → /issues, Docs → /docs) on the left and an account cluster on the
 * right: a notification glyph, a framed "Create" pill, a "More" popover holding
 * the secondary destinations, and an avatar identity menu. These mirror
 * src/components/dashboard/LightShell.tsx + StudioHeaderActions.tsx 1:1 so the
 * migration reads as the same product. */
const SHELL_TABS: { label: string; to: string; match: string }[] = [
  { label: 'Issues', to: '/issues', match: '/issues' },
  { label: 'Docs', to: '/docs', match: '/docs' },
];

const MORE_LINKS: { to: string; label: string; icon: ElementType }[] = [
  { to: '/activity', label: 'Activity', icon: ActivityIcon },
  { to: '/team', label: 'Team', icon: Users },
  // Progress disabled 2026-07 — nav entry removed and /progress redirects to
  // /tasks; restore both to re-enable.
  { to: '/settings', label: 'Settings', icon: Settings },
];

const MORE_ADMIN_LINKS: { to: string; label: string; icon: ElementType }[] = [
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/external-signing', label: 'External Signing', icon: FileSignature },
  { to: '/investor', label: 'Investor Panel', icon: TrendingUp },
];

const TAB_BASE =
  'flex h-8 items-center px-2 text-[13.5px] font-medium leading-[18px] tracking-[-0.27px] transition-[color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]';

function ShellTabs() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Sections" className="-ml-2 flex items-center gap-1">
      {SHELL_TABS.map((tab) => {
        const isActive = pathname === tab.match || pathname.startsWith(`${tab.match}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={isActive ? 'page' : undefined}
            className={`${TAB_BASE} ${isActive ? 'text-[#3a3a3a]' : 'text-[#8a8a8a] hover:text-[#5a5a5a]'}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ChromeMenuLink({
  to,
  label,
  icon: Icon,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: ElementType;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d] transition-[color,background-color] duration-150 ease-out hover:bg-[#0000000a]"
    >
      <span>{label}</span>
      <Icon className="size-5 text-[#808080]" />
    </Link>
  );
}

function StudioHeaderCluster() {
  const [open, setOpen] = useState<'more' | 'account' | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        moreRef.current && !moreRef.current.contains(target) &&
        accountRef.current && !accountRef.current.contains(target)
      ) {
        setOpen(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(null);
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1.5">
      {/* Notification glyph (visual parity with the live NotificationBell slot) */}
      <span className="flex size-9 items-center justify-center text-[#808080]">
        <Inbox className="size-4" strokeWidth={2} aria-hidden />
      </span>

      {/* The one framed control on the bar */}
      <button
        type="button"
        className="flex h-9 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-3.5 shadow-seeko transition-[background-color,transform] duration-150 ease-out hover:bg-[#f7f7f7] active:scale-[0.97]"
      >
        <Plus className="size-[15px] text-[#0d0d0d]" strokeWidth={2.25} aria-hidden />
        <span className="text-[14px] font-medium leading-[18px] tracking-[-0.28px] text-[#0d0d0d]">
          Create
        </span>
      </button>

      {/* More — secondary destinations */}
      <div ref={moreRef} className="relative">
        <button
          type="button"
          aria-expanded={open === 'more'}
          onClick={() => setOpen((prev) => (prev === 'more' ? null : 'more'))}
          className="flex h-9 items-center gap-1 rounded-full pl-3 pr-2 transition-[background-color,transform] duration-150 ease-out hover:bg-[#0000000a] active:scale-[0.97]"
        >
          <span className="text-[14px] font-medium leading-[18px] tracking-[-0.28px] text-[#0d0d0d]">
            More
          </span>
          <ChevronDown
            className={`size-[14px] text-[#808080] transition-transform duration-200 ease-out motion-reduce:transition-none ${
              open === 'more' ? 'rotate-180' : ''
            }`}
            strokeWidth={2.25}
            aria-hidden
          />
        </button>

        {open === 'more' && (
          <div className="rr-pop absolute right-0 top-full z-50 mt-[9px] flex w-[244px] origin-top-right flex-col gap-1 overflow-hidden rounded-[20px] bg-white p-1 shadow-seeko">
            <div className="flex flex-col">
              {MORE_LINKS.map((link) => (
                <ChromeMenuLink key={link.to} {...link} onNavigate={() => setOpen(null)} />
              ))}
            </div>
            <div className="mx-4 h-px bg-[#0000000d]" />
            <div className="flex flex-col">
              {MORE_ADMIN_LINKS.map((link) => (
                <ChromeMenuLink key={link.to} {...link} onNavigate={() => setOpen(null)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Identity */}
      <div ref={accountRef} className="relative">
        <button
          type="button"
          aria-label="Open account menu"
          aria-expanded={open === 'account'}
          onClick={() => setOpen((prev) => (prev === 'account' ? null : 'account'))}
          className="relative z-[60] flex size-9 items-center justify-center rounded-full bg-[#262626] text-[11px] font-medium leading-[13px] text-[#f0f0f0] ring-[0.5px] ring-inset ring-[#0000001f] transition-transform duration-150 ease-out hover:scale-105 active:scale-95"
        >
          SK
        </button>

        {open === 'account' && (
          <div className="rr-pop absolute right-[-12px] top-[-14px] z-50 flex w-[244px] origin-top-right flex-col gap-1 overflow-hidden rounded-[20px] bg-white p-1 shadow-seeko">
            <div className="flex items-center px-3 py-2.5 pr-14">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d]">
                  SEEKO Studio
                </p>
                <p className="mt-0.5 truncate text-[13px] text-[#808080]">studio@seeko.app</p>
              </div>
            </div>
            <div className="mx-4 h-px bg-[#0000000d]" />
            <a
              href="/login"
              className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d] transition-[color,background-color] duration-150 ease-out hover:bg-[rgba(229,72,77,0.08)] hover:text-[#e5484d]"
            >
              <span>Sign out</span>
              <LogOut className="size-5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// The whole rr-app wears the refreshed light "Paper" system. `overview-light`
// scopes the `--ov-*` tokens (also mirrored at :root in styles.css for the
// standalone routes), and the chrome below reproduces the shipped LightShell:
// a fixed Paper canvas, flat Issues/Docs tabs, the account cluster, and a single
// scrolling content column (max-w-5xl) — NOT a wide link bar.
function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-[var(--ov-bg)] antialiased">
      <header className="shrink-0 border-b border-black/[0.06]">
        <div className="flex w-full items-center justify-between gap-3 px-6 pt-8 pb-3 md:px-[52px] md:pt-11">
          <ShellTabs />
          <StudioHeaderCluster />
        </div>
      </header>
      <main className="scrollbar-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 md:px-[52px]">
          {children}
        </div>
      </main>
    </div>
  );
}

function RootLayout() {
  return (
    <ShellFrame>
      <Outlet />
    </ShellFrame>
  );
}

function getRouteErrorDetail(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return [error.status, error.statusText].filter(Boolean).join(' ') || String(error.status);
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

// Bare-canvas error composition (Midday / Threads / Tines pattern): quiet text
// directly on Paper, no card, no icon badge. An error is the absence of content,
// so it borrows nothing louder than the product's own compact pill buttons —
// the previous elevated card + tinted icon made failure the loudest surface in
// the app. The status detail reads as plain mono text (PayPal's debug-ID
// pattern), not a chip.
function PaperErrorState({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="mx-auto flex min-h-[min(620px,calc(100dvh-8rem))] w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-balance text-[15px] font-semibold text-[#111]">{title}</h1>
      <p className="mt-1.5 max-w-[44ch] text-pretty text-[13px] leading-relaxed text-[#808080]">
        {description}
      </p>
      <p className="mt-4 max-w-full truncate font-mono text-[11px] text-[#b3b3b3]">{detail}</p>
      <div className="mt-7 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${BTN_PRIMARY} ${LIGHT_FOCUS_RING} inline-flex items-center gap-1.5 pl-3.5`}
        >
          <RotateCw className="size-3.5" />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className={`${BTN_SECONDARY} ${LIGHT_FOCUS_RING} inline-flex items-center`}
        >
          Go back
        </button>
      </div>
    </div>
  );
}

// When a child loader throws with no closer boundary (e.g. the studio API is
// unreachable), React Router would otherwise replace the whole tree with its
// raw developer error page — wiping the chrome and reading as a broken site.
// Re-render the Paper shell with a calm error card instead, so EVERY route
// degrades into the light design rather than out of it.
function RootErrorBoundary() {
  const error = useRouteError();
  const detail = getRouteErrorDetail(error);
  return (
    <ShellFrame>
      <PaperErrorState
        title="This view didn’t load"
        description="The studio service didn’t respond. Refresh the page to try again. If it keeps happening, the API may be offline."
        detail={detail}
      />
    </ShellFrame>
  );
}

// Standalone routes (onboarding, agreement, invoice, sign, shared) render OUTSIDE
// RootLayout, so RootErrorBoundary can't catch their loader failures. They have
// no chrome to preserve, so degrade to a centered Paper card on the bare canvas —
// same calm language, still inside the light design rather than RR's raw 500 page.
function StandaloneErrorBoundary() {
  const error = useRouteError();
  const detail = getRouteErrorDetail(error);
  return (
    <div className="overview-light min-h-screen bg-[var(--ov-bg)] antialiased">
      <PaperErrorState
        title="This page didn’t load"
        description="The studio service didn’t respond. Refresh to try again. If it keeps happening, the service may be offline."
        detail={detail}
      />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    ErrorBoundary: RootErrorBoundary,
    children: [
      { index: true, element: <Navigate to="/issues" replace /> },
      {
        path: 'notifications',
        lazy: async () => {
          const route = await import('./routes/notifications');
          // No loader: the faithful <NotificationsPanel> is a self-contained
          // preferences surface that needs no server data.
          return { Component: route.NotificationsRoute };
        },
      },
    ],
  },
  {
    // Investor cluster wears its OWN chrome (<InvestorShell> — the light-ported
    // left <InvestorSidebar>), NOT the team Issues/Docs top-bar. It therefore
    // mounts OUTSIDE RootLayout as its own layout route: investorLayoutLoader
    // gates access + supplies the sidebar identity, and the four investor pages
    // render as bare column content inside the shell's <Outlet>.
    path: '/investor',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/investor-layout');
      return {
        loader: route.investorLayoutLoader,
        Component: route.InvestorLayout,
      };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const route = await import('./routes/investor');
          return {
            loader: route.investorLoader,
            Component: route.InvestorRoute,
          };
        },
      },
      {
        path: 'docs',
        lazy: async () => {
          const route = await import('./routes/investor-docs');
          return {
            loader: route.investorDocsLoader,
            Component: route.InvestorDocsRoute,
          };
        },
      },
    ],
  },
  {
    // Investor settings is a full-bleed Paper page: it renders the SHARED
    // <SettingsPanel>, which owns its own fixed-inset <LightShell>. Like the team
    // /settings route it mounts OUTSIDE the investor sidebar chrome (the panel's
    // LightShell is its own full-screen surface) — exactly how the shipped page
    // looked, where the settings shell covered the investor sidebar.
    path: '/investor/settings',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/investor-settings');
      return {
        loader: route.investorSettingsLoader,
        Component: route.InvestorSettingsRoute,
      };
    },
  },
  {
    // Investor Payments IS the shared studio payments screen (read-only), NOT a
    // bespoke investor view — per user call: "the payment page investors see
    // should be the exact same one from the main studio." It reuses /payments'
    // own loader + <PaymentsAdmin>, which renders in viewerMode for a non-admin
    // investor: the passkey gate is skipped, every admin control (New Payment,
    // approve/deny, refund, invoice queue) is hidden, and the back link points to
    // /investor. Like /investor/settings above, it mounts OUTSIDE the investor
    // sidebar chrome because PaymentsAdmin owns its own fixed-inset <LightShell>;
    // nesting it would double the fixed header chrome.
    // Server-side, every mutation still requires the admin passkey token an
    // investor never holds, and the list endpoint scopes investors to paid rows;
    // viewerMode is defense-in-depth, not the only gate.
    path: '/investor/payments',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/payments');
      return {
        loader: route.paymentsLoader,
        Component: route.PaymentsRoute,
      };
    },
  },
  {
    // Issues is the landing surface and owns the global chrome: <TasksBoard>
    // renders its OWN full-bleed <LightShell> (Issues/Docs tabs + account cluster
    // + board controls). It therefore mounts OUTSIDE RootLayout/ShellFrame to
    // avoid a doubled fixed header — mirroring the shipped Next.js /tasks page.
    path: '/issues',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/tasks');
      return {
        loader: route.tasksLoader,
        Component: route.TasksRoute,
      };
    },
  },
  {
    path: '/tasks',
    element: <Navigate to="/issues" replace />,
  },
  {
    // The task detail (/tasks/:id) renders the original <TaskDetailPage>, which
    // owns its own full-bleed chrome (`overview-light fixed inset-0` with a
    // bespoke breadcrumb bar). Like /tasks it mounts OUTSIDE RootLayout/ShellFrame
    // so the shared shell never doubles up with the page's own fixed header.
    path: '/tasks/:id',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/task-detail');
      return {
        loader: route.taskDetailLoader,
        Component: route.TaskDetailRoute,
      };
    },
  },
  {
    // Docs/Activity/Progress are full-bleed Paper pages: each renders its OWN
    // <LightShell> (fixed inset-0 with the Issues/Docs tabs + account cluster),
    // exactly like the shipped Next.js pages. They mount OUTSIDE
    // RootLayout/ShellFrame so the shared shell never doubles up.
    path: '/docs',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/docs');
      return {
        loader: route.docsLoader,
        Component: route.DocsRoute,
      };
    },
  },
  {
    path: '/activity',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/activity');
      return {
        loader: route.activityLoader,
        Component: route.ActivityRoute,
      };
    },
  },
  {
    // Progress disabled 2026-07 — page kept in ./routes/progress for easy
    // re-enable; until then the URL falls back to the board.
    path: '/progress',
    element: <Navigate to="/issues" replace />,
  },
  {
    // Team is a full-bleed Paper page too: it renders its OWN <LightShell fill
    // bordered> with a back-link to the board (no Issues/Docs tabs, no account
    // cluster) — exactly the drill-in chrome the shipped Next.js team page uses.
    // Mounts OUTSIDE RootLayout/ShellFrame so the shared shell never doubles up.
    path: '/team',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/team');
      return {
        loader: route.teamLoader,
        Component: route.TeamRoute,
      };
    },
  },
  {
    // Settings is a full-bleed Paper page too: the original <SettingsPanel> owns
    // its OWN <LightShell fill bordered> with a back-link to the board (no
    // Issues/Docs tabs, no account cluster) — exactly the drill-in chrome the
    // shipped Next.js settings page rendered. Mounts OUTSIDE RootLayout/ShellFrame
    // so the shared shell never doubles up with the panel's own fixed header.
    path: '/settings',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/settings');
      return {
        loader: route.settingsLoader,
        Component: route.SettingsRoute,
      };
    },
  },
  {
    // Payments is a full-bleed Paper page too: the original <PaymentsAdmin> owns
    // its OWN <LightShell fill bordered> (back-link breadcrumb, no Issues/Docs
    // tabs) and self-gates with the passkey flow (PaymentsPasskeyGate, also its
    // own LightShell). Mounts OUTSIDE RootLayout/ShellFrame so the shared shell
    // never doubles up with the page's own fixed header.
    path: '/payments',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/payments');
      return {
        loader: route.paymentsLoader,
        Component: route.PaymentsRoute,
      };
    },
  },
  {
    // External Signing admin is a full-bleed Paper drill-in: the original
    // <ExternalSigningAdmin> owns its OWN <LightShell fill bordered> (back-link to
    // /tasks REPLACES the Issues/Docs tabs) and composes the real self-fetching
    // <SendInviteForm> + <InviteTable>. Mounts OUTSIDE RootLayout/ShellFrame so the
    // LightShell's fixed header never doubles up with the dashboard shell.
    path: '/admin/external-signing',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/external-signing-admin');
      return {
        loader: route.externalSigningAdminLoader,
        Component: route.ExternalSigningAdminRoute,
      };
    },
  },
  {
    // No-backend visual-QA preview (no loader gate). Standalone too, so the
    // drill-in LightShell renders un-doubled. Not in routeInventory.
    path: '/admin/external-signing/qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/external-signing-admin-qa');
      return {
        Component: route.ExternalSigningAdminQaRoute,
      };
    },
  },
  {
    // No-backend visual-QA preview (no loader gate) for the onboarding step.
    // Standalone too, so the LightAuthShell renders un-doubled. Not in routeInventory.
    path: '/onboarding/qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/onboarding-qa');
      return {
        Component: route.OnboardingQaRoute,
      };
    },
  },
  {
    // No-backend visual-QA preview (no loader gate) for the restored inbox bell +
    // slide/pop badge. Mounts the real LightShell header with a userId account.
    // Standalone (LightShell is full-bleed). Not in routeInventory.
    path: '/tasks/bell-qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/header-bell-qa');
      return {
        Component: route.HeaderBellQaRoute,
      };
    },
  },
  {
    // No-backend visual-QA preview (no loader gate) for the Hidden columns
    // rollup's expand/collapse motion. Not in routeInventory.
    path: '/tasks/hidden-columns-qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/hidden-columns-qa');
      return {
        Component: route.HiddenColumnsQaRoute,
      };
    },
  },
  {
    // No-backend visual-QA preview (no passkey gate) for the payments Outflow
    // chart's loading/loaded/empty states. Not in routeInventory.
    path: '/payments-chart-qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/payments-chart-qa');
      return {
        Component: route.PaymentsChartQaRoute,
      };
    },
  },
  {
    path: '/login',
    lazy: async () => {
      const route = await import('./routes/login');
      return {
        Component: route.LoginRoute,
      };
    },
  },
  {
    // Public legal documents (terms / developer-terms / privacy) — linked from
    // the login footer, so visitors can read them without an account.
    path: '/legal/:slug',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/legal');
      return {
        Component: route.LegalRoute,
      };
    },
  },
  {
    path: '/set-password',
    lazy: async () => {
      const route = await import('./routes/set-password');
      return {
        Component: route.SetPasswordRoute,
      };
    },
  },
  {
    path: '/onboarding',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/onboarding');
      return {
        loader: route.onboardingLoader,
        Component: route.OnboardingRoute,
      };
    },
  },
  {
    path: '/agreement',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/agreement');
      return {
        loader: route.agreementLoader,
        Component: route.AgreementRoute,
      };
    },
  },
  {
    path: '/invoice/:token',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/invoice');
      return {
        loader: route.invoiceLoader,
        Component: route.InvoiceRoute,
      };
    },
  },
  {
    path: '/investor-preview',
    lazy: async () => {
      const route = await import('./routes/investor-preview');
      return {
        Component: route.InvestorPreviewRoute,
      };
    },
  },
  {
    path: '/investor-preview/docs',
    lazy: async () => {
      const route = await import('./routes/investor-preview');
      return {
        Component: route.InvestorDocsPreviewRoute,
      };
    },
  },
  {
    path: '/investor-preview/payments',
    lazy: async () => {
      const route = await import('./routes/investor-preview');
      return {
        Component: route.InvestorPaymentsPreviewRoute,
      };
    },
  },
  {
    path: '/sign/qa',
    lazy: async () => {
      const route = await import('./routes/sign-qa');
      return {
        Component: route.SignQaRoute,
      };
    },
  },
  {
    path: '/shared/:token',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/shared');
      return {
        loader: route.sharedDocLoader,
        Component: route.SharedDocRoute,
      };
    },
  },
  {
    path: '/sign/:token',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/sign');
      return {
        loader: route.signLoader,
        Component: route.SignRoute,
      };
    },
  },
  {
    // Catch-all 404 — the scroll-drawn "off the map" page on the Paper canvas.
    path: '*',
    lazy: async () => {
      const route = await import('./routes/not-found');
      return {
        Component: route.NotFoundRoute,
      };
    },
  },
]);
