import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';
import { FadeScale, FadeRise } from '@/components/motion';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded, display_name, avatar_url')
    .eq('id', user.id)
    .single();

  if (profile?.onboarded === 1) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <FadeScale className="mx-auto flex size-16 items-center justify-center">
            <img src="/seeko-logo.png" alt="SEEKO" className="size-14 invert" />
          </FadeScale>
          <FadeRise delay={0.15}>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Welcome aboard to SEEKO!
            </h1>
          </FadeRise>
          <FadeRise delay={0.25}>
            <p className="mt-2 text-sm text-muted-foreground">
              Set up your profile to get started, what should the team call you?
            </p>
          </FadeRise>
        </div>
        <FadeRise delay={0.4} y={24}>
          <OnboardingForm
            userId={user.id}
            defaultName={profile?.display_name ?? user.email ?? ''}
            defaultAvatar={profile?.avatar_url ?? ''}
          />
        </FadeRise>
      </div>
    </div>
  );
}
