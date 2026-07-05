'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FileSignature, X } from 'lucide-react';
import { SendInviteForm } from '@/components/external-signing/SendInviteForm';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { CARD_TITLE } from '@/components/dashboard/lightKit';

/**
 * "New Invite" composer in a light dialog — the PaymentCreateDialog surface
 * (overlay + sprung panel, sheet-from-bottom on mobile). Closes only via the
 * explicit X, matching the payments precedent: a long composer shouldn't be
 * lost to a stray overlay click. The form mounts fresh on every open, so each
 * invite starts from a clean slate.
 */
export function InviteCreateDialog({
  open,
  onClose,
  onInviteSent,
}: {
  open: boolean;
  onClose: () => void;
  onInviteSent: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    acquireScrollLock();
    return () => releaseScrollLock();
  }, [open]);

  if (typeof document === 'undefined') return null;

  const overlayTransition = reduce
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
  const panelTransition = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 340, damping: 32, mass: 0.9 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="new-invite-overlay"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:px-4 touch-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlayTransition}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-invite-title"
            className="max-h-[90dvh] w-full max-w-xl origin-bottom overflow-y-auto rounded-t-[28px] border-0 bg-white shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)] ring-1 ring-black/[0.06] touch-auto sm:origin-center sm:rounded-[28px]"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 28, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
            transition={panelTransition}
          >
            <div className="flex items-center justify-between border-b border-black/[0.06] bg-[#fbfbfb] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-[#0a63cc]/10 text-[#0a63cc]">
                  <FileSignature className="size-5" strokeWidth={1.9} />
                </div>
                <h2 id="new-invite-title" className={`${CARD_TITLE} text-[18px]`}>
                  New invite
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-m-1.5 flex size-9 items-center justify-center rounded-full text-[#9a9a9a] transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.04] hover:text-[#3a3a3a] active:scale-[0.94]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <SendInviteForm bare onInviteSent={onInviteSent} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
