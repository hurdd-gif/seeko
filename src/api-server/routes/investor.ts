import { Hono, type Context } from 'hono';
import {
  InvestorAccessError,
  loadInvestorDocs,
  loadInvestorOverview,
  loadInvestorPayments,
  loadInvestorSettings,
  updateInvestorSettings,
  type InvestorDocsData,
  type InvestorOverviewData,
  type InvestorPaymentsData,
  type InvestorSettingsData,
  type InvestorSettingsInput,
} from '@/lib/investor-index';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

type InvestorRoutesOptions = {
  authResolver?: AuthResolver;
  investorOverviewLoader?: (user: AuthenticatedUser) => Promise<InvestorOverviewData>;
  investorDocsLoader?: (user: AuthenticatedUser) => Promise<InvestorDocsData>;
  investorPaymentsLoader?: (user: AuthenticatedUser) => Promise<InvestorPaymentsData>;
  investorSettingsLoader?: (user: AuthenticatedUser) => Promise<InvestorSettingsData>;
  investorSettingsUpdater?: (user: AuthenticatedUser, input: InvestorSettingsInput) => Promise<InvestorSettingsData>;
};

export function createInvestorRoutes(options: InvestorRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const investorOverviewLoader = options.investorOverviewLoader ?? loadInvestorOverview;
  const investorDocsLoader = options.investorDocsLoader ?? loadInvestorDocs;
  const investorPaymentsLoader = options.investorPaymentsLoader ?? loadInvestorPayments;
  const investorSettingsLoader = options.investorSettingsLoader ?? loadInvestorSettings;
  const investorSettingsUpdater = options.investorSettingsUpdater ?? updateInvestorSettings;

  return new Hono()
    .get('/investor-index', (c) => handleInvestorLoad(c, authResolver, investorOverviewLoader))
    .get('/investor-docs-index', (c) => handleInvestorLoad(c, authResolver, investorDocsLoader))
    .get('/investor-payments-index', (c) => handleInvestorLoad(c, authResolver, investorPaymentsLoader))
    .get('/investor-settings-index', (c) => handleInvestorLoad(c, authResolver, investorSettingsLoader))
    .post('/investor-settings-index', async (c) => {
      const user = await authResolver(c);

      if (!user) {
        return c.json({ error: 'unauthorized' }, 401);
      }

      let input: InvestorSettingsInput;
      try {
        input = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }

      try {
        return c.json(await investorSettingsUpdater(user, input));
      } catch (error) {
        if (error instanceof InvestorAccessError) {
          return c.json({ error: error.code }, error.code === 'investor_required' ? 403 : 404);
        }
        if (error instanceof Error && error.message === 'display_name_required') {
          return c.json({ error: 'display_name_required' }, 400);
        }
        if (error instanceof Error && error.message === 'display_name_cannot_be_email') {
          return c.json({ error: 'display_name_cannot_be_email' }, 400);
        }

        console.error('[hono investor-settings] update failed:', error);
        return c.json({ error: 'Failed to save investor settings.' }, 500);
      }
    });
}

async function handleInvestorLoad<T>(
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
    if (error instanceof InvestorAccessError) {
      return c.json({ error: error.code }, error.code === 'investor_required' ? 403 : 404);
    }

    console.error('[hono investor] load failed:', error);
    return c.json({ error: 'Failed to load investor data.' }, 500);
  }
}
