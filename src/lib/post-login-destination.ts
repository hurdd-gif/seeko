export type PostLoginDestination = '/contractor' | '/investor' | '/tasks';

type MinimalSupabase = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { is_contractor?: boolean | null; is_investor?: boolean | null } | null; error: unknown }>;
      };
    };
  };
};

/**
 * Resolve where a just-authenticated user should land. Role precedence:
 * contractor → /contractor, else investor → /investor, else /tasks (default).
 * Safe fallback to /tasks on any missing user/profile/error.
 */
export async function resolvePostLoginDestination(supabase: MinimalSupabase): Promise<PostLoginDestination> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return '/tasks';

  const { data } = await supabase
    .from('profiles')
    .select('is_contractor, is_investor')
    .eq('id', user.id)
    .maybeSingle();

  if (data?.is_contractor) return '/contractor';
  if (data?.is_investor) return '/investor';
  return '/tasks';
}
