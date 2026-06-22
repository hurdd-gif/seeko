import { createBrowserRouter, Link, Navigate, Outlet } from 'react-router';

export const routeInventory = [
  {
    path: '/',
    label: 'Overview',
  },
  {
    path: '/login',
    label: 'Login',
    showInNav: false,
  },
  {
    path: '/set-password',
    label: 'Set Password',
    showInNav: false,
  },
  {
    path: '/onboarding',
    label: 'Onboarding',
    showInNav: false,
  },
  {
    path: '/agreement',
    label: 'Agreement',
    showInNav: false,
  },
  {
    path: '/docs',
    label: 'Docs',
  },
  {
    path: '/tasks',
    label: 'Tasks',
  },
  {
    path: '/tasks/:id',
    label: 'Task Detail',
    showInNav: false,
  },
  {
    path: '/team',
    label: 'Team',
  },
  {
    path: '/payments',
    label: 'Payments',
  },
  {
    path: '/activity',
    label: 'Activity',
  },
  {
    path: '/notifications',
    label: 'Notifications',
  },
  {
    path: '/progress',
    label: 'Progress',
  },
  {
    path: '/settings',
    label: 'Settings',
  },
  {
    path: '/admin/external-signing',
    label: 'External Signing',
  },
  {
    path: '/investor',
    label: 'Investor',
  },
  {
    path: '/investor/docs',
    label: 'Investor Docs',
  },
  {
    path: '/investor/payments',
    label: 'Investor Payments',
  },
  {
    path: '/investor/settings',
    label: 'Investor Settings',
  },
  {
    path: '/investor-preview',
    label: 'Investor Preview',
    showInNav: false,
  },
  {
    path: '/invoice/:token',
    label: 'Invoice',
    showInNav: false,
  },
  {
    path: '/shared/:token',
    label: 'Shared Doc',
    showInNav: false,
  },
  {
    path: '/sign/:token',
    label: 'Signature',
    showInNav: false,
  },
  {
    path: '/sign/qa',
    label: 'Signer QA',
    showInNav: false,
  },
  {
    path: '*',
    label: 'Not Found',
    showInNav: false,
  },
] as const;

function RootLayout() {
  return (
    <div className="rr-shell">
      <aside className="rr-sidebar" aria-label="App routes">
        <Link className="rr-brand" to="/">
          <img src="/seeko-s.png" alt="" />
          <span>SEEKO</span>
        </Link>
        <nav>
          {routeInventory.filter(isNavRoute).map((route) => (
            <Link key={route.path} to={samplePath(route.path)}>
              {route.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="rr-main">
        <Outlet />
      </main>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/tasks" replace /> },
      {
        path: 'team',
        lazy: async () => {
          const route = await import('./routes/team');
          return {
            loader: route.teamLoader,
            Component: route.TeamRoute,
          };
        },
      },
      {
        path: 'docs',
        lazy: async () => {
          const route = await import('./routes/docs');
          return {
            loader: route.docsLoader,
            Component: route.DocsRoute,
          };
        },
      },
      {
        path: 'tasks',
        lazy: async () => {
          const route = await import('./routes/tasks');
          return {
            loader: route.tasksLoader,
            Component: route.TasksRoute,
          };
        },
      },
      {
        path: 'tasks/:id',
        lazy: async () => {
          const route = await import('./routes/task-detail');
          return {
            loader: route.taskDetailLoader,
            Component: route.TaskDetailRoute,
          };
        },
      },
      {
        path: 'payments',
        lazy: async () => {
          const route = await import('./routes/payments');
          return {
            loader: route.paymentsLoader,
            Component: route.PaymentsRoute,
          };
        },
      },
      {
        path: 'activity',
        lazy: async () => {
          const route = await import('./routes/activity');
          return {
            loader: route.activityLoader,
            Component: route.ActivityRoute,
          };
        },
      },
      {
        path: 'notifications',
        lazy: async () => {
          const route = await import('./routes/notifications');
          return {
            loader: route.notificationsLoader,
            Component: route.NotificationsRoute,
          };
        },
      },
      {
        path: 'progress',
        lazy: async () => {
          const route = await import('./routes/progress');
          return {
            loader: route.progressLoader,
            Component: route.ProgressRoute,
          };
        },
      },
      {
        path: 'admin/external-signing',
        lazy: async () => {
          const route = await import('./routes/external-signing-admin');
          return {
            loader: route.externalSigningAdminLoader,
            Component: route.ExternalSigningAdminRoute,
          };
        },
      },
      {
        path: 'investor',
        lazy: async () => {
          const route = await import('./routes/investor');
          return {
            loader: route.investorLoader,
            Component: route.InvestorRoute,
          };
        },
      },
      {
        path: 'investor/docs',
        lazy: async () => {
          const route = await import('./routes/investor-docs');
          return {
            loader: route.investorDocsLoader,
            Component: route.InvestorDocsRoute,
          };
        },
      },
      {
        path: 'investor/payments',
        lazy: async () => {
          const route = await import('./routes/investor-payments');
          return {
            loader: route.investorPaymentsLoader,
            Component: route.InvestorPaymentsRoute,
          };
        },
      },
      {
        path: 'investor/settings',
        lazy: async () => {
          const route = await import('./routes/investor-settings');
          return {
            loader: route.investorSettingsLoader,
            Component: route.InvestorSettingsRoute,
          };
        },
      },
      {
        path: 'settings',
        lazy: async () => {
          const route = await import('./routes/settings');
          return {
            loader: route.settingsLoader,
            Component: route.SettingsRoute,
          };
        },
      },
    ],
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
    lazy: async () => {
      const route = await import('./routes/sign');
      return {
        loader: route.signLoader,
        Component: route.SignRoute,
      };
    },
  },
  {
    path: '*',
    lazy: async () => {
      const route = await import('./routes/not-found');
      return {
        Component: route.NotFoundRoute,
      };
    },
  },
]);

function samplePath(path: string) {
  return path.replace(':token', 'sample-token').replace(':id', 'sample-task');
}

function isNavRoute(route: (typeof routeInventory)[number]) {
  return !('showInNav' in route && route.showInNav === false);
}
