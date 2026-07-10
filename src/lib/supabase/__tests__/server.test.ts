import { afterEach, describe, expect, it, vi } from 'vitest';

// server.createClient() is a server-only client (imported solely by data.ts,
// which api-server routes use). It must authenticate with the service-role key
// so server reads aren't silently filtered to zero rows by RLS. We capture the
// key handed to supabase-js.
const createSupabaseClient = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@supabase/supabase-js', () => ({ createClient: createSupabaseClient }));

const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) savedEnv[key] = process.env[key];

afterEach(() => {
  vi.clearAllMocks();
  // Restore env so these tests don't leak mutated globals to other files.
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('supabase/server createClient', () => {
  it('uses the service-role key, not the anon key', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-public';

    const { createClient } = await import('../server');
    await createClient();

    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    const [, key] = createSupabaseClient.mock.calls[0];
    expect(key).toBe('service-role-secret');
    expect(key).not.toBe('anon-public');
  });

  it('throws when the service-role key is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { createClient } = await import('../server');
    await expect(createClient()).rejects.toThrow();
  });
});
