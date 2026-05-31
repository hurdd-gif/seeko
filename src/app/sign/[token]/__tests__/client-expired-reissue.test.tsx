import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SigningPageClient } from '../client';

// The expired terminal lets a signer self-serve a fresh link via the reissue
// endpoint. The new token is emailed (never returned), so the UI only confirms.
describe('SigningPageClient — expired self-service reissue', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  });

  it('requests a fresh link from the expired terminal, then confirms', async () => {
    render(<SigningPageClient token="tok-xyz" initialData={{ status: 'expired' }} />);

    fireEvent.click(screen.getByRole('button', { name: /new link/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/external-signing/reissue');
    expect(JSON.parse(opts.body as string)).toEqual({ token: 'tok-xyz' });

    // The button is replaced by an inbox confirmation.
    expect(await screen.findByText(/on its way/i)).toBeInTheDocument();
  });

  it('surfaces the server error when reissue fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: 'Too many requests. Try again later.' }) });
    render(<SigningPageClient token="tok-xyz" initialData={{ status: 'expired' }} />);

    fireEvent.click(screen.getByRole('button', { name: /new link/i }));

    expect(await screen.findByText(/too many requests/i)).toBeInTheDocument();
  });
});
