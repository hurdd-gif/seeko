import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LatestExtension } from '@/lib/contractor-index';
import { DeadlineExtensionControl } from '../DeadlineExtensionControl';

const NOW = new Date('2026-07-05T09:00:00');
const base = { taskId: 'task-1', deadline: '2026-07-18', now: NOW };

describe('DeadlineExtensionControl', () => {
  it('shows "Request more time" when there is no extension', () => {
    render(<DeadlineExtensionControl {...base} latestExtension={null} />);
    expect(screen.getByRole('button', { name: /request more time/i })).toBeInTheDocument();
  });

  it('shows a pending pill with the requested date and hides the request button', () => {
    const ext: LatestExtension = { id: 'e1', status: 'pending', requested_deadline: '2026-07-25', reason: null, denial_reason: null };
    render(<DeadlineExtensionControl {...base} latestExtension={ext} />);
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText(/Jul 25/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request more time/i })).not.toBeInTheDocument();
  });

  it('shows a denial note with reason and a "Request again" button', () => {
    const ext: LatestExtension = { id: 'e2', status: 'denied', requested_deadline: '2026-07-25', reason: null, denial_reason: 'Ship date is fixed' };
    render(<DeadlineExtensionControl {...base} latestExtension={ext} />);
    expect(screen.getByText(/denied/i)).toBeInTheDocument();
    expect(screen.getByText(/Ship date is fixed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request again/i })).toBeInTheDocument();
  });

  it('treats an approved extension as superseded (offers a fresh request)', () => {
    const ext: LatestExtension = { id: 'e3', status: 'approved', requested_deadline: '2026-07-25', reason: null, denial_reason: null };
    render(<DeadlineExtensionControl {...base} latestExtension={ext} />);
    expect(screen.getByRole('button', { name: /request more time/i })).toBeInTheDocument();
  });

  it('opens the form, submits a date, and flips to pending optimistically', async () => {
    const onRequest = vi.fn(async (_t: string, requestedDeadline: string) => ({
      id: 'e9', status: 'pending' as const, requested_deadline: requestedDeadline, reason: null, denial_reason: null,
    }));
    render(<DeadlineExtensionControl {...base} latestExtension={null} onRequest={onRequest} />);
    fireEvent.click(screen.getByRole('button', { name: /request more time/i }));
    const dateInput = screen.getByLabelText(/new deadline/i);
    fireEvent.change(dateInput, { target: { value: '2026-07-26' } });
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith('task-1', '2026-07-26', ''));
    expect(await screen.findByText(/pending/i)).toBeInTheDocument();
  });

  it('reverts and shows an error when the request fails', async () => {
    const onRequest = vi.fn(async () => { throw new Error('nope'); });
    render(<DeadlineExtensionControl {...base} latestExtension={null} onRequest={onRequest} />);
    fireEvent.click(screen.getByRole('button', { name: /request more time/i }));
    fireEvent.change(screen.getByLabelText(/new deadline/i), { target: { value: '2026-07-26' } });
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(await screen.findByText(/couldn.t request/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request more time/i })).toBeInTheDocument();
  });

  it('keeps the denial note after "Request again" is opened then cancelled', () => {
    const ext: LatestExtension = { id: 'e2', status: 'denied', requested_deadline: '2026-07-25', reason: null, denial_reason: 'Ship date is fixed' };
    render(<DeadlineExtensionControl {...base} latestExtension={ext} />);
    fireEvent.click(screen.getByRole('button', { name: /request again/i }));
    expect(screen.getByLabelText(/new deadline/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByText(/denied/i)).toBeInTheDocument();
    expect(screen.getByText(/Ship date is fixed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request again/i })).toBeInTheDocument();
  });
});
