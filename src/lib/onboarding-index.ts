import { getServiceClient } from '@/lib/supabase/service';
import { AccessError } from '@/lib/access-error';
import type { Database } from '@/lib/supabase/database.types';

const PROFILE_SELECT = 'id, display_name, avatar_url, email, onboarded' as const;

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'avatar_url' | 'email' | 'onboarded'
>;

export type OnboardingData = {
  currentUser: {
    id: string;
    email?: string | null;
  };
  profile: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    email: string | null;
    onboarded: number;
  };
};

export type CompleteOnboardingInput = {
  displayName: string;
  avatarUrl?: string | null;
  timezone?: string | null;
};

export async function loadOnboardingProfile(currentUser: {
  id: string;
  email?: string | null;
}): Promise<OnboardingData> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AccessError('profile_not_found');

  return {
    currentUser,
    profile: toOnboardingProfile(data as ProfileRow),
  };
}

export async function completeOnboardingProfile(
  currentUser: {
    id: string;
    email?: string | null;
  },
  input: CompleteOnboardingInput,
): Promise<OnboardingData> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error('display_name_required');
  }
  if (looksLikeEmail(displayName)) {
    throw new Error('display_name_cannot_be_email');
  }

  const service = getServiceClient();
  const { error } = await service
    .from('profiles')
    .update({
      display_name: displayName,
      avatar_url: input.avatarUrl || null,
      email: currentUser.email ?? null,
      timezone: input.timezone || null,
      onboarded: 1,
    } as never)
    .eq('id', currentUser.id);

  if (error) throw error;

  return loadOnboardingProfile(currentUser);
}

function toOnboardingProfile(profile: ProfileRow): OnboardingData['profile'] {
  return {
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    email: profile.email,
    onboarded: profile.onboarded,
  };
}

function looksLikeEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}
