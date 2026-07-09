/**
 * Shared "fetch a view, map HTTP status to an access state" anatomy repeated
 * across every Paper route loader (401→unauthorized, 403→forbidden,
 * 404→not_found, other non-ok→thrown Response, ok→ready with the parsed
 * payload). One generic replaces ~16 copies of the same four branches; each
 * route still owns its own status-union alias (`ViewState<X>`) and its own
 * bespoke `RouteContent` switch/JSX.
 */
export type ViewState<T> =
  | { status: 'ready'; data: T }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'not_found' };

export async function loadView<T>(url: string, errorMessage: string): Promise<ViewState<T>> {
  const response = await fetch(url);
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok) throw new Response(errorMessage, { status: response.status });
  return { status: 'ready', data: (await response.json()) as T };
}
