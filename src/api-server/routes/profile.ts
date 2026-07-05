import { Hono, type Context } from 'hono';
import {
  completeOnboardingProfile,
  loadOnboardingProfile,
  OnboardingAccessError,
  type CompleteOnboardingInput,
  type OnboardingData,
} from '@/lib/onboarding-index';
import { getServiceClient } from '@/lib/supabase/service';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

type ProfileRoutesOptions = {
  authResolver?: AuthResolver;
  onboardingLoader?: (user: AuthenticatedUser) => Promise<OnboardingData>;
  onboardingUpdater?: (user: AuthenticatedUser, input: CompleteOnboardingInput) => Promise<OnboardingData>;
};

export function createProfileRoutes(options: ProfileRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const onboardingLoader = options.onboardingLoader ?? loadOnboardingProfile;
  const onboardingUpdater = options.onboardingUpdater ?? completeOnboardingProfile;

  return new Hono()
  .get('/profile', async (c) => {
    const user = await authResolver(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const service = getServiceClient();
    const { data, error } = await service
      .from('profiles')
      .select('id, email, display_name, is_admin, is_investor')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('[hono profile] load failed:', error);
      return c.json({ error: 'Failed to load profile' }, 500);
    }
    if (!data) return c.json({ error: 'profile_not_found' }, 404);

    const profile = data as {
      id: string;
      email: string | null;
      display_name: string | null;
      is_admin: boolean | null;
      is_investor: boolean | null;
    };

    return c.json({
      profile: {
        id: profile.id,
        email: profile.email ?? user.email ?? null,
        displayName: profile.display_name,
        isAdmin: Boolean(profile.is_admin),
        isInvestor: Boolean(profile.is_investor),
      },
    });
  })
  .patch('/profile', async (c) => {
    const user = await authResolver(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const service = getServiceClient();
    const { data: profile } = await service
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) return c.json({ error: 'Forbidden' }, 403);

    const body = await c.req.json().catch(() => null) as {
      userId?: unknown;
      department?: unknown;
      is_contractor?: unknown;
    } | null;
    if (!body) return c.json({ error: 'Invalid JSON' }, 400);

    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId) return c.json({ error: 'Missing userId' }, 400);

    const updates: { department?: string; is_contractor?: boolean } = {};
    if (body.department !== undefined) updates.department = String(body.department);
    if (body.is_contractor !== undefined) updates.is_contractor = Boolean(body.is_contractor);

    if (Object.keys(updates).length === 0) return c.json({ error: 'No fields to update' }, 400);

    const { error } = await service.from('profiles').update(updates as never).eq('id', userId);
    if (error) {
      console.error('[hono profile] update failed:', error);
      return c.json({ error: 'Failed to update profile' }, 500);
    }

    return c.json({ ok: true });
  })
  .get('/profile/onboarding', async (c) => {
    const user = await authResolver(c);

    if (!user?.email) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    try {
      return c.json(await onboardingLoader(user));
    } catch (error) {
      if (error instanceof OnboardingAccessError) {
        return c.json({ error: error.code }, 404);
      }

      console.error('[hono profile/onboarding] load failed:', error);
      return c.json({ error: 'Failed to load onboarding profile.' }, 500);
    }
  })
  .post('/profile/onboarding', async (c) => {
    const user = await authResolver(c);

    if (!user?.email) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    let body: CompleteOnboardingInput;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    try {
      return c.json(await onboardingUpdater(user, body));
    } catch (error) {
      if (error instanceof OnboardingAccessError) {
        return c.json({ error: error.code }, 404);
      }
      if (error instanceof Error && error.message === 'display_name_required') {
        return c.json({ error: 'display_name_required' }, 400);
      }
      if (error instanceof Error && error.message === 'display_name_cannot_be_email') {
        return c.json({ error: 'display_name_cannot_be_email' }, 400);
      }

      console.error('[hono profile/onboarding] update failed:', error);
      return c.json({ error: 'Failed to save onboarding profile.' }, 500);
    }
  })
  .post('/profile/init', async (c) => {
    const user = await authResolver(c);

    if (!user?.email) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const admin = getServiceClient();
    const email = user.email.toLowerCase();
    const { data: invite } = await admin
      .from('pending_invites')
      .select('department, is_contractor, is_investor')
      .eq('email', email)
      .single();

    if (invite) {
      const row = invite as { department: string | null; is_contractor: boolean; is_investor: boolean };
      await admin
        .from('profiles')
        .update({
          department: row.department,
          is_contractor: row.is_contractor,
          is_investor: row.is_investor ?? false,
          must_set_password: true,
        } as never)
        .eq('id', user.id);

      await admin.from('pending_invites').delete().eq('email', email);

      const role = row.is_investor ? 'investor' : row.is_contractor ? 'contractor' : 'team member';
      const { data: admins } = await admin.from('profiles').select('id').eq('is_admin', true);

      if (admins?.length) {
        await admin.from('notifications').insert(
          admins.map(({ id }) => ({
            user_id: id,
            kind: 'user_joined' as const,
            title: `${user.email} joined as ${role}`,
            body: row.department ? `Department: ${row.department}` : null,
            link: '/team',
            read: false,
          })) as never
        );
      }
    }

    return c.json({ success: true });
  });
}
