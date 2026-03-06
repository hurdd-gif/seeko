'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useWebHaptics } from 'web-haptics/react';

export type HapticPreset =
  | 'success'
  | 'warning'
  | 'error'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'soft'
  | 'rigid'
  | 'selection'
  | 'nudge'
  | 'buzz';

type HapticsContextValue = {
  trigger: (preset: HapticPreset) => void;
};

const HapticsContext = createContext<HapticsContextValue | null>(null);

function isMobile(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const nav = navigator as { vibrate?: unknown; maxTouchPoints?: number; userAgent?: string };
  return (
    'vibrate' in nav ||
    (typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0) ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(nav.userAgent ?? '')
  );
}

function isInteractiveTarget(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  const type = el.getAttribute('type');
  if (tag === 'button' || tag === 'a' || role === 'button' || role === 'tab') return true;
  if (tag === 'input' && (type === 'submit' || type === 'button')) return true;
  if (el.closest('button, a[href], [role="button"], [role="tab"]')) return true;
  return false;
}

export function HapticsProvider({ children }: { children: ReactNode }) {
  const { trigger } = useWebHaptics();

  useEffect(() => {
    if (!isMobile()) return;
    const onTap = (e: Event) => {
      if (isInteractiveTarget(e.target)) trigger('selection');
    };
    document.addEventListener('click', onTap, true);
    return () => document.removeEventListener('click', onTap, true);
  }, [trigger]);

  return (
    <HapticsContext.Provider value={{ trigger }}>
      {children}
    </HapticsContext.Provider>
  );
}

export function useHaptics(): HapticsContextValue {
  const ctx = useContext(HapticsContext);
  if (!ctx) {
    return {
      trigger: () => {},
    };
  }
  return ctx;
}
