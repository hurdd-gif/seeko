'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { FileSignature } from 'lucide-react';
import { SendInviteForm } from '@/components/external-signing/SendInviteForm';
import { InviteTable } from '@/components/external-signing/InviteTable';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };

export function ExternalSigningAdmin() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="space-y-8"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-seeko-accent/10 ring-1 ring-seeko-accent/20">
            <FileSignature className="size-5 text-seeko-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">External Signing</h1>
            <p className="text-sm text-muted-foreground">Send documents for external parties to sign</p>
          </div>
        </div>

        <SendInviteForm onInviteSent={() => setRefreshKey((k) => k + 1)} />
        <InviteTable refreshKey={refreshKey} />
      </motion.div>
    </div>
  );
}
