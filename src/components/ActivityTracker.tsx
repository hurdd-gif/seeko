'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const CLICK_DEBOUNCE = 500;

export function ActivityTracker({ userId }: { userId: string }) {
  const pathname = usePathname();
  const lastClick = useRef(0);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const track = useCallback(
    async (eventType: string, target?: string, metadata?: Record<string, unknown>) => {
      await supabase.from('user_events').insert({
        user_id: userId,
        event_type: eventType,
        page: pathname,
        target,
        metadata,
      });
    },
    [userId, pathname, supabase]
  );

  useEffect(() => {
    track('page_view');
  }, [pathname, track]);

  useEffect(() => {
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

      track(action, label, {
        tag,
        ...(href ? { href } : {}),
      });
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [track]);

  return null;
}
