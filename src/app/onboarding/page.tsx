import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

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
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-seeko-accent text-black text-lg font-bold">
            S
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Welcome to SEEKO Studio
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up your profile to get started.
          </p>
        </div>
        <OnboardingForm
          userId={user.id}
          defaultName={profile?.display_name ?? user.email ?? ''}
          defaultAvatar={profile?.avatar_url ?? ''}
        />
      </div>
    </div>
  );
}
