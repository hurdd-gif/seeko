import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PendingExtension } from '@/lib/types';
import { DeadlineExtensionBanner } from '../DeadlineExtensionBanner';

const EXT: PendingExtension = {
  id: 'e1', requesterName: 'Dana Okafor',
  originalDeadline: '2026-07-18', requestedDeadline: '2026-07-25', reason: 'Scope grew',
};

afterEach(() => vi.restoreAllMocks());

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

  it('disables the Deny toggle while a decision is in flight', async () => {
    let resolveDecide: () => void;
    const onDecide = vi.fn(
      () => new Promise<void>((resolve) => { resolveDecide = resolve; }),
    );
    render(<DeadlineExtensionBanner extension={EXT} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(screen.getByRole('button', { name: /^deny$/i })).toBeDisabled();

    resolveDecide!();
    await waitFor(() => expect(screen.getByRole('button', { name: /^deny$/i })).not.toBeDisabled());
  });

  it('PATCHes /api/deadline-extensions/:id with { action: "approve" } and no reason key when no onDecide is injected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, status: 'approved' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<DeadlineExtensionBanner extension={EXT} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/deadline-extensions/${EXT.id}`);
    expect(options).toEqual(expect.objectContaining({ method: 'PATCH' }));
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ action: 'approve' });
    expect(body).not.toHaveProperty('reason');
  });

  it('PATCHes with { action: "deny", reason } when a reason is typed and Confirm deny is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, status: 'denied' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<DeadlineExtensionBanner extension={EXT} />);
    fireEvent.click(screen.getByRole('button', { name: /^deny$/i }));
    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: 'Not enough justification' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm deny/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/deadline-extensions/${EXT.id}`);
    expect(options).toEqual(expect.objectContaining({ method: 'PATCH' }));
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ action: 'deny', reason: 'Not enough justification' });
  });

  it('PATCHes with { action: "deny" } and no reason key when Confirm deny is clicked with an empty reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, status: 'denied' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<DeadlineExtensionBanner extension={EXT} />);
    fireEvent.click(screen.getByRole('button', { name: /^deny$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm deny/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ action: 'deny' });
    expect(body).not.toHaveProperty('reason');
  });
});
