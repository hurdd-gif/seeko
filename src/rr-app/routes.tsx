import { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Navigate,
  useRouteError,
} from 'react-router';
import { INVESTOR_LAYOUT_ROUTE_ID } from './route-ids';

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

// For the SUNSET 500, which has a 500 six inches tall above it — and a copy
// button beside it. Different rules apply.
//
//   The mono line's whole job is to hand you the one thing you cannot retype:
//   what actually broke, quotable into a bug report. `statusText` is not that.
//   It is the canonical HTTP reason phrase — "Internal Server Error" — which the
//   mark already says, in bigger type. Putting it in the pill would offer a copy
//   button for the word you are looking at: the same mistake as the 404's old
//   "This page doesn't exist" headline, wearing a different element.
//
//   So: whatever the route actually WROTE (`data` on a thrown Response, or a
//   real Error message) — and otherwise nothing at all, pill included. A status
//   that ISN'T 500 still gets said, because there the mark is generic and the
//   number is news.
function getSunsetErrorDetail(error: unknown): string | null {
  if (isRouteErrorResponse(error)) {
    const written = typeof error.data === 'string' ? error.data.trim() : '';
    if (error.status === 500) return written || null;
    return [error.status, written || error.statusText].filter(Boolean).join(' ');
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return null;
}

// LAZY, and it has to stay that way. This module builds the router, so it is in
// the eager entry chunk — it is the one file in the app with no `motion/react`
// import, which is not an accident (motion was deliberately pulled out of the
// entry bundle). <ServerErrorContent> drags in motion AND the veil's canvas
// field; importing it here at the top would put both in front of every first
// paint, to serve a page almost nobody ever sees. An error boundary is exactly
// the right place to pay a chunk fetch.
const ServerErrorContent = lazy(async () => {
  const route = await import('./routes/server-error');
  return { default: route.ServerErrorContent };
});

// The Paper canvas the 500 renders on, held during that fetch. Not a spinner:
// the page it is standing in for is itself the "nothing loaded" state, and a
// spinner would promise content that is not coming. Just the right-colored
// ground, so the scheme doesn't flash.
function ServerErrorPage({ detail }: { detail: string | null }) {
  return (
    <Suspense
      fallback={
        <div className="overview-light min-h-dvh bg-white [color-scheme:light] dark:bg-[#171717] dark:[color-scheme:dark]" />
      }
    >
      <ServerErrorContent detail={detail} />
    </Suspense>
  );
}

// Every route mounts standalone (each page wears its own <LightShell> or
// investor shell), so there is no shared chrome for an error state to survive
// inside. The boundary owns the ENTIRE viewport, which is what makes the full
// 500 page right: it isn't competing with surrounding content, because on
// these routes there is none. This is the surface people actually mean when
// they say "the 500 page" — /500 itself is only where you go to look at it.
function StandaloneErrorBoundary() {
  const error = useRouteError();
  return <ServerErrorPage detail={getSunsetErrorDetail(error)} />;
}

export const router = createBrowserRouter([
  // Bare redirect, no layout element. The static ShellFrame mirror that used to
  // wrap this (hardcoded "SK" monogram, fake identity) is gone — every page now
  // mounts standalone and wears the real <LightShell account> chrome.
  { path: '/', element: <Navigate to="/issues" replace /> },
  {
    path: '/notifications',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/notifications');
      return { loader: route.notificationsLoader, Component: route.NotificationsRoute };
    },
  },
  {
    // Investor cluster wears its OWN chrome (<InvestorShell> — the light-ported
    // left <InvestorSidebar>), NOT the team Issues/Docs top-bar. It therefore
    // mounts as its own top-level layout route: investorLayoutLoader
    // gates access + supplies the sidebar identity, and the four investor pages
    // render as bare column content inside the shell's <Outlet>.
    //
    // The explicit id is load-bearing, not cosmetic: investorLayoutLoader is the
    // single owner of /api/investor-index, and the index child reaches its data
    // via useRouteLoaderData(INVESTOR_LAYOUT_ROUTE_ID) instead of fetching the
    // endpoint a second time in parallel. Removing the id breaks that route.
    id: INVESTOR_LAYOUT_ROUTE_ID,
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
    // Contractor portal — its own light Paper surface built from the login
    // reference (not the investor shell). Loader-gated on is_contractor.
    path: '/contractor',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/contractor');
      return {
        loader: route.contractorLoader,
        Component: route.ContractorRoute,
      };
    },
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
    // sidebar chrome because PaymentsAdmin owns its own fixed-inset <LightShell>
    // (+ AgentCompanion/EkoBus singletons) — nesting it would double both.
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
    // + board controls), top-level — mirroring the shipped Next.js /tasks page.
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
    // bespoke breadcrumb bar). Like /tasks it mounts top-level.
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
    // shipped Next.js settings page rendered.
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
    // own LightShell).
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
    // <SendInviteForm> + <InviteTable>.
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
    // No-backend visual-QA preview (no loader gate) for the comment card's
    // hold-to-delete control — the open → sweep → commit sequence and the
    // release retraction, in both schemes. Not in routeInventory.
    path: '/tasks/hold-delete-qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/hold-delete-qa');
      return {
        Component: route.HoldDeleteQaRoute,
      };
    },
  },
  {
    // No-backend visual-QA preview (no loader gate) for all three toast
    // systems (sonner, rich toast, live notification toast) in the Delphi
    // alert language. Not in routeInventory.
    path: '/toast-qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/toast-qa');
      return {
        Component: route.ToastQaRoute,
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
    // No-backend visual-QA preview (no loader gate) for the contractor portal's
    // pinned-deliverables + collapsing-timeline layout. Standalone. Not in routeInventory.
    path: '/contractor/qa',
    ErrorBoundary: StandaloneErrorBoundary,
    lazy: async () => {
      const route = await import('./routes/contractor-qa');
      return {
        Component: route.ContractorQaRoute,
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
    path: '/eko-preview',
    lazy: async () => {
      const route = await import('./routes/eko-preview');
      return {
        Component: route.EkoPreviewRoute,
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
    // The 500, as a page you can actually open. It is NOT how a 500 normally
    // reaches anyone — that is StandaloneErrorBoundary, above, which renders the
    // same component off a thrown loader — but a page that only exists inside a
    // failure is a page nobody can look at without causing one. Same reasoning as
    // /toast-qa and /payments-chart-qa, except this one is also a real, linkable
    // destination. No loader, no gate: an auth check on the error page is one more
    // thing that can fail while you are already failing.
    path: '/500',
    lazy: async () => {
      const route = await import('./routes/server-error');
      return {
        Component: route.ServerErrorRoute,
      };
    },
  },
  {
    // Catch-all 404 — the sunset mark on the Paper canvas. Sibling of /500 above;
    // they share <SunsetErrorPage> and differ in one line of copy and one button.
    path: '*',
    lazy: async () => {
      const route = await import('./routes/not-found');
      return {
        Component: route.NotFoundRoute,
      };
    },
  },
]);
