'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { FileSignature, ChevronLeft } from 'lucide-react';
import { SendInviteForm } from '@/components/external-signing/SendInviteForm';
import { InviteTable } from '@/components/external-signing/InviteTable';
import { LightShell } from '@/components/dashboard/LightShell';
import { springs } from '@/lib/motion';

const SPRING = springs.smooth;

export function ExternalSigningAdmin() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <LightShell
      fill
      bordered
      leftSlot={
        <Link
          href="/"
          className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
        >
          <ChevronLeft className="size-3.5" />
          <span>External Signing</span>
        </Link>
      }
    >
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="space-y-8"
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#0a63cc]/10">
                <FileSignature className="size-5 text-[#0a63cc]" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[#111]">External Signing</h1>
                <p className="text-sm text-[#808080]">Send documents for external parties to sign</p>
              </div>
            </div>

            <SendInviteForm onInviteSent={() => setRefreshKey((k) => k + 1)} />
            <InviteTable refreshKey={refreshKey} />
          </motion.div>
        </div>
      </main>
    </LightShell>
  );
}
