import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  loadContractorOverview,
  type ContractorOverviewData,
} from '@/lib/contractor-index';
import { AccessError, accessErrorStatus } from '@/lib/access-error';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

interface ContractorRoutesOptions {
  authResolver?: AuthResolver;
  contractorOverviewLoader?: (user: AuthenticatedUser) => Promise<ContractorOverviewData>;
}

export function createContractorRoutes(options: ContractorRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const contractorOverviewLoader = options.contractorOverviewLoader ?? loadContractorOverview;

  return new Hono().get('/contractor-index', (c) =>
    handleContractorLoad(c, authResolver, contractorOverviewLoader),
  );
}

async function handleContractorLoad<T>(
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
    console.error('[hono contractor] load failed:', error);
    return c.json({ error: 'Failed to load contractor data.' }, 500);
  }
}
