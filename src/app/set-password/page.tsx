import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SetPasswordForm } from '@/components/auth/SetPasswordForm';
import { FadeScale, FadeRise } from '@/components/motion';

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <FadeScale className="mx-auto flex size-16 items-center justify-center">
            <img src="/seeko-s.png" alt="SEEKO" className="size-14" />
          </FadeScale>
          <FadeRise delay={0.15}>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Create your password
            </h1>
          </FadeRise>
          <FadeRise delay={0.25}>
            <p className="mt-2 text-sm text-muted-foreground">
              You'll use this to sign in to SEEKO Studio.
            </p>
          </FadeRise>
        </div>
        <FadeRise delay={0.4} y={24}>
          <SetPasswordForm />
        </FadeRise>
      </div>
    </div>
  );
}
