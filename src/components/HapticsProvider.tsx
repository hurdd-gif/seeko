'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useWebHaptics } from 'web-haptics/react';

const STORAGE_KEY = 'seeko-haptics-enabled';

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
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
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

function readStoredEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function HapticsProvider({ children }: { children: ReactNode }) {
  const { trigger: rawTrigger } = useWebHaptics();
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    setEnabledState(readStoredEnabled());
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch { /* ignore */ }
  }, []);

  const trigger = useCallback((preset: HapticPreset) => {
    if (!enabled) return;
    rawTrigger(preset);
  }, [enabled, rawTrigger]);

  useEffect(() => {
    if (!isMobile() || !enabled) return;
    const onTap = (e: Event) => {
      if (isInteractiveTarget(e.target)) rawTrigger('selection');
    };
    document.addEventListener('click', onTap, true);
    return () => document.removeEventListener('click', onTap, true);
  }, [rawTrigger, enabled]);

  return (
    <HapticsContext.Provider value={{ trigger, enabled, setEnabled }}>
      {children}
    </HapticsContext.Provider>
  );
}

export function useHaptics(): HapticsContextValue {
  const ctx = useContext(HapticsContext);
  if (!ctx) {
    return {
      trigger: () => {},
      enabled: true,
      setEnabled: () => {},
    };
  }
  return ctx;
}
