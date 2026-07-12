'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { FileCheck, Clock, Ban, FileQuestion, Mail } from 'lucide-react';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { AgreementForm } from '@/components/agreement/AgreementForm';
import { RecipientSheet } from '@/components/external/RecipientSheet';
import { TerminalStatus } from '@/components/external/TerminalStatus';
import { withGuardianSection } from '@/lib/external-agreement-templates';
import { ceremonySwap } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  LIGHT_RECIPIENT_TITLE,
  LIGHT_RECIPIENT_MUTED,
  LIGHT_TERMINAL_ICON,
} from '@/components/dashboard/lightKit';

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

// Terminal screens share one shape (icon chip + headline + line of copy).
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
    description: 'This signing link has expired. Please contact the sender for a new link.',
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
              <div className="flex size-12 items-center justify-center rounded-2xl bg-wash-4 text-ink-muted-strong">
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
