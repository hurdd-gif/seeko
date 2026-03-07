'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Payments page entrance
 *
 *    0ms   hero fades in (title + subtitle)
 *  100ms   stat cards stagger in (80ms between)
 *  300ms   people card fades in
 *          people rows stagger (50ms between, slide from left)
 *  500ms   recent payments card fades in
 * ───────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react';
import {
  Users, CheckCircle2, Clock,
  CreditCard, Plus, ChevronDown, ChevronUp, Check, X as XIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { PaymentsPasswordGate } from '@/components/dashboard/PaymentsPasswordGate';
import { PaymentCreateDialog } from '@/components/dashboard/PaymentCreateDialog';
import type { Profile, Payment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TIMING = {
  hero: 0,
  stats: 100,
  statsStagger: 80,
  people: 300,
  peopleStagger: 50,
  recent: 500,
};

const delay = (ms: number) => ms / 1000;

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

type TeamMember = Profile & { paypal_email?: string };

interface PaymentsAdminProps {
  team: TeamMember[];
}

export function PaymentsAdmin({ team }: PaymentsAdminProps) {
  const [token, setToken] = useState<string | null>(null);
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

  useEffect(() => {
    const stored = sessionStorage.getItem('payments-token');
    if (stored) setToken(stored);
  }, []);

  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const headers = { 'x-payments-token': t };
      const [paymentsRes, statsRes] = await Promise.all([
        fetch('/api/payments', { headers }),
        fetch('/api/payments/stats', { headers }),
      ]);

      if (paymentsRes.status === 401 || statsRes.status === 401) {
        sessionStorage.removeItem('payments-token');
        setToken(null);
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
    if (token) fetchData(token);
  }, [token, fetchData]);

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <FadeRise delay={0}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">Track and manage team payments.</p>
        </FadeRise>
        <PaymentsPasswordGate onAuthenticated={setToken} />
      </div>
    );
  }

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
    if (token) fetchData(token);
  };

  const statCards = [
    { label: 'Pending', value: stats?.pendingTotal ?? 0, icon: Clock, primary: true, format: true },
    { label: 'Paid This Month', value: stats?.paidThisMonth ?? 0, icon: CheckCircle2, primary: false, format: true },
    { label: 'People Owed', value: stats?.peopleOwed ?? 0, icon: Users, primary: false, format: false },
    { label: 'Payments This Month', value: stats?.paymentsThisMonth ?? 0, icon: CreditCard, primary: false, format: false },
  ];

  const filterOptions = [
    { label: 'All', value: 'all' as const },
    { label: 'Owed', value: 'owed' as const },
    { label: 'Paid', value: 'paid' as const },
  ];

  return (
    <div className="flex flex-col gap-6">
      <FadeRise delay={delay(TIMING.hero)}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground">Track and manage team payments.</p>
      </FadeRise>

      <Stagger
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        delayMs={delay(TIMING.stats)}
        staggerMs={delay(TIMING.statsStagger)}
      >
        {statCards.map(stat => (
          <StaggerItem key={stat.label}>
            <HoverCard>
              <Card className={cn(
                stat.primary && 'border-seeko-accent/20 bg-seeko-accent/[0.04]'
              )}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                  <div className={cn(
                    'flex size-8 items-center justify-center rounded-lg',
                    stat.primary ? 'bg-seeko-accent/10' : 'bg-secondary'
                  )}>
                    <stat.icon className={cn('size-4', stat.primary ? 'text-seeko-accent' : 'text-muted-foreground')} />
                  </div>
                </CardHeader>
                <CardContent>
                  <span className={cn(
                    'font-semibold tracking-tight',
                    stat.primary ? 'text-3xl' : 'text-2xl'
                  )} style={stat.primary ? { color: 'var(--color-seeko-accent)' } : undefined}>
                    {stat.format ? formatCurrency(stat.value) : stat.value}
                  </span>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>
        ))}
      </Stagger>

      <FadeRise delay={delay(TIMING.people)}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-foreground">People</CardTitle>
                <CardDescription>Team members and their payment status.</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedRecipient(null); setCreateDialogOpen(true); }}
                className="text-seeko-accent"
              >
                <Plus className="size-4 mr-1" />
                New Payment
              </Button>
            </div>
            <div className="flex gap-2 pt-2">
              {filterOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    filter === opt.value
                      ? 'bg-seeko-accent/10 text-seeko-accent'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : filteredPeople.length === 0 ? (
              <EmptyState
                icon="Users"
                title="No results"
                description="No team members match this filter."
              />
            ) : (
              <Stagger className="flex flex-col" staggerMs={delay(TIMING.peopleStagger)}>
                {filteredPeople.map(person => (
                  <StaggerItem key={person.id}>
                    <div className="flex items-center justify-between rounded-lg px-3 py-3 hover:bg-white/[0.04] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-9">
                          <AvatarImage src={person.avatar_url ?? undefined} alt={person.display_name ?? ''} />
                          <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                            {getInitials(person.display_name ?? '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{person.display_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{person.department ?? 'Unassigned'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {person.pendingAmount > 0 ? (
                          <>
                            <span className="text-sm font-medium" style={{ color: 'var(--color-seeko-accent)' }}>
                              {formatCurrency(person.pendingAmount)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePay(person)}
                              className="text-seeko-accent"
                            >
                              Pay
                            </Button>
                          </>
                        ) : person.hasPaid ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CheckCircle2 className="size-3.5" />
                            Paid
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">&mdash;</span>
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

      {/* Pending Requests */}
      {(() => {
        const pendingRequests = payments.filter(p => p.status === 'pending' && p.created_by === p.recipient_id);
        if (pendingRequests.length === 0) return null;
        return (
          <FadeRise delay={delay(TIMING.recent - 100)}>
            <Card className="border-amber-500/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10">
                    {pendingRequests.length}
                  </Badge>
                  <CardTitle className="text-xl font-semibold text-foreground">Payment Requests</CardTitle>
                </div>
                <CardDescription>Team members requesting payment approval.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-0">
                  {pendingRequests.map(payment => (
                    <PendingRequestRow
                      key={payment.id}
                      payment={payment}
                      token={token!}
                      onAction={() => fetchData(token!)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </FadeRise>
        );
      })()}

      <FadeRise delay={delay(TIMING.recent)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Recent Payments</CardTitle>
            <CardDescription>Completed payments.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPaid.length === 0 ? (
              <EmptyState
                icon="CreditCard"
                title="No completed payments"
                description="Payments will appear here once marked as paid."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {recentPaid.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8">
                        <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                          {getInitials(payment.recipient?.display_name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{payment.recipient?.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.items?.length ?? 0} item{(payment.items?.length ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium text-foreground">{formatCurrency(Number(payment.amount))}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(payment.paid_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
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
        token={token}
        onCreated={handlePaymentCreated}
      />
    </div>
  );
}

function PendingRequestRow({ payment, token, onAction }: { payment: Payment; token: string; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);

  function formatCurrencyLocal(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  async function handleAction(status: 'paid' | 'cancelled') {
    setActing(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-payments-token': token },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(status === 'paid' ? 'Payment approved' : 'Payment denied');
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
    <div className="border-b border-border last:border-0">
      <span
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => { if (e.key === 'Enter') setExpanded(!expanded); }}
        className="flex items-center justify-between py-3 px-1 w-full text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="size-8">
            <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary text-foreground text-[10px]">
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
                className="text-xs text-muted-foreground/60 font-mono truncate hover:text-muted-foreground transition-colors cursor-copy block"
                title="Click to copy"
              >
                {payment.recipient.paypal_email}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-amber-400">{formatCurrencyLocal(Number(payment.amount))}</span>
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </span>
      {expanded && (
        <div className="pb-3 px-1 space-y-3">
          {payment.description && (
            <p className="text-xs text-muted-foreground">{payment.description}</p>
          )}
          {payment.items && payment.items.length > 0 && (
            <div className="space-y-1">
              {payment.items.map(item => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{formatCurrencyLocal(Number(item.amount))}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleAction('paid')}
              disabled={acting}
            >
              <Check className="size-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-destructive hover:bg-destructive/10"
              onClick={() => handleAction('cancelled')}
              disabled={acting}
            >
              <XIcon className="size-3.5" />
              Deny
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
