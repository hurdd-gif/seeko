'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';

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
  const [sending, setSending] = useState(false);

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
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Share &ldquo;{docTitle}&rdquo;</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 px-1 pt-4 pb-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Recipient email</label>
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Note <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            placeholder="Add a message..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Expires <span className="text-muted-foreground font-normal">(default 30 days)</span></label>
          <DatePicker value={expiresAt} onChange={setExpiresAt} minDate={null} dateLabel="Expires" />
        </div>

        <Button onClick={handleSubmit} disabled={sending} className="w-full gap-2 bg-seeko-accent text-black hover:bg-seeko-accent/90">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {sending ? 'Sending...' : 'Send Share Link'}
        </Button>
      </div>
    </Dialog>
  );
}
