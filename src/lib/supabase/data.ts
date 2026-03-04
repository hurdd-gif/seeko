import { createClient } from './server';
import type { Task, Area, Profile, Doc } from '../types';

export async function fetchTasks(assigneeId?: string): Promise<Task[]> {
  const supabase = await createClient();

  let query = supabase
    .from('tasks')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (assigneeId) {
    query = query.eq('assignee_id', assigneeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function fetchAreas(): Promise<Area[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Area[];
}

export async function fetchTeam(): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchDocs(parentId?: string): Promise<Doc[]> {
  const supabase = await createClient();

  let query = supabase
    .from('docs')
    .select('*')
    .order('sort_order', { ascending: true });

  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Doc[];
}
