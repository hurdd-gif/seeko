'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const HEARTBEAT_INTERVAL = 120_000;
const MIN_VISIBLE_PING_INTERVAL = 60_000;

export function PresenceHeartbeat({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let lastPingAt = 0;

    async function ping(force = false) {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!force && now - lastPingAt < MIN_VISIBLE_PING_INTERVAL) return;
      lastPingAt = now;
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userId)
          .throwOnError();
      } catch {
        lastPingAt = 0;
      }
    }

    ping(true);
    const interval = setInterval(() => ping(), HEARTBEAT_INTERVAL);

    function handleVisibility() {
      if (document.visibilityState === 'visible') ping();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [userId]);

  return null;
}
