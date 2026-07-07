import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingExtension } from '@/lib/types';
import { DeadlineExtensionBanner } from '../DeadlineExtensionBanner';

const EXT: PendingExtension = {
  id: 'e1', requesterName: 'Dana Okafor',
  originalDeadline: '2026-07-18', requestedDeadline: '2026-07-25', reason: 'Scope grew',
};

describe('DeadlineExtensionBanner', () => {
  it('renders requester, date range, and reason with Approve/Deny', () => {
    render(<DeadlineExtensionBanner extension={EXT} />);
    expect(screen.getByText(/Dana Okafor/)).toBeInTheDocument();
    expect(screen.getByText(/Jul 18/)).toBeInTheDocument();
    expect(screen.getByText(/Jul 25/)).toBeInTheDocument();
    expect(screen.getByText(/Scope grew/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^deny$/i })).toBeInTheDocument();
  });

  it('reveals an optional reason field when Deny is clicked', () => {
    render(<DeadlineExtensionBanner extension={EXT} />);
    fireEvent.click(screen.getByRole('button', { name: /^deny$/i }));
    expect(screen.getByPlaceholderText(/reason/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm deny/i })).toBeInTheDocument();
  });

  it('calls onDecide("approve") when Approve is clicked', () => {
    const onDecide = vi.fn(async () => {});
    render(<DeadlineExtensionBanner extension={EXT} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onDecide).toHaveBeenCalledWith('approve', undefined);
  });
});
