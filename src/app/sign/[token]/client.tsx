'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { FileCheck, Clock, Ban, FileText } from 'lucide-react';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { AgreementForm } from '@/components/agreement/AgreementForm';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };

interface SigningPageClientProps {
  token: string;
  initialData: {
    status: string;
    maskedEmail?: string;
    templateName?: string;
    personalNote?: string;
    sections?: { number: number; title: string; content: string }[];
  };
}

export function SigningPageClient({ token, initialData }: SigningPageClientProps) {
  const alreadyVerified = initialData.status === 'verified' && !!initialData.sections;
  const [verified, setVerified] = useState(alreadyVerified);
  const [sections, setSections] = useState<{ number: number; title: string; content: string }[] | null>(initialData.sections || null);
  const [title, setTitle] = useState(initialData.templateName || 'Agreement');
  const [personalNote, setPersonalNote] = useState(initialData.personalNote);

  // Terminal states
  if (initialData.status === 'signed') {
    return (
      <StatusPage
        icon={<FileCheck className="size-7 text-seeko-accent" />}
        title="Document already signed"
        description="This document has already been signed. A copy was sent to your email."
      />
    );
  }

  if (initialData.status === 'expired') {
    return (
      <StatusPage
        icon={<Clock className="size-7 text-yellow-400" />}
        title="Link expired"
        description="This signing link has expired. Please contact the sender for a new link."
      />
    );
  }

  if (initialData.status === 'revoked') {
    return (
      <StatusPage
        icon={<Ban className="size-7 text-destructive" />}
        title="Link revoked"
        description="This signing link is no longer valid."
      />
    );
  }

  // Verification phase
  if (!verified || !sections) {
    return (
      <div className="flex min-h-dvh items-end sm:items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="w-full max-w-md mb-8 sm:mb-0"
        >
          {/* Card */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            {/* Header: logo + document info */}
            <div className="flex items-start gap-4 mb-6">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground leading-tight">{initialData.templateName}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Document signing request</p>
              </div>
            </div>

            {/* Personal note */}
            {initialData.personalNote && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="mb-6 rounded-lg bg-muted/50 px-4 py-3"
              >
                <p className="text-sm text-foreground/70 leading-relaxed italic">
                  &ldquo;{initialData.personalNote}&rdquo;
                </p>
              </motion.div>
            )}

            {/* Divider */}
            <div className="h-px bg-border mb-6" />

            {/* Verification */}
            <VerificationForm
              token={token}
              maskedEmail={initialData.maskedEmail || '***'}
              onVerified={(data) => {
                setSections(data.sections);
                setTitle(data.title);
                setPersonalNote(data.personalNote);
                setVerified(true);
              }}
            />
          </div>

          {/* Footer outside card */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <img src="/seeko-s.png" alt="SEEKO" className="size-4 opacity-40" />
            <span className="text-xs text-muted-foreground/50">Powered by SEEKO Studio</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // Signing phase — reuse AgreementForm
  return (
    <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-center mb-8">
          <Logo />
        </div>
        <AgreementForm
          userId=""
          userEmail=""
          sections={sections}
          title={title}
          showEngagementType={false}
          signEndpoint="/api/external-signing/sign"
          signPayloadExtra={{ token }}
          successRedirect={null}
          personalNote={personalNote}
        />
      </div>
    </div>
  );
}

function StatusPage({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <Logo />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-muted ring-1 ring-border">
            {icon}
          </div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </motion.div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div>
      <img src="/seeko-s.png" alt="SEEKO" className="size-10 mx-auto" />
    </div>
  );
}
