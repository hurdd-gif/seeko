import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PaymentCreateDialog } from '../PaymentCreateDialog';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/scroll-lock', () => ({
  acquireScrollLock: vi.fn(),
  releaseScrollLock: vi.fn(),
}));

const team = [
  {
    id: 'member-1',
    display_name: 'Member Example',
    department: 'Coding',
    onboarded: 1,
    tour_completed: 1,
    is_admin: false,
    is_investor: false,
    paypal_email: 'payments@example.invalid',
  },
];

describe('PaymentCreateDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('records a manual paid payment using cookie auth when token prop is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'payment-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PaymentCreateDialog
        open
        onOpenChange={vi.fn()}
        team={team}
        recipient={null}
        token={null}
        onCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select team member...' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Member Example' }));
    fireEvent.change(screen.getByPlaceholderText('Item description'), {
      target: { value: 'Missed deadline adjustment' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '125' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/payments', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"status":"paid"'),
    }));
  });

  /* "Add another" is the one place onCreated fires while the dialog is still
     open. A parent that treats onCreated as "close" — which PaymentsAdmin did —
     tears the dialog down instead of returning the form, so pin both halves:
     the form comes back, and nobody is asked to close. */
  it('returns to a blank form on "Add another" without closing the dialog', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'payment-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();

    render(
      <PaymentCreateDialog
        open
        onOpenChange={onOpenChange}
        team={team}
        recipient={null}
        token={null}
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select team member...' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Member Example' }));
    fireEvent.change(screen.getByPlaceholderText('Item description'), {
      target: { value: 'Missed deadline adjustment' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '125' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Add another' }));

    // The form is back, with the amount cleared and the payee lane kept.
    const amount = await screen.findByPlaceholderText('0.00');
    expect(amount).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Mark as Paid' })).toBeInTheDocument();
    expect(screen.getByText('Member Example')).toBeInTheDocument();

    // Refresh the list behind me — but do not close me.
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
