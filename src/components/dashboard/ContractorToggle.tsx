'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function ContractorToggle({ userId, isContractor, light = false }: { userId: string; isContractor: boolean; light?: boolean }) {
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
        className={cn(
          'text-[11px] transition-colors whitespace-nowrap',
          light ? 'text-[#808080] hover:text-[#111]' : 'text-muted-foreground hover:text-foreground',
        )}
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
            <div className={cn('absolute inset-0 backdrop-blur-sm', light ? 'bg-black/20' : 'bg-black/50')} onClick={() => !loading && setConfirming(false)} />
            <motion.div
              className={cn(
                'relative w-full max-w-sm rounded-xl p-5',
                light ? 'border border-black/[0.06] bg-white shadow-seeko' : 'border border-border bg-card shadow-2xl',
              )}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={springs.firm}
            >
              <button
                onClick={() => setConfirming(false)}
                className={cn(
                  'absolute top-3 right-3 rounded-lg p-1 transition-colors',
                  light ? 'text-[#9a9a9a] hover:text-[#111] hover:bg-black/[0.04]' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <X className="size-4" />
              </button>
              <h3 className={cn('text-sm font-semibold', light ? 'text-[#111]' : 'text-foreground')}>{actionLabel}</h3>
              <p className={cn('text-xs mt-1.5 leading-relaxed', light ? 'text-[#808080]' : 'text-muted-foreground')}>
                {next
                  ? 'This will move them to the Contractors section. Contractors cannot see the Activity page.'
                  : 'This will move them back to the Members section with full access.'}
              </p>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                    light ? 'bg-[#111] text-white hover:bg-[#2a2a2a]' : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {loading ? 'Updating...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs transition-colors',
                    light ? 'text-[#505050] hover:text-[#111] hover:bg-black/[0.04]' : 'text-muted-foreground hover:text-foreground',
                  )}
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
