/**
 * Shared "fetch a view, map HTTP status to an access state" anatomy repeated
 * across every Paper route loader (401→unauthorized, 403→forbidden,
 * 404→not_found, other non-ok→thrown Response, ok→ready with the parsed
 * payload). One generic replaces ~16 copies of the same four branches; each
 * route still owns its own status-union alias (`ViewState<X>`) and its own
 * bespoke `RouteContent` switch/JSX.
 */
import { redirect } from 'react-router';
import { takePrefetchedView } from '@/lib/route-prefetch';

export type ViewState<T> =
  | { status: 'ready'; data: T }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function loadView<T>(url: string, errorMessage: string): Promise<ViewState<T>> {
  // A link may already have warmed this exact request on hover/focus (see
  // route-prefetch.ts). Consuming it here is what turns a blocking ~300ms loader
  // into a same-frame commit; with nothing warm this is a plain fetch, unchanged.
  const response = (await takePrefetchedView(url)) ?? (await fetch(url));
  if (response.status === 401) {
    // The migrated SPA has no server middleware to bounce anonymous users the
    // way the old Next.js proxy.ts did, so every protected loader does it here:
    // send them to /login and remember where they were headed, so a successful
    // sign-in returns them to it instead of stranding them on a dead-end
    // "Sign in required" card. The window guard keeps the bare 'unauthorized'
    // state as a fallback for any non-browser caller (there is none today).
    if (typeof window !== 'undefined') {
      const here = window.location.pathname + window.location.search;
      throw redirect(`/login?next=${encodeURIComponent(here)}`);
    }
    return { status: 'unauthorized' };
  }
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response(errorMessage, { status: response.status });
  return { status: 'ready', data: (await response.json()) as T };
}
