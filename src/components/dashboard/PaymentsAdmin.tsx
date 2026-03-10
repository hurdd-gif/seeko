'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Payments page entrance
 *
 *    0ms   hero fades in (title + subtitle + action)
 *  120ms   stat cards stagger in (60ms apart, scale up)
 *  350ms   pending requests card slides in (if any)
 *  450ms   people card fades in
 *          people rows stagger (40ms apart, slide from left)
 *  600ms   recent payments card fades in
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, CheckCircle2, Clock,
  CreditCard, Plus, ChevronDown, ChevronUp, Check, X as XIcon,
  TrendingUp, DollarSign,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { FadeRise, Stagger, StaggerItem, HoverCard, springs } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { PaymentsPasswordGate } from '@/components/dashboard/PaymentsPasswordGate';
import { PaymentCreateDialog } from '@/components/dashboard/PaymentCreateDialog';
import type { Profile, Payment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Timing config (ms → seconds for motion) ── */
const TIMING = {
  hero: 0,
  stats: 120,
  statsStagger: 60,
  pending: 350,
  people: 450,
  peopleStagger: 40,
  recent: 600,
};

const d = (ms: number) => ms / 1000;

/* ── Helpers ── */
function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

type TeamMember = Profile & { paypal_email?: string };

interface PaymentsAdminProps {
  team: TeamMember[];
}

export function PaymentsAdmin({ team }: PaymentsAdminProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<{
    pendingTotal: number;
    paidThisMonth: number;
    peopleOwed: number;
    paymentsThisMonth: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'owed' | 'paid'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<TeamMember | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Token is sent automatically via httpOnly cookie
      const [paymentsRes, statsRes] = await Promise.all([
        fetch('/api/payments'),
        fetch('/api/payments/stats'),
      ]);

      if (paymentsRes.status === 401 || statsRes.status === 401) {
        setAuthenticated(false);
        return;
      }

      const [paymentsData, statsData] = await Promise.all([
        paymentsRes.json(),
        statsRes.json(),
      ]);

      setPayments(paymentsData);
      setStats(statsData);
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, fetchData]);

  if (!authenticated) {
    return (
      <div className="flex flex-col gap-6">
        <FadeRise delay={0}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">Track and manage team payments.</p>
        </FadeRise>
        <PaymentsPasswordGate onAuthenticated={() => setAuthenticated(true)} />
      </div>
    );
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

  const pendingRequests = payments.filter(p => p.status === 'pending' && p.created_by === p.recipient_id);

  const recentPaid = payments
    .filter(p => p.status === 'paid')
    .slice(0, 10);

  const handlePay = (member: TeamMember) => {
    setSelectedRecipient(member);
    setCreateDialogOpen(true);
  };

  const handlePaymentCreated = () => {
    setCreateDialogOpen(false);
    setSelectedRecipient(null);
    fetchData();
  };

  const statCards = [
    {
      label: 'Pending',
      value: stats?.pendingTotal ?? 0,
      icon: Clock,
      accent: true,
      format: true,
      subtitle: `${stats?.peopleOwed ?? 0} people owed`,
    },
    {
      label: 'Paid This Month',
      value: stats?.paidThisMonth ?? 0,
      icon: TrendingUp,
      accent: false,
      format: true,
      subtitle: `${stats?.paymentsThisMonth ?? 0} payments`,
    },
    {
      label: 'People Owed',
      value: stats?.peopleOwed ?? 0,
      icon: Users,
      accent: false,
      format: false,
      subtitle: 'awaiting payment',
    },
    {
      label: 'This Month',
      value: stats?.paymentsThisMonth ?? 0,
      icon: CreditCard,
      accent: false,
      format: false,
      subtitle: 'transactions',
    },
  ];

  const filterOptions = [
    { label: 'All', value: 'all' as const, count: peopleWithPending.length },
    { label: 'Owed', value: 'owed' as const, count: peopleWithPending.filter(p => p.pendingAmount > 0).length },
    { label: 'Paid', value: 'paid' as const, count: peopleWithPending.filter(p => p.pendingAmount === 0 && p.hasPaid).length },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* ── Hero ── */}
      <FadeRise delay={d(TIMING.hero)}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
            <p className="text-sm text-muted-foreground mt-1">Track and manage team payments.</p>
          </div>
          <Button
            onClick={() => { setSelectedRecipient(null); setCreateDialogOpen(true); }}
            className="gap-1.5 bg-seeko-accent text-black hover:bg-seeko-accent/90"
          >
            <Plus className="size-4" />
            New Payment
          </Button>
        </div>
      </FadeRise>

      {/* ── Stat Cards ── */}
      <Stagger
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        delayMs={d(TIMING.stats)}
        staggerMs={d(TIMING.statsStagger)}
      >
        {statCards.map(stat => (
          <StaggerItem key={stat.label}>
            <HoverCard>
              <Card className={cn(
                'relative overflow-hidden',
                stat.accent && 'border-seeko-accent/30'
              )}>
                {stat.accent && (
                  <div className="absolute inset-0 bg-gradient-to-br from-seeko-accent/[0.06] to-transparent pointer-events-none" />
                )}
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </span>
                    <div className={cn(
                      'flex size-8 items-center justify-center rounded-lg',
                      stat.accent ? 'bg-seeko-accent/15' : 'bg-white/[0.04]'
                    )}>
                      <stat.icon className={cn('size-4', stat.accent ? 'text-seeko-accent' : 'text-muted-foreground')} />
                    </div>
                  </div>
                  <p className={cn(
                    'font-semibold tracking-tight',
                    stat.accent ? 'text-3xl' : 'text-2xl'
                  )} style={stat.accent ? { color: 'var(--color-seeko-accent)' } : undefined}>
                    {stat.format ? fmt(stat.value) : stat.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">{stat.subtitle}</p>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>
        ))}
      </Stagger>

      {/* ── Pending Requests ── */}
      <AnimatePresence>
        {pendingRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ ...springs.smooth, delay: d(TIMING.pending) }}
          >
            <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/[0.03] to-transparent">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15">
                      <DollarSign className="size-4.5 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">
                        Payment Requests
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Team members requesting payment approval.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 tabular-nums">
                    {pendingRequests.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-border">
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

      {/* ── People ── */}
      <FadeRise delay={d(TIMING.people)}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.04]">
                  <Users className="size-4.5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">People</CardTitle>
                  <CardDescription className="text-xs">Team members and their payment status.</CardDescription>
                </div>
              </div>
            </div>
            {/* Filter pills */}
            <div className="flex gap-1.5 pt-3">
              {filterOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
                    filter === opt.value
                      ? 'bg-seeko-accent/15 text-seeko-accent shadow-[inset_0_0_0_1px_rgba(110,231,183,0.2)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'
                  )}
                >
                  {opt.label}
                  {opt.count > 0 && (
                    <span className={cn(
                      'ml-1.5 tabular-nums',
                      filter === opt.value ? 'text-seeko-accent/70' : 'text-muted-foreground/50'
                    )}>
                      {opt.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="size-5 rounded-full border-2 border-muted-foreground/20 border-t-seeko-accent animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading payments...</p>
                </div>
              </div>
            ) : filteredPeople.length === 0 ? (
              <EmptyState
                icon="Users"
                title="No results"
                description="No team members match this filter."
              />
            ) : (
              <Stagger className="divide-y divide-border/50" staggerMs={d(TIMING.peopleStagger)}>
                {filteredPeople.map(person => (
                  <StaggerItem key={person.id}>
                    <div className="flex items-center justify-between py-3 px-1 hover:bg-white/[0.02] transition-colors rounded-md -mx-1">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-9 ring-1 ring-white/[0.06]">
                          <AvatarImage src={person.avatar_url ?? undefined} alt={person.display_name ?? ''} />
                          <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                            {getInitials(person.display_name ?? '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{person.display_name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{person.department ?? 'Unassigned'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {person.pendingAmount > 0 ? (
                          <>
                            <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--color-seeko-accent)' }}>
                              {fmt(person.pendingAmount)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePay(person)}
                              className="text-seeko-accent hover:bg-seeko-accent/10 h-7 px-2.5 text-xs"
                            >
                              Pay
                            </Button>
                          </>
                        ) : person.hasPaid ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="size-3.5 text-emerald-500/60" />
                            Paid
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">&mdash;</span>
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

      {/* ── Recent Payments ── */}
      <FadeRise delay={d(TIMING.recent)}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.04]">
                <CreditCard className="size-4.5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Recent Payments</CardTitle>
                <CardDescription className="text-xs">Completed payments.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {recentPaid.length === 0 ? (
              <EmptyState
                icon="CreditCard"
                title="No completed payments"
                description="Payments will appear here once marked as paid."
              />
            ) : (
              <div className="divide-y divide-border/50">
                {recentPaid.map(payment => (
                  <PaidPaymentRow key={payment.id} payment={payment} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      <PaymentCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        team={team}
        recipient={selectedRecipient}
        token={null}
        onCreated={handlePaymentCreated}
      />
    </div>
  );
}

/* ── Paid Payment Row (expandable) ── */
function PaidPaymentRow({ payment }: { payment: Payment }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => { if (e.key === 'Enter') setExpanded(!expanded); }}
        className="flex items-center justify-between py-3 px-1 w-full text-left hover:bg-white/[0.02] transition-colors cursor-pointer rounded-md -mx-1"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="size-8 ring-1 ring-white/[0.06]">
            <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary text-foreground text-[10px]">
              {getInitials(payment.recipient?.display_name ?? '?')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{payment.recipient?.display_name}</p>
            <p className="text-[11px] text-muted-foreground">
              {payment.items?.length ?? 0} item{(payment.items?.length ?? 0) !== 1 ? 's' : ''}
              {payment.description && <span className="ml-1.5 text-muted-foreground/50">· {payment.description}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-medium text-foreground tabular-nums">{fmt(Number(payment.amount))}</span>
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {new Date(payment.paid_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="size-4 text-muted-foreground/40" />
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
            <div className="pb-3 px-1 pt-1">
              {payment.items && payment.items.length > 0 && (
                <div className="rounded-lg bg-white/[0.02] p-3 space-y-2">
                  {payment.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="text-foreground font-medium tabular-nums">{fmt(Number(item.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
        className="flex items-center justify-between py-3 px-1 w-full text-left hover:bg-white/[0.02] transition-colors cursor-pointer rounded-md -mx-1"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="size-8 ring-1 ring-amber-500/20">
            <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-amber-500/10 text-amber-300 text-[10px]">
              {(payment.recipient?.display_name ?? '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{payment.recipient?.display_name}</p>
            {payment.recipient?.paypal_email && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(payment.recipient!.paypal_email!);
                  toast.success('PayPal email copied');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.stopPropagation(); navigator.clipboard.writeText(payment.recipient!.paypal_email!); toast.success('PayPal email copied'); }
                }}
                className="text-[11px] text-muted-foreground/50 font-mono truncate hover:text-muted-foreground transition-colors cursor-copy block"
                title="Click to copy"
              >
                {payment.recipient.paypal_email}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-amber-400 tabular-nums">{fmt(Number(payment.amount))}</span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="size-4 text-muted-foreground/40" />
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
            <div className="pb-3 px-1 pt-1 space-y-3">
              {payment.description && (
                <p className="text-xs text-muted-foreground">{payment.description}</p>
              )}
              {payment.items && payment.items.length > 0 && (
                <div className="rounded-lg bg-white/[0.02] p-3 space-y-2">
                  {payment.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="text-foreground font-medium tabular-nums">{fmt(Number(item.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                  onClick={(e) => { e.stopPropagation(); handleAction('paid'); }}
                  disabled={acting}
                >
                  <Check className="size-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8"
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
