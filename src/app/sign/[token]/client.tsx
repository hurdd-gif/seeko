'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { FileCheck, Clock, Ban, FileQuestion, Mail, Loader2 } from 'lucide-react';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { AgreementForm } from '@/components/agreement/AgreementForm';
import { RecipientSheet } from '@/components/external/RecipientSheet';
import { TerminalStatus } from '@/components/external/TerminalStatus';
import { Button } from '@/components/ui/button';
import { withGuardianSection } from '@/lib/external-agreement-templates';
import { springs, ceremonySwap } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  LIGHT_RECIPIENT_TITLE,
  LIGHT_RECIPIENT_MUTED,
  LIGHT_RECIPIENT_CTA,
  LIGHT_TERMINAL_ICON,
  LIGHT_SUCCESS_TEXT,
} from '@/components/dashboard/lightKit';

const SPRING = springs.smooth;

type Section = { number: number; title: string; content: string };

interface SigningPageClientProps {
  token: string;
  initialData: {
    status: string;
    maskedEmail?: string;
    templateName?: string;
    personalNote?: string;
    sections?: Section[];
    isGuardianSigning?: boolean;
  };
}

// Terminal screens share one shape (icon chip + headline + line of copy). The
// expired screen alone carries a self-service action, wired below by status.
const TERMINALS: Record<
  string,
  { iconKey: keyof typeof LIGHT_TERMINAL_ICON; icon: React.ReactNode; title: string; description: string }
> = {
  signed: {
    iconKey: 'signed',
    icon: <FileCheck className="size-7" />,
    title: 'Already signed',
    description: 'This document has already been signed. A copy was sent to your email.',
  },
  expired: {
    iconKey: 'expired',
    icon: <Clock className="size-7" />,
    title: 'Link expired',
    description: "This signing link has expired. Request a fresh one below and we'll email it to you.",
  },
  revoked: {
    iconKey: 'revoked',
    icon: <Ban className="size-7" />,
    title: 'Link revoked',
    description: 'This signing link is no longer valid. Please contact the sender if you believe this is a mistake.',
  },
  notfound: {
    iconKey: 'notfound',
    icon: <FileQuestion className="size-7" />,
    title: 'Link not found',
    description: "We couldn't find this signing request. Please check the link, or contact the sender for a new one.",
  },
};

export function SigningPageClient({ token, initialData }: SigningPageClientProps) {
  const alreadyVerified = initialData.status === 'verified' && !!initialData.sections;
  const [verified, setVerified] = useState(alreadyVerified);
  const [sections, setSections] = useState<Section[] | null>(
    initialData.sections
      ? initialData.isGuardianSigning
        ? withGuardianSection(initialData.sections)
        : initialData.sections
      : null,
  );
  const [title, setTitle] = useState(initialData.templateName || 'Agreement');
  const [personalNote, setPersonalNote] = useState(initialData.personalNote);
  const [dismissed, setDismissed] = useState(false);
  // Drawer → fullscreen on "Continue to sign": AgreementForm signals when the
  // ceremony leaves the reading step, and the sheet grows to match.
  const [expanded, setExpanded] = useState(false);
  const reduce = useReducedMotion();

  // ── Terminal states (signed / expired / revoked / not-found) ──
  // Dismissible: the ceremony is over, so the signer may swipe/tap away. On
  // dismiss the sheet slides off to reveal a quiet "you can close this" hint.
  const terminal = TERMINALS[initialData.status];
  if (terminal) {
    return (
      <AnimatePresence>
        {dismissed ? (
          <ClosedHint key="closed" />
        ) : (
          <RecipientSheet key="terminal" dismissible onDismiss={() => setDismissed(true)}>
            <TerminalStatus
              iconKey={terminal.iconKey}
              icon={terminal.icon}
              title={terminal.title}
              description={terminal.description}
              action={initialData.status === 'expired' ? <ReissueAction token={token} /> : undefined}
            />
          </RecipientSheet>
        )}
      </AnimatePresence>
    );
  }

  // ── Active ceremony (verify → review → sign) ──
  // One persistent, LOCKED sheet: it can't be swiped away mid-signature. The
  // inner panel cross-fades from verification to the agreement once the signer
  // proves their email, so the surface itself never leaves the screen.
  return (
    <RecipientSheet expanded={expanded}>
      <AnimatePresence mode="wait" initial={false}>
        {!verified || !sections ? (
          <motion.div key="verify" {...ceremonySwap(reduce)} className="flex flex-col gap-6">
            {/* Header — no logo (signer feedback): icon chip + the document name */}
            <div className="flex flex-col items-center gap-4 pt-2 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-black/[0.04] text-[#6e6e6e]">
                <Mail className="size-5" />
              </div>
              <h1 className={cn('text-[22px] leading-tight tracking-[-0.01em]', LIGHT_RECIPIENT_TITLE)}>
                {initialData.templateName || 'Signature request'}
              </h1>
            </div>

            <VerificationForm
              light
              token={token}
              maskedEmail={initialData.maskedEmail || '***'}
              onVerified={(data) => {
                const d = data as { sections: Section[]; title: string; personalNote?: string };
                setSections(initialData.isGuardianSigning ? withGuardianSection(d.sections) : d.sections);
                setTitle(d.title);
                setPersonalNote(d.personalNote);
                setVerified(true);
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="sign" {...ceremonySwap(reduce)}>
            <AgreementForm
              light
              userId=""
              userEmail=""
              sections={sections}
              title={title}
              showEngagementType={false}
              signEndpoint="/api/external-signing/sign"
              signPayloadExtra={{ token }}
              successRedirect={null}
              personalNote={personalNote}
              isGuardianSigning={initialData.isGuardianSigning}
              onExpandedChange={setExpanded}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </RecipientSheet>
  );
}

/** Shown after a terminal sheet is dismissed — the page is spent, nothing to do. */
function ClosedHint() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.3 }}
      className="overview-light fixed inset-0 z-40 flex items-center justify-center bg-[var(--ov-bg)] px-6 text-center"
    >
      <p className={cn('text-[15px]', LIGHT_RECIPIENT_MUTED)}>You can close this page now.</p>
    </motion.div>
  );
}

/**
 * Expired-only self-service: emails the signer a fresh link via the reissue
 * endpoint. The new token is delivered by email (never returned in the response),
 * so the UI only confirms that a new link is on its way.
 */
function ReissueAction({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function requestNewLink() {
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/external-signing/reissue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not send a new link. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch {
      setError('Could not send a new link. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className={cn('text-sm leading-relaxed', LIGHT_SUCCESS_TEXT)}
      >
        A new link is on its way to your inbox. It may take a minute to arrive.
      </motion.p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Button
        type="button"
        onClick={requestNewLink}
        disabled={status === 'sending'}
        className={cn('gap-2', LIGHT_RECIPIENT_CTA)}
      >
        {status === 'sending' ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
        {status === 'sending' ? 'Sending…' : 'Request a new link'}
      </Button>
      {status === 'error' && <p className="text-sm text-[#d4503e]">{error}</p>}
    </div>
  );
}
