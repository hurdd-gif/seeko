import { Hono, type Context } from 'hono';
import {
  ExternalSigningAdminAccessError,
  loadExternalSigningAdminIndex,
  type ExternalSigningAdminData,
} from '@/lib/external-signing-admin';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;
type ExternalSigningAdminLoader = (user: AuthenticatedUser) => Promise<ExternalSigningAdminData>;

type ExternalSigningAdminRoutesOptions = {
  authResolver?: AuthResolver;
  externalSigningAdminLoader?: ExternalSigningAdminLoader;
};

export function createExternalSigningAdminRoutes(options: ExternalSigningAdminRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const externalSigningAdminLoader = options.externalSigningAdminLoader ?? loadExternalSigningAdminIndex;

  return new Hono().get('/external-signing-admin', async (c) => {
    const user = await authResolver(c);

    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    try {
      return c.json(await externalSigningAdminLoader(user));
    } catch (error) {
      if (error instanceof ExternalSigningAdminAccessError) {
        return c.json({ error: error.code }, error.code === 'admin_required' ? 403 : 404);
      }

      console.error('[hono external-signing-admin] load failed:', error);
      return c.json({ error: 'Failed to load signing invites.' }, 500);
    }
  });
}
