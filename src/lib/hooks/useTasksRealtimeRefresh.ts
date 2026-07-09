import { useContext, useEffect, useMemo } from 'react';
import { UNSAFE_DataRouterContext } from 'react-router';
import { subscribeEkoBus } from '@/lib/eko-bus';
import { createClient } from '@/lib/supabase/client';

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
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const router = dataRouter?.router ?? null;

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!router) return;

    let disposed = false;
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

    // 2. Realtime row events. Attach the session token to the socket BEFORE
    // subscribing — the channel otherwise joins as anon and RLS silently
    // filters out every row.
    const channel = supabase
      ? supabase
          .channel('tasks-board-live')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tasks' },
            scheduleRevalidate,
          )
      : null;

    if (supabase && channel) {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (disposed) return;
        if (session) supabase.realtime.setAuth(session.access_token);
        channel.subscribe();
      });
    }

    // 3. Catch-up on returning to the tab.
    const onFocus = () => scheduleRevalidate();
    window.addEventListener('focus', onFocus);

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      unsubscribeBus();
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [router, supabase]);
}
