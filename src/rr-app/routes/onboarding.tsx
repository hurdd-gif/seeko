import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { OnboardingData } from '@/lib/onboarding-index';
import { LightAuthShell } from '@/components/auth/LightAuthShell';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';
import { loadView, type ViewState } from '../load-view';

type OnboardingLoaderData = ViewState<OnboardingData>;

export async function onboardingLoader(_args: LoaderFunctionArgs): Promise<OnboardingLoaderData> {
  return loadView<OnboardingData>('/api/profile/onboarding', 'Unable to load onboarding');
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

  if (data.status === 'forbidden') {
    return (
      <LightAuthShell
        title="Onboarding unavailable"
        subtitle="Your account cannot access onboarding right now."
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

  const index = data.data;
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
      />
    </LightAuthShell>
  );
}
