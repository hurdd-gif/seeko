import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchTeamWithPaypalEmails } from '@/lib/supabase/data';
import { redirect } from 'next/navigation';
import { PaymentsAdmin } from '@/components/dashboard/PaymentsAdmin';
import { FadeRise } from '@/components/motion';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (!profile?.is_admin) redirect('/');

  const team = await fetchTeamWithPaypalEmails();

  return (
    <FadeRise delay={0} y={16}>
      <PaymentsAdmin team={team} />
    </FadeRise>
  );
}
