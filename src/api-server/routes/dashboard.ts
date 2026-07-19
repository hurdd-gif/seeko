import { Hono, type Context } from 'hono';
import {
  loadActivityIndex,
  loadNotificationsIndex,
  loadProgressIndex,
  loadSettingsIndex,
  type ActivityIndexData,
  type NotificationsIndexData,
  type ProgressIndexData,
  type SettingsIndexData,
} from '@/lib/dashboard-index';
import {
  loadActivityView,
  loadDocsView,
  loadNotificationsView,
  loadPaymentsView,
  loadProgressView,
  loadSettingsView,
  type ActivityViewData,
  type DocsViewData,
  type NotificationsViewData,
  type PaymentsViewData,
  type ProgressViewData,
  type SettingsViewData,
} from '@/lib/dashboard-views';
import { AccessError, accessErrorStatus } from '@/lib/access-error';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

type DashboardRoutesOptions = {
  authResolver?: AuthResolver;
  activityLoader?: (user: AuthenticatedUser) => Promise<ActivityIndexData>;
  notificationsLoader?: (user: AuthenticatedUser) => Promise<NotificationsIndexData>;
  progressLoader?: (user: AuthenticatedUser) => Promise<ProgressIndexData>;
  settingsLoader?: (user: AuthenticatedUser) => Promise<SettingsIndexData>;
  // Rich "view" loaders feed the faithful full-bleed Paper pages (the original
  // DocList / ActivitySection / StudioProgressRing inside <LightShell>).
  docsViewLoader?: (user: AuthenticatedUser) => Promise<DocsViewData>;
  activityViewLoader?: (user: AuthenticatedUser) => Promise<ActivityViewData>;
  notificationsViewLoader?: (user: AuthenticatedUser) => Promise<NotificationsViewData>;
  progressViewLoader?: (user: AuthenticatedUser) => Promise<ProgressViewData>;
  settingsViewLoader?: (user: AuthenticatedUser) => Promise<SettingsViewData>;
  paymentsViewLoader?: (user: AuthenticatedUser) => Promise<PaymentsViewData>;
};

export function createDashboardRoutes(options: DashboardRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const activityLoader = options.activityLoader ?? loadActivityIndex;
  const notificationsLoader = options.notificationsLoader ?? loadNotificationsIndex;
  const progressLoader = options.progressLoader ?? loadProgressIndex;
  const settingsLoader = options.settingsLoader ?? loadSettingsIndex;
  const docsViewLoader = options.docsViewLoader ?? loadDocsView;
  const activityViewLoader = options.activityViewLoader ?? loadActivityView;
  const notificationsViewLoader = options.notificationsViewLoader ?? loadNotificationsView;
  const progressViewLoader = options.progressViewLoader ?? loadProgressView;
  const settingsViewLoader = options.settingsViewLoader ?? loadSettingsView;
  const paymentsViewLoader = options.paymentsViewLoader ?? loadPaymentsView;

  return new Hono()
    .get('/activity-index', (c) => handleDashboardLoad(c, authResolver, activityLoader))
    .get('/notifications-index', (c) => handleDashboardLoad(c, authResolver, notificationsLoader))
    .get('/progress-index', (c) => handleDashboardLoad(c, authResolver, progressLoader))
    .get('/settings-index', (c) => handleDashboardLoad(c, authResolver, settingsLoader))
    .get('/docs-view', (c) => handleDashboardLoad(c, authResolver, docsViewLoader))
    .get('/activity-view', (c) => handleDashboardLoad(c, authResolver, activityViewLoader))
    .get('/notifications-view', (c) => handleDashboardLoad(c, authResolver, notificationsViewLoader))
    .get('/progress-view', (c) => handleDashboardLoad(c, authResolver, progressViewLoader))
    .get('/settings-view', (c) => handleDashboardLoad(c, authResolver, settingsViewLoader))
    .get('/payments-view', (c) => handleDashboardLoad(c, authResolver, paymentsViewLoader));
}

async function handleDashboardLoad<T>(
  c: Context,
  authResolver: AuthResolver,
  loader: (user: AuthenticatedUser) => Promise<T>,
) {
  const user = await authResolver(c);

  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  try {
    return c.json(await loader(user));
  } catch (error) {
    if (error instanceof AccessError) {
      return c.json({ error: error.message }, accessErrorStatus(error.reason));
    }

    console.error('[hono dashboard] load failed:', error);
    return c.json({ error: 'Failed to load dashboard data.' }, 500);
  }
}
