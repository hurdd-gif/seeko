import { getServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/database.types';
import type { PaymentStatus } from '@/lib/types';

const TEAM_SELECT =
  'id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, paypal_email' as const;
const PAYMENTS_SELECT =
  'id, recipient_id, recipient_email, amount, currency, description, status, paid_at, refund_amount, refunded_at, refund_note, created_by, created_at, recipient:profiles!payments_recipient_id_fkey(id, display_name, avatar_url, department, paypal_email), items:payment_items(id, label, amount, task_id)' as const;

type TeamPaymentProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'id'
  | 'display_name'
  | 'department'
  | 'role'
  | 'avatar_url'
  | 'is_admin'
  | 'is_contractor'
  | 'is_investor'
  | 'paypal_email'
>;

type PaymentRow = Pick<
  Database['public']['Tables']['payments']['Row'],
  | 'id'
  | 'recipient_id'
  | 'recipient_email'
  | 'amount'
  | 'currency'
  | 'description'
  | 'status'
  | 'paid_at'
  | 'refund_amount'
  | 'refunded_at'
  | 'refund_note'
  | 'created_by'
  | 'created_at'
> & {
  recipient: Pick<
    Database['public']['Tables']['profiles']['Row'],
    'id' | 'display_name' | 'avatar_url' | 'department' | 'paypal_email'
  > | null;
  items: Pick<Database['public']['Tables']['payment_items']['Row'], 'id' | 'label' | 'amount' | 'task_id'>[] | null;
};

export type PaymentPersonSummary = {
  id: string;
  displayName: string | null;
  department: string | null;
  avatarUrl: string | null;
  paypalEmail: string | null;
  pendingAmount: number;
  hasPaid: boolean;
};

export type PaymentIndexItem = {
  id: string;
  recipientId: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientAvatarUrl: string | null;
  amount: number;
  currency: string;
  description: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  refundAmount: number;
  refundedAt: string | null;
  refundNote: string | null;
  createdAt: string | null;
  itemCount: number;
};

export type MonthlyPaidSummary = {
  month: string; // 'YYYY-MM'
  paidCount: number;
  paidTotal: number;
};

export type PaymentsIndexData = {
  currentUser: {
    id: string;
    email?: string | null;
  };
  stats: {
    pendingTotal: number;
    paidThisMonth: number;
    peopleOwed: number;
    paymentsThisMonth: number;
  };
  monthlyPaid: MonthlyPaidSummary[];
  people: PaymentPersonSummary[];
  pendingRequests: PaymentIndexItem[];
  recentPaid: PaymentIndexItem[];
};

export async function loadPaymentsIndex(currentUser: {
  id: string;
  email?: string | null;
}): Promise<PaymentsIndexData> {
  const service = getServiceClient();
  const [{ data: teamData, error: teamError }, { data: paymentData, error: paymentError }] = await Promise.all([
    service
      .from('profiles')
      .select(TEAM_SELECT)
      .order('display_name', { ascending: true }),
    service
      .from('payments')
      .select(PAYMENTS_SELECT)
      .order('created_at', { ascending: false }),
  ]);

  if (teamError) throw teamError;
  if (paymentError) throw paymentError;

  const team = (teamData ?? []) as TeamPaymentProfile[];
  const payments = ((paymentData ?? []) as unknown as PaymentRow[]).map(toPaymentIndexItem);
  const pendingPayments = payments.filter((payment) => payment.status === 'pending');
  const monthStart = startOfMonth(new Date());
  const paidThisMonth = payments.filter((payment) => {
    if (payment.status !== 'paid' || !payment.paidAt) return false;
    return new Date(payment.paidAt).getTime() >= monthStart.getTime();
  });

  return {
    currentUser,
    stats: {
      pendingTotal: pendingPayments.reduce((sum, payment) => sum + payment.amount, 0),
      paidThisMonth: paidThisMonth.reduce((sum, payment) => sum + payment.amount, 0),
      peopleOwed: new Set(pendingPayments.map((payment) => payment.recipientId).filter(Boolean)).size,
      paymentsThisMonth: paidThisMonth.length,
    },
    people: team
      .filter((member) => !member.is_investor)
      .map((member) => {
        const memberPayments = payments.filter((payment) => payment.recipientId === member.id);
        return {
          id: member.id,
          displayName: member.display_name,
          department: member.department,
          avatarUrl: member.avatar_url,
          paypalEmail: member.paypal_email,
          pendingAmount: memberPayments
            .filter((payment) => payment.status === 'pending')
            .reduce((sum, payment) => sum + payment.amount, 0),
          hasPaid: memberPayments.some((payment) => payment.status === 'paid'),
        };
      })
      .sort((a, b) => b.pendingAmount - a.pendingAmount),
    monthlyPaid: summarizeMonthlyPaid(payments),
    pendingRequests: payments.filter((payment) => payment.status === 'pending' && payment.recipientId === null),
    recentPaid: payments.filter((payment) => payment.status === 'paid').slice(0, 10),
  };
}

function summarizeMonthlyPaid(payments: PaymentIndexItem[], monthCount = 3): MonthlyPaidSummary[] {
  const now = new Date();
  const months: MonthlyPaidSummary[] = [];
  for (let offset = 0; offset < monthCount; offset += 1) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      month: `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`,
      paidCount: 0,
      paidTotal: 0,
    });
  }
  const byMonth = new Map(months.map((entry) => [entry.month, entry]));
  for (const payment of payments) {
    if (payment.status !== 'paid' || !payment.paidAt) continue;
    const paidAt = new Date(payment.paidAt);
    const key = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, '0')}`;
    const entry = byMonth.get(key);
    if (!entry) continue;
    entry.paidCount += 1;
    entry.paidTotal += payment.amount;
  }
  return months;
}

function toPaymentIndexItem(payment: PaymentRow): PaymentIndexItem {
  return {
    id: payment.id,
    recipientId: payment.recipient_id,
    recipientName: payment.recipient?.display_name ?? null,
    recipientEmail: payment.recipient_email,
    recipientAvatarUrl: payment.recipient?.avatar_url ?? null,
    amount: Number(payment.amount),
    currency: payment.currency,
    description: payment.description,
    status: isPaymentStatus(payment.status) ? payment.status : 'pending',
    paidAt: payment.paid_at,
    refundAmount: Number(payment.refund_amount ?? 0),
    refundedAt: payment.refunded_at,
    refundNote: payment.refund_note,
    createdAt: payment.created_at,
    itemCount: payment.items?.length ?? 0,
  };
}

function isPaymentStatus(status: string): status is PaymentStatus {
  return status === 'pending' || status === 'paid' || status === 'cancelled';
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
