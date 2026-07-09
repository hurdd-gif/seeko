import { LightAuthShell } from '@/components/auth/LightAuthShell';
import { SetPasswordForm } from '@/components/auth/SetPasswordForm';

/**
 * Faithful port of the legacy `set-password/page.tsx`: the ORIGINAL
 * <SetPasswordForm> (light-ported) inside the shared light auth shell — logo →
 * "Create your password" → subtitle → form. The form self-handles auth via the
 * browser Supabase client and navigates to /onboarding on success (the real
 * flow), so this route needs no loader. Replaces the earlier hand-rewritten
 * scaffold, which look-alike'd the form and wrongly jumped straight to /tasks.
 */
export function SetPasswordRoute() {
  return (
    <LightAuthShell
      title="Create your password"
      subtitle="You'll use this to sign in to SEEKO Studio."
    >
      <SetPasswordForm />
    </LightAuthShell>
  );
}
