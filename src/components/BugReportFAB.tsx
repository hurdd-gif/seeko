'use client';

import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { Bug, ImagePlus, Loader2, X } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { springs } from '@/lib/motion';

const HIDDEN_PATHS = ['/login', '/set-password', '/agreement', '/onboarding'];

interface BugReportFABProps {
  displayName: string;
  email: string;
}

export function BugReportFAB({ displayName, email }: BugReportFABProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (HIDDEN_PATHS.some(p => pathname.startsWith(p)) || pathname.startsWith('/sign')) {
    return null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshot(file);
    setPreview(URL.createObjectURL(file));
  }

  function clearScreenshot() {
    setScreenshot(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose(v: boolean) {
    if (!v) {
      setOpen(false);
      setTimeout(() => {
        setDescription('');
        clearScreenshot();
      }, 200);
    }
  }

  async function handleSubmit() {
    if (!description.trim()) return;
    setSending(true);

    const formData = new FormData();
    formData.append('description', description.trim());
    formData.append('pageUrl', window.location.href);
    formData.append('userAgent', navigator.userAgent);
    formData.append('screenSize', `${window.innerWidth}x${window.innerHeight}`);
    formData.append('isPwa', String(window.matchMedia('(display-mode: standalone)').matches));
    formData.append('reporterName', displayName);
    formData.append('reporterEmail', email);
    if (screenshot) formData.append('screenshot', screenshot);

    try {
      const res = await fetch('/api/bug-report', { method: 'POST', body: formData });
      if (res.ok) {
        toast.success('Bug report sent — thanks!');
        handleClose(false);
      } else {
        toast.error('Failed to send report');
      }
    } catch {
      toast.error('Failed to send report');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...springs.firm, delay: 1 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6 z-40 flex size-11 items-center justify-center rounded-full bg-muted border border-border shadow-lg text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
        title="Report a bug"
      >
        <Bug className="size-4.5" />
      </motion.button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="size-4 text-muted-foreground" />
            Report a Bug
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2 mb-1">Help us improve by describing what went wrong.</p>
        <div className="flex flex-col gap-5">
          <div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What happened? What did you expect?"
              rows={3}
              autoComplete="off"
              autoCorrect="off"
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-resizer]:hidden"
            />
          </div>

          {/* Screenshot + Page info grouped */}
          <div className="flex items-center gap-3">
            {preview ? (
              <div className="relative size-16 rounded-lg overflow-hidden border border-border shrink-0 group">
                <img src={preview} alt="Screenshot" className="size-full object-cover" />
                <button
                  onClick={clearScreenshot}
                  className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full bg-black/70 p-0.5 text-white"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors shrink-0"
              >
                <ImagePlus className="size-3.5" />
                Screenshot
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 min-w-0">
              <code className="truncate rounded bg-muted px-1.5 py-0.5 text-[11px]">{pathname}</code>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={sending || !description.trim()}
            className="w-full bg-seeko-accent text-background hover:bg-seeko-accent/90 font-semibold"
          >
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              'Send Report'
            )}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
