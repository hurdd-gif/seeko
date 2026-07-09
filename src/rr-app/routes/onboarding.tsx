import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { OnboardingData } from '@/lib/onboarding-index';
import { LightAuthShell } from '@/components/auth/LightAuthShell';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

type OnboardingLoaderData =
  | { status: 'ready'; index: OnboardingData }
  | { status: 'unauthorized' }
  | { status: 'not_found' };

export async function onboardingLoader(_args: LoaderFunctionArgs): Promise<OnboardingLoaderData> {
  const response = await fetch('/api/profile/onboarding');

  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 404) return { status: 'not_found' };

  if (!response.ok) {
    throw new Response('Unable to load onboarding', { status: response.status });
  }

  const index = (await response.json()) as OnboardingData;
  return { status: 'ready', index };
}

export function OnboardingRoute() {
  const data = useLoaderData() as OnboardingLoaderData;
  return <OnboardingRouteContent data={data} />;
}

/**
 * Faithful port of the legacy `onboarding/page.tsx`: the ORIGINAL
 * <OnboardingForm> (light-ported) inside the shared light auth shell — logo →
 * "Welcome aboard to SEEKO!" → subtitle → form. The form self-handles the
 * profile write via the browser Supabase client and navigates to /tasks on
 * success (the real flow), so this route's loader is gate-only. Replaces the
 * earlier hand-rewritten scaffold form.
 */
export function OnboardingRouteContent({ data }: { data: OnboardingLoaderData }) {
  if (data.status === 'unauthorized') {
    return (
      <LightAuthShell
        title="Sign in required"
        subtitle="Use your SEEKO account to finish onboarding."
      />
    );
  }

  if (data.status === 'not_found') {
    return (
      <LightAuthShell
        title="Profile not found"
        subtitle="Your account doesn't have a SEEKO profile yet."
      />
    );
  }

  const { index } = data;
  return (
    <LightAuthShell
      title="Welcome aboard to SEEKO!"
      subtitle="Set up your profile to get started, what should the team call you?"
      maxWidth="max-w-md"
    >
      <OnboardingForm
        userId={index.currentUser.id}
        defaultName={index.profile.displayName ?? index.currentUser.email ?? ''}
        defaultAvatar={index.profile.avatarUrl ?? ''}
        userEmail={index.currentUser.email ?? ''}
      />
    </LightAuthShell>
  );
}
