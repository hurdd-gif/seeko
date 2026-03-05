import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteCodeForm } from '../InviteCodeForm';

// Mock next/navigation
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// Mock supabase client
const mockVerifyOtp = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { verifyOtp: mockVerifyOtp },
  })),
}));

// Mock fetch for /api/profile/init
global.fetch = vi.fn();

describe('InviteCodeForm', () => {
  it('renders email and code inputs', () => {
    render(<InviteCodeForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('shows error when code is invalid', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    render(<InviteCodeForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@seeko.studio' } });
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
    });
  });

  it('calls verifyOtp with email and token on submit', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<InviteCodeForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@seeko.studio' } });
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'test@seeko.studio',
        token: '654321',
        type: 'email',
      });
    });
  });
});
