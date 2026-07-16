'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Payments page entrance
 *
 *    0ms   hero fades in (title + subtitle + action)
 *  120ms   stat cards stagger in (60ms apart, scale up)
 *  350ms   pending requests card slides in (if any)
 *  420ms   invoice requests card fades in (if any)
 *  500ms   people card fades in
 *          people rows stagger (40ms apart, slide from left)
 *  650ms   recent payments card fades in
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { Link, useRouter, useSearchParams, usePathname } from '@/lib/react-router-adapters';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Users, CheckCircle2,
  CreditCard, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, X as XIcon,
  FileText, RotateCw, Ban, Loader2, Pencil,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { InputCopy } from '@/components/ui/input-copy';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FadeRise, Stagger, StaggerItem, springs } from '@/components/motion';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { LightShell } from '@/components/dashboard/LightShell';
import { BTN_PRIMARY, LIGHT_INVOICE_STATUS, LIGHT_INPUT, DIALOG_SAVE, DIALOG_CANCEL } from '@/components/dashboard/lightKit';
import { PaymentsPasskeyGate } from '@/components/dashboard/PaymentsPasskeyGate';
import { PaymentCreateDialog } from '@/components/dashboard/PaymentCreateDialog';
import { PaymentsChart } from '@/components/dashboard/PaymentsChart';
import type { Profile, Payment } from '@/lib/types';
import { TAB_PILL_SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Timing config (ms → seconds for motion) ── */
const TIMING = {
  hero: 0,
  chart: 120, // outflow chart rises with the strip settled; bars stagger internally
  stats: 120,
  statsStagger: 60,
  pending: 350,
  invoiceRequests: 420,
  people: 500,
  peopleStagger: 40,
  recent: 650,
};

const d = (ms: number) => ms / 1000;
const PAYMENT_MAIN_SURFACE = 'rounded-[20px] border-0 bg-surface-1 shadow-surface-1';
const PAYMENT_RAIL_SURFACE = 'rounded-[18px] border-0 bg-surface-1 shadow-surface-1';
const PAYMENT_SECTION_HEAD = 'px-5 py-3.5 border-b border-wash-6';

/* ── Helpers ── */
function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function externalRecipientLabel(email?: string | null): string {
  const local = email?.split('@')[0]?.trim();
  if (!local) return 'External recipient';
  const cleaned = local
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'External recipient';
}

/* Local light empty block — the shared <EmptyState> bakes a `text-foreground` title that
 * is invisible on white, so light surfaces render their own. */
function LightEmpty({ icon: Icon, title, description }: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-surface-4">
        <Icon className="size-5 text-ink-faint" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-title">{title}</p>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

/* Compact one-line empty row — empty sections shouldn't outrank live ones with
 * a full-height empty state; this keeps them present but visually demoted. */
function LightEmptyRow({ icon: Icon, text }: {
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-3 px-1">
      <Icon className="size-4 shrink-0 text-[#c8c8c8] dark:text-ink-ghost" />
      <p className="text-xs text-ink-faint">{text}</p>
    </div>
  );
}

type TeamMember = Profile & { paypal_email?: string };

interface InvoiceRequest {
  id: string;
  recipient_email: string;
  status: 'pending' | 'verified' | 'signed' | 'expired' | 'revoked';
  prefilled_items: { label: string; amount: number }[] | null;
  paypal_email: string | null;
  submitted_payment_id: string | null;
  payment_status: 'pending' | 'paid' | 'cancelled' | null;
  expires_at: string;
  created_at: string;
}

interface PaymentsAdminProps {
  team: TeamMember[];
  viewerMode?: boolean;
}

export function PaymentsAdmin({ team, viewerMode = false }: PaymentsAdminProps) {
  // The passkey gate is a UX layer over the *server's* decision — the API is the
  // real gate (401 without a valid payments token). So we ASK the server on mount
  // whether it will serve payments: it returns 200 when a valid token cookie
  // exists OR when DEV_AUTH_BYPASS is active (see api-server/payments-auth.ts).
  //
  // The old `import.meta.env.MODE === 'development'` check failed locally because
  // we QA the *built* bundle served by the API on :8788, where MODE is baked to
  // 'production' at build time — so the dev bypass never fired even though the
  // server was granting access. A runtime probe unlocks correctly on the Vite dev
  // server AND the local build, and still shows the gate in real production (no
  // bypass + no cookie → 401 → locked). 'checking' avoids a gate flash on unlock.
  const [access, setAccess] = useState<'checking' | 'granted' | 'locked'>(
    viewerMode ? 'granted' : 'checking'
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<{
    pendingTotal: number;
    paidThisMonth: number;
    peopleOwed: number;
    paymentsThisMonth: number;
    // viewer-only extras — investors get an all-time lens instead of admin queues
    allTimePaid?: number;
    totalPayments?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'owed' | 'paid'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<TeamMember | null>(null);
  const [invoiceRequests, setInvoiceRequests] = useState<InvoiceRequest[]>([]);
  const reduce = useReducedMotion();
  const pillTransition = reduce ? { duration: 0 } : TAB_PILL_SPRING;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Token is sent automatically via httpOnly cookie
      const [paymentsRes, statsRes, invoiceRes] = await Promise.all([
        fetch('/api/payments'),
        fetch('/api/payments/stats'),
        viewerMode ? Promise.resolve(new Response('[]', { status: 200 })) : fetch('/api/invoice-request/list'),
      ]);

      if (paymentsRes.status === 401 || statsRes.status === 401) {
        // Token expired mid-session (the 1h window lapsed) — fall back to the gate.
        setAccess('locked');
        return;
      }

      const [paymentsData, statsRaw, invoiceData] = await Promise.all([
        paymentsRes.json(),
        statsRes.json(),
        invoiceRes.ok ? invoiceRes.json() : [],
      ]);

      setPayments(paymentsData);
      setStats(viewerMode
        ? {
            pendingTotal: 0,
            paidThisMonth: Number(statsRaw.thisMonth ?? 0),
            peopleOwed: Number(statsRaw.peoplePaid ?? 0),
            paymentsThisMonth: paymentsData.filter((payment: Payment) => payment.status === 'paid').length,
            allTimePaid: Number(statsRaw.allTime ?? 0),
            totalPayments: Number(statsRaw.paymentCount ?? 0),
          }
        : statsRaw);
      setInvoiceRequests(invoiceData);
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, [viewerMode]);

  // Probe the server's own gate once on mount (non-viewer). 200 means the server
  // will serve payments — a valid token cookie OR the local dev bypass — so we
  // skip the passkey UI. 401/network → show the gate. This replaces the removed
  // compile-time MODE check and works identically on the Vite dev server and the
  // locally-served production build.
  useEffect(() => {
    if (access !== 'checking') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payments/stats');
        if (!cancelled) setAccess(res.ok ? 'granted' : 'locked');
      } catch {
        if (!cancelled) setAccess('locked');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access]);

  useEffect(() => {
    if (access === 'granted') fetchData();
  }, [access, fetchData]);

  // Deep link from the dashboard chrome: /payments?new=1 opens the create
  // dialog once the passkey gate has passed, then strips the param so a
  // refresh doesn't re-open it.
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const wantsNewPayment = searchParams.get('new') === '1';
  // The mount path is the ground truth for where "back" belongs: anything under
  // /investor returns to the investor dashboard, regardless of admin/viewer status
  // or whether a ?from param happened to ride along. The query param stays as a
  // secondary signal for links that deep-link into /payments from the investor UI.
  const inInvestorContext = pathname.startsWith('/investor') || searchParams.get('from') === 'investor';
  useEffect(() => {
    if (access !== 'granted' || !wantsNewPayment) return;
    setSelectedRecipient(null);
    setCreateDialogOpen(true);
    router.replace('/payments');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, wantsNewPayment]);

  if (access === 'checking') {
    // Neutral placeholder in the same shell the gate/content use, so resolving to
    // either one is a crossfade of the body — never a layout jump.
    return (
      <LightShell fill bordered>
        <div className="flex min-h-full flex-1 items-center justify-center text-ink-faint">
          <Loader2 className="size-4 animate-spin" />
        </div>
      </LightShell>
    );
  }

  if (access === 'locked') {
    return <PaymentsPasskeyGate onAuthenticated={() => setAccess('granted')} />;
  }

  /* ── Derived data ── */
  const peopleWithPending = team
    .filter(m => !m.is_investor)
    .map(member => {
      const memberPayments = payments.filter(p => p.recipient_id === member.id);
      const pendingAmount = memberPayments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const hasPaid = memberPayments.some(p => p.status === 'paid');
      return { ...member, pendingAmount, hasPaid };
    });

  const filteredPeople = peopleWithPending.filter(p => {
    if (filter === 'owed') return p.pendingAmount > 0;
    if (filter === 'paid') return p.pendingAmount === 0 && p.hasPaid;
    return true;
  });

  filteredPeople.sort((a, b) => {
    if (a.pendingAmount > 0 && b.pendingAmount === 0) return -1;
    if (a.pendingAmount === 0 && b.pendingAmount > 0) return 1;
    return b.pendingAmount - a.pendingAmount;
  });

  const pendingRequests = payments.filter(p => p.status === 'pending' && (p.created_by === p.recipient_id || p.recipient_id === null));

  const recentPaid = payments
    .filter(p => p.status === 'paid')
    .slice(0, 15);

  // Map: payment.id → paypal_email submitted on the linked invoice request
  const paypalEmailByPaymentId = new Map<string, string>();
  for (const inv of invoiceRequests) {
    if (inv.submitted_payment_id && inv.paypal_email) {
      paypalEmailByPaymentId.set(inv.submitted_payment_id, inv.paypal_email);
    }
  }

  const recentPaidRows = recentPaid.map(payment => (
    <PaidPaymentRow
      key={payment.id}
      payment={payment}
      externalPaypalEmail={paypalEmailByPaymentId.get(payment.id) ?? null}
      onAction={fetchData}
      readOnly={viewerMode}
    />
  ));

  const handlePay = (member: TeamMember) => {
    setSelectedRecipient(member);
    setCreateDialogOpen(true);
  };

  /* "A payment was recorded — refresh behind me." NOT "close me." The dialog
     fires this from "Add another" while it is still open, so closing here tore
     down the very form the user just asked for. Closing is the dialog's own
     call (handleClose → onOpenChange(false)), and that path already refetches. */
  const handlePaymentCreated = () => {
    fetchData();
  };

  // Never flash "$0.00 · All caught up" before the first stats fetch resolves —
  // a false all-clear on a money page. Values render as an em dash until ready;
  // refetches keep the previous stats visible, so this only gates first load.
  const statsReady = stats !== null;
  const pendingTotal = stats?.pendingTotal ?? 0;
  // Invites not yet submitted (pending/verified, unexpired) are pipeline the
  // payments table can't see — fold them into the summary so "All caught up"
  // stays truthful while invoices are still out.
  const openInvoiceCount = invoiceRequests.filter(inv =>
    (inv.status === 'pending' || inv.status === 'verified') &&
    new Date(inv.expires_at) >= new Date()
  ).length;
  const pendingSubtitle = !statsReady
    ? ' '
    : [
        pendingTotal > 0 ? `${stats?.peopleOwed ?? 0} people owed` : null,
        openInvoiceCount > 0 ? `${openInvoiceCount} invoice${openInvoiceCount !== 1 ? 's' : ''} awaiting submission` : null,
  ].filter(Boolean).join(' · ') || 'All caught up';
  const refundedPayments = payments.filter(p => p.status === 'paid' && Number(p.refund_amount ?? 0) > 0);
  const revokedInvoices = invoiceRequests.filter(inv => inv.status === 'revoked').length;
  const exceptionCount = refundedPayments.length + revokedInvoices;
  // Investors read paid outflow, not the admin work queue: Pending / Invoices /
  // Exceptions are all zero for a viewer (they only receive paid rows), so the
  // strip shows an all-time lens instead — same visual grammar, honest numbers.
  const summarySignals = viewerMode
    ? [
        {
          label: 'Paid this month',
          value: statsReady ? fmt(stats?.paidThisMonth ?? 0) : '—',
          detail: statsReady
            ? `${stats?.paymentsThisMonth ?? 0} payment${(stats?.paymentsThisMonth ?? 0) !== 1 ? 's' : ''}`
            : ' ',
          active: statsReady && (stats?.paidThisMonth ?? 0) > 0,
        },
        {
          label: 'All-time paid',
          value: statsReady ? fmt(stats?.allTimePaid ?? 0) : '—',
          detail: statsReady
            ? `${stats?.totalPayments ?? 0} payout${(stats?.totalPayments ?? 0) !== 1 ? 's' : ''} total`
            : ' ',
          active: statsReady && (stats?.allTimePaid ?? 0) > 0,
        },
        {
          label: 'People paid',
          value: statsReady ? String(stats?.peopleOwed ?? 0) : '—',
          detail: 'team members across the studio',
          active: statsReady && (stats?.peopleOwed ?? 0) > 0,
        },
      ]
    : [
    {
      label: 'Pending',
      value: statsReady ? fmt(pendingTotal) : '—',
      detail: pendingSubtitle,
      active: statsReady && pendingTotal > 0,
    },
    {
      label: 'Paid this month',
      value: statsReady ? fmt(stats?.paidThisMonth ?? 0) : '—',
      detail: statsReady
        ? `${stats?.paymentsThisMonth ?? 0} transaction${(stats?.paymentsThisMonth ?? 0) !== 1 ? 's' : ''}`
        : ' ',
      active: statsReady && (stats?.paidThisMonth ?? 0) > 0,
    },
    {
      label: 'Invoices',
      value: `${openInvoiceCount} open`,
      detail: `${invoiceRequests.length} total request${invoiceRequests.length !== 1 ? 's' : ''}`,
      active: openInvoiceCount > 0,
    },
    {
      label: 'Exceptions',
      value: String(exceptionCount),
      detail: `${refundedPayments.length} refunded · ${revokedInvoices} revoked`,
      active: exceptionCount > 0,
      danger: exceptionCount > 0,
    },
  ];

  const filterOptions = [
    { label: 'All', value: 'all' as const, count: peopleWithPending.length },
    { label: 'Owed', value: 'owed' as const, count: peopleWithPending.filter(p => p.pendingAmount > 0).length },
    { label: 'Paid', value: 'paid' as const, count: peopleWithPending.filter(p => p.pendingAmount === 0 && p.hasPaid).length },
  ];

  const paymentActions = viewerMode ? null : (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => { setSelectedRecipient(null); setCreateDialogOpen(true); }}
        className={`${BTN_PRIMARY} inline-flex min-h-9 items-center gap-1.5 pl-3.5 pr-4 active:scale-[0.96]`}
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">New Payment</span>
        <span className="sm:hidden">Payment</span>
      </button>
    </div>
  );
  const backHref = inInvestorContext || viewerMode ? '/investor' : '/tasks';
  const backLabel = inInvestorContext || viewerMode ? 'Investor dashboard' : 'Payments';

  return (
    <LightShell
      fill
      bordered
      actions={paymentActions}
      leftSlot={
        <Link
          href={backHref}
          className="flex items-center gap-1 text-[13px] text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          <span>{backLabel}</span>
        </Link>
      }
    >
    <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
    <div className="mx-auto w-full max-w-[1180px] px-5 pt-8 pb-16 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <FadeRise delay={d(TIMING.hero)}>
        <div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-wash-6 py-3">
            {summarySignals.map((signal) => (
              <div key={signal.label} className="flex min-w-0 items-baseline gap-2 text-[13px]">
                <span className="shrink-0 text-[#858585] dark:text-ink-muted">{signal.label}</span>
                <span className={cn(
                  'shrink-0 font-semibold tabular-nums',
                  signal.danger ? 'text-danger' : signal.active ? 'text-ink-title' : 'text-[#a0a0a0] dark:text-ink-faint'
                )}>
                  {signal.value}
                </span>
                <span className="hidden min-w-0 truncate text-ink-faint md:inline">{signal.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeRise>

      {/* ── Outflow chart — first area of impact; loading mirrors the strip's
            no-false-all-clear rule (shimmer until the first fetch resolves) ── */}
      <FadeRise delay={d(TIMING.chart)}>
        <PaymentsChart
          payments={payments}
          loading={loading && stats === null}
          className="mt-5"
        />
      </FadeRise>

      {/* Admin gets the two-column console (work queue + rail). A viewer has no
          left-column content (pending/invoice are admin-only), so the read-only
          page collapses to one full-width column: chart → Recent payments. */}
      <div className={cn('mt-5', viewerMode ? 'space-y-5' : 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch')}>
        {!viewerMode && (
        <div className="flex min-w-0 flex-col gap-5">

      {/* ── Pending Requests ── */}
      <AnimatePresence>
        {!viewerMode && pendingRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ ...springs.smooth, delay: d(TIMING.pending) }}
          >
            <Card className={cn(PAYMENT_MAIN_SURFACE, 'overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.035),0_0_0_1px_rgba(184,128,26,0.22)]')}>
              <CardHeader className={PAYMENT_SECTION_HEAD}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-[15px] font-semibold text-ink-title">
                      Needs review
                    </CardTitle>
                    <CardDescription className="mt-0.5 text-xs text-ink-muted">
                      Team-submitted payment requests waiting on an admin decision.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-dept-wash-animation/35 bg-dept-wash-animation/10 text-dept-ink-animation tabular-nums">
                    {pendingRequests.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-5 py-0">
                <div className="-mx-5 divide-y divide-wash-6">
                  {pendingRequests.map((payment, i) => (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springs.smooth, delay: d(TIMING.pending) + i * 0.06 }}
                    >
                      <PendingRequestRow
                        payment={payment}
                        onAction={() => fetchData()}
                      />
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Invoice Requests ── */}
      {/* The card is absolutely positioned inside a flex-1 slot so it escapes the
          grid row's intrinsic (content) sizing: with a long queue in flow, the tall
          left column would drive the row taller than the right rail. Out of flow,
          the RIGHT rail sets the row height and this card fills + scrolls to match
          its end (grow-left) — no dead space, a bottom fade on the clipped edge. */}
      {!viewerMode && invoiceRequests.length > 0 && (
        <div className="relative min-h-0 flex-1">
        <FadeRise delay={d(TIMING.invoiceRequests)} className="absolute inset-0 flex flex-col">
          <Card className={cn(PAYMENT_MAIN_SURFACE, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
            <CardHeader className={PAYMENT_SECTION_HEAD}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-[15px] font-semibold text-ink-title">Invoice queue</CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-ink-muted">Review external submissions and payout outcomes.</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                  <span className="tabular-nums">{openInvoiceCount} open</span>
                  <span className="text-[#d0d0d0] dark:text-ink-ghost">/</span>
                  <span className="tabular-nums">{invoiceRequests.length} total</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-5 py-0">
              <div className="-mx-5 hidden grid-cols-[minmax(0,1fr)_92px_116px_112px] gap-3 border-b border-wash-6 px-5 py-2.5 text-[11px] font-medium text-[#a0a0a0] dark:text-ink-muted sm:grid">
                <span>Recipient</span>
                <span className="text-left">Date</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
              </div>
              {/* Fills the stretched slot (h-full) and scrolls the queue; the
                  bottom fade softens the clipped edge past the fold. */}
              <div className="relative -mx-5 min-h-0 flex-1">
                <ScrollArea className="h-full" viewportClassName="pb-6">
                  <div className="divide-y divide-wash-6">
                    {invoiceRequests.map((inv, i) => (
                      <InvoiceRequestRow key={inv.id} invite={inv} index={i} onAction={fetchData} />
                    ))}
                  </div>
                </ScrollArea>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface-1 via-surface-1/60 to-transparent" />
              </div>
            </CardContent>
          </Card>
        </FadeRise>
        </div>
      )}

        </div>
        )}

        <aside className={cn('space-y-5', !viewerMode && 'xl:sticky xl:top-6 xl:self-start')}>

      {/* ── People ── */}
      {!viewerMode && (
      <FadeRise delay={d(TIMING.people)}>
        <Card className={cn(PAYMENT_RAIL_SURFACE, 'overflow-hidden')}>
          <CardHeader className={PAYMENT_SECTION_HEAD}>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-[15px] font-semibold text-ink-title">People</CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-ink-muted">Team payment status.</CardDescription>
                </div>
                <span className="rounded-md bg-[#f5f5f5] dark:bg-wash-4 px-2 py-1 text-[11px] text-ink-muted tabular-nums">{peopleWithPending.length}</span>
              </div>
              {/* Filter pills — only show when team is large enough to warrant filtering */}
              {peopleWithPending.length >= 5 && (
                <div className="flex flex-wrap gap-1">
                  {filterOptions.map(opt => {
                    const active = filter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFilter(opt.value)}
                        className={cn(
                          'relative rounded-full px-2.5 py-1 text-xs font-medium transition-[color,transform] duration-150 active:scale-[0.97]',
                          active ? 'text-seeko-accent-ink' : 'text-ink-muted hover:text-ink-title'
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="paymentsFilterPill"
                            initial={false}
                            transition={pillTransition}
                            className="absolute inset-0 rounded-full bg-seeko-accent-ink/10"
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center">
                          {opt.label}
                          {opt.count > 0 && (
                            <span className={cn(
                              'ml-1 tabular-nums',
                              active ? 'text-seeko-accent-ink/70' : 'text-ink-faint'
                            )}>
                              {opt.count}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-5 py-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="size-5 rounded-full border-2 border-black/10 border-t-seeko-accent-ink animate-spin" />
                  <p className="text-xs text-ink-muted">Loading payments...</p>
                </div>
              </div>
            ) : filteredPeople.length === 0 ? (
              <LightEmpty icon={Users} title="No results" description="No team members match this filter." />
            ) : (
              <Stagger className="-mx-5 divide-y divide-wash-6" staggerMs={d(TIMING.peopleStagger)}>
                {filteredPeople.map(person => (
                  <StaggerItem key={person.id}>
                    <div className="flex items-center justify-between py-3 px-5 hover:bg-wash-3 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-9 outline outline-1 -outline-offset-1 outline-wash-6">
                          <AvatarImage src={person.avatar_url ?? undefined} alt={person.display_name ?? ''} />
                          <AvatarFallback seed={person.id} className="bg-surface-4 text-ink-body text-[10px]">
                            {getInitials(person.display_name ?? '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-title truncate">{person.display_name}</p>
                          <p className="text-[11px] text-ink-faint font-mono">{person.department ?? 'Unassigned'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {person.pendingAmount > 0 ? (
                          <>
                            <span className="text-sm font-semibold tabular-nums text-seeko-accent-ink">
                              {fmt(person.pendingAmount)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePay(person)}
                              className="text-seeko-accent-ink hover:bg-seeko-accent-ink/10 h-7 px-2.5 text-xs"
                            >
                              Pay
                            </Button>
                          </>
                        ) : person.hasPaid ? (
                          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                            <CheckCircle2 className="size-3.5 text-seeko-accent-ink" />
                            Paid
                          </span>
                        ) : (
                          <span className="text-xs text-[#c8c8c8] dark:text-ink-faint">No payments</span>
                        )}
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </CardContent>
        </Card>
      </FadeRise>
      )}

      {/* ── Recent Payments ── */}
      <FadeRise delay={d(TIMING.recent)}>
        <Card className={cn(PAYMENT_RAIL_SURFACE, 'overflow-hidden')}>
          <CardHeader className={PAYMENT_SECTION_HEAD}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-[15px] font-semibold text-ink-title">Recent payments</CardTitle>
                <CardDescription className="mt-0.5 text-xs text-ink-muted">Completed payouts and refunds.</CardDescription>
              </div>
              <span className="rounded-md bg-[#f5f5f5] dark:bg-wash-4 px-2 py-1 text-[11px] text-ink-muted tabular-nums">{recentPaid.length}</span>
            </div>
          </CardHeader>
          <CardContent className="px-5 py-0">
            {recentPaid.length === 0 ? (
              <LightEmptyRow icon={CreditCard} text="No completed payments yet." />
            ) : (
              /* Cap on the VIEWPORT (auto-height root): hugs the rows when short —
                 no dead gap below the last payout — and caps + scrolls once long.
                 A bottom fade softens the clipped edge once the list runs long. */
              <div className="relative -mx-5">
                <ScrollArea viewportClassName="max-h-[clamp(340px,calc(100vh-500px),650px)] pb-2">
                  <div className="divide-y divide-wash-6">
                    {recentPaidRows}
                  </div>
                </ScrollArea>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface-1 via-surface-1/60 to-transparent" />
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

        </aside>
      </div>

      {/* Invoice requests are sent from inside this dialog too (Invoice mode),
          so closing it always refetches — the invoice queue may have changed
          even when no payment was recorded. */}
      <PaymentCreateDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) fetchData();
        }}
        team={team}
        recipient={selectedRecipient}
        token={null}
        onCreated={handlePaymentCreated}
      />
    </div>
    </main>
    </LightShell>
  );
}

/* ── Paid Payment Row (expandable) ── */
export function PaidPaymentRow({
  payment,
  externalPaypalEmail,
  onAction,
  readOnly = false,
}: {
  payment: Payment;
  externalPaypalEmail: string | null;
  onAction: () => void;
  // Investor viewers get a read-only row: no refund menu, and recipient
  // payout emails stay hidden — that PayPal address is team-member PII.
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundMenu, setRefundMenu] = useState<{ x: number; y: number } | null>(null);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const paypalEmail = payment.recipient?.paypal_email ?? externalPaypalEmail;
  const showPaypalEmail = Boolean(paypalEmail) && !readOnly;
  const firstItemLabel = payment.items?.[0]?.label?.trim();
  const hasTeamRecipient = Boolean(payment.recipient_id && payment.recipient?.display_name);
  const isManualExternal = !hasTeamRecipient && Boolean(payment.payee_name);
  const compactTitle = hasTeamRecipient
    ? payment.recipient!.display_name!
    : payment.payee_name ?? externalRecipientLabel(payment.recipient_email ?? paypalEmail);
  const compactContext = firstItemLabel ?? (
    payment.description && payment.description.toLowerCase() !== 'external invoice'
      ? payment.description
      : null
  );
  const fallbackInitials = hasTeamRecipient && payment.recipient?.display_name
    ? getInitials(payment.recipient.display_name)
    : (compactTitle ?? '?').slice(0, 2).toUpperCase();
  const amount = Number(payment.amount);
  const refundAmount = Math.min(Number(payment.refund_amount ?? 0), amount);
  const hasRefund = refundAmount > 0;
  const fullyRefunded = refundAmount >= amount;
  const netAmount = Math.max(amount - refundAmount, 0);

  // Newest first. The payment's own `amount` is the current one; every
  // `previous_amount` here is a superseded reading — rendered, never summed.
  const adjustments = [...(payment.adjustments ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const isAdjusted = adjustments.length > 0;
  const latestAdjustmentNote = adjustments[0]?.note?.trim() || null;

  async function updateRefund(refund_amount: number, refund_note?: string | null): Promise<boolean> {
    setRefundLoading(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refund_amount, refund_note }),
      });
      if (res.ok) {
        toast.success(refund_amount > 0 ? 'Refund status updated' : 'Refund cleared');
        onAction();
        return true;
      }
      const data = await res.json();
      toast.error(data.error ?? 'Failed to update refund');
      return false;
    } catch {
      toast.error('Network error');
      return false;
    } finally {
      setRefundLoading(false);
    }
  }

  async function updateAmount(amount: number, adjustment_note: string | null): Promise<boolean> {
    setAdjustLoading(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, adjustment_note }),
      });
      if (res.ok) {
        toast.success('Amount adjusted');
        onAction();
        return true;
      }
      const data = await res.json();
      toast.error(data.error ?? 'Failed to adjust amount');
      return false;
    } catch {
      toast.error('Network error');
      return false;
    } finally {
      setAdjustLoading(false);
    }
  }

  useEffect(() => {
    if (!refundMenu) return;
    function close() {
      setRefundMenu(null);
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [refundMenu]);

  return (
    <div
      onContextMenu={readOnly ? undefined : (e) => {
        e.preventDefault();
        e.stopPropagation();
        setRefundMenu({
          x: Math.min(e.clientX, window.innerWidth - 220),
          y: Math.min(e.clientY, window.innerHeight - 176),
        });
      }}
    >
      <span
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => { if (e.key === 'Enter') setExpanded(!expanded); }}
        // Resting and hover colours move together — a bare hover:bg-wash-3 would
        // wash the accent tint straight back out on hover.
        className={cn(
          'flex items-center justify-between py-3 px-5 w-full text-left transition-colors cursor-pointer',
          isAdjusted ? 'bg-seeko-accent/[0.05] hover:bg-seeko-accent/[0.09]' : 'hover:bg-wash-3'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {hasTeamRecipient ? (
            <Avatar className="size-8 outline outline-1 -outline-offset-1 outline-wash-6">
              <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
              <AvatarFallback seed={payment.recipient_id ?? payment.recipient_email ?? payment.payee_name ?? payment.id} className="bg-surface-4 text-ink-body text-[10px]">
                {fallbackInitials}
              </AvatarFallback>
            </Avatar>
          ) : isManualExternal ? (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-4 text-[10px] font-medium text-ink-body outline outline-1 -outline-offset-1 outline-wash-6">
              {getInitials(payment.payee_name!)}
            </div>
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-4 outline outline-1 -outline-offset-1 outline-wash-6">
              <FileText className="size-3.5 text-ink-muted" />
            </div>
          )}
          <div className="min-w-0">
            {/* ADJ rides with the name, not with the amount: parked in the right
                cluster it displaced the amount and broke the column every other
                row shares. */}
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-medium text-ink-title truncate">{compactTitle}</p>
              {isAdjusted && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-seeko-accent/25 bg-seeko-accent/10 text-[10px] font-medium text-seeko-accent-ink"
                >
                  ADJ
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-ink-muted truncate">
              {compactContext ?? `${payment.items?.length ?? 0} item${(payment.items?.length ?? 0) !== 1 ? 's' : ''}`}
              <span className="ml-1.5 text-ink-faint">
                · {hasTeamRecipient ? 'Payment' : isManualExternal ? 'External' : 'External invoice'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className={cn(
              'block text-sm font-medium tabular-nums',
              hasRefund ? 'text-ink-muted line-through' : 'text-ink-title'
            )}>
              {fmt(amount)}
            </span>
            {hasRefund && (
              <span className="block text-[11px] font-medium text-ink-title tabular-nums">
                {fullyRefunded ? 'Refunded' : `${fmt(netAmount)} net`}
              </span>
            )}
          </div>
          {hasRefund && (
            <Badge variant="outline" className={cn(
              'border-dept-wash-animation/30 bg-dept-wash-animation/10 text-[10px] text-dept-ink-animation',
              fullyRefunded && 'border-danger/25 bg-danger/10 text-danger-strong'
            )}>
              {fullyRefunded ? 'Refunded' : 'Partial refund'}
            </Badge>
          )}
          {/* Fixed-width, right-aligned: a fluid date column is why the amounts
              never lined up — "Jul 4" is narrower than "Jul 12", so every row
              pushed its amount to a different x. */}
          <span className="w-12 shrink-0 text-right text-[11px] text-ink-faint tabular-nums">
            {new Date(payment.paid_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="size-4 text-ink-faintest" />
          </motion.div>
        </div>
      </span>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* One ghost per superseded amount. History, not a payout: it lives
                inside the drawer, so a collapsed list shows one row per payment
                and no struck-through numbers. The ADJ badge is what advertises
                that there is history to open. Render-only — no chevron, no menu,
                and no place in any array that gets summed. The date is the
                adjustment's, i.e. when this amount stopped being true; paid_at
                never moves and would print the same day on every row. */}
            {isAdjusted && (
              <div className="border-t border-wash-6 bg-surface-2">
                {adjustments.map(adj => (
                  <div
                    key={adj.id}
                    data-testid="adjustment-ghost"
                    className="flex items-center justify-between gap-3 py-2.5 pl-16 pr-5"
                  >
                    <p className="truncate text-[11px] text-ink-faintest">Superseded</p>
                    <div className="flex shrink-0 items-center gap-3">
                      {/* Same size and weight as the live amount so the digits
                          land in the same column, only dimmed and struck. */}
                      <span className="text-sm font-medium tabular-nums text-ink-faint line-through">
                        {fmt(Number(adj.previous_amount))}
                      </span>
                      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-ink-faintest">
                        {new Date(adj.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {/* Stands in for the live row's chevron — without it the
                          ghost's columns drift 28px right of every row above. */}
                      <span aria-hidden className="size-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Detail reads as a drawer inside the row's frame — a full-width
                band, not a floating box. Nesting a rounded slab under the
                square, full-bleed row put two shapes in one card. */}
            {(hasRefund || showPaypalEmail || latestAdjustmentNote || (payment.items && payment.items.length > 0)) && (
              <div className="border-t border-wash-6 bg-surface-3 text-xs">
                {latestAdjustmentNote && (
                  <div className="bg-seeko-accent/[0.06] px-5 py-2.5 text-seeko-accent-ink">
                    <div className="flex items-center justify-between gap-3">
                      <span>Amount adjusted</span>
                      {/* An arrowhead, not "→": the glyph inherits the 12px text
                          size and renders as a hairline at that scale, so it's a
                          drawn icon sized on its own terms. */}
                      <span className="flex items-center gap-1.5 font-medium tabular-nums">
                        {fmt(Number(adjustments[0].previous_amount))}
                        <span className="sr-only">to</span>
                        <ChevronRight aria-hidden strokeWidth={2.25} className="size-4 shrink-0 text-seeko-accent-ink/70" />
                        {fmt(amount)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-seeko-accent-ink/75">{latestAdjustmentNote}</p>
                  </div>
                )}
                {hasRefund && (
                  <div className="bg-[#fff7eb] dark:bg-dept-wash-animation/[0.08] px-5 py-2.5 text-dept-ink-animation">
                    <div className="flex items-center justify-between gap-3">
                      <span>{fullyRefunded ? 'Fully refunded' : 'Partially refunded'}</span>
                      <span className="font-medium tabular-nums">{fmt(refundAmount)} of {fmt(amount)}</span>
                    </div>
                    {payment.refund_note && (
                      <p className="mt-1 text-[11px] text-dept-ink-animation/75">{payment.refund_note}</p>
                    )}
                  </div>
                )}
                {payment.items && payment.items.length > 0 && (
                  <div className="space-y-2 px-5 py-2.5">
                    {payment.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-ink-muted">{item.label}</span>
                        <span className="font-medium tabular-nums text-ink-title">{fmt(Number(item.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showPaypalEmail && (
                  <div className={cn('px-5 py-2.5', payment.items && payment.items.length > 0 && 'border-t border-wash-4')}>
                    <InputCopy
                      value={paypalEmail}
                      variant="icon"
                      showTooltip={false}
                      monospace={false}
                      className="min-w-0 max-w-full flex-1"
                      onClick={(e) => e.stopPropagation()}
                      onCopy={() => toast.success('PayPal email copied')}
                    />
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {refundMenu && !readOnly && (
          <>
            <motion.div
              key="refund-menu-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="fixed inset-0 z-40 bg-scrim"
              onMouseDown={() => setRefundMenu(null)}
            />
            <motion.div
              key="refund-menu"
              initial={{ opacity: 0, scale: 0.97, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -2 }}
              transition={{ type: 'spring', duration: 0.18, bounce: 0 }}
              // Frame padding 6px, item radius 8px — concentric with the 14px
              // outer corner (14 − 6 = 8), so the items nest instead of fighting it.
              className="fixed z-50 w-[228px] rounded-[14px] bg-overlay p-1.5 shadow-seeko-pop"
              style={{ left: refundMenu.x, top: refundMenu.y, transformOrigin: 'top left' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 pb-2 pt-2.5">
                <p className="text-xs font-medium text-ink-body tabular-nums">{fmt(amount)}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {hasRefund
                    ? `${fmt(refundAmount)} refunded`
                    : isAdjusted
                      ? `Adjusted ${adjustments.length}×`
                      : 'No refund recorded'}
                </p>
              </div>
              {/* The corrective action leads; the destructive ones follow. */}
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-seeko-accent-ink transition-[background-color,transform] hover:bg-seeko-accent/10 active:scale-[0.98] disabled:opacity-50"
                onClick={() => { setRefundMenu(null); setAdjustOpen(true); }}
                disabled={adjustLoading || hasRefund}
                title={hasRefund ? 'Remove the refund before adjusting' : undefined}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[9px] bg-seeko-accent/10">
                  <Pencil className="size-3.5" />
                </span>
                Adjust amount
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[#7a5a00] dark:text-dept-ink-animation transition-[background-color,transform] hover:bg-dept-wash-animation/10 active:scale-[0.98] disabled:opacity-50"
                onClick={() => { setRefundMenu(null); setRefundOpen(true); }}
                disabled={refundLoading}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[9px] bg-dept-wash-animation/10">
                  <RotateCw className="size-3.5" />
                </span>
                {hasRefund ? 'Edit partial refund' : 'Record partial refund'}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[#c43f30] dark:text-danger transition-[background-color,transform] hover:bg-danger/10 active:scale-[0.98] disabled:opacity-50"
                onClick={() => { setRefundMenu(null); updateRefund(amount, payment.refund_note ?? 'Full refund'); }}
                disabled={refundLoading || fullyRefunded}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[9px] bg-danger/10">
                  <Ban className="size-3.5" />
                </span>
                Mark fully refunded
              </button>
              {hasRefund && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[#707070] dark:text-ink-muted transition-[background-color,transform] hover:bg-wash-4 hover:text-ink-title active:scale-[0.98] disabled:opacity-50"
                  onClick={() => { setRefundMenu(null); updateRefund(0, null); }}
                  disabled={refundLoading}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-[9px] bg-wash-4">
                    <XIcon className="size-3.5" />
                  </span>
                  Clear refund status
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        max={amount}
        initialAmount={hasRefund ? refundAmount : null}
        initialNote={payment.refund_note ?? ''}
        loading={refundLoading}
        onSubmit={updateRefund}
      />
      <AdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        current={amount}
        loading={adjustLoading}
        onSubmit={updateAmount}
      />
    </div>
  );
}

/* ── Refund Dialog (replaces the old window.prompt flow) ── */
function RefundDialog({ open, onOpenChange, max, initialAmount, initialNote, loading, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  max: number;
  initialAmount: number | null;
  initialNote: string;
  loading: boolean;
  onSubmit: (amount: number, note: string | null) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-seed the fields each time the dialog opens (values can change between opens)
  useEffect(() => {
    if (open) {
      setAmount(initialAmount !== null ? String(initialAmount) : '');
      setNote(initialNote);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed) || parsed < 0 || parsed > max) {
      setError(`Enter an amount between $0.00 and ${fmt(max)}.`);
      return;
    }
    const ok = await onSubmit(parsed, note.trim() || null);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-sm" light>
      <DialogHeader>
        <DialogTitle>Refund payment</DialogTitle>
        <p className="text-[13px] text-ink-muted">Refund part or all of {fmt(max)}.</p>
      </DialogHeader>
      <DialogClose onClose={() => onOpenChange(false)} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-body">Amount</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>
            <input
              type="number"
              min={0}
              max={max}
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              autoFocus
              className={`flex h-9 w-full pl-7 pr-3 text-sm tabular-nums focus-visible:outline-none ${LIGHT_INPUT} ${error ? 'border-danger focus-visible:ring-danger/30' : ''}`}
            />
          </div>
          {error && <span className="text-[11px] text-danger">{error}</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-body">
            Note <span className="font-normal text-ink-faint">(optional)</span>
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for the refund"
            className={`flex h-9 w-full px-3 text-sm focus-visible:outline-none ${LIGHT_INPUT}`}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className={DIALOG_CANCEL} onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" className={cn('gap-1.5', DIALOG_SAVE)} disabled={loading}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            Refund
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ── Adjust Dialog (correct a recorded amount; the old one stays on the ledger) ──
   Mirrors RefundDialog's shape deliberately: the two sit in the same menu, and
   siblings that behave differently read as two different products. */
function AdjustDialog({ open, onOpenChange, current, loading, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: number;
  loading: boolean;
  onSubmit: (amount: number, note: string | null) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time it opens — `current` moves as adjustments land.
  useEffect(() => {
    if (open) {
      setAmount(String(current));
      setNote('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0 || parsed > 50_000) {
      setError('Enter an amount between $0.01 and $50,000.00.');
      return;
    }
    if (parsed === current) {
      setError('Enter a different amount — this is the current one.');
      return;
    }
    const ok = await onSubmit(parsed, note.trim() || null);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-sm" light>
      <DialogHeader>
        <DialogTitle>Adjust amount</DialogTitle>
        <p className="text-[13px] text-ink-muted">
          {fmt(current)} stays on the ledger as a superseded entry. Totals count only the new amount.
        </p>
      </DialogHeader>
      <DialogClose onClose={() => onOpenChange(false)} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-body">New amount</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              autoFocus
              className={`flex h-9 w-full pl-7 pr-3 text-sm tabular-nums focus-visible:outline-none ${LIGHT_INPUT} ${error ? 'border-danger focus-visible:ring-danger/30' : ''}`}
            />
          </div>
          {error && <span className="text-[11px] text-danger">{error}</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-body">
            Reason <span className="font-normal text-ink-faint">(optional)</span>
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why the amount changed"
            className={`flex h-9 w-full px-3 text-sm focus-visible:outline-none ${LIGHT_INPUT}`}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className={DIALOG_CANCEL} onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" className={cn('gap-1.5', DIALOG_SAVE)} disabled={loading}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            Save adjustment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ── Pending Request Row (expandable with Accept/Deny) ── */
function PendingRequestRow({ payment, onAction }: { payment: Payment; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);

  async function handleAction(status: 'paid' | 'cancelled') {
    setActing(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(status === 'paid' ? 'Payment accepted' : 'Payment denied');
        onAction();
      } else {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to update payment');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => { if (e.key === 'Enter') setExpanded(!expanded); }}
        className="flex items-center justify-between py-3 px-5 w-full text-left hover:bg-wash-3 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="size-8 outline outline-1 -outline-offset-1 outline-dept-wash-animation/25">
            <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
            <AvatarFallback seed={payment.recipient_id ?? payment.recipient_email ?? payment.payee_name ?? payment.id} className="bg-dept-wash-animation/10 text-dept-ink-animation text-[10px]">
              {(payment.recipient?.display_name ?? payment.payee_name ?? payment.recipient_email ?? '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-title truncate">
              {payment.recipient?.display_name ?? payment.payee_name ?? payment.recipient_email ?? 'External'}
            </p>
            {payment.recipient?.paypal_email ? (
              <InputCopy
                value={payment.recipient.paypal_email}
                variant="icon"
                showTooltip={false}
                className="max-w-[240px]"
                onClick={(e) => e.stopPropagation()}
                onCopy={() => toast.success('PayPal email copied')}
              />
            ) : payment.recipient_email ? (
              <span className="text-[11px] text-ink-faint font-mono truncate block">
                {payment.recipient_email}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-dept-ink-animation tabular-nums">{fmt(Number(payment.amount))}</span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="size-4 text-ink-faintest" />
          </motion.div>
        </div>
      </span>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-wash-6 bg-surface-3 px-5 py-3">
              {payment.description && (
                <p className="text-xs text-ink-muted">{payment.description}</p>
              )}
              {payment.items && payment.items.length > 0 && (
                <div className="space-y-2">
                  {payment.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{item.label}</span>
                      <span className="text-ink-title font-medium tabular-nums">{fmt(Number(item.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="gap-1.5 bg-ink-title hover:bg-ink-strong text-surface-1 h-8"
                  onClick={(e) => { e.stopPropagation(); handleAction('paid'); }}
                  disabled={acting}
                >
                  <Check className="size-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-danger hover:text-danger-strong hover:bg-danger/10 h-8"
                  onClick={(e) => { e.stopPropagation(); handleAction('cancelled'); }}
                  disabled={acting}
                >
                  <XIcon className="size-3.5" />
                  Deny
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Invoice Request Row ── */
const INVOICE_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  verified: 'Verified',
  signed: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  revoked: 'Revoked',
};

function InvoiceRequestRow({ invite, index, onAction }: { invite: InvoiceRequest; index: number; onAction: () => void }) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleAction(action: 'revoke' | 'resend') {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/invoice-request/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: invite.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success(action === 'revoke' ? 'Invoice request revoked' : 'Invoice request resent');
      onAction();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  const canAct = invite.status === 'pending' || invite.status === 'verified';
  const isExpired = new Date(invite.expires_at) < new Date() && invite.status !== 'signed' && invite.status !== 'revoked';

  // Resolve display status: if submitted, show the linked payment's outcome
  let displayStatus: string;
  if (isExpired) {
    displayStatus = 'expired';
  } else if (invite.status === 'signed' && invite.payment_status === 'paid') {
    displayStatus = 'approved';
  } else if (invite.status === 'signed' && invite.payment_status === 'cancelled') {
    displayStatus = 'rejected';
  } else {
    displayStatus = invite.status;
  }
  const prefilledTotal = invite.prefilled_items?.reduce((sum, i) => sum + i.amount, 0) ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.1, delay: Math.min(index, 8) * 0.04 }}
      className="grid min-w-0 gap-3 px-5 py-3.5 transition-colors hover:bg-wash-3 sm:grid-cols-[minmax(0,1fr)_92px_116px_112px] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-4 outline outline-1 -outline-offset-1 outline-wash-6">
          <FileText className="size-3.5 text-ink-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-title font-mono truncate">{invite.recipient_email}</p>
          <div className="flex items-center gap-2 text-[11px] text-ink-muted sm:hidden">
            <span>{new Date(invite.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {prefilledTotal > 0 && (
              <>
                <span className="text-[#c8c8c8] dark:text-ink-ghost">·</span>
                <span className="tabular-nums">{fmt(prefilledTotal)}</span>
              </>
            )}
          </div>
          {/* Only worth a line when it differs from the recipient email above */}
          {invite.paypal_email && invite.paypal_email.trim().toLowerCase() !== invite.recipient_email.trim().toLowerCase() && (
            <div className="mt-1 max-w-full sm:max-w-[300px]">
              <InputCopy
                value={invite.paypal_email}
                variant="icon"
                showTooltip={false}
                compact
                className="min-w-0 max-w-full"
                onClick={(e) => e.stopPropagation()}
                onCopy={() => toast.success('PayPal email copied')}
              />
            </div>
          )}
        </div>
      </div>
      <span className="hidden text-left text-xs text-ink-muted tabular-nums sm:block">
        {new Date(invite.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
      <span className="hidden text-right text-sm font-medium text-ink-title tabular-nums sm:block">
        {prefilledTotal > 0 ? fmt(prefilledTotal) : '—'}
      </span>
      <div className="flex items-center justify-between gap-2.5 sm:justify-end">
        <Badge variant="outline" className={cn('min-w-[72px] justify-center text-[10px] capitalize', LIGHT_INVOICE_STATUS[displayStatus])}>
          {INVOICE_STATUS_LABEL[displayStatus] ?? displayStatus}
        </Badge>
        {canAct && !isExpired && (
          <div className="flex gap-0.5">
            <button
              onClick={() => handleAction('resend')}
              disabled={!!actionLoading}
              title="Resend"
              className="rounded p-1.5 hover:bg-wash-4 transition-colors group"
            >
              {actionLoading === 'resend' ? (
                <Loader2 className="size-3.5 animate-spin text-ink-muted" />
              ) : (
                <RotateCw className="size-3.5 text-ink-muted group-hover:text-ink-title transition-colors" />
              )}
            </button>
            <button
              onClick={() => handleAction('revoke')}
              disabled={!!actionLoading}
              title="Revoke"
              className="rounded p-1.5 hover:bg-danger/10 transition-colors group"
            >
              {actionLoading === 'revoke' ? (
                <Loader2 className="size-3.5 animate-spin text-ink-muted" />
              ) : (
                <Ban className="size-3.5 text-ink-muted group-hover:text-danger transition-colors" />
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
