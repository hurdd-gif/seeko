'use client';

import { DollarSign, Users, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeRise, Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Payment } from '@/lib/types';

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface PaymentsInvestorProps {
  payments: Payment[];
  stats: {
    thisMonth: number;
    allTime: number;
    peoplePaid: number;
  };
  delay?: number;
}

export function PaymentsInvestor({ payments, stats, delay: baseDelay = 0 }: PaymentsInvestorProps) {
  const d = (ms: number) => (baseDelay + ms) / 1000;

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
      label: new Date(key + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      ...data,
    }));

  const recentPayments = payments.slice(0, 10);

  const statCards = [
    { label: 'This Month', value: stats.thisMonth, icon: Calendar, format: true },
    { label: 'All Time', value: stats.allTime, icon: DollarSign, format: true },
    { label: 'People Paid', value: stats.peoplePaid, icon: Users, format: false },
  ];

  return (
    <>
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
                  </CardContent>
                </Card>
              </HoverCard>
            </StaggerItem>
          ))}
        </Stagger>
      </FadeRise>

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
                  <div key={month.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <span className="text-sm text-foreground">{month.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{formatCurrency(month.total)}</span>
                      <span className="text-xs text-muted-foreground">
                        {month.count} payment{month.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      <FadeRise delay={d(300)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">Recent Payments</CardTitle>
            <CardDescription>Last 10 completed payments.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <EmptyState
                icon="CreditCard"
                title="No payments yet"
                description="Completed payments will appear here."
              />
            ) : (
              <div className="flex flex-col gap-0">
                {recentPayments.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8">
                        <AvatarImage src={payment.recipient?.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                          {getInitials(payment.recipient?.display_name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium text-foreground truncate">
                        {payment.recipient?.display_name}
                      </p>
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
    </>
  );
}
