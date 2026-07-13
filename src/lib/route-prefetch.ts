/**
 * Warm a route loader's fetch on intent.
 *
 * THE PROBLEM IT SOLVES. React Router's data router is a BLOCKING navigation: it
 * keeps the outgoing page fully rendered and fully interactive until the incoming
 * route's loader resolves, and only then commits the URL and the paint together.
 * Nothing on screen moves in between. Measured on the Connected frame's "View
 * task" link: 313ms from click to the first changed pixel, ~300ms of which is the
 * loader's `/api/task-detail/:id` round-trip. For a third of a second the app
 * looks like it simply ignored the press — which is why the navigation reads as
 * "it doesn't take me there", even though it always did, just late.
 *
 * You cannot fix that with a faster transition. The fix is to not be waiting.
 *
 * INTENT ARRIVES BEFORE THE CLICK. Hover, focus and touch-down all precede the
 * click by 80ms+, and on rows whose action only appears on hover the head start is
 * effectively guaranteed. Firing the loader's own fetch at that moment means the
 * response is usually already in hand by the time the router asks for it, and the
 * navigation commits on the next frame.
 *
 * WHY A MAP AND NOT THE HTTP CACHE. The obvious version of this is to call
 * `fetch(url)` on hover and let the browser's HTTP cache serve the loader's
 * identical `fetch(url)` a moment later. It does not work here: the API sends no
 * `Cache-Control`, no `ETag` and no `Last-Modified`, so there is no validator to
 * compute a heuristic freshness lifetime from — the response is not reusable and
 * the browser goes back to the network. Holding the in-flight promise ourselves
 * sidesteps the whole question.
 *
 * SINGLE USE, SHORT LIFE. An entry is deleted the moment it is consumed and
 * expires on its own shortly after, so a warmed payload can only ever satisfy the
 * navigation it was warmed for. It is a head start, not a cache: nothing here can
 * serve stale data to a later visit, and `router.revalidate()` is unaffected
 * because a revalidation never has a matching warm entry waiting for it.
 */

/** Long enough to cover hover→click; short enough that the payload can't go stale. */
const TTL_MS = 10_000;

const warm = new Map<string, Promise<Response>>();

export function prefetchView(url: string): void {
  // Don't spend someone's metered data on a page they haven't asked for. Data
  // Saver is an explicit request to stop doing exactly this.
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
  if (warm.has(url)) return;

  const request = fetch(url);
  warm.set(url, request);

  // A failed warm-up is not a failure. Swallow it here and drop the entry, so the
  // loader re-fetches and surfaces the real error where it can actually be handled.
  request.catch(() => {
    if (warm.get(url) === request) warm.delete(url);
  });

  setTimeout(() => {
    if (warm.get(url) === request) warm.delete(url);
  }, TTL_MS);
}

/**
 * Hand the warmed response to the loader, exactly once.
 *
 * Deleted before it is awaited, so the entry is exclusive to this caller and the
 * body is guaranteed unread — no `clone()` needed. Returns null when there is
 * nothing warm, which is the signal to just fetch.
 */
export async function takePrefetchedView(url: string): Promise<Response | null> {
  const request = warm.get(url);
  if (!request) return null;
  warm.delete(url);
  try {
    return await request;
  } catch {
    return null;
  }
}
