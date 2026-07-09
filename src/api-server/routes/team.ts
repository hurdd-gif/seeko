import { Hono, type Context } from 'hono';
import {
  loadTeamRoster,
  type TeamRosterData,
} from '@/lib/team-roster';
import { AccessError, accessErrorStatus } from '@/lib/access-error';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type TeamLoader = (user: AuthenticatedUser) => Promise<TeamRosterData>;
type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

type TeamRoutesOptions = {
  authResolver?: AuthResolver;
  teamLoader?: TeamLoader;
};

export function createTeamRoutes(options: TeamRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const teamLoader = options.teamLoader ?? loadTeamRoster;

  return new Hono().get('/team', async (c) => {
    const user = await authResolver(c);

    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    try {
      const data = await teamLoader(user);
      return c.json(data);
    } catch (error) {
      if (error instanceof AccessError) {
        return c.json({ error: error.message }, accessErrorStatus(error.reason));
      }

      console.error('[hono team] load failed:', error);
      return c.json({ error: 'Failed to load team.' }, 500);
    }
  });
}
