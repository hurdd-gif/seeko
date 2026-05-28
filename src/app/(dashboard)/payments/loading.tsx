/**
 * Instant loading state for the `/payments` route.
 *
 * SECURITY NOTE: `/payments` is passkey-gated. The server component fetches
 * admin data and then renders the PASSKEY GATE — a centered "Unlock with
 * passkey" card — until the user authenticates. Payment amounts, recipients,
 * rows, and stats are NOT present in the initial render; they load only AFTER
 * passkey auth. Therefore this fallback deliberately skeletonizes the GATE,
 * not payment data. Skeletonizing rows/amounts/recipients here would
 * misrepresent the gated state and imply financial data that isn't loaded.
 *
 * No ContentSkeleton / boneyard is used: capturing bones for this route would
 * require an authenticated session and risk snapshotting gated financial data.
 * This is a hand-built gate skeleton instead. The breadcrumb + LightShell
 * chrome are reproduced from PaymentsPasskeyGate so the fallback matches the
 * real gate exactly. The Lock icon + accent circle and the "Payments"
 * breadcrumb stay crisp (gate identity); only the title/description/button
 * placeholders pulse.
 */
import Link from 'next/link';
import { ChevronLeft, Lock } from 'lucide-react';
import { LightShell } from '@/components/dashboard/LightShell';

export default function PaymentsLoading() {
  const breadcrumb = (
    <Link
      href="/"
      className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
    >
      <ChevronLeft className="size-3.5" />
      <span>Payments</span>
    </Link>
  );

  return (
    <LightShell fill bordered leftSlot={breadcrumb}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-6 py-10">
          <div className="w-full max-w-[440px]">
            <div className="w-full rounded-2xl bg-white p-8 shadow-seeko">
              {/* icon circle — crisp, keep the accent tint (gate identity, not a skeleton) */}
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[#0a63cc]/10">
                <Lock className="size-5 text-[#0a63cc]" />
              </div>
              {/* title + description + button placeholders — the only pulsing skeletons */}
              <div className="animate-pulse">
                <div className="flex flex-col items-center gap-2.5">
                  <div className="h-4 w-40 rounded bg-black/[0.06]" />
                  <div className="h-3 w-56 rounded bg-black/[0.05]" />
                </div>
                <div className="mt-6 h-10 w-full rounded-lg bg-black/[0.05]" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </LightShell>
  );
}
