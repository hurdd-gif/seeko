import { useEffect, useMemo } from 'react';
import { useDataRouter } from '@/lib/react-router-adapters';
import { subscribeEkoBus } from '@/lib/eko-bus';
import { createClient } from '@/lib/supabase/client';
import { subscribeToTable, type SupabaseLike } from '@/lib/realtime';

/**
 * Live Issues board: re-runs the active route's loaders when tasks change, so
 * issues added or removed elsewhere appear without a manual refresh. Three
 * complementary signals, because no single one covers every environment:
 *
 * 1. EKO bus `write-executed` — same-tab writes through the gated agent path.
 *    Instant, and the only signal that works in dev, where DEV_AUTH_BYPASS is
 *    API-side only and the browser Supabase client has NO session.
 * 2. Supabase realtime on `tasks` — other users/tabs in production. Delivery
 *    passes through RLS, so a session-less client simply receives no events.
 * 3. Window focus — cross-tab changes in dev, and a catch-up net everywhere.
 *
 * Refetches are debounced: a burst of row events (multi-row write) collapses
 * into one /api/tasks-board request.
 *
 * Resilient outside the app shell: without a data router (plain <MemoryRouter>
 * in tests) or without Supabase env, the hook mounts as a no-op.
 */
export function useTasksRealtimeRefresh() {
  const router = useDataRouter();

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!router) return;

    let timer: number | null = null;

    const scheduleRevalidate = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (router.state.revalidation === 'idle') {
          void router.revalidate();
        }
      }, 300);
    };

    // 1. Same-tab EKO writes — the tray emits after every executed intent.
    const unsubscribeBus = subscribeEkoBus((event) => {
      if (event.type === 'write-executed') {
        scheduleRevalidate();
      }
    });

    // 2. Realtime row events — subscribeToTable owns the setAuth-before-
    // subscribe invariant.
    const disposeRealtime = supabase
      ? subscribeToTable(supabase as unknown as SupabaseLike, 'tasks-board-live', [
          { event: '*', table: 'tasks', handler: scheduleRevalidate },
        ])
      : () => {};

    // 3. Catch-up on returning to the tab.
    const onFocus = () => scheduleRevalidate();
    window.addEventListener('focus', onFocus);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      unsubscribeBus();
      disposeRealtime();
    };
  }, [router, supabase]);
}
