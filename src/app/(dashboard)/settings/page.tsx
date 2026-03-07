import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchTeam } from '@/lib/supabase/data';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await fetchProfile(user.id);
  if (!profile) redirect('/onboarding');

  const isAdmin = profile.is_admin;
  const team = isAdmin ? await fetchTeam().catch(() => []) : [];

  // Fetch user's completed tasks for payment request dialog
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('id, name, bounty')
    .eq('assignee_id', user.id)
    .eq('status', 'Complete')
    .order('updated_at', { ascending: false });

  return (
    <SettingsPanel
      profile={profile}
      isAdmin={isAdmin}
      team={team}
      completedTasks={completedTasks ?? []}
    />
  );
}
