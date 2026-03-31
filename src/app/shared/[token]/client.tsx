'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Presentation, Clock, XCircle, AlertTriangle, Shield } from 'lucide-react';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { DocContent } from '@/components/dashboard/DocContent';
import { DeckViewer } from '@/components/dashboard/DeckViewer';
import { springs } from '@/lib/motion';

const SPRING = springs.firm;
const SMOOTH = springs.smooth;

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Shared Viewer
 *
 *  Load     spinner visible while fetching
 *  Reveal   staggered page entrance:
 *             0ms  header slides down from top + fades in
 *           100ms  content area fades up
 *           250ms  footer fades in
 *  Verify   card fades+rises in (existing SPRING)
 * ───────────────────────────────────────────────────────── */

const viewerStagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

const headerReveal = {
  hidden: { opacity: 0, y: -12 },
  visible: { opacity: 1, y: 0, transition: SMOOTH },
};

const contentReveal = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { ...SMOOTH, delay: 0.05 } },
};

const footerReveal = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4, delay: 0.2 } },
};

interface SharedDocClientProps {
  token: string;
  initialData: {
    status: string;
    maskedEmail?: string;
    docTitle?: string;
    docType?: string;
    expiresAt?: string;
  };
}

type Phase = 'verify' | 'viewing' | 'session_expired';

function formatExpiry(expiresAt: string): string {
  const expires = new Date(expiresAt);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Expires today';
  if (diffDays === 1) return 'Expires tomorrow';
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  return `Expires ${expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function SharedDocClient({ token, initialData }: SharedDocClientProps) {
  const alreadyVerified = initialData.status === 'verified';
  const [phase, setPhase] = useState<Phase>(alreadyVerified ? 'viewing' : 'verify');
  const [docData, setDocData] = useState<{ title: string; content?: string; type: string; deck_orientation?: 'horizontal' | 'vertical'; slides?: { url: string; sort_order: number }[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/doc-share/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'session_expired') {
          setPhase('session_expired');
          return;
        }
        throw new Error(data.error);
      }
      const data = await res.json();
      setDocData(data);
      setPhase('viewing');
    } catch (err) {
      console.error('Failed to load document:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (alreadyVerified) fetchContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terminal states
  if (initialData.status === 'expired') {
    return <StatusPage icon={<Clock className="size-7 text-yellow-400" />} title="Link Expired" description="This document link has expired." />;
  }
  if (initialData.status === 'revoked') {
    return <StatusPage icon={<XCircle className="size-7 text-destructive" />} title="Link Revoked" description="This document link has been revoked." />;
  }
  if (phase === 'session_expired') {
    return <StatusPage icon={<AlertTriangle className="size-7 text-amber-400" />} title="Session Ended" description="This link was accessed from another device. Only one session is allowed at a time." />;
  }

  // Verify phase
  if (phase === 'verify') {
    const isDoc = initialData.docType !== 'deck';
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                {isDoc ? <FileText className="size-5 text-muted-foreground" /> : <Presentation className="size-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-tight text-foreground">{initialData.docTitle || 'Shared Document'}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">from SEEKO Studio</p>
              </div>
            </div>

            {initialData.expiresAt && (
              <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <span>{formatExpiry(initialData.expiresAt)}</span>
              </div>
            )}

            <div className="mb-6 h-px bg-border" />

            <VerificationForm
              token={token}
              maskedEmail={initialData.maskedEmail || '***'}
              sendCodeEndpoint="/api/doc-share/send-code"
              verifyEndpoint="/api/doc-share/verify"
              onVerified={() => fetchContent()}
            />
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5">
            <img src="/seeko-s.png" alt="SEEKO" className="size-4 opacity-40" />
            <span className="text-xs text-muted-foreground/50">Powered by SEEKO Studio</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // Loading
  if (loading || !docData) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="size-5 rounded-full border-2 border-muted-foreground/20 border-t-seeko-accent animate-spin" />
      </div>
    );
  }

  // Viewing phase — staggered page entrance
  return (
    <motion.div
      variants={viewerStagger}
      initial="hidden"
      animate="visible"
      className="min-h-dvh bg-background select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header — brand + title + security context */}
      <motion.div variants={headerReveal} className="sticky top-0 z-10 border-b border-border/60 bg-card/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/seeko-s.png" alt="SEEKO" className="size-5 shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-foreground truncate block">{docData.title}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {initialData.expiresAt && (
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                <Clock className="size-3" />
                {formatExpiry(initialData.expiresAt)}
              </span>
            )}
            <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground/60">
              <Shield className="size-3" />
              <span>Confidential</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div variants={contentReveal} className="mx-auto max-w-5xl px-5 py-8">
        {docData.type === 'deck' && docData.slides ? (
          <DeckViewer slides={docData.slides} title={docData.title} notes={docData.content} orientation={docData.deck_orientation} />
        ) : docData.content ? (
          <DocContent html={docData.content} />
        ) : (
          <p className="text-sm text-muted-foreground">No content available.</p>
        )}
      </motion.div>

      {/* Footer — share context */}
      <motion.div variants={footerReveal} className="border-t border-border/40 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-3 px-5">
          <img src="/seeko-s.png" alt="SEEKO" className="size-3.5 opacity-30" />
          <span className="text-[11px] text-muted-foreground/40">
            Shared by SEEKO Studio{initialData.expiresAt ? ` · ${formatExpiry(initialData.expiresAt)}` : ''} · View-only access
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusPage({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <img src="/seeko-s.png" alt="SEEKO" className="mx-auto size-10" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted ring-1 ring-border">{icon}</div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </motion.div>
      </div>
    </div>
  );
}
