'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const HEARTBEAT_INTERVAL = 60_000;

export function PresenceHeartbeat({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    async function ping() {
      await supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', userId);
    }

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL);

    function handleVisibility() {
      if (document.visibilityState === 'visible') ping();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId]);

  return null;
}
