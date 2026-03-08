'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Investor Payments
 *
 *    0ms   stat cards stagger in (80ms apart)
 *  150ms   monthly breakdown card fades up
 *  300ms   department + top recipients side-by-side fade up
 *  450ms   recent payments card fades up
 * ───────────────────────────────────────────────────────── */

import { useState } from 'react';
import { DollarSign, Users, Calendar, TrendingUp, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import type { Payment } from '@/lib/types';

/* ─── Helpers ────────────────────────────────────────────── */

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatCompact(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return formatCurrency(amount);
}

/* ─── Department color map ───────────────────────────────── */
const DEPT_COLORS: Record<string, string> = {
  'Coding':          '#6ee7b7',
  'Visual Art':      '#93c5fd',
  'UI/UX':           '#c4b5fd',
  'Animation':       '#fbbf24',
  'Asset Creation':  '#f9a8d4',
};

function deptColor(dept: string): string {
  return DEPT_COLORS[dept] ?? '#6ee7b7';
}

/* ─── Props ──────────────────────────────────────────────── */

interface PaymentsInvestorProps {
  payments: Payment[];
  stats: {
    thisMonth: number;
    allTime: number;
    peoplePaid: number;
  };
  lastMonthTotal?: number;
  monthCount?: number;
  delay?: number;
}

const INITIAL_VISIBLE = 10;

export function PaymentsInvestor({ payments, stats, lastMonthTotal, monthCount = 1, delay: baseDelay = 0 }: PaymentsInvestorProps) {
  const d = (ms: number) => (baseDelay + ms) / 1000;
  const [showAll, setShowAll] = useState(false);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);

  /* ── Monthly breakdown with bars ─────────────────────── */
  const monthlyBreakdown = payments.reduce<Record<string, { total: number; count: number }>>((acc, p) => {
    const date = new Date(p.paid_at!);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = { total: 0, count: 0 };
    acc[key].total += Number(p.amount);
    acc[key].count += 1;
    return acc;
  }, {});

  const months = Object.entries(monthlyBreakdown)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, data]) => ({
      key,
      label: new Date(key + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      ...data,
    }));

  const maxMonthTotal = Math.max(...months.map(m => m.total), 1);

  /* ── Department breakdown (proportional) ───────────────── */
  const deptTotals = payments.reduce<Record<string, number>>((acc, p) => {
    const dept = p.recipient?.department ?? 'Other';
    acc[dept] = (acc[dept] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  const deptEntries = Object.entries(deptTotals)
    .sort(([, a], [, b]) => b - a);
  const deptGrandTotal = deptEntries.reduce((sum, [, v]) => sum + v, 0) || 1;

  /* ── Per-person spend breakdown ────────────────────────── */
  const personTotals = payments.reduce<Record<string, { name: string; avatar_url?: string; total: number; count: number }>>((acc, p) => {
    const id = p.recipient_id ?? 'unknown';
    if (!acc[id]) acc[id] = { name: p.recipient?.display_name ?? 'Unknown', avatar_url: p.recipient?.avatar_url ?? undefined, total: 0, count: 0 };
    acc[id].total += Number(p.amount);
    acc[id].count += 1;
    return acc;
  }, {});

  const topRecipients = Object.entries(personTotals)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 5);

  /* ── Recent payments ─────────────────────────────────── */
  const visiblePayments = showAll ? payments : payments.slice(0, INITIAL_VISIBLE);
  const hasMore = payments.length > INITIAL_VISIBLE;

  /* ── Month-over-month delta (neutral treatment) ────────── */
  const monthDelta = lastMonthTotal != null && lastMonthTotal > 0
    ? Math.round(((stats.thisMonth - lastMonthTotal) / lastMonthTotal) * 100)
    : null;

  /* ── Average monthly spend ─────────────────────────────── */
  const avgMonthly = monthCount > 0 ? stats.allTime / monthCount : stats.allTime;

  const statCards = [
    {
      label: 'This Month',
      value: stats.thisMonth,
      icon: Calendar,
      format: true,
      delta: monthDelta,
    },
    { label: 'Avg / Month', value: avgMonthly, icon: TrendingUp, format: true },
    { label: 'People Paid', value: stats.peoplePaid, icon: Users, format: false },
  ];

  return (
    <>
      {/* ── Stat Cards ──────────────────────────────────── */}
      <FadeRise delay={d(0)}>
        <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-4" staggerMs={0.08}>
          {statCards.map(stat => (
            <StaggerItem key={stat.label}>
              <HoverCard>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardDescription className="text-sm font-medium">{stat.label}</CardDescription>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                      <stat.icon className="size-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">
                      {stat.format ? formatCurrency(stat.value) : stat.value}
                    </span>
                    {'delta' in stat && stat.delta != null && (
                      <p className="text-xs mt-0.5 font-medium text-muted-foreground flex items-center gap-1">
                        {stat.delta >= 0
                          ? <ArrowUp className="size-3" />
                          : <ArrowDown className="size-3" />
                        }
                        {Math.abs(stat.delta)}% vs last month
                      </p>
                    )}
                  </CardContent>
                </Card>
              </HoverCard>
            </StaggerItem>
          ))}
        </Stagger>
      </FadeRise>

      {/* ── Monthly Breakdown with spend bars ──────────── */}
      <FadeRise delay={d(150)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Monthly Breakdown</CardTitle>
            <CardDescription>Spend aggregated by month.</CardDescription>
          </CardHeader>
          <CardContent>
            {months.length === 0 ? (
              <EmptyState
                icon="DollarSign"
                title="No payments yet"
                description="Monthly spend will appear here."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {months.map(month => (
                  <div key={month.key} className="py-3 border-b border-border last:border-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-foreground">{month.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{formatCurrency(month.total)}</span>
                        <span className="text-xs text-muted-foreground w-20 text-right">
                          {month.count} payment{month.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(month.total / maxMonthTotal) * 100}%`,
                          backgroundColor: 'var(--color-seeko-accent)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      {/* ── Department Breakdown + Top Recipients ────────── */}
      <FadeRise delay={d(300)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Department — stacked proportional bar + legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">By Department</CardTitle>
              <CardDescription>Allocation across teams.</CardDescription>
            </CardHeader>
            <CardContent>
              {deptEntries.length === 0 ? (
                <EmptyState
                  icon="Users"
                  title="No data yet"
                  description="Department breakdown will appear here."
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Stacked bar */}
                  <div className="w-full h-4 rounded-full bg-secondary overflow-hidden flex">
                    {deptEntries.map(([dept, total]) => (
                      <div
                        key={dept}
                        className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500"
                        style={{
                          width: `${(total / deptGrandTotal) * 100}%`,
                          backgroundColor: deptColor(dept),
                        }}
                      />
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-col gap-2">
                    {deptEntries.map(([dept, total]) => {
                      const pct = Math.round((total / deptGrandTotal) * 100);
                      return (
                        <div key={dept} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: deptColor(dept) }}
                            />
                            <span className="text-sm text-foreground">{dept}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">{pct}%</span>
                            <span className="text-sm text-muted-foreground w-20 text-right">{formatCompact(total)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Recipients */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">Top Recipients</CardTitle>
              <CardDescription>Highest paid team members.</CardDescription>
            </CardHeader>
            <CardContent>
              {topRecipients.length === 0 ? (
                <EmptyState
                  icon="Users"
                  title="No data yet"
                  description="Recipient breakdown will appear here."
                />
              ) : (
                <div className="flex flex-col gap-0">
                  {topRecipients.map(([id, person], idx) => (
                    <div key={id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                      <span className="text-xs text-muted-foreground/60 font-mono w-4 shrink-0">{idx + 1}</span>
                      <Avatar className="size-7 shrink-0">
                        <AvatarImage src={person.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                          {getInitials(person.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{person.name}</p>
                        <p className="text-xs text-muted-foreground">{person.count} payment{person.count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="text-sm font-medium text-foreground shrink-0">{formatCurrency(person.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </FadeRise>

      {/* ── Recent Payments (expandable rows) ──────────── */}
      <FadeRise delay={d(450)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Recent Payments</CardTitle>
            <CardDescription>
              {payments.length} completed payment{payments.length !== 1 ? 's' : ''} total.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <EmptyState
                icon="CreditCard"
                title="No payments yet"
                description="Completed payments will appear here."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {visiblePayments.map(payment => {
                  const isExpanded = expandedPayment === payment.id;
                  const hasItems = payment.items && payment.items.length > 0;
                  const hasDesc = !!payment.description;
                  const isClickable = hasItems || hasDesc;

                  return (
                    <div key={payment.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => isClickable && setExpandedPayment(isExpanded ? null : payment.id)}
                        className={`w-full text-left py-3 ${isClickable ? 'cursor-pointer hover:bg-white/[0.02] transition-colors' : 'cursor-default'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="size-8 shrink-0">
                              <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                                {getInitials(payment.recipient?.display_name ?? '?')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {payment.recipient?.display_name}
                              </p>
                              {hasDesc && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {payment.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span className="text-sm font-medium text-foreground">{formatCurrency(Number(payment.amount))}</span>
                              <p className="text-xs text-muted-foreground">
                                {new Date(payment.paid_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                            {isClickable && (
                              isExpanded
                                ? <ChevronUp className="size-3.5 text-muted-foreground" />
                                : <ChevronDown className="size-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expandable line items */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                            className="overflow-hidden"
                          >
                            <div className="pb-3 pl-11 pr-2">
                              <div className="rounded-lg bg-muted/40 border border-border/50 p-3 flex flex-col gap-1.5">
                                {payment.items && payment.items.length > 0 ? (
                                  payment.items.map(item => (
                                    <div key={item.id} className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground truncate">{item.label}</span>
                                      <span className="text-foreground font-medium shrink-0 ml-2">
                                        {formatCurrency(Number(item.amount))}
                                      </span>
                                    </div>
                                  ))
                                ) : hasDesc ? (
                                  <p className="text-xs text-muted-foreground">{payment.description}</p>
                                ) : null}
                                {payment.recipient?.department && (
                                  <div className="mt-1.5 pt-1.5 border-t border-border/50">
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                                      {payment.recipient.department}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Show all / Show less toggle */}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setShowAll(prev => !prev)}
                    className="w-full py-3 text-sm font-medium text-seeko-accent hover:text-seeko-accent/80 transition-colors"
                  >
                    {showAll ? `Show less` : `Show all ${payments.length} payments`}
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>
    </>
  );
}
