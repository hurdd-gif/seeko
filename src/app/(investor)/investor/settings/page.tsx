import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile } from '@/lib/supabase/data';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';
import { revalidateInvestor } from './actions';

export default async function InvestorSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (!profile) redirect('/onboarding');
  if (!profile.is_investor && !profile.is_admin) redirect('/');

  return (
    <SettingsPanel
      profile={profile}
      isAdmin={false}
      team={[]}
      revalidate={revalidateInvestor}
    />
  );
}
