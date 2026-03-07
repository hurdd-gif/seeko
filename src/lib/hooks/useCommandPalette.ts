'use client';

import { useEffect, useState, useCallback } from 'react';

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape') setOpen(false);
    }
    function onOpenEvent() {
      setOpen(true);
    }
    function onCloseEvent() {
      setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('open-command-palette', onOpenEvent);
    window.addEventListener('close-command-palette', onCloseEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('open-command-palette', onOpenEvent);
      window.removeEventListener('close-command-palette', onCloseEvent);
    };
  }, [toggle, setOpen]);

  return { open, setOpen, toggle };
}
