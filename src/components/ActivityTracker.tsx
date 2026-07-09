'use client';

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { usePathname } from '@/lib/react-router-adapters';
import { createClient } from '@/lib/supabase/client';

const CLICK_DEBOUNCE = 500;
const FLUSH_INTERVAL = 5_000; // bulk-insert buffered events at most every 5s…
const MAX_BUFFER = 25; // …or sooner once this many pile up

type BufferedEvent = {
  user_id: string;
  event_type: string;
  page: string;
  target?: string;
  metadata?: Record<string, unknown>;
};

export function ActivityTracker({ userId }: { userId: string }) {
  const pathname = usePathname();
  const lastClick = useRef(0);
  const buffer = useRef<BufferedEvent[]>([]);

  // Analytics are recorded in production only — dev sessions shouldn't pollute
  // the activity data or hit the DB on every click. Next statically replaces
  // NODE_ENV at build time, so in the prod bundle this is a constant and the
  // disabled branches dead-code-eliminate.
  const enabled = process.env.NODE_ENV === 'production';

  // One client per mount, not a fresh one on every render (the previous bug:
  // createBrowserClient was called in the render body).
  const supabase = useMemo(() => createClient(), []);

  const flush = useCallback(() => {
    if (buffer.current.length === 0) return;
    const batch = buffer.current;
    buffer.current = [];
    // Fire-and-forget bulk insert. Analytics are best-effort, so a failed flush
    // just drops that batch rather than retrying.
    void supabase.from('user_events').insert(batch);
  }, [supabase]);

  const track = useCallback(
    (eventType: string, page: string, target?: string, metadata?: Record<string, unknown>) => {
      if (!enabled) return;
      buffer.current.push({ user_id: userId, event_type: eventType, page, target, metadata });
      if (buffer.current.length >= MAX_BUFFER) flush();
    },
    [enabled, userId, flush]
  );

  // One page_view per navigation.
  useEffect(() => {
    track('page_view', pathname);
  }, [pathname, track]);

  // Periodic flush, plus a flush when the tab is hidden or unloaded so buffered
  // events aren't lost when the user navigates away or backgrounds the tab.
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(flush, FLUSH_INTERVAL);
    function onVisibility() {
      if (document.visibilityState === 'hidden') flush();
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [enabled, flush]);

  // Interactive-element click tracking (debounced). The listener isn't even
  // attached outside production.
  useEffect(() => {
    if (!enabled) return;

    function getCleanLabel(el: HTMLElement): string {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria;

      const title = el.getAttribute('title');
      if (title) return title;

      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      if (directText && directText.length > 1 && directText.length < 60) return directText;

      const span = el.querySelector(':scope > span');
      if (span?.textContent?.trim()) {
        const t = span.textContent.trim();
        if (t.length < 60) return t;
      }

      const innerText = el.textContent?.trim().slice(0, 60);
      if (innerText && innerText.length > 1 && !/[{};:]/.test(innerText)) return innerText;

      return el.tagName.toLowerCase();
    }

    function handleClick(e: MouseEvent) {
      const now = Date.now();
      if (now - lastClick.current < CLICK_DEBOUNCE) return;
      lastClick.current = now;

      const el = e.target as HTMLElement;
      const anchor = el.closest('a');
      const button = el.closest('button');
      const input = el.closest('input, select, textarea');
      const interactive = anchor || button;

      if (!interactive && !input) return;

      const target = interactive || input!;
      const label = getCleanLabel(target as HTMLElement);

      if (/[{};]|transition|opacity|transform/.test(label)) return;

      const tag = target.tagName.toLowerCase();
      const href = anchor?.getAttribute('href');

      const action = anchor ? 'navigate' : tag === 'select' ? 'select' : tag === 'input' ? 'input' : 'click';

      track(action, window.location.pathname, label, {
        tag,
        ...(href ? { href } : {}),
      });
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [enabled, track]);

  return null;
}
