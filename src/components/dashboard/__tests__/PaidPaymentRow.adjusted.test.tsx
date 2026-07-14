import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// The superseded amounts live in the drawer, so a test that wants to see them
// has to open it — same as a person does.
function expand(container: HTMLElement) {
  fireEvent.click(container.querySelector('[role="button"]')!);
}

describe('PaidPaymentRow — adjusted payments', () => {
  it('marks an adjusted payment with ADJ and shows the current amount', () => {
    row(adjusted);
    expect(screen.getByText('ADJ')).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
  });

  it('hides the superseded amounts until the row is expanded', () => {
    row(adjusted);
    expect(screen.queryAllByTestId('adjustment-ghost')).toHaveLength(0);
    expect(screen.queryByText('$62.00')).toBeNull();
  });

  it('renders one ghost row per superseded amount, newest first', () => {
    const { container } = row(adjusted);
    expand(container);
    const ghosts = screen.getAllByTestId('adjustment-ghost');
    expect(ghosts).toHaveLength(2);
    expect(within(ghosts[0]).getByText('$62.00')).toBeInTheDocument();
    expect(within(ghosts[1]).getByText('$56.00')).toBeInTheDocument();
  });

  it('gives ghost rows no expander and no context menu', () => {
    const { container } = row(adjusted);
    expand(container);
    const ghost = screen.getAllByTestId('adjustment-ghost')[0];
    expect(within(ghost).queryByRole('button')).toBeNull();
  });

  it('leaves an unadjusted payment unmarked and ghost-free', () => {
    const { container } = row(base);
    expand(container);
    expect(screen.queryByText('ADJ')).toBeNull();
    expect(screen.queryAllByTestId('adjustment-ghost')).toHaveLength(0);
  });
});

describe('PaidPaymentRow — adjust action', () => {
  it('offers Adjust amount in the peek menu on a paid payment', () => {
    const { container } = row(base);
    fireEvent.contextMenu(container.firstChild!);
    expect(screen.getByRole('button', { name: /adjust amount/i })).toBeInTheDocument();
  });

  it('disables Adjust amount when a refund is recorded', () => {
    const { container } = row({ ...base, refund_amount: 10 });
    fireEvent.contextMenu(container.firstChild!);
    expect(screen.getByRole('button', { name: /adjust amount/i })).toBeDisabled();
  });

  it('PATCHes the new amount and the note', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const onAction = vi.fn();

    const { container } = render(
      <PaidPaymentRow payment={base} externalPaypalEmail={null} onAction={onAction} />
    );
    fireEvent.contextMenu(container.firstChild!);
    fireEvent.click(screen.getByRole('button', { name: /adjust amount/i }));

    fireEvent.change(screen.getByLabelText(/new amount/i), { target: { value: '85' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Invoice was short' } });
    fireEvent.click(screen.getByRole('button', { name: /^save adjustment$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/payments/pay-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ amount: 85, adjustment_note: 'Invoice was short' }),
    })));
    await waitFor(() => expect(onAction).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it('refuses to submit an unchanged amount', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = row(base);
    fireEvent.contextMenu(container.firstChild!);
    fireEvent.click(screen.getByRole('button', { name: /adjust amount/i }));
    fireEvent.change(screen.getByLabelText(/new amount/i), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: /^save adjustment$/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/different amount/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
