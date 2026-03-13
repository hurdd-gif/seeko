'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';

export function ContractorToggle({ userId, isContractor }: { userId: string; isContractor: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    acquireScrollLock();
    return () => { releaseScrollLock(); };
  }, [confirming]);

  const next = !isContractor;
  const actionLabel = isContractor ? 'Make Member' : 'Make Contractor';

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, is_contractor: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Failed to update');
        return;
      }
      toast.success(next ? 'Marked as contractor' : 'Marked as member');
      setConfirming(false);
      window.location.reload();
    } catch {
      toast.error('Failed to update');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
      >
        {actionLabel}
      </button>

      <AnimatePresence>
        {confirming && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !loading && setConfirming(false)} />
            <motion.div
              className="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl p-5"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <button
                onClick={() => setConfirming(false)}
                className="absolute top-3 right-3 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
              <h3 className="text-sm font-semibold text-foreground">{actionLabel}</h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {next
                  ? 'This will move them to the Contractors section. Contractors cannot see the Activity page.'
                  : 'This will move them back to the Members section with full access.'}
              </p>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
