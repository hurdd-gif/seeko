import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AgreementForm } from '@/components/agreement/AgreementForm';
import { FadeScale, FadeRise } from '@/components/motion';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

export default async function AgreementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('nda_accepted_at, is_admin, is_contractor, department, role, onboarded')
    .eq('id', user.id)
    .single();

  // Admins skip NDA entirely
  if (profile?.is_admin) redirect('/');
  // Already signed
  if (profile?.nda_accepted_at) {
    redirect(profile.onboarded === 0 ? '/onboarding' : '/');
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <FadeScale className="mx-auto flex size-16 items-center justify-center">
            <img src="/seeko-s.png" alt="SEEKO" className="size-14" />
          </FadeScale>
          <FadeRise delay={0.15}>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Onboarding Agreement
            </h1>
          </FadeRise>
          <FadeRise delay={0.25}>
            <p className="mt-2 text-sm text-muted-foreground">
              Please review and sign the agreement below to continue.
            </p>
          </FadeRise>
        </div>
        <FadeRise delay={0.4} y={24}>
          <AgreementForm
            userId={user.id}
            userEmail={user.email ?? ''}
            sections={AGREEMENT_SECTIONS}
            title={AGREEMENT_TITLE}
            department={profile?.department ?? ''}
            role={profile?.role ?? ''}
            isContractor={profile?.is_contractor ?? false}
            onboarded={profile?.onboarded ?? 0}
            showEngagementType={true}
            signEndpoint="/api/agreement/sign"
          />
        </FadeRise>
      </div>
    </div>
  );
}
