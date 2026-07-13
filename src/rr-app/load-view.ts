/**
 * Shared "fetch a view, map HTTP status to an access state" anatomy repeated
 * across every Paper route loader (401→unauthorized, 403→forbidden,
 * 404→not_found, other non-ok→thrown Response, ok→ready with the parsed
 * payload). One generic replaces ~16 copies of the same four branches; each
 * route still owns its own status-union alias (`ViewState<X>`) and its own
 * bespoke `RouteContent` switch/JSX.
 */
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
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response(errorMessage, { status: response.status });
  return { status: 'ready', data: (await response.json()) as T };
}
