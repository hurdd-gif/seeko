'use client';

/**
 * EkoBusBridge — mounts once inside LightShell and turns EKO bus `navigate`
 * events into SPA navigations. Split from the bus core so eko-bus.ts stays
 * framework-agnostic, and guarded with useInRouterContext so LightShell can
 * still render outside a router (unit tests, isolated previews) — same
 * pattern as the Link adapter in react-router-adapters.
 *
 * UI choreography only: navigation, never mutation.
 */

import { useEffect } from 'react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router';
import { subscribeEkoBus } from '@/lib/eko-bus';

function EkoBusNavigationInner() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(
    () =>
      subscribeEkoBus((event) => {
        if (event.type !== 'navigate') return;
        // Skip no-op pushes when we're already on the target path.
        if (window.location.pathname === event.path) return;
        navigate(event.path);
      }),
    [navigate, location.pathname],
  );

  return null;
}

export function EkoBusBridge() {
  const inRouter = useInRouterContext();
  if (!inRouter) return null;
  return <EkoBusNavigationInner />;
}
