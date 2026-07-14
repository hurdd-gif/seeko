import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Payment } from '@/lib/types';
import { PaidPaymentRow } from '../PaymentsAdmin';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: Payment = {
  id: 'pay-1',
  recipient_id: null,
  payee_name: 'Vector Gems',
  amount: 70,
  currency: 'USD',
  status: 'paid',
  paid_at: '2026-07-11T12:00:00.000Z',
  created_by: 'admin-1',
  created_at: '2026-07-11T12:00:00.000Z',
  items: [],
};

const adjusted: Payment = {
  ...base,
  adjustments: [
    { id: 'adj-1', payment_id: 'pay-1', previous_amount: 56, new_amount: 62, adjusted_by: 'admin-1', created_at: '2026-07-12T12:00:00.000Z', note: null },
    { id: 'adj-2', payment_id: 'pay-1', previous_amount: 62, new_amount: 70, adjusted_by: 'admin-1', created_at: '2026-07-13T12:00:00.000Z', note: 'Invoice was short' },
  ],
};

function row(payment: Payment) {
  return render(
    <PaidPaymentRow payment={payment} externalPaypalEmail={null} onAction={() => {}} />
  );
}

describe('PaidPaymentRow — adjusted payments', () => {
  it('marks an adjusted payment with ADJ and shows the current amount', () => {
    row(adjusted);
    expect(screen.getByText('ADJ')).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
  });

  it('renders one ghost row per superseded amount, newest first', () => {
    row(adjusted);
    const ghosts = screen.getAllByTestId('adjustment-ghost');
    expect(ghosts).toHaveLength(2);
    expect(within(ghosts[0]).getByText('$62.00')).toBeInTheDocument();
    expect(within(ghosts[1]).getByText('$56.00')).toBeInTheDocument();
  });

  it('gives ghost rows no expander and no context menu', () => {
    row(adjusted);
    const ghost = screen.getAllByTestId('adjustment-ghost')[0];
    expect(within(ghost).queryByRole('button')).toBeNull();
  });

  it('leaves an unadjusted payment unmarked and ghost-free', () => {
    row(base);
    expect(screen.queryByText('ADJ')).toBeNull();
    expect(screen.queryAllByTestId('adjustment-ghost')).toHaveLength(0);
  });
});
