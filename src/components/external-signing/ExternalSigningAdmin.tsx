'use client';

import { useState } from 'react';
import { Link } from '@/lib/react-router-adapters';
import { Plus, ChevronLeft } from 'lucide-react';
import { InviteCreateDialog } from '@/components/external-signing/InviteCreateDialog';
import { InviteTable } from '@/components/external-signing/InviteTable';
import { LightShell } from '@/components/dashboard/LightShell';
import { FadeRise } from '@/components/motion';
import { BTN_PRIMARY } from '@/components/dashboard/lightKit';

/**
 * External Signing admin — a full-bleed Paper "drill-in" on the recent design
 * language: no hero block (the page identity lives in the back-link), the
 * primary action is a "New Invite" pill in the bar's actions slot (payments
 * precedent), and the invite pipeline IS the page. The composer lives in
 * <InviteCreateDialog>; <InviteTable> stays the real self-fetching table.
 */
export function ExternalSigningAdmin() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <LightShell
      fill
      bordered
      leftSlot={
        <Link
          href="/tasks"
          className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
        >
          <ChevronLeft className="size-3.5" />
          <span>External Signing</span>
        </Link>
      }
      actions={
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={`${BTN_PRIMARY} inline-flex min-h-10 items-center gap-2 rounded-full pl-4 pr-5 shadow-seeko active:scale-[0.96]`}
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">New Invite</span>
          <span className="sm:hidden">Invite</span>
        </button>
      }
    >
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
          <FadeRise y={6} delay={0.08}>
            <InviteTable refreshKey={refreshKey} onNewInvite={() => setCreateOpen(true)} />
          </FadeRise>
        </div>
      </main>

      <InviteCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onInviteSent={() => {
          setCreateOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </LightShell>
  );
}
