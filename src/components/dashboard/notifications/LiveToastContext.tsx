'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Notification } from '@/lib/types';

export interface LiveToast {
  id: string;
  notification: Notification;
  createdAt: number;
}

interface LiveToastContextValue {
  addLiveToast: (notification: Notification) => void;
  dismissToast: (id: string) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string, ms: number) => void;
  toasts: LiveToast[];
  overflowCount: number;
  suppress: boolean;
  setSuppress: (v: boolean) => void;
}

const LiveToastContext = createContext<LiveToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 10_000;
const ACCELERATED_DISMISS_MS = 2_000;

export function LiveToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const [suppress, setSuppress] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seenIds = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    seenIds.current.delete(id);
  }, []);

  const startTimer = useCallback((id: string, ms: number) => {
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      dismissToast(id);
    }, ms);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  const pauseTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const resumeTimer = useCallback((id: string, ms: number) => {
    startTimer(id, ms);
  }, [startTimer]);

  const addLiveToast = useCallback((notification: Notification) => {
    if (suppress) return;
    if (seenIds.current.has(notification.id)) return;
    seenIds.current.add(notification.id);

    const toast: LiveToast = {
      id: notification.id,
      notification,
      createdAt: Date.now(),
    };

    // Check if adding this toast will overflow — accelerate oldest
    if (toasts.length >= MAX_VISIBLE && toasts[0]) {
      startTimer(toasts[0].id, ACCELERATED_DISMISS_MS);
    }

    setToasts(prev => [...prev, toast]);
    startTimer(notification.id, AUTO_DISMISS_MS);
  }, [suppress, startTimer, toasts]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  return (
    <LiveToastContext.Provider
      value={{
        addLiveToast,
        dismissToast,
        pauseTimer,
        resumeTimer,
        toasts,
        overflowCount: Math.max(0, toasts.length - MAX_VISIBLE),
        suppress,
        setSuppress,
      }}
    >
      {children}
    </LiveToastContext.Provider>
  );
}

export function useLiveToast() {
  const ctx = useContext(LiveToastContext);
  if (!ctx) throw new Error('useLiveToast must be used within LiveToastProvider');
  return ctx;
}

export { MAX_VISIBLE, AUTO_DISMISS_MS };
