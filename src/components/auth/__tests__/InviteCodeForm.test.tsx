import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteCodeForm } from '../InviteCodeForm';

// Mock @/lib/react-router-adapters
vi.mock('@/lib/react-router-adapters', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// Mock supabase client
const mockVerifyOtp = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { verifyOtp: mockVerifyOtp },
  })),
}));

// Mock fetch for /api/profile/init
global.fetch = vi.fn();

// The code is entered through SegmentedCodeInput's 8 single-digit cells. The
// cells fill via paste/keydown (their own onChange is a no-op), so simulate a
// paste onto the first cell to set the full 8-digit token in one step.
function pasteCode(code: string) {
  fireEvent.paste(screen.getByLabelText('Digit 1'), {
    clipboardData: { getData: () => code },
  });
}

describe('InviteCodeForm', () => {
  it('renders email and 8 code cells', () => {
    render(<InviteCodeForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^digit \d+$/i)).toHaveLength(8);
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('shows error when code is invalid', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    render(<InviteCodeForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@seeko.studio' } });
    pasteCode('12345678');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
    });
  });

  it('shows a red error state instead of native validation when email is empty', async () => {
    mockVerifyOtp.mockClear();
    render(<InviteCodeForm />);
    pasteCode('12345678');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Custom in-design error, not the browser bubble; no network call.
    expect(await screen.findByText(/enter the email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('marks the code cells invalid when the code is rejected', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    render(<InviteCodeForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@seeko.studio' } });
    pasteCode('12345678');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Digit 1')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('calls verifyOtp with email and the 8-digit token on submit', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<InviteCodeForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@seeko.studio' } });
    pasteCode('65432187');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'test@seeko.studio',
        token: '65432187',
        type: 'email',
      });
    });
  });
});
