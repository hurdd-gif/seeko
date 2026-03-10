'use client';

import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { Bug, ImagePlus, Loader2, X } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 28 };

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
        transition={{ ...SPRING, delay: 1 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex size-11 items-center justify-center rounded-full bg-muted border border-border shadow-lg text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
        title="Report a bug"
      >
        <Bug className="size-4.5" />
      </motion.button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              What went wrong?
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              rows={4}
              autoFocus
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Screenshot (optional)
            </label>
            {preview ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={preview} alt="Screenshot preview" className="w-full max-h-40 object-cover" />
                <button
                  onClick={clearScreenshot}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                <ImagePlus className="size-4" />
                Add screenshot
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Page:</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{pathname}</code>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={sending || !description.trim()}
            className="w-full"
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
