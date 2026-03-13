type Entry = { count: number; resetAt: number };

/**
 * Creates an in-memory rate limiter keyed by an arbitrary string (IP, user ID, etc.).
 * Fine for a single Render instance; swap for Upstash/Redis if horizontally scaled.
 *
 * @param max      Maximum requests allowed per key within the window
 * @param windowMs Window duration in milliseconds
 * @param pruneAt  Prune expired entries when map grows beyond this size (default 200)
 * @returns        A function that returns `true` if the key is currently rate-limited
 */
export function createRateLimiter(max: number, windowMs: number, pruneAt = 200) {
  const hits = new Map<string, Entry>();

  return function isLimited(key: string): boolean {
    const now = Date.now();

    if (hits.size > pruneAt) {
      for (const [k, entry] of hits) {
        if (now > entry.resetAt) hits.delete(k);
      }
    }

    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    if (entry.count >= max) return true;
    entry.count++;
    return false;
  };
}
