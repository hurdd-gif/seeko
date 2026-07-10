import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Server-only Supabase client for authoritative reads in api-server routes
 * (imported solely by data.ts). Uses the service-role key: these reads are
 * session-less, so the anon key had them silently filtered to zero rows by
 * RLS (e.g. the task rail and investor export returned empty). Per-user
 * scoping, where needed, is done by explicit id filters in data.ts — never
 * relied on RLS here. Never import this into browser code.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
