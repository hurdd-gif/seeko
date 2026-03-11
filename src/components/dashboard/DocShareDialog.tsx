'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Loader2, Calendar, X, Shield } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — DocShareDialog
 *
 *    0ms   dialog opens (handled by Dialog base)
 *  100ms   header fades + slides up (y 8 → 0, opacity 0 → 1)
 *  180ms   email field reveals    (stagger +80ms each)
 *  260ms   note field reveals
 *  340ms   expires field reveals
 *  420ms   CTA button reveals
 *  500ms   security badge fades in
 *
 *  CALENDAR  expand/collapse with height auto + fade
 * ───────────────────────────────────────────────────────── */

const STAGGER_SPRING = { type: 'spring' as const, visualDuration: 0.4, bounce: 0.05 };
const STAGGER_DELAY = 0.08; // seconds between each field

interface DocShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
  docTitle: string;
}

export function DocShareDialog({ open, onOpenChange, docId, docTitle }: DocShareDialogProps) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [sending, setSending] = useState(false);

  const formattedExpiry = expiresAt
    ? new Date(expiresAt + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  async function handleSubmit() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/doc-share/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email,
          docId,
          personalNote: note || undefined,
          expiresAt: expiresAt ? new Date(expiresAt + 'T00:00:00').toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to share');
      }

      toast.success(`Share link sent to ${email}`);
      setEmail('');
      setNote('');
      setExpiresAt('');
      setShowCalendar(false);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-[480px]">
      <DialogClose onClose={() => onOpenChange(false)} />
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: STAGGER_DELAY, delayChildren: 0.1 } },
        }}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: STAGGER_SPRING } }}>
          <DialogHeader>
            <DialogTitle className="text-base">Share &ldquo;{docTitle}&rdquo;</DialogTitle>
            <p className="text-xs text-muted-foreground">Send a secure, view-only link</p>
          </DialogHeader>
        </motion.div>

        <div className="space-y-3.5 pt-1 pb-2">
          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: STAGGER_SPRING } }} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </motion.div>

          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: STAGGER_SPRING } }} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Note <span className="font-normal">(optional)</span></label>
            <Input
              placeholder="Add a message..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </motion.div>

          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: STAGGER_SPRING } }} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Expires <span className="font-normal">(default 30 days)</span></label>
            <AnimatePresence mode="wait">
              {!showCalendar ? (
                <motion.button
                  key="trigger"
                  type="button"
                  onClick={() => setShowCalendar(true)}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/20 hover:text-foreground transition-colors w-full"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Calendar className="size-3.5" />
                  {expiresAt ? (
                    <span className="text-foreground">{formattedExpiry}</span>
                  ) : (
                    <span>Pick a date</span>
                  )}
                </motion.button>
              ) : (
                <motion.div
                  key="picker"
                  className="relative overflow-hidden"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', visualDuration: 0.35, bounce: 0 }}
                >
                  <DatePicker
                    value={expiresAt}
                    onChange={(date) => { setExpiresAt(date); setShowCalendar(false); }}
                    dateLabel="Expires"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCalendar(false)}
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: STAGGER_SPRING } }} className="pt-1.5">
            <Button onClick={handleSubmit} disabled={sending} className="w-full gap-2 bg-seeko-accent text-black hover:bg-seeko-accent/90">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? 'Sending...' : 'Send Share Link'}
            </Button>
          </motion.div>

          <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }} className="flex items-center justify-center gap-1.5 pt-0.5">
            <Shield className="size-3 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground/40">Single-session, read-only access</p>
          </motion.div>
        </div>
      </motion.div>
    </Dialog>
  );
}
